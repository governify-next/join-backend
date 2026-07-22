import type {
    OnboardingDefinition,
    OnboardingModule,
    RequirementDefinition,
    SignatureMapping,
    ValueBinding,
} from '../types/onboarding.js';

const agreementModule: OnboardingModule = {
    id: 'agreement',
    label: 'Agreement',
    kind: 'core',
    adapter: 'join',
    authorization: 'none',
};

const githubModule: OnboardingModule = {
    id: 'github',
    label: 'GitHub',
    kind: 'external',
    adapter: 'github',
    authorization: 'github-app',
};

const zenhubModule: OnboardingModule = {
    id: 'zenhub',
    label: 'ZenHub',
    kind: 'external',
    adapter: 'zenhub-mock',
    authorization: 'mock',
};

const scopeModule: OnboardingModule = {
    id: 'scope',
    label: 'Governify Scope',
    kind: 'destination',
    adapter: 'scope-manager',
    authorization: 'governify-session',
};

const step = (order: number, stepTitle: string, stepDescription: string) => ({
    order,
    step: stepTitle.toLowerCase().replaceAll(' ', '-'),
    stepTitle,
    stepDescription,
});

const destinationStep = step(
    50,
    'Governify destination',
    'Choose where Join should publish the completed agreement.',
);
const validityStep = step(70, 'Agreement validity', 'Define when the agreement is active.');
const repositoryStep = step(
    10,
    'GitHub repository',
    'Select the repository used by the agreement metrics.',
);
const projectStep = step(
    20,
    'GitHub Project',
    'Select the project board, workflow field and required columns.',
);
const peopleStep = step(
    30,
    'GitHub people and issues',
    'Select the collaborators and issues used by per-member and issue-specific metrics.',
);
const zenhubStep = step(
    40,
    'ZenHub configuration',
    'Choose mocked ZenHub resources for the demo agreement.',
);
const scopeDetailsStep = step(
    60,
    'Scope details',
    'Add the extra Scope metadata requested by this agreement.',
);

const requirements: RequirementDefinition[] = [
    {
        id: 'scope_organization',
        module: 'scope',
        type: 'resource',
        cardinality: 'one',
        required: true,
        requiredBy: [{ agreement: true }],
        source: { operation: 'scope.organizations' },
        ui: { ...destinationStep, label: 'Governify organization' },
    },
    {
        id: 'scope_element_name',
        module: 'scope',
        type: 'text',
        required: true,
        requiredBy: [{ agreement: true }],
        validation: { minLength: 3, maxLength: 96, pattern: '^[A-Za-z0-9_-]+$' },
        ui: {
            ...destinationStep,
            label: 'Element name',
            help: 'Letters, numbers, underscores and hyphens only.',
        },
    },
    {
        id: 'agreement_validity_start',
        module: 'agreement',
        type: 'datetime',
        required: true,
        requiredBy: [{ agreement: true }],
        default: 'now',
        ui: { ...validityStep, label: 'Validity starts' },
    },
    {
        id: 'agreement_validity_end',
        module: 'agreement',
        type: 'datetime',
        required: true,
        requiredBy: [{ agreement: true }],
        default: 'oneYearFromNow',
        ui: { ...validityStep, label: 'Validity ends' },
    },
    {
        id: 'agreement_timezone',
        module: 'agreement',
        type: 'timezone',
        required: true,
        requiredBy: [{ agreement: true }],
        default: 'browserTimezone',
        ui: { ...validityStep, label: 'IANA timezone' },
    },
    {
        id: 'github_repository',
        module: 'github',
        type: 'resource',
        cardinality: 'one',
        required: true,
        requiredBy: [
            { guarantee: 'JOIN_GITHUB_PR_QUALITY_TEAM' },
            { guarantee: 'JOIN_GITHUB_PROJECT_FLOW_TEAM' },
            { guarantee: 'JOIN_GITHUB_PROJECT_DELIVERY_MEMBER' },
        ],
        source: { operation: 'github.repositories' },
        ui: { ...repositoryStep, label: 'Repository', searchable: true },
    },
    {
        id: 'github_project',
        module: 'github',
        type: 'resource',
        cardinality: 'one',
        required: true,
        requiredBy: [
            { guarantee: 'JOIN_GITHUB_PROJECT_FLOW_TEAM' },
            { guarantee: 'JOIN_GITHUB_PROJECT_DELIVERY_MEMBER' },
        ],
        dependsOn: ['github_repository'],
        source: {
            operation: 'github.projects',
            arguments: { owner: { answer: 'github_repository', path: 'owner' } },
        },
        ui: { ...projectStep, label: 'Project board' },
    },
    {
        id: 'github_status_field',
        module: 'github',
        type: 'resource',
        cardinality: 'one',
        required: true,
        requiredBy: [
            { guarantee: 'JOIN_GITHUB_PROJECT_FLOW_TEAM' },
            { guarantee: 'JOIN_GITHUB_PROJECT_DELIVERY_MEMBER' },
        ],
        dependsOn: ['github_project'],
        source: {
            operation: 'github.projectFields',
            arguments: { project: { answer: 'github_project' } },
        },
        ui: { ...projectStep, label: 'Workflow status field' },
    },
    {
        id: 'github_in_progress_columns',
        module: 'github',
        type: 'resource',
        cardinality: 'many',
        required: true,
        requiredBy: [
            {
                guarantee: 'JOIN_GITHUB_PROJECT_FLOW_TEAM',
                metric: 'COUNT_INPROGRESS_ISSUES',
            },
        ],
        dependsOn: ['github_status_field'],
        source: {
            operation: 'github.fieldOptions',
            arguments: { field: { answer: 'github_status_field' } },
        },
        validation: { minItems: 1 },
        ui: { ...projectStep, label: 'In Progress columns' },
    },
    {
        id: 'github_in_review_columns',
        module: 'github',
        type: 'resource',
        cardinality: 'many',
        required: true,
        requiredBy: [{ guarantee: 'JOIN_GITHUB_PROJECT_FLOW_TEAM' }],
        dependsOn: ['github_status_field'],
        source: {
            operation: 'github.fieldOptions',
            arguments: { field: { answer: 'github_status_field' } },
        },
        validation: { minItems: 1 },
        ui: { ...projectStep, label: 'In Review columns' },
    },
    {
        id: 'github_done_columns',
        module: 'github',
        type: 'resource',
        cardinality: 'many',
        required: true,
        requiredBy: [
            {
                guarantee: 'JOIN_GITHUB_PROJECT_DELIVERY_MEMBER',
                metric: 'COUNT_DONEISSUES_MEMBER',
            },
        ],
        dependsOn: ['github_status_field'],
        source: {
            operation: 'github.fieldOptions',
            arguments: { field: { answer: 'github_status_field' } },
        },
        validation: { minItems: 1 },
        ui: { ...projectStep, label: 'Done columns' },
    },
    {
        id: 'github_users',
        module: 'github',
        type: 'resource',
        cardinality: 'many',
        required: true,
        requiredBy: [{ guarantee: 'JOIN_GITHUB_PROJECT_DELIVERY_MEMBER' }],
        dependsOn: ['github_repository'],
        source: {
            operation: 'github.collaborators',
            arguments: {
                owner: { answer: 'github_repository', path: 'owner' },
                repository: { answer: 'github_repository', path: 'name' },
            },
        },
        validation: { minItems: 1 },
        ui: { ...peopleStep, label: 'Tracked collaborators', searchable: true },
    },
    {
        id: 'github_issues',
        module: 'github',
        type: 'resource',
        cardinality: 'many',
        required: true,
        requiredBy: [{ guarantee: 'JOIN_GITHUB_PROJECT_FLOW_TEAM' }],
        dependsOn: ['github_repository'],
        source: {
            operation: 'github.issues',
            arguments: {
                owner: { answer: 'github_repository', path: 'owner' },
                repository: { answer: 'github_repository', path: 'name' },
            },
        },
        validation: { minItems: 1 },
        ui: { ...peopleStep, label: 'Tracked issues', searchable: true },
    },
    {
        id: 'zenhub_workspace',
        module: 'zenhub',
        type: 'resource',
        cardinality: 'one',
        required: true,
        requiredBy: [
            { guarantee: 'JOIN_ZENHUB_FLOW_TEAM' },
            { guarantee: 'JOIN_ZENHUB_FLOW_MEMBER' },
        ],
        source: { operation: 'zenhub.workspaces' },
        ui: { ...zenhubStep, label: 'Workspace' },
    },
    {
        id: 'zenhub_team_pipelines',
        module: 'zenhub',
        type: 'resource',
        cardinality: 'many',
        required: true,
        requiredBy: [{ guarantee: 'JOIN_ZENHUB_FLOW_TEAM' }],
        dependsOn: ['zenhub_workspace'],
        source: {
            operation: 'zenhub.pipelines',
            arguments: { workspace: { answer: 'zenhub_workspace', path: 'id' } },
        },
        validation: { minItems: 1 },
        ui: { ...zenhubStep, label: 'Team tracked pipelines' },
    },
    {
        id: 'zenhub_done_pipelines',
        module: 'zenhub',
        type: 'resource',
        cardinality: 'many',
        required: true,
        requiredBy: [{ guarantee: 'JOIN_ZENHUB_FLOW_MEMBER' }],
        dependsOn: ['zenhub_workspace'],
        source: {
            operation: 'zenhub.donePipelines',
            arguments: { workspace: { answer: 'zenhub_workspace', path: 'id' } },
        },
        validation: { minItems: 1 },
        ui: { ...zenhubStep, label: 'Member done pipelines' },
    },
    {
        id: 'zenhub_users',
        module: 'zenhub',
        type: 'resource',
        cardinality: 'many',
        required: true,
        requiredBy: [{ guarantee: 'JOIN_ZENHUB_FLOW_MEMBER' }],
        dependsOn: ['zenhub_workspace'],
        source: {
            operation: 'zenhub.users',
            arguments: { workspace: { answer: 'zenhub_workspace', path: 'id' } },
        },
        validation: { minItems: 1 },
        ui: { ...zenhubStep, label: 'ZenHub members' },
    },
    {
        id: 'scope_delivery_model',
        module: 'scope',
        type: 'resource',
        cardinality: 'one',
        required: true,
        requiredBy: [{ guarantee: 'JOIN_ZENHUB_FLOW_TEAM' }],
        source: {
            operation: 'static.options',
            options: [
                { id: 'kanban', label: 'Kanban', value: { id: 'kanban', name: 'Kanban' } },
                { id: 'scrum', label: 'Scrum', value: { id: 'scrum', name: 'Scrum' } },
                { id: 'hybrid', label: 'Hybrid', value: { id: 'hybrid', name: 'Hybrid' } },
            ],
        },
        ui: { ...scopeDetailsStep, label: 'Delivery model' },
    },
    {
        id: 'scope_description',
        module: 'scope',
        type: 'text',
        required: true,
        requiredBy: [{ guarantee: 'JOIN_ZENHUB_FLOW_TEAM' }],
        validation: { minLength: 5, maxLength: 240 },
        ui: { ...scopeDetailsStep, label: 'Scope description' },
    },
];

const repositoryFetcher = (fetcherId: string) => ({
    fetcherId,
    fields: {
        owner: { answer: 'github_repository', path: 'owner' },
        repository: { answer: 'github_repository', path: 'name' },
        credentialRef: { integration: 'github' },
    } satisfies Record<string, ValueBinding>,
});

const projectFetcher = {
    fetcherId: 'FT_GQL_GITHUB_PROJECTV2_ITEMS',
    fields: {
        owner: { answer: 'github_project', path: 'owner' },
        repository: { answer: 'github_repository', path: 'name' },
        projectNumber: { answer: 'github_project', path: 'number' },
        statusFieldId: { answer: 'github_status_field', path: 'id' },
        credentialRef: { integration: 'github' },
    } satisfies Record<string, ValueBinding>,
};

const githubPullRequestMapping: SignatureMapping = {
    guaranteeTemplateName: 'JOIN_GITHUB_PR_QUALITY_TEAM',
    subject: { kind: 'project' },
    metrics: [
        {
            metricName: 'COUNT_MERGED_PR_WITH_POSITIVE_REVIEWS_TEAM',
            fetcherConfigs: [repositoryFetcher('FT_GQL_GITHUB_PULL_REQUESTS')],
            processConfig: { reviewState: { literal: 'APPROVED' } },
        },
        {
            metricName: 'COUNT_PR_MERGED_TEAM',
            fetcherConfigs: [repositoryFetcher('FT_GQL_GITHUB_PULL_REQUESTS')],
            processConfig: {},
        },
    ],
};

const githubProjectMapping: SignatureMapping = {
    guaranteeTemplateName: 'JOIN_GITHUB_PROJECT_FLOW_TEAM',
    subject: { kind: 'project' },
    metrics: [
        {
            metricName: 'COUNT_INPROGRESS_ISSUES',
            fetcherConfigs: [projectFetcher],
            processConfig: {
                columns: { answer: 'github_in_progress_columns', transform: 'pluckName' },
            },
        },
    ],
};

const githubMemberMapping: SignatureMapping = {
    guaranteeTemplateName: 'JOIN_GITHUB_PROJECT_DELIVERY_MEMBER',
    subject: { kind: 'member', answer: 'github_users', itemPath: 'username' },
    metrics: [
        {
            metricName: 'COUNT_DONEISSUES_MEMBER',
            fetcherConfigs: [projectFetcher],
            processConfig: {
                columns: { answer: 'github_done_columns', transform: 'pluckName' },
                username: { repeatItem: 'username' },
            },
        },
    ],
};

const zenhubFetcher = {
    fetcherId: 'FT_GQL_ZENHUB_ISSUES',
    fields: {
        workspaceId: { answer: 'zenhub_workspace', path: 'id' },
        repositoryGhId: { answer: 'github_repository', path: 'id' },
        token: { integration: 'zenhub', format: 'uri' },
        credentialRef: { integration: 'zenhub' },
    } satisfies Record<string, ValueBinding>,
};

const zenhubTeamMapping: SignatureMapping = {
    guaranteeTemplateName: 'JOIN_ZENHUB_FLOW_TEAM',
    subject: { kind: 'project' },
    metrics: [
        {
            metricName: 'COUNT_INPROGRESS_ZENHUB_ISSUES',
            fetcherConfigs: [zenhubFetcher],
            processConfig: {
                columns: { answer: 'zenhub_team_pipelines', transform: 'pluckName' },
            },
        },
    ],
};

const zenhubMemberMapping: SignatureMapping = {
    guaranteeTemplateName: 'JOIN_ZENHUB_FLOW_MEMBER',
    subject: { kind: 'member', answer: 'zenhub_users', itemPath: 'username' },
    metrics: [
        {
            metricName: 'COUNT_DONE_ZENHUB_ISSUES_MEMBER',
            fetcherConfigs: [zenhubFetcher],
            processConfig: {
                columns: { answer: 'zenhub_done_pipelines', transform: 'pluckName' },
                username: { repeatItem: 'username' },
            },
        },
    ],
};

const contractMappings: Record<string, ValueBinding> = {
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
};

const commonScopeMappings: Record<string, ValueBinding> = {
    organizationName: { answer: 'scope_organization', path: 'name' },
    'element.name': { answer: 'scope_element_name' },
    'element.auditConfig.join.provider': { literal: 'join' },
};

const githubScopeMappings: Record<string, ValueBinding> = {
    'element.auditConfig.join.repository': { answer: 'github_repository', path: 'fullName' },
    'element.auditConfig.join.repositoryId': { answer: 'github_repository', path: 'id' },
};

const githubProjectScopeMappings: Record<string, ValueBinding> = {
    'element.auditConfig.join.statusMapping.inProgress': {
        answer: 'github_in_progress_columns',
        transform: 'pluckName',
    },
    'element.auditConfig.join.statusMapping.inReview': {
        answer: 'github_in_review_columns',
        transform: 'pluckName',
    },
    'element.auditConfig.join.statusMapping.done': {
        answer: 'github_done_columns',
        transform: 'pluckName',
    },
    'element.auditConfig.join.selectedIssues': { answer: 'github_issues' },
};

const createDefinition = (
    id: string,
    agreementTemplateId: string,
    signatures: SignatureMapping[],
    scopeMappings: Record<string, ValueBinding> = {},
): OnboardingDefinition => {
    const guarantees = new Set(
        signatures.map(({ guaranteeTemplateName }) => guaranteeTemplateName),
    );
    const metrics = new Map(
        signatures.map((signature) => [
            signature.guaranteeTemplateName,
            new Set(signature.metrics.map(({ metricName }) => metricName)),
        ]),
    );
    const selectedRequirements = requirements
        .filter((requirement) =>
            requirement.requiredBy.some(
                (consumer) =>
                    consumer.agreement ||
                    (consumer.guarantee &&
                        guarantees.has(consumer.guarantee) &&
                        (!consumer.metric ||
                            metrics.get(consumer.guarantee)?.has(consumer.metric))),
            ),
        )
        .sort((left, right) => left.ui.order - right.ui.order);
    const selectedModules = new Set(selectedRequirements.map(({ module }) => module));
    return {
        schemaVersion: '1.0',
        id,
        agreementTemplateId,
        modules: [agreementModule, githubModule, zenhubModule, scopeModule].filter((module) =>
            selectedModules.has(module.id),
        ),
        requirements: selectedRequirements,
        mappings: {
            contract: contractMappings,
            signatures,
            scope: { ...commonScopeMappings, ...scopeMappings },
        },
    };
};

export const ONBOARDING_DEFINITIONS: OnboardingDefinition[] = [
    createDefinition(
        'github-basic-onboarding-v2',
        'github-basic-v1',
        [githubPullRequestMapping],
        githubScopeMappings,
    ),
    createDefinition(
        'github-advanced-onboarding-v2',
        'github-advanced-v1',
        [githubPullRequestMapping, githubProjectMapping, githubMemberMapping],
        {
            ...githubScopeMappings,
            ...githubProjectScopeMappings,
            'element.auditConfig.join.trackedUsers': {
                answer: 'github_users',
                transform: 'pluckUsername',
            },
        },
    ),
    createDefinition(
        'hybrid-delivery-onboarding-v2',
        'hybrid-delivery-v1',
        [githubProjectMapping, githubMemberMapping, zenhubTeamMapping, zenhubMemberMapping],
        {
            ...githubScopeMappings,
            ...githubProjectScopeMappings,
            'element.description': { answer: 'scope_description' },
            'element.auditConfig.join.deliveryModel': {
                answer: 'scope_delivery_model',
                path: 'name',
            },
            'element.auditConfig.join.githubUsers': {
                answer: 'github_users',
                transform: 'pluckUsername',
            },
            'element.auditConfig.join.zenhubUsers': {
                answer: 'zenhub_users',
                transform: 'pluckUsername',
            },
        },
    ),
];
