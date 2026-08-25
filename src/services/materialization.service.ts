import type { IOnboarding } from '../models/onboarding.model.js';
import type {
    GuaranteeTemplate,
    MaterializedOnboarding,
    OnboardingAnswers,
    SignatureInput,
    ValueBinding,
} from '../types/onboarding.js';
import { ValidationError } from '../utils/customErrors.js';
import { localDateTimeInZoneToIso } from '../utils/date.js';
import { readPath } from './requirement.service.js';

const isRecord = (value: unknown): value is Record<string, unknown> =>
    Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const setPath = (target: Record<string, unknown>, path: string, value: unknown) => {
    const parts = path.split('.');
    let current = target;
    for (const key of parts.slice(0, -1)) {
        if (!isRecord(current[key])) current[key] = {};
        current = current[key] as Record<string, unknown>;
    }
    current[parts.at(-1)!] = value;
};

const pluck = (value: unknown, key: string) =>
    Array.isArray(value) ? value.map((item) => readPath(item, key)) : [];

const resolveBinding = (
    binding: ValueBinding,
    answers: OnboardingAnswers,
    onboarding: IOnboarding,
    repeatItem?: unknown,
) => {
    if ('literal' in binding) return binding.literal;
    if ('repeatItem' in binding) return readPath(repeatItem, binding.repeatItem);
    if ('integration' in binding) {
        if (binding.integration === 'github') {
            const installationId = onboarding.integrations?.github?.installationId;
            if (!installationId)
                throw new ValidationError('GitHub credential reference is missing');
            return { provider: 'github', installationId };
        }
        const connectionId = onboarding.integrations?.zenhub?.connectionId;
        if (!connectionId) throw new ValidationError('ZenHub credential reference is missing');
        if (binding.format === 'uri') return `join-mock://zenhub/connections/${connectionId}`;
        return { provider: 'zenhub', connectionId, mocked: true };
    }

    let value = readPath(answers[binding.answer], binding.path);
    switch (binding.transform) {
        case 'pluckName':
            value = pluck(value, 'name');
            break;
        case 'pluckNumber':
            value = pluck(value, 'number');
            break;
        case 'pluckUsername':
            value = pluck(value, 'username');
            break;
        case 'toIso':
            value = localDateTimeInZoneToIso(
                value,
                binding.timezoneAnswer ? answers[binding.timezoneAnswer] : undefined,
            );
            break;
    }
    return value;
};

const buildSignatures = (
    onboarding: IOnboarding,
    guaranteeTemplates: GuaranteeTemplate[],
): SignatureInput[] => {
    const answers = onboarding.answers || {};
    const agreementGuarantees = new Set(
        onboarding.agreementTemplate.guarantees.map((guarantee) => guarantee.guaranteeTemplateName),
    );

    return onboarding.onboardingDefinition.mappings.signatures.flatMap((signatureMapping) => {
        const subject = signatureMapping.subject;
        if (!agreementGuarantees.has(signatureMapping.guaranteeTemplateName))
            throw new ValidationError(
                `Mapped guarantee '${signatureMapping.guaranteeTemplateName}' is not in the Agreement Template`,
            );
        const guaranteeTemplate = guaranteeTemplates.find(
            ({ name }) => name === signatureMapping.guaranteeTemplateName,
        );
        if (!guaranteeTemplate)
            throw new ValidationError(
                `Guarantee Template '${signatureMapping.guaranteeTemplateName}' is unavailable`,
            );
        const repeatItems = subject.kind === 'member' ? answers[subject.answer] : [undefined];
        if (!Array.isArray(repeatItems) || !repeatItems.length)
            throw new ValidationError(
                `Guarantee '${signatureMapping.guaranteeTemplateName}' requires expansion values`,
            );
        if (
            subject.kind === 'member' &&
            repeatItems.some((repeatItem) => readPath(repeatItem, subject.itemPath) === undefined)
        )
            throw new ValidationError(
                `Guarantee '${signatureMapping.guaranteeTemplateName}' has an invalid member subject`,
            );

        return repeatItems.map((repeatItem) => ({
            guaranteeTemplateName: signatureMapping.guaranteeTemplateName,
            metrics: signatureMapping.metrics.map((metricMapping) => {
                const metric = guaranteeTemplate.metrics.find(
                    ({ metricName }) => metricName === metricMapping.metricName,
                );
                if (!metric)
                    throw new ValidationError(
                        `Metric '${metricMapping.metricName}' is unavailable in '${guaranteeTemplate.name}'`,
                    );
                return {
                    metricName: metricMapping.metricName,
                    fetcherConfigs: metricMapping.fetcherConfigs.map((fetcher) => ({
                        fetcherId: fetcher.fetcherId,
                        fetcherConfig: Object.fromEntries(
                            Object.entries(fetcher.fields).map(([key, binding]) => [
                                key,
                                resolveBinding(binding, answers, onboarding, repeatItem),
                            ]),
                        ),
                    })),
                    processConfig: Object.fromEntries(
                        Object.entries(metricMapping.processConfig).map(([key, binding]) => [
                            key,
                            resolveBinding(binding, answers, onboarding, repeatItem),
                        ]),
                    ),
                };
            }),
        }));
    });
};

export const materialize = (
    onboarding: IOnboarding,
    guaranteeTemplates: GuaranteeTemplate[],
): MaterializedOnboarding => {
    const answers = onboarding.answers || {};
    const contract: Record<string, unknown> = {};
    for (const [path, binding] of Object.entries(
        onboarding.onboardingDefinition.mappings.contract,
    )) {
        setPath(contract, path, resolveBinding(binding, answers, onboarding));
    }

    const signatures = buildSignatures(onboarding, guaranteeTemplates);
    const agreement = {
        agreementTemplate: onboarding.agreementTemplate,
        contract,
        signatures,
    };
    const scope: Record<string, unknown> = {
        description: `Project onboarded from ${onboarding.agreementTemplate.displayName}`,
        type: 'Project',
        parentId: null,
        fields: [],
        permissions: { view: [], edit: [], delete: [], create: [] },
        config: {
            auditConfig: {
                join: {
                    onboardingId: onboarding._id.toString(),
                    onboardingDefinitionId: onboarding.onboardingDefinition.id,
                    agreementTemplateId: onboarding.agreementTemplate._id,
                    answers,
                    agreement,
                },
            },
        },
    };
    for (const [path, binding] of Object.entries(onboarding.onboardingDefinition.mappings.scope)) {
        setPath(scope, path, resolveBinding(binding, answers, onboarding));
    }
    const scopeName = String(readPath(scope, 'name'));
    scope.agreementCollection = {
        name: `tpa-${scopeName}`,
        displayName: `TPA ${scopeName}`,
        fields: {},
        permissions: {},
    };

    return {
        agreement,
        scope,
    };
};

export const withInitialGitHubCredential = (
    payload: MaterializedOnboarding,
    credential: { installationId: number; token: string; expiresAt: string },
) => {
    const versionPayload = structuredClone(payload);
    let injected = 0;
    for (const signature of versionPayload.agreement.signatures) {
        for (const metric of signature.metrics) {
            for (const fetcher of metric.fetcherConfigs) {
                const reference = fetcher.fetcherConfig.credentialRef;
                if (
                    !isRecord(reference) ||
                    reference.provider !== 'github' ||
                    Number(reference.installationId) !== credential.installationId
                )
                    continue;
                fetcher.fetcherConfig.token = credential.token;
                fetcher.fetcherConfig.tokenExpiresAt = credential.expiresAt;
                injected += 1;
            }
        }
    }
    if (!injected)
        throw new ValidationError('The Agreement contains no GitHub fetcher configuration');
    return versionPayload;
};
