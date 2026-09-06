export type IntegrationProvider = 'github' | 'zenhub';
export type ModuleId = IntegrationProvider | 'agreement' | 'scope';

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

export interface JoinLinkOrganization {
    _id: string;
    name: string;
    displayName?: string;
}

export interface JoinLinkField<T> {
    value: T;
    editable: boolean;
}

export interface JoinLinkConfiguration {
    organization: JoinLinkField<JoinLinkOrganization>;
    agreementTemplate: JoinLinkField<PublicAgreementTemplate>;
    agreementValidity: JoinLinkField<{
        initial: string;
        end: string;
        timezone: string;
    }>;
    scopeName: JoinLinkField<string>;
}

export interface JoinLinkCreateInput {
    agreementTemplateId: string;
    agreementValidity: {
        initial: string;
        end: string;
        timezone: string;
    };
    scopeName: string;
    editable?: Partial<Record<keyof JoinLinkConfiguration, boolean>>;
}

export interface GuaranteeTemplate {
    _id: string;
    name: string;
    info: {
        title: string;
        description: string;
        example: string;
    };
    numericExpression: string;
    comparator: null;
    threshold: null;
    window: null;
    metrics: {
        metricName: string;
        metricConfig: {
            event: {
                eventId: string;
                fetcherConfigs: { fetcherId: string; fetcherConfig: null }[];
                processConfig: null;
            };
            aggregation: {
                aggregatorType: string;
                aggregatorConfig: Record<string, unknown>;
            };
        };
    }[];
}

export interface OnboardingModule {
    id: ModuleId;
    label: string;
    kind: 'core' | 'external' | 'destination';
    adapter: string;
    authorization: 'none' | 'github-app' | 'mock' | 'governify-session';
}

export interface RequirementConsumer {
    agreement?: boolean;
    guarantee?: string;
    metric?: string;
}

export type RequirementOperation =
    | 'scope.organizations'
    | 'github.repositories'
    | 'github.projects'
    | 'github.projectFields'
    | 'github.fieldOptions'
    | 'github.collaborators'
    | 'zenhub.workspaces'
    | 'zenhub.pipelines'
    | 'zenhub.donePipelines'
    | 'zenhub.users'
    | 'static.options';

export interface RequirementDefinition {
    id: string;
    module: ModuleId;
    type: 'text' | 'datetime' | 'timezone' | 'resource' | 'member-details';
    cardinality?: 'one' | 'many';
    required: boolean;
    requiredBy: RequirementConsumer[];
    dependsOn?: string[];
    source?: {
        operation: RequirementOperation;
        arguments?: Record<string, AnswerReference>;
        options?: ResourceOption[];
    };
    default?: 'now' | 'oneYearFromNow' | 'browserTimezone';
    validation?: {
        minLength?: number;
        maxLength?: number;
        pattern?: string;
        minItems?: number;
    };
    ui: {
        order: number;
        step: string;
        stepTitle: string;
        stepDescription: string;
        label: string;
        help?: string;
        searchable?: boolean;
    };
}

export interface AnswerReference {
    answer: string;
    path?: string;
    transform?: 'identity' | 'pluckName' | 'pluckNumber' | 'pluckUsername' | 'toIso';
    timezoneAnswer?: string;
}

export interface LiteralReference {
    literal: unknown;
}

export interface IntegrationReference {
    integration: IntegrationProvider;
    format?: 'reference' | 'uri';
}

export interface RepeatItemReference {
    repeatItem: string;
}

export type ValueBinding =
    | AnswerReference
    | LiteralReference
    | IntegrationReference
    | RepeatItemReference;

export interface MetricMapping {
    metricName: string;
    fetcherConfigs: {
        fetcherId: string;
        fields: Record<string, ValueBinding>;
    }[];
    processConfig: Record<string, ValueBinding>;
}

export interface SignatureMapping {
    guaranteeTemplateName: string;
    subject: { kind: 'project' } | { kind: 'member'; answer: string; itemPath: string };
    metrics: MetricMapping[];
}

export interface ScopeChildMapping {
    answer: string;
    fields: Record<string, ValueBinding>;
}

export interface ScopeNodeInput {
    name: string;
    description?: string;
    type: string;
    config: Record<string, unknown>;
    children: ScopeNodeInput[];
}

export interface OnboardingDefinition {
    schemaVersion: '1.0';
    id: string;
    agreementTemplateName: string;
    modules: OnboardingModule[];
    requirements: RequirementDefinition[];
    mappings: {
        contract: Record<string, ValueBinding>;
        signatures: SignatureMapping[];
        scope: Record<string, ValueBinding>;
        scopeChildren?: ScopeChildMapping[];
    };
}

export interface JoinTemplateOption {
    agreementTemplate: PublicAgreementTemplate;
    onboardingDefinition: OnboardingDefinition;
}

export interface ResourceOption {
    id: string;
    label: string;
    description?: string;
    value: unknown;
}

export type OnboardingAnswers = Record<string, unknown>;

export interface SignatureInput {
    guaranteeTemplateName: string;
    metrics: {
        metricName: string;
        fetcherConfigs: {
            fetcherId: string;
            fetcherConfig: Record<string, unknown>;
        }[];
        processConfig: Record<string, unknown>;
    }[];
}

export interface MaterializedOnboarding {
    agreement: {
        agreementTemplate: PublicAgreementTemplate;
        contract: Record<string, unknown>;
        signatures: SignatureInput[];
    };
    scope: Record<string, unknown>;
}
