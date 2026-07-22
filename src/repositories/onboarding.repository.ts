import { randomUUID } from 'node:crypto';
import Onboarding, { IOnboarding } from '../models/onboarding.model.js';
import JoinedProject from '../models/joinedProject.model.js';
import { bootEnv } from '../config/bootConfig.js';
import { readPath } from '../services/requirement.service.js';

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
    const answers = onboarding.answers || {};
    const repository = answers.github_repository;
    const organizationName = String(readPath(answers.scope_organization, 'name') || '');
    const elementName = String(answers.scope_element_name || '');
    const providerResourceId = String(
        readPath(repository, 'id') || `${onboarding.agreementTemplate._id}:${onboarding.userId}`,
    );
    const provider = repository ? 'github' : onboarding.requiredIntegrations[0] || 'join';
    return JoinedProject.findOneAndUpdate(
        {
            provider,
            providerResourceId,
            organizationName,
        },
        {
            $setOnInsert: {
                elementName,
                onboardingId: onboarding._id,
                installationId: onboarding.integrations?.github?.installationId,
            },
        },
        { upsert: true, new: true },
    );
};
