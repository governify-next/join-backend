import mongoose from 'mongoose';
import { ValidationError } from '../utils/customErrors.js';
import { type Request, type Response, type NextFunction } from 'express';

export function validateMongoId(req: Request, res: Response, next: NextFunction) {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        return next(new ValidationError('Invalid user id', { id: req.params.id }));
    }
    next();
}
