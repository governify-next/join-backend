import { bootEnv } from '../config/bootConfig.js';

const AUTHENTICATOR_SERVICE_URL = bootEnv.AUTHENTICATOR_SERVICE_URL;
const CLIENT_ID = bootEnv.CLIENT_ID;
const CLIENT_SECRET = bootEnv.CLIENT_SECRET;

let serviceToken: string | null = null;

export const fetchServiceToken = async () => {
    const response = await fetch(`${AUTHENTICATOR_SERVICE_URL}/api/v1/services/token`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            clientId: CLIENT_ID,
            clientSecret: CLIENT_SECRET,
        }),
    });

    const result = (await response.json()) as {
        success?: boolean;
        data?: { token?: string };
    };
    const token = result.data?.token;

    if (!response.ok || !result.success || !token)
        throw new Error(
            `Failed to fetch service token from authenticator (status: ${response.status})`,
        );

    serviceToken = token;

    return token;
};

export const serviceHeaders = () => ({
    Authorization: `Bearer ${serviceToken}`,
    'Content-Type': 'application/json',
});
