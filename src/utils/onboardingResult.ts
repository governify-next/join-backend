import type {
    JoinLinkConfiguration,
    JoinLinkResultOptions,
    OnboardingAnswers,
} from '../types/onboarding.js';

export const defaultResultOptions: JoinLinkResultOptions = {
    dashboardURL: true,
    organizationURL: true,
    scopeAndAgreement: true,
};

export const normalizeResultOptions = (
    resultOptions?: Partial<JoinLinkResultOptions>,
): JoinLinkResultOptions => ({
    dashboardURL: resultOptions?.dashboardURL !== false,
    organizationURL: resultOptions?.organizationURL !== false,
    scopeAndAgreement: resultOptions?.scopeAndAgreement !== false,
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
    Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const selectedResultOptions = (
    configuration: JoinLinkConfiguration | undefined,
): JoinLinkResultOptions => normalizeResultOptions(configuration?.resultOptions);

const organizationNameFrom = (answers: OnboardingAnswers | undefined) => {
    const organization = answers?.scope_organization;
    return isRecord(organization) ? String(organization.name || '') : '';
};

export const buildClientOnboardingResult = ({
    result,
    configuration,
    answers,
    governifyFrontendURL,
}: {
    result: Record<string, unknown>;
    configuration?: JoinLinkConfiguration;
    answers?: OnboardingAnswers;
    governifyFrontendURL: string;
}) => {
    const options = selectedResultOptions(configuration);
    const clientResult: Record<string, unknown> = {};
    const totalCheckpoints = Number(result.totalCheckpoints);
    if (Number.isSafeInteger(totalCheckpoints)) clientResult.totalCheckpoints = totalCheckpoints;

    const dashboard = result.dashboard;
    const dashboardURL = isRecord(dashboard) ? dashboard.grafanaUrl : undefined;
    if (options.dashboardURL && typeof dashboardURL === 'string' && dashboardURL)
        clientResult.dashboardURL = dashboardURL;

    const organizationName = organizationNameFrom(answers);
    if (options.organizationURL && organizationName)
        clientResult.organizationURL = `${governifyFrontendURL.replace(/\/+$/, '')}/organizations/${encodeURIComponent(organizationName)}`;

    if (options.scopeAndAgreement && isRecord(result.materialized))
        clientResult.scopeAndAgreement = result.materialized;

    return clientResult;
};
