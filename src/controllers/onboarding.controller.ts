import type { NextFunction, Request, Response } from 'express';
import * as onboardingService from '../services/onboarding.service.js';
import * as github from '../providers/github.provider.js';
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

export const organizationOptions = (req: Request, res: Response, next: NextFunction) =>
    handle(() => onboardingService.getOrganizationOptions(req.userAuth!), res, next);

export const create = (req: Request, res: Response, next: NextFunction) =>
    handle(
        () =>
            onboardingService.create(
                req.userAuth!,
                req.body.agreementTemplateId,
                req.body.joinLinkId,
                (req.body.answers || {}) as OnboardingAnswers,
            ),
        res,
        next,
        201,
    );

export const get = (req: Request, res: Response, next: NextFunction) =>
    handle(() => onboardingService.getOwned(req.params.id, req.userAuth!), res, next);

export const list = (req: Request, res: Response, next: NextFunction) =>
    handle(() => onboardingService.listOwned(req.userAuth!), res, next);

export const remove = (req: Request, res: Response, next: NextFunction) =>
    handle(() => onboardingService.removeOwned(req.params.id, req.userAuth!), res, next);

export const connectIntegration = (req: Request, res: Response, next: NextFunction) =>
    handle(
        () =>
            onboardingService.connectIntegration(
                req.params.id,
                req.userAuth!,
                req.params.provider as IntegrationProvider,
            ),
        res,
        next,
    );

export const githubCallback = async (req: Request, res: Response) => {
    const callbackState = req.query.state?.toString();
    try {
        const code = req.query.code?.toString();
        const rawInstallationId = req.query.installation_id?.toString();
        const installationId = rawInstallationId ? Number(rawInstallationId) : undefined;
        if (
            !callbackState ||
            !code ||
            (installationId !== undefined && !Number.isSafeInteger(installationId))
        )
            throw new ValidationError('Missing GitHub callback parameters');
        const result = await onboardingService.completeGitHubAuthorization({
            state: callbackState,
            installationId,
            code,
        });
        if (result.redirectUrl) {
            res.redirect(303, result.redirectUrl);
            return;
        }
        if (!result.onboarding)
            throw new ValidationError('GitHub authorization did not resolve an onboarding');
        res.redirect(
            303,
            `${bootEnv.FRONTEND_URL}/?onboarding=${result.onboarding._id.toString()}&integration=github&status=connected`,
        );
    } catch (error) {
        logger.error(
            'GitHub authorization callback failed',
            error instanceof Error ? error.message : 'Unknown error',
        );
        let onboardingId: string | undefined;
        try {
            if (callbackState) onboardingId = github.verifyState(callbackState).onboardingId;
        } catch {
            // Invalid state must not influence the frontend redirect.
        }
        const destination = new URL('/', bootEnv.FRONTEND_URL);
        if (onboardingId) destination.searchParams.set('onboarding', onboardingId);
        destination.searchParams.set('integration', 'github');
        destination.searchParams.set('status', 'error');
        destination.searchParams.set(
            'message',
            'GitHub authorization could not be completed. Please try again.',
        );
        res.redirect(303, destination.toString());
    }
};

export const requirementOptions = (req: Request, res: Response, next: NextFunction) =>
    handle(
        () =>
            onboardingService.requirementOptions(
                req.params.id,
                req.userAuth!,
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
                req.userAuth!,
                req.body.answers as OnboardingAnswers,
            ),
        res,
        next,
    );

export const provision = (req: Request, res: Response, next: NextFunction) =>
    handle(() => onboardingService.queueProvisioning(req.params.id, req.userAuth!), res, next, 202);
