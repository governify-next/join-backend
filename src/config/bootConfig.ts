import dotenv from 'dotenv';
import path from 'path';

// Load .env file
const envPath = process.env.GOV_BOOT_ENV_PATH || path.resolve(process.cwd(), '.env');
dotenv.config({ path: envPath });

export const bootEnv = {
    NODE_ENV: process.env.NODE_ENV || 'development',
    GOV_LOG_LEVEL: process.env.GOV_LOG_LEVEL || 'INFO',
    GOV_SERVICE_NAME: process.env.GOV_SERVICE_NAME || 'join-backend',
    PORT: process.env.PORT || '5807',
    MONGO_URI: process.env.MONGO_URI || 'mongodb://localhost:27017/governify-next',
    FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:3000',
    AUTHENTICATOR_SERVICE_URL: process.env.AUTHENTICATOR_SERVICE_URL || 'http://localhost:5900',
    SCOPE_MANAGER_SERVICE_URL: process.env.SCOPE_MANAGER_SERVICE_URL || 'http://localhost:5901',
    REGISTRY_SERVICE_URL: process.env.REGISTRY_SERVICE_URL || 'http://localhost:5902',
    DIRECTOR_SERVICE_URL: process.env.DIRECTOR_SERVICE_URL || 'http://localhost:5906',
    CLIENT_ID: process.env.CLIENT_ID || 'join-backend',
    CLIENT_SECRET: process.env.CLIENT_SECRET || 'join_backend_client_secret',
    JWT_SECRET: process.env.JWT_SECRET || 'governify_next_secret_key',
    GITHUB_APP_ID: process.env.GITHUB_APP_ID || '',
    GITHUB_APP_SLUG: process.env.GITHUB_APP_SLUG || 'governify-next',
    GITHUB_APP_CLIENT_ID: process.env.GITHUB_APP_CLIENT_ID || '',
    GITHUB_APP_CLIENT_SECRET: process.env.GITHUB_APP_CLIENT_SECRET || '',
    GITHUB_APP_PRIVATE_KEY: (process.env.GITHUB_APP_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    GITHUB_CALLBACK_URL:
        process.env.GITHUB_CALLBACK_URL ||
        'http://localhost:5807/api/v1/integrations/github/callback',
    GITHUB_API_URL: process.env.GITHUB_API_URL || 'https://api.github.com',
    ONBOARDING_TTL_SECONDS: Number(process.env.ONBOARDING_TTL_SECONDS || 24 * 60 * 60),
    WORKER_INTERVAL_MS: Number(process.env.WORKER_INTERVAL_MS || 2_000),
    WORKER_LEASE_MS: Number(process.env.WORKER_LEASE_MS || 5 * 60_000),
};

export const validateBootConfig = () => {
    const errors: string[] = [];
    const required = [
        'CLIENT_ID',
        'CLIENT_SECRET',
        'JWT_SECRET',
        'GITHUB_APP_ID',
        'GITHUB_APP_CLIENT_ID',
        'GITHUB_APP_CLIENT_SECRET',
        'GITHUB_APP_PRIVATE_KEY',
    ] as const;

    if (bootEnv.NODE_ENV === 'production') {
        for (const key of required) {
            if (!bootEnv[key]) errors.push(`${key} is required in production`);
        }
        if (bootEnv.JWT_SECRET === 'governify_next_secret_key')
            errors.push('JWT_SECRET must not use the development default in production');
    }
    if (!Number.isFinite(bootEnv.ONBOARDING_TTL_SECONDS) || bootEnv.ONBOARDING_TTL_SECONDS <= 0)
        errors.push('ONBOARDING_TTL_SECONDS must be a positive number');
    if (!Number.isFinite(bootEnv.WORKER_INTERVAL_MS) || bootEnv.WORKER_INTERVAL_MS <= 0)
        errors.push('WORKER_INTERVAL_MS must be a positive number');
    if (!Number.isFinite(bootEnv.WORKER_LEASE_MS) || bootEnv.WORKER_LEASE_MS <= 0)
        errors.push('WORKER_LEASE_MS must be a positive number');

    if (errors.length) throw new Error(`Invalid configuration: ${errors.join('; ')}`);
};
