import type { NextFunction, Request, Response } from 'express';
import { bootEnv } from '../config/bootConfig.js';
import type { AuthenticatedUser } from '../types/onboarding.js';
import { UnauthorizedError } from '../utils/customErrors.js';
import { requestJson } from '../utils/http.js';

declare module 'express' {
    interface Request {
        userAuth?: AuthenticatedUser;
        accessToken?: string;
    }
}

export const requireUser = async (req: Request, _res: Response, next: NextFunction) => {
    const authorization = req.header('authorization');
    if (!authorization?.startsWith('Bearer ')) return next(new UnauthorizedError());
    try {
        const user = await requestJson<Record<string, unknown>>(
            `${bootEnv.AUTHENTICATOR_SERVICE_URL}/api/v1/users/me`,
            { headers: { Authorization: authorization } },
        );
        req.userAuth = {
            id: String(user._id || user.id || user.userId),
            username: String(user.username),
            email: user.email ? String(user.email) : undefined,
            systemRole: user.systemRole ? String(user.systemRole) : undefined,
        };
        req.accessToken = authorization.slice('Bearer '.length);
        next();
    } catch {
        next(new UnauthorizedError('Invalid or expired Governify session'));
    }
};
