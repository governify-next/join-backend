import { hostname } from 'node:os';
import { bootEnv } from '../config/bootConfig.js';
import type { IOnboarding } from '../models/onboarding.model.js';
import * as github from '../providers/github.provider.js';
import * as onboardingRepository from '../repositories/onboarding.repository.js';
import type { IntegrationProvider, MaterializedOnboarding } from '../types/onboarding.js';
import { ForbiddenError, ValidationError } from '../utils/customErrors.js';
import { getLogger } from '../utils/logger.js';
import * as agreementTemplates from './agreementTemplate.service.js';
import * as ecosystem from './ecosystemPublisher.service.js';
import {
    materialize,
    materializeScope,
    withInitialGitHubCredential,
} from './materialization.service.js';
import { readPath } from './requirement.service.js';
import { organizationsForUser } from './scopeManager.service.js';

const logger = getLogger().setTag('provisioning.service.ts');
const PROVISIONING_CHECKPOINTS = [
    'validated',
    'materialized',
    'agreementTemplate',
    'scope',
    'agreementCollection',
    'agreementVersion',
    'initialCalculation',
    'schedule',
    'dashboard',
] as const;
export const TOTAL_PROVISIONING_CHECKPOINTS = PROVISIONING_CHECKPOINTS.length;
let timer: ReturnType<typeof setInterval> | undefined;
let active = false;

const connected = (onboarding: IOnboarding, provider: IntegrationProvider) =>
    provider === 'github'
        ? Boolean(onboarding.integrations?.github?.installationId)
        : Boolean(onboarding.integrations?.zenhub?.connectionId);

const checkpoint = async (
    onboarding: IOnboarding,
    name: string,
    result?: Record<string, unknown>,
) => {
    if (!onboarding.checkpoints.includes(name)) onboarding.checkpoints.push(name);
    onboarding.result = {
        ...(onboarding.result || {}),
        totalCheckpoints: TOTAL_PROVISIONING_CHECKPOINTS,
        ...(result || {}),
    };
    onboarding.leaseUntil = new Date(Date.now() + bootEnv.WORKER_LEASE_MS);
    await onboarding.save();
};

const revalidateResources = async (onboarding: IOnboarding) => {
    const answers = onboarding.answers || {};
    const organizationId = String(readPath(answers.scope_organization, '_id') || '');
    const organizations = await organizationsForUser(onboarding.username, onboarding.userId);
    const organization = organizations.find(
        (candidate) => String(candidate._id) === organizationId,
    );
    if (!organization)
        throw new ForbiddenError('The user is no longer a member of the target organization');
    answers.scope_organization = organization;
    onboarding.answers = answers;

    const repository = answers.github_repository;
    const installationId = onboarding.integrations?.github?.installationId;
    if (!repository || !installationId) return organization;
    const repositories = await github.listRepositories(installationId);
    if (
        !repositories.some(
            (candidate) => String(candidate.id) === String(readPath(repository, 'id')),
        )
    )
        throw new ForbiddenError('The GitHub App can no longer access the selected repository');

    const project = answers.github_project;
    if (!project) return organization;
    const projects = await github.listProjects(
        installationId,
        String(readPath(project, 'owner') || readPath(repository, 'owner') || ''),
    );
    if (!projects.some((candidate) => candidate.id === readPath(project, 'id')))
        throw new ForbiddenError('The GitHub App can no longer access the selected Project');
    return organization;
};

const provision = async (onboarding: IOnboarding) => {
    if (!onboarding.answers) throw new ValidationError('Onboarding answers are missing');

    await revalidateResources(onboarding);
    const current = await agreementTemplates.getPublic(onboarding.agreementTemplate._id);
    if (current.onboardingDefinition.id !== onboarding.onboardingDefinition.id)
        throw new ValidationError('The onboarding definition changed; start a new onboarding');

    if (!onboarding.checkpoints.includes('validated')) {
        const missing = onboarding.requiredIntegrations.filter(
            (provider) => !connected(onboarding, provider),
        );
        if (missing.length)
            throw new ForbiddenError(`Required integrations are missing: ${missing.join(', ')}`);
        onboarding.agreementTemplate = current.agreementTemplate;
        onboarding.onboardingDefinition = current.onboardingDefinition;
        await checkpoint(onboarding, 'validated');
    }

    const guaranteeTemplates = await agreementTemplates.listGuaranteeTemplates();
    let payload = onboarding.result?.materialized as MaterializedOnboarding | undefined;
    const needsScopeTree =
        !onboarding.checkpoints.includes('scope') && !Array.isArray(payload?.scope.children);
    if (!onboarding.checkpoints.includes('materialized') || !payload || needsScopeTree) {
        onboarding.onboardingDefinition = current.onboardingDefinition;
        payload = payload
            ? { ...payload, scope: materializeScope(onboarding, payload.agreement) }
            : materialize(onboarding, guaranteeTemplates);
        await checkpoint(onboarding, 'materialized', { materialized: payload });
    }

    const organizationName = String(readPath(onboarding.answers.scope_organization, 'name') || '');
    const organizationId = String(readPath(onboarding.answers.scope_organization, '_id') || '');
    delete payload.scope.organizationName;
    payload.scope.organizationId = organizationId;
    const scopeName = String(readPath(payload.scope, 'name'));
    let agreementTemplateName = String(onboarding.result?.agreementTemplateName || '');
    if (!onboarding.checkpoints.includes('agreementTemplate') || !agreementTemplateName) {
        agreementTemplateName = await ecosystem.ensureAgreementTemplate(
            organizationName,
            organizationId,
            payload,
        );
        await checkpoint(onboarding, 'agreementTemplate', { agreementTemplateName });
    }
    const onboardingResourceId = onboarding._id.toString();
    const storedScopeId = String(onboarding.result?.scopeId || '');
    let scopeId = storedScopeId || onboardingResourceId;
    if (!onboarding.checkpoints.includes('scope') || !storedScopeId) {
        scopeId = await ecosystem.ensureScope(
            onboardingResourceId,
            organizationName,
            onboarding.userId,
            payload,
        );
        await checkpoint(onboarding, 'scope', { scopeId });
    }

    const storedCollectionId = String(onboarding.result?.collectionId || '');
    let collectionId = storedCollectionId;
    let collectionName = String(onboarding.result?.collectionName || '');
    if (!onboarding.checkpoints.includes('agreementCollection') || !storedCollectionId) {
        const collection = await ecosystem.ensureAgreementCollection(
            organizationName,
            scopeId,
            payload,
        );
        collectionId = collection.id;
        collectionName = collection.name;
        await checkpoint(onboarding, 'agreementCollection', { collectionId, collectionName });
    }

    let agreementVersion = onboarding.result?.agreementVersion as
        | Record<string, unknown>
        | undefined;
    let agreementVersionNumber = Number(agreementVersion?.versionNumber);
    if (
        !onboarding.checkpoints.includes('agreementVersion') ||
        !Number.isSafeInteger(agreementVersionNumber)
    ) {
        agreementVersion = await ecosystem.ensureAgreementVersion(
            organizationName,
            scopeId,
            collectionId,
            agreementTemplateName,
            payload,
            async () => {
                const installationId = onboarding.integrations?.github?.installationId;
                if (!installationId) return payload;
                const initialCredential = await github.createInstallationToken(installationId);
                return withInitialGitHubCredential(payload, {
                    installationId,
                    token: initialCredential.token,
                    expiresAt: initialCredential.expires_at,
                });
            },
        );
        agreementVersionNumber = Number(agreementVersion.versionNumber);
        await checkpoint(onboarding, 'agreementVersion', { agreementVersion });
    }
    if (!Number.isSafeInteger(agreementVersionNumber))
        throw new Error('Registry did not return an agreement version number');

    if (!onboarding.checkpoints.includes('initialCalculation')) {
        const calculationDate =
            (onboarding.result?.initialCalculationDate as string | undefined) ||
            ecosystem.calculationDate(payload);
        if (!onboarding.result?.initialCalculationDate) {
            onboarding.result = {
                ...(onboarding.result || {}),
                initialCalculationDate: calculationDate,
            };
            await onboarding.save();
        }
        await ecosystem.generateInitialState(
            organizationName,
            scopeId,
            collectionId,
            agreementVersionNumber,
            calculationDate,
        );
        await checkpoint(onboarding, 'initialCalculation');
    }
    if (!onboarding.checkpoints.includes('schedule')) {
        const tasks = await ecosystem.ensureCalculationSchedule(
            organizationName,
            scopeId,
            collectionId,
            agreementVersionNumber,
        );
        await checkpoint(onboarding, 'schedule', { tasks });
    }
    if (!onboarding.checkpoints.includes('dashboard')) {
        const dashboard = await ecosystem.ensureDashboard(
            organizationName,
            scopeId,
            collectionId,
            agreementVersionNumber,
        );
        await checkpoint(onboarding, 'dashboard', { dashboard });
    }

    onboarding.status = 'COMPLETED';
    onboarding.leaseOwner = undefined;
    onboarding.leaseUntil = undefined;
    onboarding.expiresAt = undefined;
    const result = { ...(onboarding.result || {}) };
    delete result.organizationName;
    onboarding.result = {
        ...result,
        organizationId,
        scopeId,
        scopeName,
        collectionId,
        collectionName,
        totalCheckpoints: TOTAL_PROVISIONING_CHECKPOINTS,
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
                step:
                    PROVISIONING_CHECKPOINTS.find(
                        (checkpointName) => !onboarding!.checkpoints.includes(checkpointName),
                    ) || 'completion',
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
    logger.log(`Starting ecosystem provisioning worker on ${hostname()}`);
    timer = setInterval(() => void runOnce(), bootEnv.WORKER_INTERVAL_MS);
    void runOnce();
};

export const stopWorker = () => {
    if (timer) clearInterval(timer);
    timer = undefined;
};
