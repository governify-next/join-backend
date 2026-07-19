export type ProviderKey = 'github';

export type OnboardingStatus =
    | 'DRAFT'
    | 'AUTHORIZING'
    | 'CONFIGURING'
    | 'READY'
    | 'PROVISIONING'
    | 'COMPLETED'
    | 'FAILED';

export interface AuthenticatedUser {
    id: string;
    username: string;
    email?: string;
    systemRole?: string;
}

export interface AgreementTemplateGuarantee {
    guaranteeTemplateName: string;
    comparator: string;
    threshold: number;
    window: {
        period: { unit: string; value: number }[];
        anchorDate: string;
    };
}

export interface PublicAgreementTemplate {
    _id: string;
    name: string;
    displayName: string;
    description: string;
    orgId: string;
    isPublic: boolean;
    guarantees: AgreementTemplateGuarantee[];
}

export interface GuaranteeTemplate {
    name: string;
    metrics: {
        metricName: string;
        event?: { fetcherConfigs?: { fetcherId: string }[] };
        metricConfig?: { event?: { fetcherConfigs?: { fetcherId: string }[] } };
    }[];
}

export interface RepositorySelection {
    id: number;
    owner: string;
    name: string;
    fullName: string;
    private: boolean;
}

export interface ProjectSelection {
    id: string;
    number: number;
    title: string;
    owner: string;
    statusFieldId: string;
    statusFieldName: string;
}

export interface StatusMapping {
    inProgress: string[];
    inReview: string[];
    done: string[];
}

export interface OnboardingConfiguration {
    repository: RepositorySelection;
    project: ProjectSelection;
    organizationName: string;
    elementName: string;
    trackedUsers: string[];
    statusMapping: StatusMapping;
    validity: { initial: string; end: string; timezone: string };
}

export interface FetcherConfigInput {
    fetcherId: string;
    fetcherConfig: Record<string, unknown>;
}

export interface SignatureInput {
    guaranteeName: string;
    metrics: {
        metricName: string;
        fetcherConfigs: FetcherConfigInput[];
        processConfig: Record<string, unknown>;
    }[];
}
