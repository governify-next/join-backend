import type { IOnboarding } from '../models/onboarding.model.js';
import * as github from '../providers/github.provider.js';
import type {
    AnswerReference,
    AuthenticatedUser,
    OnboardingAnswers,
    RequirementDefinition,
    ResourceOption,
} from '../types/onboarding.js';
import { ValidationError } from '../utils/customErrors.js';
import { localDateTimeInZoneToIso } from '../utils/date.js';
import { organizationsForUser } from './scopeManager.service.js';

const zenhubWorkspaces: ResourceOption[] = [
    {
        id: 'zh-workspace-platform',
        label: 'Governify Platform Demo',
        description: 'Mock workspace · 3 repositories',
        value: { id: 'zh-workspace-platform', name: 'Governify Platform Demo' },
    },
    {
        id: 'zh-workspace-course',
        label: 'Software Engineering Course',
        description: 'Mock workspace · 12 repositories',
        value: { id: 'zh-workspace-course', name: 'Software Engineering Course' },
    },
];

const zenhubPipelines: ResourceOption[] = [
    {
        id: 'in-progress',
        label: 'In Progress',
        value: { id: 'in-progress', name: 'In Progress' },
    },
    { id: 'in-review', label: 'In Review', value: { id: 'in-review', name: 'In Review' } },
    { id: 'done', label: 'Done', value: { id: 'done', name: 'Done' } },
    { id: 'closed', label: 'Closed', value: { id: 'closed', name: 'Closed' } },
];

const zenhubUsers: ResourceOption[] = [
    { id: 'zh-alice', label: 'alice-demo', value: { id: 'zh-alice', username: 'alice-demo' } },
    { id: 'zh-bob', label: 'bob-demo', value: { id: 'zh-bob', username: 'bob-demo' } },
    { id: 'zh-carol', label: 'carol-demo', value: { id: 'zh-carol', username: 'carol-demo' } },
];

const isRecord = (value: unknown): value is Record<string, unknown> =>
    Boolean(value) && typeof value === 'object' && !Array.isArray(value);

export const readPath = (value: unknown, path?: string): unknown => {
    if (!path) return value;
    return path.split('.').reduce<unknown>((current, key) => {
        if (!isRecord(current)) return undefined;
        return current[key];
    }, value);
};

const resolveReference = (answers: OnboardingAnswers, reference: AnswerReference) =>
    readPath(answers[reference.answer], reference.path);

const githubInstallations = (onboarding: IOnboarding) => {
    const integration = onboarding.integrations?.github;
    if (integration?.installations?.length) return integration.installations;
    if (integration?.installationId)
        return [
            {
                id: integration.installationId,
                accountLogin: integration.accountLogin || 'GitHub',
                accountType: integration.accountType || 'Account',
                htmlUrl: '',
            },
        ];
    throw new ValidationError('Connect GitHub before selecting its resources');
};

const requireGitHub = (onboarding: IOnboarding, answers: OnboardingAnswers) => {
    const installations = githubInstallations(onboarding);
    const repositoryInstallationId = Number(readPath(answers.github_repository, 'installationId'));
    const installationId = Number.isSafeInteger(repositoryInstallationId)
        ? repositoryInstallationId
        : onboarding.integrations?.github?.installationId ||
          (installations.length === 1 ? installations[0].id : undefined);
    if (!installationId || !installations.some(({ id }) => id === installationId))
        throw new ValidationError('Select a GitHub repository before its dependent resources');
    return installationId;
};

const requireZenHub = (onboarding: IOnboarding) => {
    if (!onboarding.integrations?.zenhub?.connectionId)
        throw new ValidationError('Connect the ZenHub demo before selecting its resources');
};

export const resolveOptions = async (
    onboarding: IOnboarding,
    requirement: RequirementDefinition,
    answers: OnboardingAnswers,
    user: AuthenticatedUser,
): Promise<ResourceOption[]> => {
    if (requirement.type !== 'resource' || !requirement.source)
        throw new ValidationError(`Requirement '${requirement.id}' does not provide options`);
    for (const dependency of requirement.dependsOn || []) {
        if (answers[dependency] === undefined)
            throw new ValidationError(`Complete '${dependency}' before '${requirement.id}'`);
    }
    const args = Object.fromEntries(
        Object.entries(requirement.source.arguments || {}).map(([key, reference]) => [
            key,
            resolveReference(answers, reference),
        ]),
    );

    switch (requirement.source.operation) {
        case 'scope.organizations': {
            const organizations = await organizationsForUser(user.username, user.id);
            return organizations.map((organization) => ({
                id: String(organization._id),
                label: String(organization.displayName || organization.name),
                description: organization.description
                    ? String(organization.description)
                    : undefined,
                value: organization,
            }));
        }
        case 'github.repositories': {
            const installations = githubInstallations(onboarding);
            const repositories = await Promise.all(
                installations.map(async (installation) => ({
                    installation,
                    repositories: await github.listRepositories(installation.id),
                })),
            );
            return repositories.flatMap(({ installation, repositories: available }) =>
                available.map((repository) => ({
                    id: `${installation.id}:${repository.id}`,
                    label: repository.fullName,
                    description: `${installation.accountLogin} · ${
                        repository.private ? 'Private repository' : 'Public repository'
                    }`,
                    value: {
                        ...repository,
                        installationId: installation.id,
                        installationAccount: installation.accountLogin,
                    },
                })),
            );
        }
        case 'github.projects': {
            const projects = await github.listProjects(
                requireGitHub(onboarding, answers),
                String(args.owner || ''),
            );
            return projects.map((project) => ({
                id: project.id,
                label: project.title,
                description: `Project #${project.number}`,
                value: project,
            }));
        }
        case 'github.projectFields': {
            const project = args.project;
            const fields =
                isRecord(project) && Array.isArray(project.statusFields)
                    ? project.statusFields
                    : [];
            return fields.filter(isRecord).map((field) => ({
                id: String(field.id),
                label: String(field.name),
                value: field,
            }));
        }
        case 'github.fieldOptions': {
            const field = args.field;
            const options = isRecord(field) && Array.isArray(field.options) ? field.options : [];
            return options.filter(isRecord).map((option) => ({
                id: String(option.id),
                label: String(option.name),
                value: option,
            }));
        }
        case 'github.collaborators': {
            const collaborators = await github.listCollaborators(
                requireGitHub(onboarding, answers),
                String(args.owner || ''),
                String(args.repository || ''),
            );
            return collaborators.map((collaborator) => ({
                id: collaborator.id,
                label: collaborator.username,
                value: collaborator,
            }));
        }
        case 'zenhub.workspaces':
            requireZenHub(onboarding);
            return zenhubWorkspaces;
        case 'zenhub.pipelines':
            requireZenHub(onboarding);
            return zenhubPipelines;
        case 'zenhub.donePipelines':
            requireZenHub(onboarding);
            return zenhubPipelines.filter(({ value }) =>
                ['Done', 'Closed'].includes(String(readPath(value, 'name'))),
            );
        case 'zenhub.users':
            requireZenHub(onboarding);
            return zenhubUsers;
        case 'static.options':
            return requirement.source.options || [];
    }
};

const resourceIdentity = (value: unknown) => {
    if (!isRecord(value)) return String(value);
    if (value.installationId !== undefined && value.id !== undefined)
        return `${String(value.installationId)}:${String(value.id)}`;
    if (value._id !== undefined) return String(value._id);
    if (value.id !== undefined) return String(value.id);
    if (value.username !== undefined) return String(value.username);
    if (value.name !== undefined) return String(value.name);
    return JSON.stringify(value);
};

const validateValue = (requirement: RequirementDefinition, value: unknown) => {
    if (!requirement.required && (value === undefined || value === '')) return;
    if (requirement.cardinality === 'many') {
        if (!Array.isArray(value))
            throw new ValidationError(`'${requirement.ui.label}' must be a list`);
        if (value.length < (requirement.validation?.minItems || 0))
            throw new ValidationError(`Select at least one value for '${requirement.ui.label}'`);
        if (new Set(value.map(resourceIdentity)).size !== value.length)
            throw new ValidationError(`'${requirement.ui.label}' contains duplicate values`);
        return;
    }
    if (value === undefined || value === null || value === '')
        throw new ValidationError(`Complete '${requirement.ui.label}'`);
    if (requirement.type === 'text' || requirement.type === 'timezone') {
        if (typeof value !== 'string')
            throw new ValidationError(`'${requirement.ui.label}' must be text`);
        if (requirement.validation?.minLength && value.length < requirement.validation.minLength)
            throw new ValidationError(`'${requirement.ui.label}' is too short`);
        if (requirement.validation?.maxLength && value.length > requirement.validation.maxLength)
            throw new ValidationError(`'${requirement.ui.label}' is too long`);
        if (
            requirement.validation?.pattern &&
            !new RegExp(requirement.validation.pattern).test(value)
        )
            throw new ValidationError(`'${requirement.ui.label}' has an invalid format`);
    }
    if (requirement.type === 'datetime' && Number.isNaN(new Date(String(value)).getTime()))
        throw new ValidationError(`'${requirement.ui.label}' is not a valid date`);
    if (
        requirement.type === 'timezone' &&
        !Intl.supportedValuesOf('timeZone').includes(String(value))
    )
        throw new ValidationError(`'${requirement.ui.label}' is not a valid IANA timezone`);
};

export const validatePartialAnswers = (onboarding: IOnboarding, answers: OnboardingAnswers) => {
    const requirements = new Map(
        onboarding.onboardingDefinition.requirements.map((requirement) => [
            requirement.id,
            requirement,
        ]),
    );
    for (const [id, value] of Object.entries(answers)) {
        const requirement = requirements.get(id);
        if (!requirement) throw new ValidationError(`Unknown onboarding answer '${id}'`);
        validateValue(requirement, value);
    }
};

export const validateAnswers = async (
    onboarding: IOnboarding,
    answers: OnboardingAnswers,
    user: AuthenticatedUser,
) => {
    validatePartialAnswers(onboarding, answers);

    for (const requirement of onboarding.onboardingDefinition.requirements) {
        const value = answers[requirement.id];
        validateValue(requirement, value);
        if (requirement.type !== 'resource' || value === undefined) continue;
        const options = await resolveOptions(onboarding, requirement, answers, user);
        const optionsById = new Map(options.map((option) => [option.id, option]));
        const selected = requirement.cardinality === 'many' ? (value as unknown[]) : [value];
        const selectedOptions = selected.map((item) => optionsById.get(resourceIdentity(item)));
        if (selectedOptions.some((option) => !option))
            throw new ValidationError(`'${requirement.ui.label}' contains an unavailable value`);
        answers[requirement.id] =
            requirement.cardinality === 'many'
                ? selectedOptions.map((option) => option!.value)
                : selectedOptions[0]!.value;
    }

    const timezone = answers.agreement_timezone;
    const initial = new Date(localDateTimeInZoneToIso(answers.agreement_validity_start, timezone));
    const end = new Date(localDateTimeInZoneToIso(answers.agreement_validity_end, timezone));
    if (end <= initial) throw new ValidationError('Validity end must be later than its start');
    if (end <= new Date()) throw new ValidationError('Validity end must be in the future');

    const statusOptions = [
        answers.github_in_progress_columns,
        answers.github_in_review_columns,
        answers.github_done_columns,
    ].flatMap((value) => (Array.isArray(value) ? value : []));
    if (new Set(statusOptions.map(resourceIdentity)).size !== statusOptions.length)
        throw new ValidationError('A GitHub status option can only map to one workflow state');
};
