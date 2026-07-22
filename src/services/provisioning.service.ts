import { hostname } from 'node:os';
import { bootEnv } from '../config/bootConfig.js';
import type { IOnboarding } from '../models/onboarding.model.js';
import * as github from '../providers/github.provider.js';
import * as onboardingRepository from '../repositories/onboarding.repository.js';
import type { IntegrationProvider, MaterializedOnboarding } from '../types/onboarding.js';
import { ForbiddenError, ValidationError } from '../utils/customErrors.js';
import { getLogger } from '../utils/logger.js';
import { serviceHeaders } from '../utils/serviceAuthentication.js';
import * as agreementTemplates from './agreementTemplate.service.js';
import * as ecosystem from './ecosystemPublisher.service.js';
import { materialize, withInitialGitHubCredential } from './materialization.service.js';
import { readPath } from './requirement.service.js';
import { organizationsForUser } from './scopeManager.service.js';

const logger = getLogger().setTag('provisioning.service.ts');
const PROVISIONING_CHECKPOINTS = [
    'validated',
    'materialized',
    'guaranteeTemplates',
    'agreementTemplate',
    'scopeElement',
    'agreementCollection',
    'agreementVersion',
    'initialCalculation',
    'schedule',
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
    const organizationName = String(readPath(answers.scope_organization, 'name') || '');
    const organizations = await organizationsForUser(
        onboarding.username,
        onboarding.userId,
        serviceHeaders(),
    );
    if (!organizations.some((organization) => organization.name === organizationName))
        throw new ForbiddenError('The user is no longer a member of the target organization');

    const repository = answers.github_repository;
    const installationId = onboarding.integrations?.github?.installationId;
    if (!repository || !installationId) return;
    const repositories = await github.listRepositories(installationId);
    if (
        !repositories.some(
            (candidate) => String(candidate.id) === String(readPath(repository, 'id')),
        )
    )
        throw new ForbiddenError('The GitHub App can no longer access the selected repository');

    const project = answers.github_project;
    if (!project) return;
    const projects = await github.listProjects(
        installationId,
        String(readPath(project, 'owner') || readPath(repository, 'owner') || ''),
    );
    if (!projects.some((candidate) => candidate.id === readPath(project, 'id')))
        throw new ForbiddenError('The GitHub App can no longer access the selected Project');
};

const provision = async (onboarding: IOnboarding) => {
    if (!onboarding.answers) throw new ValidationError('Onboarding answers are missing');

    if (!onboarding.checkpoints.includes('validated')) {
        const current = await agreementTemplates.getPublic(onboarding.agreementTemplate._id);
        if (current.onboardingDefinition.id !== onboarding.onboardingDefinition.id)
            throw new ValidationError('The onboarding definition changed; start a new onboarding');
        const missing = onboarding.requiredIntegrations.filter(
            (provider) => !connected(onboarding, provider),
        );
        if (missing.length)
            throw new ForbiddenError(`Required integrations are missing: ${missing.join(', ')}`);
        onboarding.agreementTemplate = current.agreementTemplate;
        onboarding.onboardingDefinition = current.onboardingDefinition;
        await revalidateResources(onboarding);
        await checkpoint(onboarding, 'validated');
    }

    const guaranteeTemplates = await agreementTemplates.listGuaranteeTemplates();
    let payload = onboarding.result?.materialized as MaterializedOnboarding | undefined;
    if (!onboarding.checkpoints.includes('materialized') || !payload) {
        payload = materialize(onboarding, guaranteeTemplates);
        await checkpoint(onboarding, 'materialized', { materialized: payload });
    }

    const organizationName = String(payload.scope.organizationName);
    const elementName = String(readPath(payload.scope, 'element.name'));
    const guaranteeNames = new Set(
        payload.agreement.agreementTemplate.guarantees.map(
            ({ guaranteeTemplateName }) => guaranteeTemplateName,
        ),
    );

    if (!onboarding.checkpoints.includes('guaranteeTemplates')) {
        await ecosystem.ensureGuaranteeTemplates(
            guaranteeTemplates.filter(({ name }) => guaranteeNames.has(name)),
        );
        await checkpoint(onboarding, 'guaranteeTemplates');
    }
    if (!onboarding.checkpoints.includes('agreementTemplate')) {
        await ecosystem.ensureAgreementTemplate(organizationName, payload);
        await checkpoint(onboarding, 'agreementTemplate');
    }
    if (!onboarding.checkpoints.includes('scopeElement')) {
        await ecosystem.ensureScopeElement(
            onboarding._id.toString(),
            organizationName,
            elementName,
            payload,
        );
        await checkpoint(onboarding, 'scopeElement');
    }

    let collectionName = String(onboarding.result?.collectionName || '');
    if (!onboarding.checkpoints.includes('agreementCollection') || !collectionName) {
        collectionName = await ecosystem.ensureAgreementCollection(
            organizationName,
            elementName,
            payload,
        );
        await checkpoint(onboarding, 'agreementCollection', { collectionName });
    }
    if (!onboarding.checkpoints.includes('agreementVersion')) {
        const agreementVersion = await ecosystem.ensureAgreementVersion(
            organizationName,
            elementName,
            collectionName,
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
        await checkpoint(onboarding, 'agreementVersion', { agreementVersion });
    }
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
            elementName,
            collectionName,
            calculationDate,
        );
        await checkpoint(onboarding, 'initialCalculation');
    }
    if (!onboarding.checkpoints.includes('schedule')) {
        const task = await ecosystem.ensureCalculationSchedule(
            organizationName,
            elementName,
            collectionName,
            payload,
        );
        await checkpoint(onboarding, 'schedule', { task });
    }

    onboarding.status = 'COMPLETED';
    onboarding.leaseOwner = undefined;
    onboarding.leaseUntil = undefined;
    onboarding.result = {
        ...(onboarding.result || {}),
        organizationName,
        elementName,
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
