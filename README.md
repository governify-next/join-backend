# Governify Join Backend

Orchestrates project onboarding into Governify. The first provider is GitHub, with agreement templates supplied by Registry's public catalog.

The current proof of concept projects Registry's public `CS169L-Sp26` example into a four-metric agreement: the In-Progress issue/branch correlation and the team approved-merged-pull-request correlation. Metric and fetcher definitions remain authoritative in Registry.

## Responsibilities

- Authenticate Governify users through the Authenticator `/me` contract.
- Install and verify a GitHub App, enumerate repositories, Projects V2 boards, status fields, and collaborators.
- Persist resumable onboarding sessions and project associations.
- Generate agreement-version signatures from guided GitHub configuration.
- Provision Scope Manager, Registry, and Director resources with durable checkpoints.
- Mint short-lived GitHub installation tokens for service-authenticated collectors.

GitHub user and installation access tokens are never persisted. Agreement fetcher configuration contains only a durable `{ provider, installationId }` credential reference.

## Local development

Requires Node.js 24 and MongoDB. Copy `.env.example` to `.env`, configure the service URLs and GitHub App, then run:

```bash
npm ci
npm run dev
```

The GitHub App must request read access to repository metadata, issues, pull requests, collaborators, and Projects, request user authorization during installation, and use `GITHUB_CALLBACK_URL` as its callback URL.

## Commands

- `npm run dev` — run with reload
- `npm run build` — compile TypeScript
- `npm run lint` — run ESLint
- `npm run format:check` — verify formatting

The downstream collector/computer GitHub Projects adapter is intentionally outside this repository. It must consume `FT_GQL_GITHUB_PROJECTV2_ITEMS` and use the internal installation-token endpoint before live calculations can succeed.
