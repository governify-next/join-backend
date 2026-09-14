import type { NextFunction, Request, Response } from 'express';
import * as joinLinkService from '../services/joinLink.service.js';
import type { JoinLinkCreateInput } from '../types/onboarding.js';
import { sendSuccess } from '../utils/standardResponse.js';

const handle = (fn: () => Promise<unknown>, res: Response, next: NextFunction, status = 200) =>
    fn()
        .then((data) => sendSuccess(res, { data, httpStatus: status }))
        .catch(next);

export const create = (req: Request, res: Response, next: NextFunction) =>
    handle(
        () =>
            joinLinkService.create(
                req.params.organizationName,
                req.userAuth!,
                req.body as JoinLinkCreateInput,
            ),
        res,
        next,
        201,
    );

export const list = (req: Request, res: Response, next: NextFunction) =>
    handle(
        () => joinLinkService.listForOrganization(req.params.organizationName, req.userAuth!),
        res,
        next,
    );

export const organizations = (req: Request, res: Response, next: NextFunction) =>
    handle(() => joinLinkService.listOrganizations(req.userAuth!), res, next);

export const get = (req: Request, res: Response, next: NextFunction) =>
    handle(() => joinLinkService.getForMember(req.params.id, req.userAuth!), res, next);
