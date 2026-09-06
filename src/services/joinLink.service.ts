import mongoose from 'mongoose';
import type { IJoinLink } from '../models/joinLink.model.js';
import * as joinLinkRepository from '../repositories/joinLink.repository.js';
import type {
    AuthenticatedUser,
    JoinLinkConfiguration,
    JoinLinkCreateInput,
    OnboardingAnswers,
} from '../types/onboarding.js';
import { NotFoundError, ValidationError } from '../utils/customErrors.js';
import { localDateTimeInZoneToIso } from '../utils/date.js';
import * as agreementTemplates from './agreementTemplate.service.js';
import {
    organizationsAdministeredBy,
    requireOrganizationAdmin,
    requireOrganizationMember,
} from './scopeManager.service.js';

const scopeNamePattern = /^[A-Za-z0-9_-]+$/;

export const repositoryScopeName = (repository: unknown) => {
    if (!repository || typeof repository !== 'object' || Array.isArray(repository)) return '';
    const name = String((repository as Record<string, unknown>).name || '');
    const normalized = name
        .replace(/[^A-Za-z0-9_-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 96);
    return normalized.length >= 3 ? normalized : `${normalized || 'repository'}-scope`;
};

export const applyDerivedAnswers = (
    configuration: JoinLinkConfiguration | undefined,
    answers: OnboardingAnswers,
) => {
    const resolved = { ...answers };
    if (!configuration?.scopeName.fromRepository) return resolved;
    if (
        configuration.scopeName.editable &&
        typeof resolved.scope_name === 'string' &&
        resolved.scope_name.length > 0
    )
        return resolved;
    const scopeName = repositoryScopeName(resolved.github_repository);
    if (scopeName) resolved.scope_name = scopeName;
    else delete resolved.scope_name;
    return resolved;
};

const validateInput = (input: JoinLinkCreateInput) => {
    if (!input || typeof input !== 'object')
        throw new ValidationError('Join link configuration is required');
    if (!input.agreementTemplateId) throw new ValidationError('Select an agreement template');
    if (typeof input.scopeNameFromRepository !== 'boolean')
        throw new ValidationError('Automatic Scope naming must be enabled or disabled');
    if (input.scopeNameFromRepository && input.scopeName !== undefined)
        throw new ValidationError(
            'Provide either a Scope and agreement name or automatic repository naming, not both',
        );
    if (
        !input.scopeNameFromRepository &&
        (typeof input.scopeName !== 'string' ||
            input.scopeName.length < 3 ||
            input.scopeName.length > 96 ||
            !scopeNamePattern.test(input.scopeName))
    )
        throw new ValidationError(
            'Enter a Scope and agreement name or use the enrolled repository name automatically',
        );

    const { initial, end, timezone } = input.agreementValidity || {};
    if (!Intl.supportedValuesOf('timeZone').includes(String(timezone)))
        throw new ValidationError('Agreement validity requires a valid IANA timezone');
    const initialDate = new Date(localDateTimeInZoneToIso(initial, timezone));
    const endDate = new Date(localDateTimeInZoneToIso(end, timezone));
    if (endDate <= initialDate)
        throw new ValidationError('Agreement validity end must be later than its start');
    if (endDate <= new Date())
        throw new ValidationError('Agreement validity end must be in the future');
};

const serializedConfiguration = (link: IJoinLink) => structuredClone(link.configuration);

export const create = async (
    organizationName: string,
    user: AuthenticatedUser,
    input: JoinLinkCreateInput,
) => {
    validateInput(input);
    const [organization, templateOption] = await Promise.all([
        requireOrganizationAdmin(organizationName, user),
        agreementTemplates.getPublic(input.agreementTemplateId),
    ]);
    if (
        input.scopeNameFromRepository &&
        !templateOption.onboardingDefinition.requirements.some(
            ({ id }) => id === 'github_repository',
        )
    )
        throw new ValidationError(
            'The selected agreement does not enroll a repository for automatic Scope naming',
        );
    const editable = input.editable || {};
    return joinLinkRepository.create({
        createdBy: user.id,
        createdByUsername: user.username,
        configuration: {
            organization: {
                value: organization,
                editable: editable.organization === true,
            },
            agreementTemplate: {
                value: templateOption.agreementTemplate,
                editable: editable.agreementTemplate === true,
            },
            agreementValidity: {
                value: { ...input.agreementValidity },
                editable: editable.agreementValidity === true,
            },
            scopeName: {
                value: input.scopeNameFromRepository ? '' : input.scopeName!,
                editable: editable.scopeName === true,
                fromRepository: input.scopeNameFromRepository === true,
            },
        },
    });
};

export const listForOrganization = async (organizationName: string, user: AuthenticatedUser) => {
    await requireOrganizationAdmin(organizationName, user);
    return joinLinkRepository.findByOrganization(organizationName);
};

export const listOrganizations = (user: AuthenticatedUser) => organizationsAdministeredBy(user);

const getById = async (id: string) => {
    if (!mongoose.isValidObjectId(id)) throw new ValidationError('Invalid join link ID');
    const link = await joinLinkRepository.findById(id);
    if (!link) throw new NotFoundError('Join link not found');
    return link;
};

export const getForMember = async (id: string, user: AuthenticatedUser) => {
    const link = await getById(id);
    await requireOrganizationMember(link.configuration.organization.value.name, user);
    return link;
};

export const resolveForOnboarding = async (id: string, user: AuthenticatedUser) => {
    const link = await getForMember(id, user);
    return {
        id: link._id.toString(),
        configuration: serializedConfiguration(link),
    };
};

export const assertConfigurationMember = (
    configuration: JoinLinkConfiguration,
    user: AuthenticatedUser,
) => requireOrganizationMember(configuration.organization.value.name, user);

export const validateAgreementTemplate = (
    configuration: JoinLinkConfiguration,
    agreementTemplateId: string,
) => {
    if (
        !configuration.agreementTemplate.editable &&
        String(configuration.agreementTemplate.value._id) !== agreementTemplateId
    )
        throw new ValidationError('The agreement template is locked by the join link');
};

const answerId = (value: unknown) =>
    value && typeof value === 'object' && !Array.isArray(value)
        ? String((value as Record<string, unknown>)._id || '')
        : '';

export const validateLockedAnswers = (
    configuration: JoinLinkConfiguration | undefined,
    answers: OnboardingAnswers,
) => {
    if (!configuration) return;
    if (
        !configuration.organization.editable &&
        answerId(answers.scope_organization) !== configuration.organization.value._id
    )
        throw new ValidationError('The organization is locked by the join link');
    if (configuration.scopeName.fromRepository && !configuration.scopeName.editable) {
        const expectedScopeName = repositoryScopeName(answers.github_repository);
        if (
            expectedScopeName
                ? answers.scope_name !== expectedScopeName
                : answers.scope_name !== undefined
        )
            throw new ValidationError(
                'The Scope and agreement name must match the enrolled repository name',
            );
    } else if (
        !configuration.scopeName.editable &&
        answers.scope_name !== configuration.scopeName.value
    )
        throw new ValidationError('The Scope and agreement name is locked by the join link');
    if (!configuration.agreementValidity.editable) {
        const validity = configuration.agreementValidity.value;
        if (
            answers.agreement_validity_start !== validity.initial ||
            answers.agreement_validity_end !== validity.end ||
            answers.agreement_timezone !== validity.timezone
        )
            throw new ValidationError('The agreement validity is locked by the join link');
    }
};

export const initialAnswers = (configuration: JoinLinkConfiguration): OnboardingAnswers => ({
    scope_organization: structuredClone(configuration.organization.value),
    ...(configuration.scopeName.fromRepository
        ? {}
        : { scope_name: configuration.scopeName.value }),
    agreement_validity_start: configuration.agreementValidity.value.initial,
    agreement_validity_end: configuration.agreementValidity.value.end,
    agreement_timezone: configuration.agreementValidity.value.timezone,
});
