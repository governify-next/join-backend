import { Router } from 'express';
/**
 * Exception: This router does not use StdResponse (for compatibility reasons)
 */
export const healthRoutes = Router();

healthRoutes.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', message: 'Health check passed' });
});
