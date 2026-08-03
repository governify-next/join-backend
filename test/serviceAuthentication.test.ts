import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('service authentication', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.stubEnv('AUTHENTICATOR_SERVICE_URL', 'http://authenticator.test');
        vi.stubEnv('CLIENT_ID', 'join-backend');
        vi.stubEnv('CLIENT_SECRET', 'join-backend-secret');
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.unstubAllEnvs();
    });

    it('fetches and reuses a service token from the authenticator', async () => {
        const fetchMock = vi.fn().mockResolvedValue(
            new Response(
                JSON.stringify({
                    success: true,
                    data: { token: 'service-token' },
                }),
                { status: 200, headers: { 'Content-Type': 'application/json' } },
            ),
        );
        vi.stubGlobal('fetch', fetchMock);

        const { fetchServiceToken, serviceHeaders } =
            await import('../src/utils/serviceAuthentication.js');

        await expect(fetchServiceToken()).resolves.toBe('service-token');
        expect(fetchMock).toHaveBeenCalledWith('http://authenticator.test/api/v1/services/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                clientId: 'join-backend',
                clientSecret: 'join-backend-secret',
            }),
        });
        expect(serviceHeaders()).toEqual({
            Authorization: 'Bearer service-token',
            'Content-Type': 'application/json',
        });
    });

    it('rejects unsuccessful token responses', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue(
                new Response(JSON.stringify({ success: false }), {
                    status: 401,
                    headers: { 'Content-Type': 'application/json' },
                }),
            ),
        );

        const { fetchServiceToken } = await import('../src/utils/serviceAuthentication.js');

        await expect(fetchServiceToken()).rejects.toThrow(
            'Failed to fetch service token from authenticator (status: 401)',
        );
    });
});
