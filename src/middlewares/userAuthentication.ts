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

export const requireService = (req: Request, _res: Response, next: NextFunction) => {
    const authorization = req.header('authorization');
    if (!authorization?.startsWith('Bearer ')) return next(new UnauthorizedError());
    const token = authorization.slice('Bearer '.length);
    try {
        const [header, encoded, signature] = token.split('.');
        const unsigned = `${header}.${encoded}`;
        const expected = Buffer.from(requireHmac(unsigned, bootEnv.JWT_SECRET), 'base64url');
        const actual = Buffer.from(signature || '', 'base64url');
        if (expected.length !== actual.length || !timingSafeEqual(expected, actual))
            throw new Error();
        const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString()) as {
            type?: string;
            exp?: number;
        };
        if (payload.type !== 'service-token' || (payload.exp || 0) < Date.now() / 1000)
            throw new Error();
        next();
    } catch {
        next(new UnauthorizedError('Invalid service token'));
    }
};

import { createHmac, timingSafeEqual } from 'node:crypto';
const requireHmac = (value: string, secret: string) =>
    createHmac('sha256', secret).update(value).digest('base64url');
