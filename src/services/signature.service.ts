import type {
    GuaranteeTemplate,
    OnboardingConfiguration,
    SignatureInput,
} from '../types/onboarding.js';
import { ValidationError } from '../utils/customErrors.js';

const workflowStatuses = (metricName: string, config: OnboardingConfiguration) => {
    if (metricName.includes('INPROGRESS')) return config.statusMapping.inProgress;
    if (metricName.includes('INREVIEW')) return config.statusMapping.inReview;
    if (metricName.includes('DONE')) return config.statusMapping.done;
    return undefined;
};

export const buildSignatures = (
    config: OnboardingConfiguration,
    installationId: number,
    guaranteeNames: string[],
    guaranteeTemplates: GuaranteeTemplate[],
): SignatureInput[] => {
    const credentialRef = { provider: 'github', installationId };
    const repository = {
        owner: config.repository.owner,
        repository: config.repository.name,
        credentialRef,
    };
    const project = {
        owner: config.project.owner,
        repository: config.repository.name,
        projectNumber: config.project.number,
        statusFieldId: config.project.statusFieldId,
        credentialRef,
    };

    return guaranteeNames.flatMap((guaranteeName) => {
        const definition = guaranteeTemplates.find((template) => template.name === guaranteeName);
        if (!definition)
            throw new ValidationError(`Guarantee template '${guaranteeName}' is unavailable`);
        const isMemberGuarantee = definition.metrics.some((metric) =>
            metric.metricName.includes('MEMBER'),
        );
        if (isMemberGuarantee && !config.trackedUsers.length)
            throw new ValidationError(`Guarantee '${guaranteeName}' requires tracked users`);
        const users = isMemberGuarantee ? config.trackedUsers : [undefined];

        return users.map((username) => ({
            guaranteeName,
            metrics: definition.metrics.map((metric) => {
                const { metricName } = metric;
                const statuses = workflowStatuses(metricName, config);
                const fetcherId =
                    metric.event?.fetcherConfigs?.[0]?.fetcherId ||
                    metric.metricConfig?.event?.fetcherConfigs?.[0]?.fetcherId;
                if (!fetcherId)
                    throw new ValidationError(`Metric '${metricName}' has no fetcher in Registry`);
                const isProjectMetric = fetcherId.includes('PROJECTV2');
                const processConfig: Record<string, unknown> = {};
                if (statuses) processConfig.columns = statuses;
                if (username) processConfig.username = username;
                if (metricName.includes('POSITIVE_REVIEWS')) processConfig.reviewState = 'APPROVED';
                if (metricName.includes('ASSOCIATED_OPEN_PR')) processConfig.status = 'OPEN';
                if (metricName.includes('ASSOCIATED_CLOSED_PR')) processConfig.status = 'MERGED';
                return {
                    metricName,
                    fetcherConfigs: [
                        {
                            fetcherId,
                            fetcherConfig: isProjectMetric ? project : repository,
                        },
                    ],
                    processConfig,
                };
            }),
        }));
    });
};
