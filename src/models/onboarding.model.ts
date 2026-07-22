import mongoose, { Document, Schema } from 'mongoose';
import type {
    OnboardingAnswers,
    OnboardingDefinition,
    OnboardingStatus,
    IntegrationProvider,
    PublicAgreementTemplate,
} from '../types/onboarding.js';

export interface IOnboarding extends Document {
    userId: string;
    username: string;
    requiredIntegrations: IntegrationProvider[];
    agreementTemplate: PublicAgreementTemplate;
    onboardingDefinition: OnboardingDefinition;
    status: OnboardingStatus;
    integrations?: {
        github?: {
            installationId?: number;
            accountLogin?: string;
            accountType?: string;
            stateNonce?: string;
        };
        zenhub?: {
            connectionId?: string;
            accountName?: string;
            mocked?: boolean;
        };
    };
    answers?: OnboardingAnswers;
    checkpoints: string[];
    result?: Record<string, unknown>;
    failure?: { step: string; message: string; retryable: boolean; occurredAt: Date };
    leaseOwner?: string;
    leaseUntil?: Date;
    expiresAt: Date;
    createdAt: Date;
    updatedAt: Date;
}

const onboardingSchema = new Schema<IOnboarding>(
    {
        userId: { type: String, required: true, index: true },
        username: { type: String, required: true },
        requiredIntegrations: { type: [String], enum: ['github', 'zenhub'], default: [] },
        agreementTemplate: { type: Schema.Types.Mixed, required: true },
        onboardingDefinition: { type: Schema.Types.Mixed, required: true },
        status: { type: String, required: true, index: true },
        integrations: { type: Schema.Types.Mixed, default: {} },
        answers: { type: Schema.Types.Mixed, default: {} },
        checkpoints: { type: [String], default: [] },
        result: { type: Schema.Types.Mixed },
        failure: { type: Schema.Types.Mixed },
        leaseOwner: { type: String },
        leaseUntil: { type: Date },
        expiresAt: { type: Date, required: true },
    },
    { timestamps: true, minimize: false },
);

onboardingSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model<IOnboarding>('JoinOnboarding', onboardingSchema);
