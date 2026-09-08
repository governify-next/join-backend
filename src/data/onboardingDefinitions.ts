import type {
    GuaranteeTemplate,
    OnboardingDefinition,
    PublicAgreementTemplate,
    RequirementDefinition,
    ScopeChildMapping,
    SignatureMapping,
    ValueBinding,
} from '../types/onboarding.js';

type DefinitionFactory = (
    agreementTemplate: PublicAgreementTemplate,
    guaranteeTemplates: GuaranteeTemplate[],
) => OnboardingDefinition;

type GitHubColumn = 'inProgress' | 'inReview' | 'done';
type MetricRule = {
    column?: GitHubColumn;
    member?: boolean;
    process?: Record<string, unknown>;
};

const required = (
    definition: Omit<RequirementDefinition, 'required' | 'requiredBy'>,
): RequirementDefinition => ({
    ...definition,
    required: true,
    requiredBy: [{ agreement: true }],
});

const step = (order: number, stepTitle: string, stepDescription: string) => ({
    order,
    step: stepTitle.toLowerCase().replaceAll(' ', '-'),
    stepTitle,
    stepDescription,
});

const literalBindings = (values: Record<string, unknown>) =>
    Object.fromEntries(
        Object.entries(values).map(([key, literal]) => [key, { literal } satisfies ValueBinding]),
    );

// Complete Join definition for Registry Agreement Template CS169L-Sp26.
const cs169lSpring2026: DefinitionFactory = (agreementTemplate, guaranteeTemplates) => {
    const projectFetcher = 'FT_GQL_GITHUB_PROJECTV2_ITEMS';
    const pullRequestFetcher = 'FT_GQL_GITHUB_PULL_REQUESTS';
    const columns: Record<GitHubColumn, string> = {
        inProgress: 'github_in_progress_columns',
        inReview: 'github_in_review_columns',
        done: 'github_done_columns',
    };
    const metrics: Record<string, MetricRule> = {
        COUNT_INPROGRESS_ISSUES_WITH_ASSOCIATED_BRANCHES: { column: 'inProgress' },
        COUNT_BRANCHES_ASSOCIATED_TO_INPROGRESS_ISSUES: { column: 'inProgress' },
        COUNT_INPROGRESS_ISSUES: { column: 'inProgress' },
        COUNT_INREVIEW_ISSUES_WITH_ASSOCIATED_OPEN_PR: {
            column: 'inReview',
            process: { status: 'OPEN' },
        },
        COUNT_INREVIEW_ISSUES: { column: 'inReview' },
        COUNT_DONE_ISSUES_WITH_ASSOCIATED_CLOSED_PR: {
            column: 'done',
            process: { status: 'MERGED' },
        },
        COUNT_DONE_ISSUES: { column: 'done' },
        COUNT_INPROGRESSISSUES_MEMBER: { column: 'inProgress', member: true },
        COUNT_DONEISSUES_MEMBER: { column: 'done', member: true },
        COUNT_MERGED_PR_WITH_POSITIVE_REVIEWS_TEAM: {
            process: { reviewState: 'APPROVED' },
        },
        COUNT_PR_MERGED_TEAM: {},
        COUNT_MERGED_PR_WITH_POSITIVE_REVIEWS_MEMBER: {
            member: true,
            process: { reviewState: 'APPROVED' },
        },
        COUNT_PR_MERGED_MEMBER: { member: true },
        COUNT_PRS_WITH_AT_LEAST_ONE_COMMENT_OR_ONE_REVIEW_COMMENT_BY_MEMBER: {
            member: true,
        },
        COUNT_PR: {},
    };
    const fetchers: Record<string, Record<string, ValueBinding>> = {
        [projectFetcher]: {
            owner: { answer: 'github_project', path: 'owner' },
            repository: { answer: 'github_repository', path: 'name' },
            projectNumber: { answer: 'github_project', path: 'number' },
            statusFieldId: { answer: 'github_status_field', path: 'id' },
            credentialRef: { integration: 'github' },
        },
        [pullRequestFetcher]: {
            owner: { answer: 'github_repository', path: 'owner' },
            repository: { answer: 'github_repository', path: 'name' },
            credentialRef: { integration: 'github' },
        },
    };

    const repositoryStep = step(
        10,
        'GitHub repository',
        'Select the repository evaluated by the agreement.',
    );
    const projectStep = step(
        20,
        'GitHub Project',
        'Select the Project V2 board, status field and workflow columns.',
    );
    const membersStep = step(
        30,
        'GitHub members',
        'Select the collaborators whose individual practices will be measured.',
    );
    const memberDetailsStep = step(
        40,
        'Member details',
        'Provide the contact details for each selected collaborator.',
    );
    const destinationStep = step(
        50,
        'Governify destination',
        'Choose where Join should publish the completed agreement.',
    );
    const validityStep = step(70, 'Agreement validity', 'Define when the agreement is active.');

    const requirements: RequirementDefinition[] = [
        required({
            id: 'github_repository',
            module: 'github',
            type: 'resource',
            cardinality: 'one',
            source: { operation: 'github.repositories' },
            ui: { ...repositoryStep, label: 'Repository', searchable: true },
        }),
        required({
            id: 'github_project',
            module: 'github',
            type: 'resource',
            cardinality: 'one',
            dependsOn: ['github_repository'],
            source: {
                operation: 'github.projects',
                arguments: { owner: { answer: 'github_repository', path: 'owner' } },
            },
            ui: { ...projectStep, label: 'Project board' },
        }),
        required({
            id: 'github_status_field',
            module: 'github',
            type: 'resource',
            cardinality: 'one',
            dependsOn: ['github_project'],
            source: {
                operation: 'github.projectFields',
                arguments: { project: { answer: 'github_project' } },
            },
            ui: { ...projectStep, label: 'Workflow status field' },
        }),
        ...(
            [
                [columns.inProgress, 'In Progress columns'],
                [columns.inReview, 'In Review columns'],
                [columns.done, 'Done columns'],
            ] as const
        ).map(([id, label]) =>
            required({
                id,
                module: 'github',
                type: 'resource',
                cardinality: 'many',
                dependsOn: ['github_status_field'],
                source: {
                    operation: 'github.fieldOptions',
                    arguments: { field: { answer: 'github_status_field' } },
                },
                validation: { minItems: 1 },
                ui: { ...projectStep, label },
            }),
        ),
        required({
            id: 'github_users',
            module: 'github',
            type: 'resource',
            cardinality: 'many',
            dependsOn: ['github_repository'],
            source: {
                operation: 'github.collaborators',
                arguments: {
                    owner: { answer: 'github_repository', path: 'owner' },
                    repository: { answer: 'github_repository', path: 'name' },
                },
            },
            validation: { minItems: 1 },
            ui: { ...membersStep, label: 'Tracked members', searchable: true },
        }),
        required({
            id: 'github_member_details',
            module: 'github',
            type: 'member-details',
            cardinality: 'many',
            dependsOn: ['github_users'],
            validation: { minItems: 1 },
            ui: {
                ...memberDetailsStep,
                label: 'Member details',
                help: 'First name, last name and e-mail address are required for every tracked member.',
            },
        }),
        required({
            id: 'scope_organization',
            module: 'scope',
            type: 'resource',
            cardinality: 'one',
            source: { operation: 'scope.organizations' },
            ui: { ...destinationStep, label: 'Governify organization' },
        }),
        required({
            id: 'scope_name',
            module: 'scope',
            type: 'text',
            validation: { minLength: 3, maxLength: 96, pattern: '^[A-Za-z0-9_-]+$' },
            ui: {
                ...destinationStep,
                label: 'Scope and agreement name',
                help: 'Letters, numbers, underscores and hyphens only.',
            },
        }),
        required({
            id: 'agreement_validity_start',
            module: 'agreement',
            type: 'datetime',
            default: 'now',
            ui: { ...validityStep, label: 'Validity starts' },
        }),
        required({
            id: 'agreement_validity_end',
            module: 'agreement',
            type: 'datetime',
            default: 'oneYearFromNow',
            ui: { ...validityStep, label: 'Validity ends' },
        }),
        required({
            id: 'agreement_timezone',
            module: 'agreement',
            type: 'timezone',
            default: 'browserTimezone',
            ui: { ...validityStep, label: 'IANA timezone' },
        }),
    ].sort((left, right) => left.ui.order - right.ui.order);

    const guaranteeByName = new Map(
        guaranteeTemplates.map((template) => [template.name, template]),
    );
    const signatures: SignatureMapping[] = agreementTemplate.guarantees.map(
        ({ guaranteeTemplateName }) => {
            const guarantee = guaranteeByName.get(guaranteeTemplateName);
            if (!guarantee)
                throw new Error(`Guarantee Template '${guaranteeTemplateName}' is unavailable`);
            const configuredMetrics = guarantee.metrics.map((metric) => {
                const rule = metrics[metric.metricName];
                if (!rule)
                    throw new Error(
                        `CS169L-Sp26 does not support metric '${metric.metricName}' from '${guaranteeTemplateName}'`,
                    );
                const registryFetchers = metric.metricConfig.event.fetcherConfigs;
                if (!registryFetchers.length)
                    throw new Error(`Metric '${metric.metricName}' has no Registry fetcher`);
                return {
                    metric,
                    rule,
                    fetcherConfigs: registryFetchers.map(({ fetcherId }) => {
                        const fields = fetchers[fetcherId];
                        if (!fields)
                            throw new Error(
                                `CS169L-Sp26 does not support fetcher '${fetcherId}' from metric '${metric.metricName}'`,
                            );
                        return { fetcherId, fields };
                    }),
                };
            });
            const member = configuredMetrics.some(({ rule }) => rule.member);
            return {
                guaranteeTemplateName,
                subject: member
                    ? { kind: 'member', answer: 'github_users', itemPath: 'username' }
                    : { kind: 'project' },
                metrics: configuredMetrics.map(({ metric, rule, fetcherConfigs }) => ({
                    metricName: metric.metricName,
                    fetcherConfigs,
                    processConfig: {
                        ...(rule.column
                            ? {
                                  columns: {
                                      answer: columns[rule.column],
                                      transform: 'pluckName' as const,
                                  },
                              }
                            : {}),
                        ...literalBindings(rule.process || {}),
                        ...(member ? { username: { repeatItem: 'username' } as const } : {}),
                    },
                })),
            } satisfies SignatureMapping;
        },
    );
    const scopeChildren: ScopeChildMapping[] = [
        {
            answer: 'github_member_details',
            fields: {
                name: { repeatItem: 'scopeName' },
                type: { literal: 'Members' },
                'config.firstName': { repeatItem: 'firstName' },
                'config.lastName': { repeatItem: 'lastName' },
                'config.email': { repeatItem: 'email' },
            },
            children: [
                {
                    fields: {
                        name: { literal: 'GitHub' },
                        type: { literal: 'Identities' },
                        'config.username': { repeatItem: 'username' },
                        'config.userId': { repeatItem: 'id' },
                    },
                },
            ],
        },
        {
            fields: {
                name: { literal: 'GitHub' },
                type: { literal: 'Identities' },
                'config.owner': { answer: 'github_repository', path: 'owner' },
                'config.repository': { answer: 'github_repository', path: 'name' },
                'config.repositoryId': { answer: 'github_repository', path: 'id' },
            },
            children: [
                {
                    fields: {
                        name: { answer: 'github_project', path: 'title' },
                        type: { literal: 'Projects' },
                        'config.projectName': { answer: 'github_project', path: 'title' },
                        'config.owner': { answer: 'github_project', path: 'owner' },
                        'config.projectId': { answer: 'github_project', path: 'id' },
                        'config.projectNumber': { answer: 'github_project', path: 'number' },
                    },
                },
            ],
        },
    ];

    return {
        schemaVersion: '1.0',
        id: `${agreementTemplate.name}--github-project-v2`,
        agreementTemplateName: agreementTemplate.name,
        modules: [
            {
                id: 'agreement',
                label: 'Agreement',
                kind: 'core',
                adapter: 'join',
                authorization: 'none',
            },
            {
                id: 'github',
                label: 'GitHub',
                kind: 'external',
                adapter: 'github',
                authorization: 'github-app',
            },
            {
                id: 'scope',
                label: 'Governify Scope',
                kind: 'destination',
                adapter: 'scope-manager',
                authorization: 'governify-session',
            },
        ],
        requirements,
        mappings: {
            contract: {
                'validity.initial': {
                    answer: 'agreement_validity_start',
                    transform: 'toIso',
                    timezoneAnswer: 'agreement_timezone',
                },
                'validity.end': {
                    answer: 'agreement_validity_end',
                    transform: 'toIso',
                    timezoneAnswer: 'agreement_timezone',
                },
                'validity.timezone': { answer: 'agreement_timezone' },
            },
            signatures,
            scope: {
                organizationId: { answer: 'scope_organization', path: '_id' },
                name: { answer: 'scope_name' },
                type: { literal: 'Repositories' },
                'config.name': { answer: 'scope_name' },
            },
            scopeChildren,
        },
    };
};

// Adding another Agreement Template means adding another self-contained factory here.
export const ONBOARDING_DEFINITIONS: Record<string, DefinitionFactory> = {
    'CS169L-Sp26': cs169lSpring2026,
};

export const createOnboardingDefinition = (
    agreementTemplate: PublicAgreementTemplate,
    guaranteeTemplates: GuaranteeTemplate[],
) => ONBOARDING_DEFINITIONS[agreementTemplate.name]?.(agreementTemplate, guaranteeTemplates);
