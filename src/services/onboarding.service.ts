import { createHash } from 'node:crypto';
import mongoose from 'mongoose';
import type { IOnboarding } from '../models/onboarding.model.js';
import * as github from '../providers/github.provider.js';
import * as onboardingRepository from '../repositories/onboarding.repository.js';
import type {
    AuthenticatedUser,
    IntegrationProvider,
    OnboardingAnswers,
} from '../types/onboarding.js';
import { ForbiddenError, NotFoundError, ValidationError } from '../utils/customErrors.js';
import * as agreementTemplates from './agreementTemplate.service.js';
import {
    readPath,
    resolveOptions,
    validateAnswers,
    validatePartialAnswers,
} from './requirement.service.js';
import { TOTAL_PROVISIONING_CHECKPOINTS } from './provisioning.service.js';

export const getAgreementTemplates = () => agreementTemplates.listPublic();

const requiredIntegrations = (onboarding: IOnboarding) => onboarding.requiredIntegrations || [];

const integrationConnected = (onboarding: IOnboarding, provider: IntegrationProvider) => {
    if (provider === 'github')
        return Boolean(
            onboarding.integrations?.github?.installationId ||
            onboarding.integrations?.github?.installations?.length,
        );
    return Boolean(onboarding.integrations?.zenhub?.connectionId);
};

const selectRepositoryInstallation = (onboarding: IOnboarding, answers: OnboardingAnswers) => {
    const installationId = Number(readPath(answers.github_repository, 'installationId'));
    if (!Number.isSafeInteger(installationId)) return;
    const githubIntegration = onboarding.integrations?.github;
    const installation = githubIntegration?.installations?.find(
        (candidate) => candidate.id === installationId,
    );
    if (!installation && githubIntegration?.installationId !== installationId)
        throw new ValidationError('The selected repository belongs to an unavailable installation');
    onboarding.integrations = {
        ...onboarding.integrations,
        github: {
            ...githubIntegration,
            installationId,
            accountLogin: installation?.accountLogin || githubIntegration?.accountLogin,
            accountType: installation?.accountType || githubIntegration?.accountType,
        },
    };
};

export const create = async (user: AuthenticatedUser, agreementTemplateId: string) => {
    if (!agreementTemplateId) throw new ValidationError('Select an agreement template');
    const option = await agreementTemplates.getPublic(agreementTemplateId);
    const required = option.onboardingDefinition.modules
        .filter((module) => module.kind === 'external')
        .map((module) => module.id)
        .filter((id): id is IntegrationProvider => id === 'github' || id === 'zenhub');
    return onboardingRepository.createOnboarding({
        userId: user.id,
        username: user.username,
        requiredIntegrations: required,
        agreementTemplate: option.agreementTemplate,
        onboardingDefinition: option.onboardingDefinition,
        answers: {},
    });
};

export const getOwned = async (id: string, userId: string) => {
    if (!mongoose.isValidObjectId(id)) throw new ValidationError('Invalid onboarding ID');
    const onboarding = await onboardingRepository.findOwned(id, userId);
    if (!onboarding) throw new NotFoundError('Onboarding not found');
    if (!onboarding.onboardingDefinition)
        throw new ValidationError(
            'This onboarding uses an obsolete format. Start a new onboarding.',
        );
    return onboarding;
};

export const connectIntegration = async (
    id: string,
    userId: string,
    provider: IntegrationProvider,
) => {
    const onboarding = await getOwned(id, userId);
    if (!requiredIntegrations(onboarding).includes(provider))
        throw new ValidationError(`${provider} is not required by this agreement template`);
    if (onboarding.status === 'COMPLETED' || onboarding.status === 'PROVISIONING')
        throw new ValidationError('This onboarding can no longer change its integrations');

    if (provider === 'github') {
        const authorization = github.buildUserAuthorization(onboarding);
        onboarding.integrations = {
            ...onboarding.integrations,
            github: {
                ...onboarding.integrations?.github,
                stateNonce: authorization.nonceHash,
                statePurpose: authorization.purpose,
            },
        };
        onboarding.status = 'AUTHORIZING';
        await onboarding.save();
        return { authorizationUrl: authorization.url };
    }

    onboarding.integrations = {
        ...onboarding.integrations,
        zenhub: {
            connectionId: `mock-zenhub-${onboarding._id.toString()}`,
            accountName: 'ZenHub demo account',
            mocked: true,
        },
    };
    onboarding.status = 'CONFIGURING';
    await onboarding.save();
    return { onboarding };
};

export const completeGitHubAuthorization = async (params: {
    state: string;
    installationId?: number;
    code?: string;
}) => {
    const state = github.verifyState(params.state);
    const onboarding = await onboardingRepository.findById(state.onboardingId);
    if (!onboarding || onboarding.userId !== state.userId)
        throw new ForbiddenError('GitHub authorization does not match an onboarding session');
    const nonceHash = createHash('sha256').update(state.nonce).digest('hex');
    if (
        onboarding.integrations?.github?.stateNonce !== nonceHash ||
        onboarding.integrations.github.statePurpose !== state.purpose
    )
        throw new ForbiddenError('GitHub authorization has already been used or was replaced');
    const installations = await github.discoverUserInstallations(params.code);
    if (params.installationId && !installations.some(({ id }) => id === params.installationId))
        throw new ForbiddenError('GitHub installation is not associated with this user');

    if (!installations.length) {
        if (state.purpose === 'install')
            throw new ForbiddenError(
                'The GitHub installation is not accessible yet or is awaiting organization approval',
            );
        const authorization = github.buildInstallationAuthorization(onboarding);
        onboarding.integrations = {
            ...onboarding.integrations,
            github: {
                installations: [],
                stateNonce: authorization.nonceHash,
                statePurpose: authorization.purpose,
            },
        };
        onboarding.status = 'AUTHORIZING';
        await onboarding.save();
        return { redirectUrl: authorization.url };
    }

    const selected =
        installations.find(({ id }) => id === params.installationId) ||
        (installations.length === 1 ? installations[0] : undefined);
    onboarding.integrations = {
        ...onboarding.integrations,
        github: {
            installations,
            installationId: selected?.id,
            accountLogin: selected?.accountLogin,
            accountType: selected?.accountType,
        },
    };
    onboarding.status = 'CONFIGURING';
    await onboarding.save();
    return { onboarding };
};

export const requirementOptions = async (
    id: string,
    user: AuthenticatedUser,
    requirementId: string,
    proposedAnswers: OnboardingAnswers,
) => {
    const onboarding = await getOwned(id, user.id);
    const requirement = onboarding.onboardingDefinition.requirements.find(
        ({ id: candidateId }) => candidateId === requirementId,
    );
    if (!requirement) throw new NotFoundError('Onboarding requirement not found');
    const answers = { ...(onboarding.answers || {}), ...(proposedAnswers || {}) };
    return resolveOptions(onboarding, requirement, answers, user);
};

export const saveAnswers = async (id: string, userId: string, answers: OnboardingAnswers) => {
    const onboarding = await getOwned(id, userId);
    if (!answers || typeof answers !== 'object' || Array.isArray(answers))
        throw new ValidationError('Onboarding answers are required');
    if (onboarding.status === 'PROVISIONING' || onboarding.status === 'COMPLETED')
        throw new ValidationError('Provisioning has already started');
    if (onboarding.checkpoints.length)
        throw new ValidationError(
            'Provisioning already created resources; retry without changing the configuration',
        );
    validatePartialAnswers(onboarding, answers);
    selectRepositoryInstallation(onboarding, answers);
    onboarding.answers = answers;
    onboarding.status = 'CONFIGURING';
    onboarding.failure = undefined;
    await onboarding.save();
    return onboarding;
};

export const configure = async (
    id: string,
    user: AuthenticatedUser,
    answers: OnboardingAnswers,
) => {
    const onboarding = await getOwned(id, user.id);
    if (!answers || typeof answers !== 'object' || Array.isArray(answers))
        throw new ValidationError('Onboarding answers are required');
    const missingIntegrations = requiredIntegrations(onboarding).filter(
        (provider) => !integrationConnected(onboarding, provider),
    );
    if (missingIntegrations.length)
        throw new ValidationError(
            `Connect required integrations first: ${missingIntegrations.join(', ')}`,
        );
    if (onboarding.status === 'PROVISIONING' || onboarding.status === 'COMPLETED')
        throw new ValidationError('Provisioning has already started');
    if (onboarding.checkpoints.length)
        throw new ValidationError(
            'Provisioning already created resources; retry without changing the configuration',
        );

    await validateAnswers(onboarding, answers, user);
    selectRepositoryInstallation(onboarding, answers);
    onboarding.answers = answers;
    onboarding.status = 'READY';
    onboarding.failure = undefined;
    await onboarding.save();
    return onboarding;
};

export const queueProvisioning = async (id: string, userId: string) => {
    const onboarding = await getOwned(id, userId);
    if (!onboarding.answers || !Object.keys(onboarding.answers).length)
        throw new ValidationError('Complete configuration first');
    if (onboarding.status === 'COMPLETED') return onboarding;
    if (!['READY', 'FAILED'].includes(onboarding.status))
        throw new ValidationError('Onboarding is not ready for provisioning');
    onboarding.status = 'PROVISIONING';
    onboarding.failure = undefined;
    onboarding.result = {
        ...(onboarding.result || {}),
        totalCheckpoints: TOTAL_PROVISIONING_CHECKPOINTS,
    };
    onboarding.leaseOwner = undefined;
    onboarding.leaseUntil = undefined;
    await onboarding.save();
    return onboarding;
};
