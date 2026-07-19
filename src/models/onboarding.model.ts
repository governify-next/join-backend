import mongoose, { Document, Schema } from 'mongoose';
import type {
    OnboardingConfiguration,
    OnboardingStatus,
    ProviderKey,
    PublicAgreementTemplate,
} from '../types/onboarding.js';

export interface IOnboarding extends Document {
    userId: string;
    username: string;
    provider: ProviderKey;
    agreementTemplate: PublicAgreementTemplate;
    status: OnboardingStatus;
    integration?: {
        installationId?: number;
        accountLogin?: string;
        accountType?: string;
        stateNonce?: string;
    };
    configuration?: OnboardingConfiguration;
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
        provider: { type: String, enum: ['github'], required: true },
        agreementTemplate: { type: Schema.Types.Mixed, required: true },
        status: { type: String, required: true, index: true },
        integration: { type: Schema.Types.Mixed },
        configuration: { type: Schema.Types.Mixed },
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
