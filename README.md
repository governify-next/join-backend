# Governify Join Backend

Orchestrates declarative project onboarding into Governify. During this early stage, Join owns a local mock catalog for template discovery; completed onboardings are still provisioned through the real Scope Manager, Registry and Director APIs.

Agreement and Guarantee Templates live in `src/data/agreementTemplates.ts`. Their separate, versioned onboarding contracts live in `src/data/onboardingDefinitions.ts`. A definition declares reusable modules, required inputs, dependency-aware option sources, and semantic mappings into the Agreement signatures and Scope payload.

The Mongo worker only owns checkpoints and retries. `ecosystemPublisher.service.ts` is the downstream adapter for Registry, Scope Manager and Director, keeping publication replaceable without coupling it to the wizard contract.

The demo catalog contains a basic GitHub agreement, an advanced GitHub Project/member agreement, and a combined GitHub + mocked ZenHub + Scope agreement. Removing guarantees and requirements changes the wizard without frontend changes.

## Responsibilities

- Authenticate Governify users through the Authenticator `/me` contract.
- Authorize GitHub once, discover existing GitHub App installations, install automatically when none is available, and enumerate repositories across every accessible installation.
- Resolve the installation from the selected repository, then enumerate Projects V2 boards, status fields and collaborators.
- Simulate ZenHub authorization, workspaces, pipelines, and users with deterministic mocks.
- Persist resumable onboarding sessions and project associations.
- Resolve resource options through a generic requirement endpoint and validate every submitted answer server-side.
- Generate per-project and per-member signatures from explicit subjects in the integration definition.
- Send the completed onboarding and Agreement copy to Scope Manager, create/reuse the Agreement collection and version in Registry, start an asynchronous state generation, and create an hourly Director task.
- Resume provisioning from durable, idempotent Mongo checkpoints and reject conflicting pre-existing resources.
- Mint one initial GitHub installation token while creating the Agreement version.

The initial installation token, its expiration and the durable `installationId` are written only to the Registry Agreement version so the first fetch can run immediately. Join does not place the token in its onboarding result, Scope Manager audit copy or frontend response, and exposes no token-refresh endpoint. Fetcher owns all subsequent token renewal using the `installationId`.

## Local development

Requires Node.js 24 and MongoDB. Copy `.env.example` to `.env`, configure the service URLs and GitHub App, then run:

```bash
npm ci
npm run dev
```

The GitHub App must request read access to repository metadata, issues, pull requests, collaborators, and Projects, request user authorization during installation, and use `GITHUB_CALLBACK_URL` as its callback URL. Join starts with the OAuth user flow so an existing installation returns directly to the repository selector; if the user has no accessible installation, Join forwards to GitHub installation automatically.

## Commands

- `npm run dev` — run with reload
- `npm run build` — compile TypeScript
- `npm run lint` — run ESLint
- `npm run format:check` — verify formatting

Fetcher must have the GitHub App credentials needed to replace the initial token after `tokenExpiresAt`. ZenHub resources and credentials remain demo mocks, so the hybrid example demonstrates materialization and orchestration but cannot fetch real ZenHub data yet.
