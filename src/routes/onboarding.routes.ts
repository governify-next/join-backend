import { Router } from 'express';
import * as controller from '../controllers/onboarding.controller.js';
import * as joinLinkController from '../controllers/joinLink.controller.js';
import { requireUser } from '../middlewares/userAuthentication.js';

export const onboardingRoutes = Router();

onboardingRoutes.get('/agreement-templates', requireUser, controller.agreementTemplates);
onboardingRoutes.get('/join-link-organizations', requireUser, joinLinkController.organizations);
onboardingRoutes.get(
    '/organizations/:organizationName/join-links',
    requireUser,
    joinLinkController.list,
);
onboardingRoutes.post(
    '/organizations/:organizationName/join-links',
    requireUser,
    joinLinkController.create,
);
onboardingRoutes.get('/join-links/:id', requireUser, joinLinkController.get);
onboardingRoutes.get('/integrations/github/callback', controller.githubCallback);
onboardingRoutes.post('/onboardings', requireUser, controller.create);
onboardingRoutes.get('/onboardings/:id', requireUser, controller.get);
onboardingRoutes.post(
    '/onboardings/:id/integrations/:provider/connect',
    requireUser,
    controller.connectIntegration,
);
onboardingRoutes.post(
    '/onboardings/:id/requirements/:requirementId/options',
    requireUser,
    controller.requirementOptions,
);
onboardingRoutes.patch('/onboardings/:id/answers', requireUser, controller.saveAnswers);
onboardingRoutes.put('/onboardings/:id/configuration', requireUser, controller.configure);
onboardingRoutes.post('/onboardings/:id/provision', requireUser, controller.provision);
onboardingRoutes.post('/onboardings/:id/retry', requireUser, controller.provision);
