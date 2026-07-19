import type { NextFunction, Request, Response } from 'express';
import * as onboardingService from '../services/onboarding.service.js';
import * as github from '../providers/github.provider.js';
import { bootEnv } from '../config/bootConfig.js';
import { sendSuccess } from '../utils/standardResponse.js';
import { ValidationError } from '../utils/customErrors.js';
import { installationIsJoined } from '../repositories/onboarding.repository.js';

const handle = (fn: () => Promise<unknown>, res: Response, next: NextFunction, status = 200) =>
    fn()
        .then((data) => sendSuccess(res, { data, httpStatus: status }))
        .catch(next);

export const agreementTemplates = (_req: Request, res: Response, next: NextFunction) =>
    handle(() => onboardingService.getAgreementTemplates(), res, next);

export const create = (req: Request, res: Response, next: NextFunction) =>
    handle(
        () =>
            onboardingService.create(
                req.userAuth!,
                req.body.provider,
                req.body.agreementTemplateId,
            ),
        res,
        next,
        201,
    );

export const get = (req: Request, res: Response, next: NextFunction) =>
    handle(() => onboardingService.getOwned(req.params.id, req.userAuth!.id), res, next);

export const authorizeGitHub = (req: Request, res: Response, next: NextFunction) =>
    handle(
        () => onboardingService.startGitHubAuthorization(req.params.id, req.userAuth!.id),
        res,
        next,
    );

export const githubCallback = async (req: Request, res: Response) => {
    try {
        const state = req.query.state?.toString();
        const installationId = Number(req.query.installation_id);
        if (!state || !Number.isSafeInteger(installationId))
            throw new ValidationError('Missing GitHub callback parameters');
        const onboarding = await onboardingService.completeGitHubAuthorization({
            state,
            installationId,
            code: req.query.code?.toString(),
        });
        res.redirect(
            303,
            `${bootEnv.FRONTEND_URL}/github?onboarding=${onboarding._id.toString()}&github=connected`,
        );
    } catch {
        res.redirect(
            303,
            `${bootEnv.FRONTEND_URL}/github?github=error&message=${encodeURIComponent('GitHub authorization could not be completed. Please try again.')}`,
        );
    }
};

export const repositories = (req: Request, res: Response, next: NextFunction) =>
    handle(() => onboardingService.repositories(req.params.id, req.userAuth!.id), res, next);

export const projects = (req: Request, res: Response, next: NextFunction) =>
    handle(
        () =>
            onboardingService.projects(
                req.params.id,
                req.userAuth!.id,
                req.query.owner?.toString() || '',
            ),
        res,
        next,
    );

export const collaborators = (req: Request, res: Response, next: NextFunction) =>
    handle(
        () =>
            onboardingService.collaborators(
                req.params.id,
                req.userAuth!.id,
                req.query.owner?.toString() || '',
                req.query.repo?.toString() || '',
            ),
        res,
        next,
    );

export const organizations = (req: Request, res: Response, next: NextFunction) =>
    handle(
        () => onboardingService.organizations(req.params.id, req.userAuth!, req.accessToken!),
        res,
        next,
    );

export const configure = (req: Request, res: Response, next: NextFunction) =>
    handle(
        () => onboardingService.configure(req.params.id, req.userAuth!, req.accessToken!, req.body),
        res,
        next,
    );

export const provision = (req: Request, res: Response, next: NextFunction) =>
    handle(
        () => onboardingService.queueProvisioning(req.params.id, req.userAuth!.id),
        res,
        next,
        202,
    );

export const installationToken = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const installationId = Number(req.params.installationId);
        if (!Number.isSafeInteger(installationId))
            throw new ValidationError('Invalid installation ID');
        if (!(await installationIsJoined(installationId)))
            throw new ValidationError('Installation is not associated with a joined project');
        const data = await github.createInstallationToken(installationId);
        return sendSuccess(res, { data });
    } catch (error) {
        next(error);
    }
};
