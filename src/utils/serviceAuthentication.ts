import { createHmac } from 'node:crypto';
import { bootEnv } from '../config/bootConfig.js';

const serviceToken = () => {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(
        JSON.stringify({
            service: bootEnv.GOV_SERVICE_NAME,
            type: 'service-token',
            exp: Math.floor(Date.now() / 1000) + 300,
        }),
    ).toString('base64url');
    const unsigned = `${header}.${payload}`;
    const signature = createHmac('sha256', bootEnv.JWT_SECRET).update(unsigned).digest('base64url');
    return `${unsigned}.${signature}`;
};

export const serviceHeaders = () => ({
    Authorization: `Bearer ${serviceToken()}`,
    'Content-Type': 'application/json',
});
