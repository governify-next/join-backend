import { randomUUID } from 'node:crypto';
import Onboarding, { IOnboarding } from '../models/onboarding.model.js';
import JoinedProject from '../models/joinedProject.model.js';
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

export const reserveJoinedProject = (onboarding: IOnboarding) => {
    const config = onboarding.configuration!;
    return JoinedProject.findOneAndUpdate(
        {
            provider: onboarding.provider,
            providerResourceId: String(config.repository.id),
            organizationName: config.organizationName,
        },
        {
            $setOnInsert: {
                elementName: config.elementName,
                onboardingId: onboarding._id,
                installationId: onboarding.integration!.installationId,
            },
        },
        { upsert: true, new: true },
    );
};

export const installationIsJoined = async (installationId: number) =>
    Boolean(await JoinedProject.exists({ installationId }));
