# Governify Join Backend

Orchestrates declarative project onboarding into Governify. Join discovers public Agreement Templates directly from Registry and provisions completed onboardings through the real Scope Manager, Registry and Director APIs.

Agreement and Guarantee Template contents live in Registry. `src/data/onboardingDefinitions.ts` contains one self-contained onboarding factory per supported Registry Agreement Template and an explicit name-to-factory map. Each factory owns its integrations, wizard requirements, metric rules, project/member signatures, credential bindings and Scope mappings, while reading the actual Guarantee Templates from Registry.

The Mongo worker only owns checkpoints and retries. `ecosystemPublisher.service.ts` is the downstream adapter for Registry, Scope Manager and Director, keeping publication replaceable without coupling it to the wizard contract.

The currently supported catalog contains one definition for Registry's public `CS169L-Sp26` template, displayed as **TPA UCBerkeley CS169L Spring 2026**. Its complete demo catalog contains 11 guarantees and 15 unique metrics covering project/team and per-member practices. Join collects one GitHub repository, Project V2 workflow columns and members, then expands all member-scoped signatures for the selected collaborators. Other public Registry templates remain hidden until Join receives a matching onboarding definition.

## Responsibilities

- Authenticate Governify users through the Authenticator `/me` contract.
- Authorize GitHub once, discover existing GitHub App installations, install automatically when none is available, and enumerate repositories across every accessible installation.
- Resolve the installation from the selected repository, then enumerate Projects V2 boards, status fields and collaborators.
- Retain the mocked ZenHub adapter for future onboarding definitions without exposing it in the current Berkeley flow.
- Persist resumable onboarding sessions, provisioning checkpoints and completed results; the same source may be onboarded more than once.
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

Standalone development and container runs listen on port `5907` by default. Managed deployments can continue to override `PORT` explicitly.

The GitHub App must request read access to repository metadata, issues, pull requests, collaborators, and Projects, request user authorization during installation, and use `GITHUB_CALLBACK_URL` as its callback URL. Join starts with the OAuth user flow so an existing installation returns directly to the repository selector; if the user has no accessible installation, Join forwards to GitHub installation automatically.

## Commands

- `npm run dev` — run with reload
- `npm run build` — compile TypeScript
- `npm run lint` — run ESLint
- `npm run format:check` — verify formatting

Fetcher must have the GitHub App credentials needed to replace the initial token after `tokenExpiresAt`. The retained ZenHub adapter still uses demo resources and credentials and is not part of the current Berkeley definition.
