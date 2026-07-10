import dotenv from 'dotenv';
import path from 'path';

// Load .env file
const envPath = process.env.GOV_BOOT_ENV_PATH || path.resolve(process.cwd(), '.env');
dotenv.config({ path: envPath });

export const bootEnv = {
    GOV_LOG_LEVEL: process.env.GOV_LOG_LEVEL || 'INFO',
    GOV_SERVICE_NAME: process.env.GOV_SERVICE_NAME || 'UnknownService',
    PORT: process.env.PORT || '3000',
    MONGO_URI: process.env.MONGO_URI || 'mongodb://localhost:27017/mern_example',
};
