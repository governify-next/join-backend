import { Router } from 'express';
import mongoose from 'mongoose';
/**
 * Exception: This router does not use StdResponse (for compatibility reasons)
 */
export const healthRoutes = Router();

healthRoutes.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok' });
});

healthRoutes.get('/ready', (_req, res) => {
    const ready = mongoose.connection.readyState === 1;
    res.status(ready ? 200 : 503).json({ status: ready ? 'ready' : 'not_ready' });
});
