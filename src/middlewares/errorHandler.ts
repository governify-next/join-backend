import { NextFunction, Request, Response } from 'express';
import { sendError } from '../utils/standardResponse.js';
import { getLogger } from '../utils/logger.js';
const logger = getLogger().setTag('errorHandler.ts');

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: Error, req: Request, res: Response, next: NextFunction) {
    logger.error(err.message);
    logger.debug(err);
    return sendError(res, err);
}
