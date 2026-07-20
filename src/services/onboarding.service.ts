import { createHash } from 'node:crypto';
import type { IOnboarding } from '../models/onboarding.model.js';
import * as onboardingRepository from '../repositories/onboarding.repository.js';
import type { AuthenticatedUser, OnboardingConfiguration } from '../types/onboarding.js';
import {
    DuplicateKeyError,
    ForbiddenError,
    NotFoundError,
    ValidationError,
} from '../utils/customErrors.js';
import * as github from '../providers/github.provider.js';
import mongoose from 'mongoose';
import * as agreementTemplates from './agreementTemplate.service.js';
import { organizationsForUser } from './scopeManager.service.js';

export const getAgreementTemplates = () => agreementTemplates.listPublic();

export const create = async (
    user: AuthenticatedUser,
    provider: string,
    agreementTemplateId: string,
) => {
    if (provider !== 'github') throw new ValidationError(`Provider '${provider}' is not supported`);
    if (!agreementTemplateId) throw new ValidationError('Select an agreement template');
    const agreementTemplate = await agreementTemplates.getPublic(agreementTemplateId);
    return onboardingRepository.createOnboarding({
        userId: user.id,
        username: user.username,
        provider: 'github',
        agreementTemplate,
    });
};

export const getOwned = async (id: string, userId: string) => {
    if (!mongoose.isValidObjectId(id)) throw new ValidationError('Invalid onboarding ID');
    const onboarding = await onboardingRepository.findOwned(id, userId);
    if (!onboarding) throw new NotFoundError('Onboarding not found');
    return onboarding;
};

export const startGitHubAuthorization = async (id: string, userId: string) => {
    const onboarding = await getOwned(id, userId);
    if (onboarding.status === 'COMPLETED' || onboarding.status === 'PROVISIONING')
        throw new ValidationError('This onboarding can no longer change its GitHub installation');
    const authorization = github.buildAuthorization(onboarding);
    onboarding.integration = { stateNonce: authorization.nonceHash };
    onboarding.status = 'AUTHORIZING';
    await onboarding.save();
    return { authorizationUrl: authorization.url };
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
    if (onboarding.integration?.stateNonce !== nonceHash)
        throw new ForbiddenError('GitHub authorization has already been used or was replaced');
    const installation = await github.verifyInstallationForUser(params.installationId, params.code);
    onboarding.integration = {
        installationId: installation.id,
        accountLogin: installation.account.login,
        accountType: installation.account.type,
    };
    onboarding.status = 'CONFIGURING';
    await onboarding.save();
    return onboarding;
};

const requireInstallation = (onboarding: IOnboarding) => {
    const installationId = onboarding.integration?.installationId;
    if (!installationId) throw new ValidationError('Connect GitHub before selecting resources');
    return installationId;
};

export const repositories = async (id: string, userId: string) => {
    const onboarding = await getOwned(id, userId);
    return github.listRepositories(requireInstallation(onboarding));
};

export const projects = async (id: string, userId: string, owner: string) => {
    const onboarding = await getOwned(id, userId);
    if (!owner) throw new ValidationError('owner query parameter is required');
    return github.listProjects(requireInstallation(onboarding), owner);
};

export const collaborators = async (id: string, userId: string, owner: string, repo: string) => {
    const onboarding = await getOwned(id, userId);
    if (!owner || !repo) throw new ValidationError('owner and repo query parameters are required');
    return github.listCollaborators(requireInstallation(onboarding), owner, repo);
};

export const organizations = async (id: string, user: AuthenticatedUser, accessToken: string) => {
    await getOwned(id, user.id);
    return organizationsForUser(user.username, user.id, {
        Authorization: `Bearer ${accessToken}`,
    });
};

const validateConfiguration = (config: OnboardingConfiguration) => {
    if (!config.repository?.id || !config.repository.owner || !config.repository.name)
        throw new ValidationError('A repository is required');
    if (!config.project?.id || !config.project.statusFieldId)
        throw new ValidationError('A GitHub Project and status field are required');
    if (!/^[A-Za-z0-9_-]{3,100}$/.test(config.elementName))
        throw new ValidationError(
            'Element name must be 3-100 letters, numbers, underscores, or hyphens',
        );
    if (!config.organizationName) throw new ValidationError('A Governify organization is required');
    const groups = Object.values(config.statusMapping || {});
    if (!config.statusMapping?.inProgress?.length)
        throw new ValidationError('Map at least one In Progress status');
    const mappedStatuses = groups.flat();
    if (new Set(mappedStatuses).size !== mappedStatuses.length)
        throw new ValidationError('A GitHub status may only map to one workflow state');
    if (!Intl.supportedValuesOf('timeZone').includes(config.validity?.timezone))
        throw new ValidationError('Select a valid IANA timezone');
    const initial = new Date(config.validity.initial);
    const end = new Date(config.validity.end);
    if (Number.isNaN(initial.getTime()) || Number.isNaN(end.getTime()) || end <= initial)
        throw new ValidationError('Validity end must be later than its start');
    if (end <= new Date()) throw new ValidationError('Validity end must be in the future');
};

export const configure = async (
    id: string,
    user: AuthenticatedUser,
    accessToken: string,
    configuration: OnboardingConfiguration,
) => {
    validateConfiguration(configuration);
    const onboarding = await getOwned(id, user.id);
    if (!onboarding.integration?.installationId)
        throw new ValidationError('GitHub must be connected first');
    if (onboarding.status === 'PROVISIONING' || onboarding.status === 'COMPLETED')
        throw new ValidationError('Provisioning has already started');

    const [availableOrganizations, availableRepositories, availableProjects] = await Promise.all([
        organizations(id, user, accessToken),
        github.listRepositories(onboarding.integration.installationId),
        github.listProjects(onboarding.integration.installationId, configuration.repository.owner),
    ]);
    if (!availableOrganizations.some((org) => org.name === configuration.organizationName))
        throw new ForbiddenError('You are not a member of the selected organization');
    const repository = availableRepositories.find(
        (repo) => repo.id === configuration.repository.id,
    );
    if (!repository)
        throw new ForbiddenError('The GitHub installation cannot access the selected repository');
    if (
        repository.owner !== configuration.repository.owner ||
        repository.name !== configuration.repository.name ||
        repository.fullName !== configuration.repository.fullName
    )
        throw new ValidationError('Repository metadata does not match GitHub');
    const project = availableProjects.find(
        (candidate) => candidate.id === configuration.project.id,
    );
    const statusField = project?.statusFields.find(
        (candidate) => candidate.id === configuration.project.statusFieldId,
    );
    if (!project || !statusField)
        throw new ForbiddenError(
            'The selected GitHub Project or status field is no longer accessible',
        );
    if (
        project.number !== configuration.project.number ||
        project.title !== configuration.project.title ||
        project.owner !== configuration.project.owner
    )
        throw new ValidationError('GitHub Project metadata does not match GitHub');
    const optionNames = new Set(statusField.options.map((option) => option.name));
    if (
        Object.values(configuration.statusMapping)
            .flat()
            .some((status) => !optionNames.has(status))
    )
        throw new ValidationError(
            'A mapped status no longer exists in the selected GitHub Project',
        );
    if (configuration.trackedUsers.length) {
        const collaborators = await github.listCollaborators(
            onboarding.integration.installationId,
            configuration.repository.owner,
            configuration.repository.name,
        );
        const collaboratorNames = new Set(
            collaborators.map((collaborator) => collaborator.username),
        );
        if (configuration.trackedUsers.some((username) => !collaboratorNames.has(username)))
            throw new ValidationError(
                'Every tracked user must be a current repository collaborator',
            );
    }

    onboarding.configuration = configuration;
    onboarding.status = 'READY';
    onboarding.failure = undefined;
    await onboarding.save();
    return onboarding;
};

export const queueProvisioning = async (id: string, userId: string) => {
    const onboarding = await getOwned(id, userId);
    if (!onboarding.configuration) throw new ValidationError('Complete configuration first');
    if (onboarding.status === 'COMPLETED') return onboarding;
    if (!['READY', 'FAILED'].includes(onboarding.status))
        throw new ValidationError('Onboarding is not ready for provisioning');
    try {
        const joined = await onboardingRepository.reserveJoinedProject(onboarding);
        if (joined.onboardingId.toString() !== onboarding._id.toString())
            throw new DuplicateKeyError('This repository is already joined to the organization');
    } catch (error) {
        if (error instanceof DuplicateKeyError) throw error;
        if ((error as { code?: number }).code === 11000)
            throw new DuplicateKeyError(
                'The repository or element name is already used in this organization',
            );
        throw error;
    }
    onboarding.status = 'PROVISIONING';
    onboarding.failure = undefined;
    onboarding.leaseOwner = undefined;
    onboarding.leaseUntil = undefined;
    await onboarding.save();
    return onboarding;
};
