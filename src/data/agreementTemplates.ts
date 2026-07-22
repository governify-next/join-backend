import type { GuaranteeTemplate, PublicAgreementTemplate } from '../types/onboarding.js';

const metric = (metricName: string, eventId: string, fetcherId: string) => ({
    metricName,
    metricConfig: {
        event: {
            eventId,
            fetcherConfigs: [{ fetcherId, fetcherConfig: null as null }],
            processConfig: null as null,
        },
        aggregation: { aggregatorType: 'count', aggregatorConfig: {} },
    },
});

const guaranteeTemplate = (
    name: string,
    title: string,
    description: string,
    numericExpression: string,
    metrics: GuaranteeTemplate['metrics'],
): GuaranteeTemplate => ({
    name,
    info: { title, description, example: 'Join proof-of-concept metric.' },
    numericExpression,
    comparator: null,
    threshold: null,
    window: null,
    metrics,
});

const githubPullRequestQuality = guaranteeTemplate(
    'JOIN_GITHUB_PR_QUALITY_TEAM',
    'Approved pull requests',
    'Percentage of merged pull requests that received an approval.',
    '(COUNT_MERGED_PR_WITH_POSITIVE_REVIEWS_TEAM/COUNT_PR_MERGED_TEAM*100)',
    [
        metric(
            'COUNT_MERGED_PR_WITH_POSITIVE_REVIEWS_TEAM',
            'EV_GITHUB_MERGED_PR_BY_REVIEW_STATE',
            'FT_GQL_GITHUB_PULL_REQUESTS',
        ),
        metric('COUNT_PR_MERGED_TEAM', 'EV_GITHUB_PR_MERGED', 'FT_GQL_GITHUB_PULL_REQUESTS'),
    ],
);

const githubProjectFlow = guaranteeTemplate(
    'JOIN_GITHUB_PROJECT_FLOW_TEAM',
    'GitHub Project work in progress',
    'Number of issues in the selected in-progress project columns.',
    'COUNT_INPROGRESS_ISSUES',
    [
        metric(
            'COUNT_INPROGRESS_ISSUES',
            'EV_GITHUB_ISSUES_BY_COLUMN',
            'FT_GQL_GITHUB_PROJECTV2_ITEMS',
        ),
    ],
);

const githubMemberDelivery = guaranteeTemplate(
    'JOIN_GITHUB_PROJECT_DELIVERY_MEMBER',
    'GitHub Project delivery per member',
    'Number of completed issues assigned to each selected member.',
    'COUNT_DONEISSUES_MEMBER',
    [
        metric(
            'COUNT_DONEISSUES_MEMBER',
            'EV_GITHUB_ISSUES_BY_COLUMN_FILTERED_BY_UPDATED_AT_DATE_ASSOCIATED_TO_MEMBER',
            'FT_GQL_GITHUB_PROJECTV2_ITEMS',
        ),
    ],
);

const zenhubFlowTeam = guaranteeTemplate(
    'JOIN_ZENHUB_FLOW_TEAM',
    'ZenHub flow',
    'Number of issues in the selected mocked ZenHub pipelines.',
    'COUNT_INPROGRESS_ZENHUB_ISSUES',
    [
        metric(
            'COUNT_INPROGRESS_ZENHUB_ISSUES',
            'EV_ZENHUB_ISSUES_BY_COLUMN',
            'FT_GQL_ZENHUB_ISSUES',
        ),
    ],
);

const zenhubFlowMember = guaranteeTemplate(
    'JOIN_ZENHUB_FLOW_MEMBER',
    'ZenHub delivery per member',
    'Number of completed mocked ZenHub issues assigned to each selected member.',
    'COUNT_DONE_ZENHUB_ISSUES_MEMBER',
    [
        metric(
            'COUNT_DONE_ZENHUB_ISSUES_MEMBER',
            'EV_ZENHUB_ISSUES_BY_COLUMN_FILTERED_BY_UPDATED_AT_DATE_ASSOCIATED_TO_MEMBER',
            'FT_GQL_ZENHUB_ISSUES',
        ),
    ],
);

export const GUARANTEE_TEMPLATES: GuaranteeTemplate[] = [
    githubPullRequestQuality,
    githubProjectFlow,
    githubMemberDelivery,
    zenhubFlowTeam,
    zenhubFlowMember,
];

const guarantee = (
    guaranteeTemplateName: string,
    period: 'hour' | 'week' = 'week',
    threshold = 1,
) => ({
    guaranteeTemplateName,
    comparator: '>=',
    threshold,
    window: {
        period: [{ unit: period, value: 1 }],
        anchorDate: '2026-01-01T00:00:00.000Z',
    },
});

export const AGREEMENT_TEMPLATES: PublicAgreementTemplate[] = [
    {
        _id: 'github-basic-v1',
        name: 'join-github-basic-demo',
        displayName: 'GitHub basic',
        description: 'A two-metric team agreement that only needs a GitHub repository.',
        orgId: 'mock-registry',
        isPublic: true,
        guarantees: [guarantee('JOIN_GITHUB_PR_QUALITY_TEAM', 'week', 75)],
    },
    {
        _id: 'github-advanced-v1',
        name: 'join-github-advanced-demo',
        displayName: 'GitHub project and members',
        description:
            'Four metrics covering pull requests, a Project board and per-member delivery.',
        orgId: 'mock-registry',
        isPublic: true,
        guarantees: [
            guarantee('JOIN_GITHUB_PR_QUALITY_TEAM', 'week', 75),
            guarantee('JOIN_GITHUB_PROJECT_FLOW_TEAM', 'hour'),
            guarantee('JOIN_GITHUB_PROJECT_DELIVERY_MEMBER', 'week'),
        ],
    },
    {
        _id: 'hybrid-delivery-v1',
        name: 'join-github-zenhub-scope-demo',
        displayName: 'GitHub + ZenHub + Scope',
        description:
            'Four project/member metrics combining GitHub, mocked ZenHub and Scope metadata.',
        orgId: 'mock-registry',
        isPublic: true,
        guarantees: [
            guarantee('JOIN_GITHUB_PROJECT_FLOW_TEAM', 'hour'),
            guarantee('JOIN_GITHUB_PROJECT_DELIVERY_MEMBER', 'week'),
            guarantee('JOIN_ZENHUB_FLOW_TEAM', 'hour'),
            guarantee('JOIN_ZENHUB_FLOW_MEMBER', 'week'),
        ],
    },
];
