import { bootEnv } from '../config/bootConfig.js';
import { createOnboardingDefinition } from '../data/onboardingDefinitions.js';
import type {
    GuaranteeTemplate,
    JoinTemplateOption,
    OnboardingDefinition,
    PublicAgreementTemplate,
} from '../types/onboarding.js';
import { NotFoundError } from '../utils/customErrors.js';
import { requestJson } from '../utils/http.js';
import { serviceHeaders } from '../utils/serviceAuthentication.js';

const registryUrl = (path: string) => `${bootEnv.REGISTRY_SERVICE_URL}/api/v1${path}`;

const loadPublicAgreementTemplates = () =>
    requestJson<PublicAgreementTemplate[]>(registryUrl('/agreementTemplates/public'), {
        headers: serviceHeaders(),
    });

export const listGuaranteeTemplates = () =>
    requestJson<GuaranteeTemplate[]>(registryUrl('/guaranteeTemplates'), {
        headers: serviceHeaders(),
    });

const validateOption = (
    agreementTemplate: PublicAgreementTemplate,
    onboardingDefinition: OnboardingDefinition,
): JoinTemplateOption => {
    const templateGuarantees = new Set(
        agreementTemplate.guarantees.map(({ guaranteeTemplateName }) => guaranteeTemplateName),
    );
    for (const signature of onboardingDefinition.mappings.signatures) {
        if (!templateGuarantees.has(signature.guaranteeTemplateName))
            throw new Error(
                `Onboarding '${onboardingDefinition.id}' maps guarantee '${signature.guaranteeTemplateName}' which is not in Agreement Template '${agreementTemplate.name}'`,
            );
    }
    const mappedGuarantees = new Set(
        onboardingDefinition.mappings.signatures.map(
            ({ guaranteeTemplateName }) => guaranteeTemplateName,
        ),
    );
    for (const guarantee of templateGuarantees) {
        if (!mappedGuarantees.has(guarantee))
            throw new Error(
                `Agreement template '${agreementTemplate.name}' has no signature mapping for '${guarantee}'`,
            );
    }

    const requirementIds = new Set(onboardingDefinition.requirements.map(({ id }) => id));
    if (requirementIds.size !== onboardingDefinition.requirements.length)
        throw new Error(`Onboarding '${onboardingDefinition.id}' has duplicate requirement IDs`);
    const mappedAnswers = JSON.stringify(onboardingDefinition.mappings);
    for (const requirement of onboardingDefinition.requirements) {
        for (const dependency of requirement.dependsOn || []) {
            if (!requirementIds.has(dependency))
                throw new Error(
                    `Requirement '${requirement.id}' depends on missing requirement '${dependency}'`,
                );
        }
        if (
            !mappedAnswers.includes(`"answer":"${requirement.id}"`) &&
            requirement.requiredBy.length
        )
            throw new Error(`Requirement '${requirement.id}' is not used by an onboarding mapping`);
    }
    return { agreementTemplate, onboardingDefinition };
};

const optionFor = (
    agreementTemplate: PublicAgreementTemplate,
    guaranteeTemplates: GuaranteeTemplate[],
) => {
    const onboardingDefinition = createOnboardingDefinition(agreementTemplate, guaranteeTemplates);
    return onboardingDefinition
        ? validateOption(agreementTemplate, onboardingDefinition)
        : undefined;
};

export const listPublic = async () => {
    const [templates, guaranteeTemplates] = await Promise.all([
        loadPublicAgreementTemplates(),
        listGuaranteeTemplates(),
    ]);
    return templates
        .map((template) => optionFor(template, guaranteeTemplates))
        .filter((option) => option !== undefined);
};

export const getPublic = async (id: string) => {
    const option = (await listPublic()).find(
        ({ agreementTemplate }) => String(agreementTemplate._id) === id,
    );
    if (!option) throw new NotFoundError('Supported public Agreement Template not found');
    return option;
};
