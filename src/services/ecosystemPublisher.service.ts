import { bootEnv } from '../config/bootConfig.js';
import type { GuaranteeTemplate, MaterializedOnboarding } from '../types/onboarding.js';
import { DuplicateKeyError, ValidationError } from '../utils/customErrors.js';
import { requestJson } from '../utils/http.js';
import { serviceHeaders } from '../utils/serviceAuthentication.js';
import { readPath } from './requirement.service.js';

const downstreamStatus = (error: unknown) =>
    (error as { details?: { status?: number } }).details?.status;

const stable = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(stable);
    if (value && typeof value === 'object')
        return Object.fromEntries(
            Object.entries(value as Record<string, unknown>)
                .sort(([left], [right]) => left.localeCompare(right))
                .map(([key, nested]) => [key, stable(nested)]),
        );
    return value;
};

const matchesExpected = (actual: Record<string, unknown>, expected: Record<string, unknown>) =>
    JSON.stringify(
        stable(Object.fromEntries(Object.keys(expected).map((key) => [key, actual[key]]))),
    ) === JSON.stringify(stable(expected));

const sameValidity = (left: Record<string, unknown> | undefined, right: Record<string, unknown>) =>
    left?.timezone === right.timezone &&
    new Date(String(left?.initial)).getTime() === new Date(String(right.initial)).getTime() &&
    new Date(String(left?.end)).getTime() === new Date(String(right.end)).getTime();

const createOrReuseGuaranteeTemplate = async (template: GuaranteeTemplate) => {
    const collectionUrl = `${bootEnv.REGISTRY_SERVICE_URL}/api/v1/guaranteeTemplates`;
    try {
        await requestJson(collectionUrl, {
            method: 'POST',
            headers: serviceHeaders(),
            body: JSON.stringify(template),
        });
        return;
    } catch (error) {
        if (downstreamStatus(error) !== 409) throw error;
    }
    const existing = await requestJson<Record<string, unknown>>(
        `${collectionUrl}/${encodeURIComponent(template.name)}`,
        { headers: serviceHeaders() },
    );
    if (!matchesExpected(existing, template as unknown as Record<string, unknown>))
        throw new DuplicateKeyError(
            `Guarantee template '${template.name}' already exists with different contents`,
        );
};

export const ensureGuaranteeTemplates = async (templates: GuaranteeTemplate[]) => {
    for (const template of templates) await createOrReuseGuaranteeTemplate(template);
};

export const ensureAgreementTemplate = async (
    organizationName: string,
    payload: MaterializedOnboarding,
) => {
    const template = payload.agreement.agreementTemplate;
    const input = {
        name: template.name,
        displayName: template.displayName,
        description: template.description,
        isPublic: false,
        guarantees: template.guarantees,
    };
    const collectionUrl = `${bootEnv.REGISTRY_SERVICE_URL}/api/v1/organizations/${encodeURIComponent(organizationName)}/agreementTemplates`;
    try {
        await requestJson(collectionUrl, {
            method: 'POST',
            headers: serviceHeaders(),
            body: JSON.stringify(input),
        });
        return;
    } catch (error) {
        if (downstreamStatus(error) !== 409) throw error;
    }
    const existing = await requestJson<Record<string, unknown>>(
        `${collectionUrl}/${encodeURIComponent(template.name)}`,
        { headers: serviceHeaders() },
    );
    if (!matchesExpected(existing, input))
        throw new DuplicateKeyError(
            `Agreement template '${template.name}' already exists with different contents`,
        );
};

export const ensureScopeElement = async (
    onboardingId: string,
    organizationName: string,
    elementName: string,
    payload: MaterializedOnboarding,
) => {
    const element = readPath(payload.scope, 'element');
    if (!element || typeof element !== 'object' || Array.isArray(element))
        throw new ValidationError('Materialized Scope element is invalid');
    const collectionUrl = `${bootEnv.SCOPE_MANAGER_SERVICE_URL}/api/v1/organizations/${encodeURIComponent(organizationName)}/elements`;
    try {
        await requestJson(collectionUrl, {
            method: 'POST',
            headers: serviceHeaders(),
            body: JSON.stringify(element),
        });
        return;
    } catch (error) {
        if (downstreamStatus(error) !== 409) throw error;
    }
    const existing = await requestJson<Record<string, unknown>>(
        `${collectionUrl}/${encodeURIComponent(elementName)}`,
        { headers: serviceHeaders() },
    );
    if (readPath(existing, 'auditConfig.join.onboardingId') !== onboardingId)
        throw new DuplicateKeyError(`Element '${elementName}' already belongs to another join`);
};

export const ensureAgreementCollection = async (
    organizationName: string,
    elementName: string,
    payload: MaterializedOnboarding,
) => {
    const collection = readPath(payload.scope, 'agreementCollection');
    if (!collection || typeof collection !== 'object' || Array.isArray(collection))
        throw new ValidationError('Materialized agreement collection is invalid');
    const input = collection as Record<string, unknown>;
    const collectionName = String(input.name);
    const collectionUrl = `${bootEnv.REGISTRY_SERVICE_URL}/api/v1/organizations/${encodeURIComponent(organizationName)}/elements/${encodeURIComponent(elementName)}/agreementCollections`;
    try {
        await requestJson(collectionUrl, {
            method: 'POST',
            headers: serviceHeaders(),
            body: JSON.stringify(input),
        });
        return collectionName;
    } catch (error) {
        if (downstreamStatus(error) !== 409) throw error;
    }
    const existing = await requestJson<Record<string, unknown>>(
        `${collectionUrl}/${encodeURIComponent(collectionName)}`,
        { headers: serviceHeaders() },
    );
    if (!matchesExpected(existing, input))
        throw new DuplicateKeyError(
            `Agreement collection '${collectionName}' has conflicting metadata`,
        );
    return collectionName;
};

export const ensureAgreementVersion = async (
    organizationName: string,
    elementName: string,
    collectionName: string,
    payload: MaterializedOnboarding,
    prepareForCreate: () => Promise<MaterializedOnboarding>,
) => {
    const versionsUrl = `${bootEnv.REGISTRY_SERVICE_URL}/api/v1/organizations/${encodeURIComponent(organizationName)}/elements/${encodeURIComponent(elementName)}/agreementCollections/${encodeURIComponent(collectionName)}/agreementVersions`;
    const versions = await requestJson<
        {
            versionNumber?: number;
            contract?: { agreementTemplateName?: string; validity?: Record<string, unknown> };
        }[]
    >(`${versionsUrl}?expand=true`, { headers: serviceHeaders() });
    const validity = readPath(payload.agreement.contract, 'validity');
    if (!validity || typeof validity !== 'object' || Array.isArray(validity))
        throw new ValidationError('Materialized agreement validity is invalid');
    if (versions.length) {
        const existing = versions.at(-1)!;
        if (
            existing.contract?.agreementTemplateName !== payload.agreement.agreementTemplate.name ||
            !sameValidity(existing.contract.validity, validity as Record<string, unknown>)
        )
            throw new DuplicateKeyError(
                `Agreement collection '${collectionName}' already contains a different version`,
            );
        return { versionNumber: existing.versionNumber, reused: true };
    }
    const createPayload = await prepareForCreate();
    const created = await requestJson<Record<string, unknown>>(versionsUrl, {
        method: 'POST',
        headers: serviceHeaders(),
        body: JSON.stringify({
            contract: createPayload.agreement.contract,
            signatures: createPayload.agreement.signatures,
        }),
    });
    return { versionNumber: created.versionNumber, reused: false };
};

export const calculationDate = (payload: MaterializedOnboarding) => {
    const initial = new Date(String(readPath(payload.agreement.contract, 'validity.initial')));
    const end = new Date(String(readPath(payload.agreement.contract, 'validity.end')));
    const calculation = new Date(Math.max(Date.now(), initial.getTime()));
    if (calculation >= end)
        throw new ValidationError('Agreement validity ended before calculations could start');
    return calculation.toISOString();
};

export const generateInitialState = async (
    organizationName: string,
    elementName: string,
    collectionName: string,
    date: string,
) =>
    requestJson(
        `${bootEnv.REGISTRY_SERVICE_URL}/api/v1/organizations/${encodeURIComponent(organizationName)}/elements/${encodeURIComponent(elementName)}/agreementCollections/${encodeURIComponent(collectionName)}/agreementVersions/auditableVersion/states/generate?isAsync=true`,
        {
            method: 'POST',
            headers: serviceHeaders(),
            body: JSON.stringify({ date }),
        },
    );

export const ensureCalculationSchedule = async (
    organizationName: string,
    elementName: string,
    collectionName: string,
    payload: MaterializedOnboarding,
) => {
    const tasksUrl = `${bootEnv.DIRECTOR_SERVICE_URL}/api/v1/tasks`;
    const tasks = await requestJson<Record<string, unknown>[]>(tasksUrl, {
        headers: serviceHeaders(),
    });
    const inputArgs = { orgName: organizationName, elementName, agColName: collectionName };
    let task = tasks.find(
        (candidate) =>
            candidate.script === 'generateStates' &&
            candidate.type === 'RECURRING' &&
            candidate.interval === 60 * 60 * 1_000 &&
            JSON.stringify(candidate.inputArgs) === JSON.stringify(inputArgs),
    );
    if (task) return task;
    const validityInitial = new Date(
        String(readPath(payload.agreement.contract, 'validity.initial')),
    );
    task = await requestJson<Record<string, unknown>>(tasksUrl, {
        method: 'POST',
        headers: serviceHeaders(),
        body: JSON.stringify({
            script: 'generateStates',
            inputArgs,
            type: 'RECURRING',
            enabled: true,
            startDate: new Date(Math.max(Date.now(), validityInitial.getTime())).toISOString(),
            endDate: String(readPath(payload.agreement.contract, 'validity.end')),
            interval: 60 * 60 * 1_000,
        }),
    });
    return task;
};
