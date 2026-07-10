import mongoose from 'mongoose';
import app from './app.js';
import { getLogger } from './utils/logger.js';
import { bootEnv } from './config/bootConfig.js';

const logger = getLogger().setTag('server.ts');
const PORT = bootEnv.PORT;
const MONGO_URI = bootEnv.MONGO_URI;

mongoose
    .connect(MONGO_URI)
    .then(() => {
        app.listen(PORT, () => {
            logger.log(`Server running on http://localhost:${PORT}`);
            logger.log(`Docs available at http://localhost:${PORT}/api-docs`);
        });
    })
    .catch((err) => {
        logger.error('Failed to connect to MongoDB', err);
    });
