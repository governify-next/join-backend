import { oasTelemetry } from '@oas-tools/oas-telemetry';
import mongoose from 'mongoose';
import app from './app.js';
import { getLogger } from './utils/logger.js';
import { bootEnv, validateBootConfig } from './config/bootConfig.js';
import { startWorker, stopWorker } from './services/provisioning.service.js';
import { fetchServiceToken } from './utils/serviceAuthentication.js';
import { connectMongo } from './db/mongo.js';
import { initializePublicationIndex } from './repositories/onboarding.repository.js';

app.use(oasTelemetry());

const logger = getLogger().setTag('server.ts');
const PORT = bootEnv.PORT;

validateBootConfig();

connectMongo()
    .then(async () => {
        await initializePublicationIndex();
        await fetchServiceToken();
        app.listen(PORT, () => {
            logger.log(`Server running on http://localhost:${PORT}`);
            logger.log(`Docs available at http://localhost:${PORT}/api-docs`);
            startWorker();
        });
    })
    .catch((err) => {
        logger.error('Failed to start server', err);
        process.exitCode = 1;
    });

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, async () => {
        stopWorker();
        await mongoose.disconnect();
        process.exit(0);
    });
}
