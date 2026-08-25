import { randomUUID } from 'node:crypto';
import Onboarding, { IOnboarding } from '../models/onboarding.model.js';
import { bootEnv } from '../config/bootConfig.js';

export const createOnboarding = (data: Partial<IOnboarding>) =>
    Onboarding.create({
        ...data,
        checkpoints: [],
        status: 'DRAFT',
        expiresAt: new Date(Date.now() + bootEnv.ONBOARDING_TTL_SECONDS * 1_000),
    });

export const findOwned = (id: string, userId: string) => Onboarding.findOne({ _id: id, userId });
export const findById = (id: string) => Onboarding.findById(id);

export const claimNext = async () => {
    const now = new Date();
    const owner = randomUUID();
    return Onboarding.findOneAndUpdate(
        {
            status: 'PROVISIONING',
            $or: [{ leaseUntil: { $exists: false } }, { leaseUntil: { $lt: now } }],
        },
        { leaseOwner: owner, leaseUntil: new Date(now.getTime() + bootEnv.WORKER_LEASE_MS) },
        { new: true, sort: { updatedAt: 1 } },
    );
};
