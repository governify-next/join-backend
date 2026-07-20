import { hostname } from 'node:os';
import type { IOnboarding } from '../models/onboarding.model.js';
import * as onboardingRepository from '../repositories/onboarding.repository.js';
import { bootEnv } from '../config/bootConfig.js';
import { requestJson } from '../utils/http.js';
import { getLogger } from '../utils/logger.js';
import * as github from '../providers/github.provider.js';
import { DuplicateKeyError, ForbiddenError } from '../utils/customErrors.js';
import { serviceHeaders } from '../utils/serviceAuthentication.js';
import * as agreementTemplates from './agreementTemplate.service.js';
import { buildSignatures } from './signature.service.js';
import { organizationsForUser } from './scopeManager.service.js';

const logger = getLogger().setTag('provisioning.service.ts');
let timer: ReturnType<typeof setInterval> | undefined;
let active = false;

const downstreamStatus = (error: unknown) =>
    (error as { details?: { status?: number } }).details?.status;

const sameValidity = (
    left: Record<string, unknown> | undefined,
    right: { initial: string; end: string; timezone: string },
) =>
    left?.timezone === right.timezone &&
    new Date(String(left.initial)).getTime() === new Date(right.initial).getTime() &&
    new Date(String(left.end)).getTime() === new Date(right.end).getTime();

const checkpoint = async (
    onboarding: IOnboarding,
    name: string,
    result?: Record<string, unknown>,
) => {
    if (!onboarding.checkpoints.includes(name)) onboarding.checkpoints.push(name);
    onboarding.result = { ...(onboarding.result || {}), ...(result || {}) };
    onboarding.leaseUntil = new Date(Date.now() + bootEnv.WORKER_LEASE_MS);
    await onboarding.save();
};

const provision = async (onboarding: IOnboarding) => {
    const config = onboarding.configuration!;
    let template = onboarding.agreementTemplate;
    const installationId = onboarding.integration!.installationId!;
    const collectionName = `tpa-${config.elementName}`;
    const onboardingId = onboarding._id.toString();

    if (!onboarding.checkpoints.includes('validated')) {
        const [organizations, repositories, projects, currentTemplate] = await Promise.all([
            organizationsForUser(onboarding.username, onboarding.userId, serviceHeaders()),
            github.listRepositories(installationId),
            github.listProjects(installationId, config.repository.owner),
            agreementTemplates.getPublic(template._id),
        ]);
        if (!organizations.some((organization) => organization.name === config.organizationName))
            throw new ForbiddenError('The user is no longer a member of the target organization');
        if (!repositories.some((repository) => repository.id === config.repository.id))
            throw new ForbiddenError('The GitHub App can no longer access the selected repository');
        if (!projects.some((project) => project.id === config.project.id))
            throw new ForbiddenError('The GitHub App can no longer access the selected project');
        template = currentTemplate;
        onboarding.agreementTemplate = currentTemplate;
        await checkpoint(onboarding, 'validated');
    }

    if (!onboarding.checkpoints.includes('template')) {
        try {
            await requestJson(
                `${bootEnv.REGISTRY_SERVICE_URL}/api/v1/organizations/${encodeURIComponent(config.organizationName)}/agreementTemplates`,
                {
                    method: 'POST',
                    headers: serviceHeaders(),
                    body: JSON.stringify({
                        name: template.name,
                        displayName: template.displayName,
                        description: template.description,
                        isPublic: false,
                        guarantees: template.guarantees,
                    }),
                },
            );
        } catch (error) {
            if (downstreamStatus(error) !== 409) throw error;
            const target = await requestJson<Record<string, unknown>>(
                `${bootEnv.REGISTRY_SERVICE_URL}/api/v1/organizations/${encodeURIComponent(config.organizationName)}/agreementTemplates/${encodeURIComponent(template.name)}`,
                { headers: serviceHeaders() },
            );
            const sameTemplate =
                target.name === template.name &&
                target.displayName === template.displayName &&
                target.description === template.description &&
                JSON.stringify(target.guarantees) === JSON.stringify(template.guarantees);
            if (!sameTemplate)
                throw new DuplicateKeyError(
                    `Agreement template '${template.name}' already exists with different metadata`,
                );
        }
        await checkpoint(onboarding, 'template');
    }

    if (!onboarding.checkpoints.includes('element')) {
        const elementUrl = `${bootEnv.SCOPE_MANAGER_SERVICE_URL}/api/v1/organizations/${encodeURIComponent(config.organizationName)}/elements`;
        try {
            await requestJson(elementUrl, {
                method: 'POST',
                headers: serviceHeaders(),
                body: JSON.stringify({
                    name: config.elementName,
                    description: `GitHub repository ${config.repository.fullName}`,
                    fields: [],
                    permissions: { view: [], edit: [], delete: [], create: [] },
                    auditConfig: {
                        provider: 'github',
                        repositoryId: config.repository.id,
                        repository: config.repository.fullName,
                        joinOnboardingId: onboardingId,
                    },
                    parts: [],
                }),
            });
        } catch (error) {
            if (downstreamStatus(error) !== 409) throw error;
            const existing = await requestJson<{ auditConfig?: Record<string, unknown> }>(
                `${elementUrl}/${encodeURIComponent(config.elementName)}`,
                { headers: serviceHeaders() },
            );
            if (
                existing.auditConfig?.joinOnboardingId !== onboardingId ||
                existing.auditConfig?.repositoryId !== config.repository.id
            )
                throw new DuplicateKeyError(
                    `Element '${config.elementName}' already belongs to another project`,
                );
        }
        await checkpoint(onboarding, 'element');
    }

    if (!onboarding.checkpoints.includes('collection')) {
        const collectionsUrl = `${bootEnv.REGISTRY_SERVICE_URL}/api/v1/organizations/${encodeURIComponent(config.organizationName)}/elements/${encodeURIComponent(config.elementName)}/agreementCollections`;
        try {
            await requestJson(collectionsUrl, {
                method: 'POST',
                headers: serviceHeaders(),
                body: JSON.stringify({
                    name: collectionName,
                    displayName: `TPA ${config.elementName}`,
                    fields: {},
                    permissions: {},
                }),
            });
        } catch (error) {
            if (downstreamStatus(error) !== 409) throw error;
            const existing = await requestJson<{ name: string; displayName: string }>(
                `${collectionsUrl}/${encodeURIComponent(collectionName)}`,
                { headers: serviceHeaders() },
            );
            if (
                existing.name !== collectionName ||
                existing.displayName !== `TPA ${config.elementName}`
            )
                throw new DuplicateKeyError(
                    `Agreement collection '${collectionName}' has conflicting metadata`,
                );
        }
        await checkpoint(onboarding, 'collection', { collectionName });
    }

    if (!onboarding.checkpoints.includes('agreementVersion')) {
        const guaranteeTemplates = await agreementTemplates.listGuaranteeTemplates();
        const versionsUrl = `${bootEnv.REGISTRY_SERVICE_URL}/api/v1/organizations/${encodeURIComponent(config.organizationName)}/elements/${encodeURIComponent(config.elementName)}/agreementCollections/${encodeURIComponent(collectionName)}/agreementVersions`;
        const existingVersions = await requestJson<
            { contract?: { agreementTemplateName?: string; validity?: Record<string, unknown> } }[]
        >(`${versionsUrl}?expand=true`, { headers: serviceHeaders() });
        let version: Record<string, unknown>;
        if (existingVersions.length) {
            const existing = existingVersions.at(-1)!;
            if (
                existing.contract?.agreementTemplateName !== template.name ||
                !sameValidity(existing.contract.validity, config.validity)
            )
                throw new DuplicateKeyError(
                    `Agreement collection '${collectionName}' already contains a different version`,
                );
            version = existing as Record<string, unknown>;
        } else {
            version = await requestJson<Record<string, unknown>>(versionsUrl, {
                method: 'POST',
                headers: serviceHeaders(),
                body: JSON.stringify({
                    contract: {
                        agreementTemplateName: template.name,
                        validity: config.validity,
                    },
                    signatures: buildSignatures(
                        config,
                        installationId,
                        template.guarantees.map((guarantee) => guarantee.guaranteeTemplateName),
                        guaranteeTemplates,
                    ),
                }),
            });
        }
        await checkpoint(onboarding, 'agreementVersion', { agreementVersion: version });
    }

    if (!onboarding.checkpoints.includes('initialCalculation')) {
        const calculationDate =
            (onboarding.result?.initialCalculationDate as string | undefined) ||
            new Date().toISOString();
        if (!onboarding.result?.initialCalculationDate) {
            onboarding.result = {
                ...(onboarding.result || {}),
                initialCalculationDate: calculationDate,
            };
            await onboarding.save();
        }
        await requestJson(
            `${bootEnv.REGISTRY_SERVICE_URL}/api/v1/organizations/${encodeURIComponent(config.organizationName)}/elements/${encodeURIComponent(config.elementName)}/agreementCollections/${encodeURIComponent(collectionName)}/agreementVersions/auditableVersion/states/generate?isAsync=true`,
            {
                method: 'POST',
                headers: serviceHeaders(),
                body: JSON.stringify({ date: calculationDate }),
            },
        );
        await checkpoint(onboarding, 'initialCalculation');
    }

    if (!onboarding.checkpoints.includes('schedule')) {
        const tasksUrl = `${bootEnv.DIRECTOR_SERVICE_URL}/api/v1/tasks`;
        const tasks = await requestJson<Record<string, unknown>[]>(tasksUrl, {
            headers: serviceHeaders(),
        });
        const taskInput = {
            orgName: config.organizationName,
            elementName: config.elementName,
            agColName: collectionName,
        };
        let task = tasks.find(
            (candidate) =>
                candidate.script === 'generateStates' &&
                candidate.type === 'RECURRING' &&
                candidate.interval === 60 * 60 * 1_000 &&
                JSON.stringify(candidate.inputArgs) === JSON.stringify(taskInput),
        );
        if (!task) {
            task = await requestJson<Record<string, unknown>>(tasksUrl, {
                method: 'POST',
                headers: serviceHeaders(),
                body: JSON.stringify({
                    script: 'generateStates',
                    inputArgs: taskInput,
                    type: 'RECURRING',
                    enabled: true,
                    startDate: new Date().toISOString(),
                    endDate: config.validity.end,
                    interval: 60 * 60 * 1_000,
                }),
            });
        }
        await checkpoint(onboarding, 'schedule', { task });
    }

    onboarding.status = 'COMPLETED';
    onboarding.leaseOwner = undefined;
    onboarding.leaseUntil = undefined;
    onboarding.result = {
        ...(onboarding.result || {}),
        organizationName: config.organizationName,
        elementName: config.elementName,
        collectionName,
        completedAt: new Date().toISOString(),
    };
    await onboarding.save();
};

export const runOnce = async () => {
    if (active) return;
    active = true;
    let onboarding: IOnboarding | null = null;
    try {
        onboarding = await onboardingRepository.claimNext();
        if (onboarding) await provision(onboarding);
    } catch (error) {
        logger.error('Provisioning failed', error);
        if (onboarding) {
            onboarding.status = 'FAILED';
            onboarding.failure = {
                step: onboarding.checkpoints.at(-1) || 'validation',
                message: error instanceof Error ? error.message : 'Unknown provisioning error',
                retryable: true,
                occurredAt: new Date(),
            };
            onboarding.leaseOwner = undefined;
            onboarding.leaseUntil = undefined;
            await onboarding.save();
        }
    } finally {
        active = false;
    }
};

export const startWorker = () => {
    if (timer) return;
    logger.log(`Starting provisioning worker on ${hostname()}`);
    timer = setInterval(() => void runOnce(), bootEnv.WORKER_INTERVAL_MS);
    void runOnce();
};

export const stopWorker = () => {
    if (timer) clearInterval(timer);
    timer = undefined;
};
