import mongoose from 'mongoose';
import app from './app.js';
import { getLogger } from './utils/logger.js';
import { bootEnv, validateBootConfig } from './config/bootConfig.js';
import { startWorker, stopWorker } from './services/provisioning.service.js';

const logger = getLogger().setTag('server.ts');
const PORT = bootEnv.PORT;
const MONGO_URI = bootEnv.MONGO_URI;

validateBootConfig();

mongoose
    .connect(MONGO_URI)
    .then(() => {
        app.listen(PORT, () => {
            logger.log(`Server running on http://localhost:${PORT}`);
            logger.log(`Docs available at http://localhost:${PORT}/api-docs`);
            startWorker();
        });
    })
    .catch((err) => {
        logger.error('Failed to connect to MongoDB', err);
        process.exitCode = 1;
    });

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, async () => {
        stopWorker();
        await mongoose.disconnect();
        process.exit(0);
    });
}
