import { bootEnv } from '../config/bootConfig.js';
import type { MaterializedOnboarding, ScopeNodeInput } from '../types/onboarding.js';
import { DuplicateKeyError, ValidationError } from '../utils/customErrors.js';
import { requestJson } from '../utils/http.js';
import { serviceHeaders } from '../utils/serviceAuthentication.js';
import { readPath } from './requirement.service.js';

const downstreamStatus = (error: unknown) =>
    (error as { details?: { status?: number } }).details?.status;

const isRecord = (value: unknown): value is Record<string, unknown> =>
    Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const resourceId = (resource: Record<string, unknown>, resourceName: string) => {
    const id = resource._id || resource.id;
    if (!id) throw new ValidationError(`${resourceName} did not return an ID`);
    return String(id);
};

const requestIfExists = async <T>(url: string): Promise<T | undefined> => {
    try {
        return await requestJson<T>(url, { headers: serviceHeaders() });
    } catch (error) {
        if (downstreamStatus(error) === 404) return undefined;
        throw error;
    }
};

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

const agreementTemplateIdentity = (template: Record<string, unknown>) => ({
    name: template.name,
    displayName: template.displayName,
    description: template.description,
    isPublic: template.isPublic,
    guarantees: Array.isArray(template.guarantees)
        ? template.guarantees.map((guarantee) => {
              const value = guarantee as Record<string, unknown>;
              return {
                  guaranteeTemplateName: value.guaranteeTemplateName,
                  comparator: value.comparator,
                  threshold: value.threshold,
                  window: value.window,
              };
          })
        : template.guarantees,
});

const agreementCollectionIdentity = (collection: Record<string, unknown>) => ({
    name: collection.name,
    displayName: collection.displayName,
    description: collection.description,
    fields: collection.fields,
    permissions: collection.permissions,
});

const sameValidity = (left: Record<string, unknown> | undefined, right: Record<string, unknown>) =>
    left?.timezone === right.timezone &&
    new Date(String(left?.initial)).getTime() === new Date(String(right.initial)).getTime() &&
    new Date(String(left?.end)).getTime() === new Date(String(right.end)).getTime();

const scopeNodeInput = (scope: Record<string, unknown>): ScopeNodeInput => {
    if (typeof scope.name !== 'string' || !scope.name)
        throw new ValidationError('Materialized Scope is missing its name');
    if (typeof scope.type !== 'string' || !scope.type)
        throw new ValidationError('Materialized Scope is missing its type');
    if (!isRecord(scope.config) || !Array.isArray(scope.children))
        throw new ValidationError(
            'Materialized Scope must have a config object and children array',
        );
    return {
        name: scope.name,
        ...(typeof scope.description === 'string' ? { description: scope.description } : {}),
        type: scope.type,
        config: scope.config,
        children: scope.children.map((child) => {
            if (!isRecord(child)) throw new ValidationError('Materialized Scope child is invalid');
            return scopeNodeInput(child);
        }),
    };
};

const scopeNodeIdentity = (scope: {
    name?: unknown;
    description?: unknown;
    type?: unknown;
    config?: unknown;
}) => ({
    name: scope.name,
    description: scope.description,
    type: scope.type,
    config: scope.config,
});

export const ensureAgreementTemplate = async (
    organizationName: string,
    organizationId: string,
    payload: MaterializedOnboarding,
) => {
    const template = payload.agreement.agreementTemplate;
    const templateAlreadyBelongsToOrganization = String(template.orgId) === organizationId;
    const input = {
        name: template.name,
        displayName: template.displayName,
        description: template.description,
        isPublic: templateAlreadyBelongsToOrganization ? template.isPublic : false,
        guarantees: template.guarantees.map((guarantee) => ({
            guaranteeTemplateName: guarantee.guaranteeTemplateName,
            comparator: guarantee.comparator,
            threshold: guarantee.threshold,
            window: guarantee.window,
        })),
    };
    const collectionUrl = `${bootEnv.REGISTRY_SERVICE_URL}/api/v1/organizations/${encodeURIComponent(organizationName)}/agreementTemplates`;
    const resourceUrl = `${collectionUrl}/${encodeURIComponent(template.name)}`;
    const existing = await requestIfExists<Record<string, unknown>>(resourceUrl);
    if (existing) {
        if (!matchesExpected(agreementTemplateIdentity(existing), agreementTemplateIdentity(input)))
            throw new DuplicateKeyError(
                `Agreement template '${template.name}' already exists with different contents`,
            );
        return template.name;
    }
    try {
        const created = await requestJson<Record<string, unknown>>(collectionUrl, {
            method: 'POST',
            headers: serviceHeaders(),
            body: JSON.stringify(input),
        });
        return String(created.name || template.name);
    } catch (error) {
        const createdByConcurrentAttempt =
            await requestIfExists<Record<string, unknown>>(resourceUrl);
        if (!createdByConcurrentAttempt) throw error;
        if (
            !matchesExpected(
                agreementTemplateIdentity(createdByConcurrentAttempt),
                agreementTemplateIdentity(input),
            )
        )
            throw new DuplicateKeyError(
                `Agreement template '${template.name}' already exists with different contents`,
            );
        return template.name;
    }
};

export const ensureScope = async (
    onboardingId: string,
    organizationName: string,
    createdBy: string,
    payload: MaterializedOnboarding,
) => {
    const scope = payload.scope;
    const scopeName = String(scope.name || '');
    if (!scopeName) throw new ValidationError('Materialized Scope is missing its name');

    const collectionUrl = `${bootEnv.SCOPE_MANAGER_SERVICE_URL}/api/v1/organizations/${encodeURIComponent(organizationName)}/scopes`;
    const root = scopeNodeInput(scope);
    if (readPath(root, 'config.onboardingId') !== onboardingId)
        throw new ValidationError('Materialized Scope has an invalid onboarding ID');

    const scopeOnboardingId = (candidate: Record<string, unknown>) =>
        readPath(candidate, 'config.onboardingId') ||
        readPath(candidate, 'config.auditConfig.join.onboardingId');

    const reuse = (existing: Record<string, unknown>) => {
        const legacy = readPath(existing, 'config.onboardingId') === undefined;
        if (
            existing.parentId !== null ||
            (!legacy && !matchesExpected(scopeNodeIdentity(existing), scopeNodeIdentity(root)))
        )
            throw new DuplicateKeyError(
                `Scope '${scopeName}' already exists with different contents`,
            );
        return resourceId(existing, `Scope '${scopeName}'`);
    };
    const findExisting = async () => {
        const scopes = await requestJson<Record<string, unknown>[]>(`${collectionUrl}?flat=true`, {
            headers: serviceHeaders(),
        });
        return scopes.find(
            (candidate) =>
                candidate.parentId === null && scopeOnboardingId(candidate) === onboardingId,
        );
    };

    const existing = await findExisting();
    if (existing) return reuse(existing);

    try {
        const created = await requestJson<Record<string, unknown>[]>(`${collectionUrl}/tree`, {
            method: 'POST',
            headers: { ...serviceHeaders(), 'X-Created-By': createdBy },
            body: JSON.stringify([root]),
        });
        const createdRoot = created.find(
            (candidate) =>
                candidate.parentId === null && scopeOnboardingId(candidate) === onboardingId,
        );
        if (!createdRoot)
            throw new ValidationError('Scope Manager did not return the created root scope');
        return reuse(createdRoot);
    } catch (error) {
        const createdByConcurrentAttempt = await findExisting();
        if (createdByConcurrentAttempt) return reuse(createdByConcurrentAttempt);
        throw error;
    }
};

export const ensureAgreementCollection = async (
    organizationName: string,
    scopeId: string,
    payload: MaterializedOnboarding,
) => {
    const collection = readPath(payload.scope, 'agreementCollection');
    if (!isRecord(collection))
        throw new ValidationError('Materialized agreement collection is invalid');
    const input: Record<string, unknown> = {
        ...collection,
        description:
            collection.description ||
            `Agreement collection for ${String(readPath(payload.scope, 'name'))}`,
    };
    const collectionName = String(input.name);
    const collectionUrl = `${bootEnv.REGISTRY_SERVICE_URL}/api/v1/organizations/${encodeURIComponent(organizationName)}/scopes/${encodeURIComponent(scopeId)}/agreementCollections`;
    const reuse = (existing: Record<string, unknown>) => {
        if (
            !matchesExpected(
                agreementCollectionIdentity(existing),
                agreementCollectionIdentity(input),
            )
        )
            throw new DuplicateKeyError(
                `Agreement collection '${collectionName}' already exists with different contents`,
            );
        return {
            id: resourceId(existing, `Agreement collection '${collectionName}'`),
            name: String(existing.name || collectionName),
        };
    };

    const findExisting = async () => {
        const collections = await requestJson<Record<string, unknown>[]>(collectionUrl, {
            headers: serviceHeaders(),
        });
        return collections.find((candidate) => candidate.name === collectionName);
    };

    const existing = await findExisting();
    if (existing) return reuse(existing);

    try {
        const created = await requestJson<Record<string, unknown>>(collectionUrl, {
            method: 'POST',
            headers: serviceHeaders(),
            body: JSON.stringify(input),
        });
        return {
            id: resourceId(created, `Agreement collection '${collectionName}'`),
            name: String(created.name || collectionName),
        };
    } catch (error) {
        const createdByConcurrentAttempt = await findExisting();
        if (createdByConcurrentAttempt) return reuse(createdByConcurrentAttempt);
        throw error;
    }
};

export const ensureAgreementVersion = async (
    organizationName: string,
    scopeId: string,
    collectionId: string,
    agreementTemplateName: string,
    payload: MaterializedOnboarding,
    prepareForCreate: () => Promise<MaterializedOnboarding>,
) => {
    const versionsUrl = `${bootEnv.REGISTRY_SERVICE_URL}/api/v1/organizations/${encodeURIComponent(organizationName)}/scopes/${encodeURIComponent(scopeId)}/agreementCollections/${encodeURIComponent(collectionId)}/agreementVersions`;
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
            String(existing.contract?.agreementTemplateName) !== agreementTemplateName ||
            !sameValidity(existing.contract?.validity, validity as Record<string, unknown>)
        )
            throw new DuplicateKeyError(
                `Agreement collection '${collectionId}' already contains a different version`,
            );
        return { versionNumber: existing.versionNumber, reused: true };
    }
    const createPayload = await prepareForCreate();
    const signatures = createPayload.agreement.signatures.map((signature) => ({
        guaranteeName: signature.guaranteeTemplateName,
        metrics: signature.metrics,
    }));
    const created = await requestJson<Record<string, unknown>>(versionsUrl, {
        method: 'POST',
        headers: serviceHeaders(),
        body: JSON.stringify({
            contract: {
                ...createPayload.agreement.contract,
                agreementTemplateName,
            },
            signatures,
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
    scopeId: string,
    collectionId: string,
    agreementVersion: number,
    date: string,
) =>
    requestJson(
        `${bootEnv.REGISTRY_SERVICE_URL}/api/v1/organizations/${encodeURIComponent(organizationName)}/scopes/${encodeURIComponent(scopeId)}/agreementCollections/${encodeURIComponent(collectionId)}/agreementVersions/${agreementVersion}/states/generate?isAsync=true`,
        {
            method: 'POST',
            headers: serviceHeaders(),
            body: JSON.stringify({ date, temporalMode: 'CAPTURE', ifExists: 'KEEP' }),
        },
    );

export const ensureCalculationSchedule = async (
    organizationName: string,
    scopeId: string,
    collectionId: string,
    agreementVersion: number,
) => {
    const tasksUrl = `${bootEnv.REGISTRY_SERVICE_URL}/api/v1/organizations/${encodeURIComponent(organizationName)}/scopes/${encodeURIComponent(scopeId)}/agreementCollections/${encodeURIComponent(collectionId)}/agreementVersions/${agreementVersion}/tasks/states/consolidated`;
    const tasks = await requestJson<Record<string, unknown>[]>(tasksUrl, {
        headers: serviceHeaders(),
    });
    if (tasks.length) return tasks;
    return requestJson<Record<string, unknown>[]>(tasksUrl, {
        method: 'POST',
        headers: serviceHeaders(),
        body: JSON.stringify({}),
    });
};

export const ensureDashboard = async (
    organizationName: string,
    scopeId: string,
    collectionId: string,
    agreementVersion: number,
) =>
    requestJson<Record<string, unknown>>(
        `${bootEnv.REPORTER_SERVICE_URL}/api/v1/dashboards/organizations/${encodeURIComponent(organizationName)}/scopes/${encodeURIComponent(scopeId)}/agreementCollections/${encodeURIComponent(collectionId)}/agreementVersions/${agreementVersion}`,
        {
            method: 'POST',
            headers: serviceHeaders(),
        },
    );
