import type { NextFunction, Request, Response } from 'express';
import * as onboardingService from '../services/onboarding.service.js';
import { bootEnv } from '../config/bootConfig.js';
import { sendSuccess } from '../utils/standardResponse.js';
import { ValidationError } from '../utils/customErrors.js';
import { getLogger } from '../utils/logger.js';
import type { IntegrationProvider, OnboardingAnswers } from '../types/onboarding.js';

const logger = getLogger().setTag('onboarding.controller.ts');

const handle = (fn: () => Promise<unknown>, res: Response, next: NextFunction, status = 200) =>
    fn()
        .then((data) => sendSuccess(res, { data, httpStatus: status }))
        .catch(next);

export const agreementTemplates = (_req: Request, res: Response, next: NextFunction) =>
    handle(() => onboardingService.getAgreementTemplates(), res, next);

export const create = (req: Request, res: Response, next: NextFunction) =>
    handle(
        () => onboardingService.create(req.userAuth!, req.body.agreementTemplateId),
        res,
        next,
        201,
    );

export const get = (req: Request, res: Response, next: NextFunction) =>
    handle(() => onboardingService.getOwned(req.params.id, req.userAuth!.id), res, next);

export const connectIntegration = (req: Request, res: Response, next: NextFunction) =>
    handle(
        () =>
            onboardingService.connectIntegration(
                req.params.id,
                req.userAuth!.id,
                req.params.provider as IntegrationProvider,
            ),
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
            `${bootEnv.FRONTEND_URL}/?onboarding=${onboarding._id.toString()}&integration=github&status=connected`,
        );
    } catch (error) {
        logger.error(
            'GitHub authorization callback failed',
            error instanceof Error ? error.message : 'Unknown error',
        );
        res.redirect(
            303,
            `${bootEnv.FRONTEND_URL}/?integration=github&status=error&message=${encodeURIComponent('GitHub authorization could not be completed. Please try again.')}`,
        );
    }
};

export const requirementOptions = (req: Request, res: Response, next: NextFunction) =>
    handle(
        () =>
            onboardingService.requirementOptions(
                req.params.id,
                req.userAuth!,
                req.accessToken!,
                req.params.requirementId,
                (req.body.answers || {}) as OnboardingAnswers,
            ),
        res,
        next,
    );

export const configure = (req: Request, res: Response, next: NextFunction) =>
    handle(
        () =>
            onboardingService.configure(
                req.params.id,
                req.userAuth!,
                req.accessToken!,
                req.body.answers as OnboardingAnswers,
            ),
        res,
        next,
    );

export const saveAnswers = (req: Request, res: Response, next: NextFunction) =>
    handle(
        () =>
            onboardingService.saveAnswers(
                req.params.id,
                req.userAuth!.id,
                req.body.answers as OnboardingAnswers,
            ),
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
