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

const requireGitHub = (onboarding: IOnboarding) => {
    const installationId = onboarding.integrations?.github?.installationId;
    if (!installationId) throw new ValidationError('Connect GitHub before selecting its resources');
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
    accessToken: string,
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
            const organizations = await organizationsForUser(user.username, user.id, {
                Authorization: `Bearer ${accessToken}`,
            });
            return organizations.map((organization) => ({
                id: organization.name,
                label: String(organization.displayName || organization.name),
                description: organization.description
                    ? String(organization.description)
                    : undefined,
                value: organization,
            }));
        }
        case 'github.repositories': {
            const repositories = await github.listRepositories(requireGitHub(onboarding));
            return repositories.map((repository) => ({
                id: String(repository.id),
                label: repository.fullName,
                description: repository.private ? 'Private repository' : 'Public repository',
                value: repository,
            }));
        }
        case 'github.projects': {
            const projects = await github.listProjects(
                requireGitHub(onboarding),
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
                requireGitHub(onboarding),
                String(args.owner || ''),
                String(args.repository || ''),
            );
            return collaborators.map((collaborator) => ({
                id: collaborator.username,
                label: collaborator.username,
                value: collaborator,
            }));
        }
        case 'github.issues': {
            const issues = await github.listIssues(
                requireGitHub(onboarding),
                String(args.owner || ''),
                String(args.repository || ''),
            );
            return issues.map((issue) => ({
                id: String(issue.id),
                label: `#${issue.number} ${issue.title}`,
                description: issue.state,
                value: issue,
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

const serialized = (value: unknown) => JSON.stringify(value);

const validateValue = (requirement: RequirementDefinition, value: unknown) => {
    if (!requirement.required && (value === undefined || value === '')) return;
    if (requirement.cardinality === 'many') {
        if (!Array.isArray(value))
            throw new ValidationError(`'${requirement.ui.label}' must be a list`);
        if (value.length < (requirement.validation?.minItems || 0))
            throw new ValidationError(`Select at least one value for '${requirement.ui.label}'`);
        if (new Set(value.map(serialized)).size !== value.length)
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
    accessToken: string,
) => {
    validatePartialAnswers(onboarding, answers);

    for (const requirement of onboarding.onboardingDefinition.requirements) {
        const value = answers[requirement.id];
        validateValue(requirement, value);
        if (requirement.type !== 'resource' || value === undefined) continue;
        const options = await resolveOptions(onboarding, requirement, answers, user, accessToken);
        const allowed = new Set(options.map((option) => serialized(option.value)));
        const selected = requirement.cardinality === 'many' ? (value as unknown[]) : [value];
        if (selected.some((item) => !allowed.has(serialized(item))))
            throw new ValidationError(`'${requirement.ui.label}' contains an unavailable value`);
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
    if (new Set(statusOptions.map(serialized)).size !== statusOptions.length)
        throw new ValidationError('A GitHub status option can only map to one workflow state');
};
