import { Router } from 'express';
import * as controller from '../controllers/onboarding.controller.js';
import { requireService, requireUser } from '../middlewares/userAuthentication.js';

export const onboardingRoutes = Router();

onboardingRoutes.get('/agreement-templates', requireUser, controller.agreementTemplates);
onboardingRoutes.get('/integrations/github/callback', controller.githubCallback);
onboardingRoutes.get(
    '/internal/integrations/github/installations/:installationId/token',
    requireService,
    controller.installationToken,
);
onboardingRoutes.post('/onboardings', requireUser, controller.create);
onboardingRoutes.get('/onboardings/:id', requireUser, controller.get);
onboardingRoutes.post(
    '/onboardings/:id/integrations/github/authorize',
    requireUser,
    controller.authorizeGitHub,
);
onboardingRoutes.get('/onboardings/:id/repositories', requireUser, controller.repositories);
onboardingRoutes.get('/onboardings/:id/projects', requireUser, controller.projects);
onboardingRoutes.get('/onboardings/:id/collaborators', requireUser, controller.collaborators);
onboardingRoutes.get('/onboardings/:id/organizations', requireUser, controller.organizations);
onboardingRoutes.put('/onboardings/:id/configuration', requireUser, controller.configure);
onboardingRoutes.post('/onboardings/:id/provision', requireUser, controller.provision);
onboardingRoutes.post('/onboardings/:id/retry', requireUser, controller.provision);
