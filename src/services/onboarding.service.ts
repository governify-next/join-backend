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
import {
    DuplicateKeyError,
    ForbiddenError,
    NotFoundError,
    ValidationError,
} from '../utils/customErrors.js';
import * as agreementTemplates from './agreementTemplate.service.js';
import { resolveOptions, validateAnswers, validatePartialAnswers } from './requirement.service.js';
import { TOTAL_PROVISIONING_CHECKPOINTS } from './provisioning.service.js';

export const getAgreementTemplates = () => agreementTemplates.listPublic();

const requiredIntegrations = (onboarding: IOnboarding) => onboarding.requiredIntegrations || [];

const integrationConnected = (onboarding: IOnboarding, provider: IntegrationProvider) => {
    if (provider === 'github') return Boolean(onboarding.integrations?.github?.installationId);
    return Boolean(onboarding.integrations?.zenhub?.connectionId);
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
        const authorization = github.buildAuthorization(onboarding);
        onboarding.integrations = {
            ...onboarding.integrations,
            github: { stateNonce: authorization.nonceHash },
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
    installationId: number;
    code?: string;
}) => {
    const state = github.verifyState(params.state);
    const onboarding = await onboardingRepository.findById(state.onboardingId);
    if (!onboarding || onboarding.userId !== state.userId)
        throw new ForbiddenError('GitHub authorization does not match an onboarding session');
    const nonceHash = createHash('sha256').update(state.nonce).digest('hex');
    if (onboarding.integrations?.github?.stateNonce !== nonceHash)
        throw new ForbiddenError('GitHub authorization has already been used or was replaced');
    const installation = await github.verifyInstallationForUser(params.installationId, params.code);
    onboarding.integrations = {
        ...onboarding.integrations,
        github: {
            installationId: installation.id,
            accountLogin: installation.account.login,
            accountType: installation.account.type,
        },
    };
    onboarding.status = 'CONFIGURING';
    await onboarding.save();
    return onboarding;
};

export const requirementOptions = async (
    id: string,
    user: AuthenticatedUser,
    accessToken: string,
    requirementId: string,
    proposedAnswers: OnboardingAnswers,
) => {
    const onboarding = await getOwned(id, user.id);
    const requirement = onboarding.onboardingDefinition.requirements.find(
        ({ id: candidateId }) => candidateId === requirementId,
    );
    if (!requirement) throw new NotFoundError('Onboarding requirement not found');
    const answers = { ...(onboarding.answers || {}), ...(proposedAnswers || {}) };
    return resolveOptions(onboarding, requirement, answers, user, accessToken);
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
    onboarding.answers = answers;
    onboarding.status = 'CONFIGURING';
    onboarding.failure = undefined;
    await onboarding.save();
    return onboarding;
};

export const configure = async (
    id: string,
    user: AuthenticatedUser,
    accessToken: string,
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

    await validateAnswers(onboarding, answers, user, accessToken);
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
    try {
        const joined = await onboardingRepository.reserveJoinedProject(onboarding);
        if (joined.onboardingId.toString() !== onboarding._id.toString())
            throw new DuplicateKeyError('This source is already joined to the organization');
    } catch (error) {
        if (error instanceof DuplicateKeyError) throw error;
        if ((error as { code?: number }).code === 11000)
            throw new DuplicateKeyError(
                'The source or element name is already used in this organization',
            );
        throw error;
    }
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
