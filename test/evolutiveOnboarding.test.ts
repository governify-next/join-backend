import { Types } from 'mongoose';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as publisher from '../src/services/ecosystemPublisher.service.js';
import * as http from '../src/utils/http.js';
import * as provisioning from '../src/services/provisioning.service.js';
import * as repository from '../src/repositories/onboarding.repository.js';
import * as templates from '../src/services/agreementTemplate.service.js';
import * as scopeManager from '../src/services/scopeManager.service.js';
import type { MaterializedOnboarding } from '../src/types/onboarding.js';

afterEach(() => vi.restoreAllMocks());
const window = { period: [{ unit: 'week', value: 1 }], anchorDate: '2026-09-20T22:00:00Z' };
const evolutiveWindow = { ...window, period: [{ unit: 'hour', value: 1 }] };
const payload = (value: typeof evolutiveWindow | null): MaterializedOnboarding => ({
    agreement: {
        agreementTemplate: {
            _id: 'template',
            name: 'template',
            orgId: 'source',
            displayName: 'Template',
            description: 'Test',
            isPublic: true,
            guarantees: [
                {
                    guaranteeTemplateName: 'GUARANTEE',
                    comparator: '>=',
                    threshold: 1,
                    window,
                    evolutiveWindow: value,
                },
            ],
        },
        contract: {},
        signatures: [],
    },
    scope: { name: 'scope', children: [] },
});

describe('evolutive onboarding publication', () => {
    it.each([evolutiveWindow, null])(
        'preserves evolutiveWindow %j when copying templates',
        async (value) => {
            const request = vi
                .spyOn(http, 'requestJson')
                .mockRejectedValueOnce({ details: { status: 404 } })
                .mockResolvedValueOnce({ name: 'template' });
            await publisher.ensureAgreementTemplate('org', 'destination', payload(value));
            const posted = JSON.parse(String(request.mock.calls[1][1]?.body));
            expect(posted.guarantees[0].evolutiveWindow).toEqual(value);
        },
    );
    it('rejects reuse of a template with a different evolutive window', async () => {
        const input = payload(evolutiveWindow);
        vi.spyOn(http, 'requestJson').mockResolvedValue({
            ...input.agreement.agreementTemplate,
            isPublic: false,
            guarantees: [
                { ...input.agreement.agreementTemplate.guarantees[0], evolutiveWindow: null },
            ],
        });
        await expect(
            publisher.ensureAgreementTemplate('org', 'destination', input),
        ).rejects.toThrow('different contents');
    });
    it('requests enabled evolutive tasks on every retry and accepts an empty result for null windows', async () => {
        const request = vi.spyOn(http, 'requestJson').mockResolvedValue([]);
        for (let attempt = 0; attempt < 2; attempt++)
            expect(
                await publisher.ensureEvolutiveCalculationSchedule(
                    'org name',
                    'scope',
                    'collection',
                    1,
                ),
            ).toEqual([]);
        expect(request).toHaveBeenCalledTimes(2);
        expect(request).toHaveBeenCalledWith(
            expect.stringContaining(
                '/organizations/org%20name/scopes/scope/agreementCollections/collection/agreementVersions/1/tasks/states/evolutive?enabled=true',
            ),
            expect.objectContaining({ method: 'POST', body: '{}' }),
        );
    });
    it('retries a failed evolutive step even when consolidated scheduling already completed', async () => {
        const input = payload(evolutiveWindow);
        const onboarding = {
            _id: new Types.ObjectId(),
            username: 'user',
            userId: 'user-id',
            status: 'PROVISIONING',
            leaseOwner: 'worker',
            answers: { scope_organization: { _id: 'org-id', name: 'org' } },
            agreementTemplate: input.agreement.agreementTemplate,
            onboardingDefinition: { id: 'definition' },
            checkpoints: [
                'validated',
                'materialized',
                'agreementTemplate',
                'scope',
                'agreementCollection',
                'agreementVersion',
                'schedule',
            ],
            result: {
                materialized: input,
                agreementTemplateName: 'template',
                scopeId: 'scope',
                collectionId: 'collection',
                collectionName: 'Collection',
                agreementVersion: { versionNumber: 1 },
            },
            failure: undefined as { step: string } | undefined,
            save: vi.fn().mockResolvedValue(undefined),
        };
        vi.spyOn(repository, 'claimNext').mockResolvedValue(onboarding as never);
        vi.spyOn(repository, 'findById').mockResolvedValue(onboarding as never);
        vi.spyOn(repository, 'recordFailure').mockResolvedValue(undefined as never);
        vi.spyOn(scopeManager, 'organizationsForUser').mockResolvedValue([
            { _id: 'org-id', name: 'org' },
        ] as never);
        vi.spyOn(templates, 'getPublic').mockResolvedValue({
            agreementTemplate: input.agreement.agreementTemplate,
            onboardingDefinition: { id: 'definition' },
        } as never);
        vi.spyOn(templates, 'listGuaranteeTemplates').mockResolvedValue([]);
        const consolidated = vi.spyOn(publisher, 'ensureCalculationSchedule');
        const evolutive = vi
            .spyOn(publisher, 'ensureEvolutiveCalculationSchedule')
            .mockRejectedValueOnce(new Error('Director unavailable'))
            .mockResolvedValue([]);
        const sync = vi.spyOn(publisher, 'ensureStateSyncSchedule').mockResolvedValue({});
        vi.spyOn(publisher, 'ensureDashboard').mockResolvedValue({});
        await provisioning.runOnce();
        expect(onboarding.failure?.step).toBe('evolutiveSchedule');
        expect(onboarding.checkpoints).not.toContain('evolutiveSchedule');
        expect(sync).not.toHaveBeenCalled();
        await provisioning.runOnce();
        expect(evolutive).toHaveBeenCalledTimes(2);
        expect(evolutive).toHaveBeenLastCalledWith('org', 'scope', 'collection', 1);
        expect(consolidated).not.toHaveBeenCalled();
        expect(onboarding.status).toBe('COMPLETED');
        expect(onboarding.checkpoints).toHaveLength(provisioning.TOTAL_PROVISIONING_CHECKPOINTS);
    });
});
