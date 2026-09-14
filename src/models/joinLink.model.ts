import { Document, Schema, model } from 'mongoose';
import type { JoinLinkConfiguration } from '../types/onboarding.js';

export interface IJoinLink extends Document {
    createdBy: string;
    createdByUsername: string;
    configuration: JoinLinkConfiguration;
    createdAt: Date;
    updatedAt: Date;
}

const joinLinkSchema = new Schema<IJoinLink>(
    {
        createdBy: { type: String, required: true, index: true },
        createdByUsername: { type: String, required: true },
        configuration: { type: Schema.Types.Mixed, required: true },
    },
    { timestamps: true, minimize: false },
);

joinLinkSchema.index({ 'configuration.organization.value.name': 1, createdAt: -1 });

export default model<IJoinLink>('JoinLink', joinLinkSchema);
