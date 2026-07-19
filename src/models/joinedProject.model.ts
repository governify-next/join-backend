import mongoose, { Document, Schema } from 'mongoose';

export interface IJoinedProject extends Document {
    provider: 'github';
    providerResourceId: string;
    organizationName: string;
    elementName: string;
    onboardingId: mongoose.Types.ObjectId;
    installationId: number;
}

const joinedProjectSchema = new Schema<IJoinedProject>(
    {
        provider: { type: String, enum: ['github'], required: true },
        providerResourceId: { type: String, required: true },
        organizationName: { type: String, required: true },
        elementName: { type: String, required: true },
        onboardingId: { type: Schema.Types.ObjectId, required: true, ref: 'JoinOnboarding' },
        installationId: { type: Number, required: true },
    },
    { timestamps: true },
);

joinedProjectSchema.index(
    { provider: 1, providerResourceId: 1, organizationName: 1 },
    { unique: true },
);
joinedProjectSchema.index({ organizationName: 1, elementName: 1 }, { unique: true });

export default mongoose.model<IJoinedProject>('JoinedProject', joinedProjectSchema);
