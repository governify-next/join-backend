import { createHash, createHmac, randomBytes, sign, timingSafeEqual } from 'node:crypto';
import { bootEnv } from '../config/bootConfig.js';
import type { IOnboarding } from '../models/onboarding.model.js';
import { UnauthorizedError, ValidationError } from '../utils/customErrors.js';
import { requestJson } from '../utils/http.js';
import type { GitHubInstallation, GitHubProject, GitHubRepository } from './provider.types.js';

const transientStatuses = new Set([429, 502, 503, 504]);

const requestGitHub = async <T>(url: string, init: Parameters<typeof fetch>[1] = {}) => {
    for (let attempt = 0; ; attempt += 1) {
        try {
            return await requestJson<T>(url, init);
        } catch (error) {
            const status = (error as { details?: { status?: number } }).details?.status;
            if (attempt >= 2 || !status || !transientStatuses.has(status)) throw error;
            await new Promise((resolve) => setTimeout(resolve, 300 * 2 ** attempt));
        }
    }
};

const apiHeaders = (token: string) => ({
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
});

const appJwt = () => {
    if (!bootEnv.GITHUB_APP_ID || !bootEnv.GITHUB_APP_PRIVATE_KEY)
        throw new ValidationError('GitHub App is not configured');
    const now = Math.floor(Date.now() / 1_000);
    const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(
        JSON.stringify({ iat: now - 30, exp: now + 9 * 60, iss: bootEnv.GITHUB_APP_ID }),
    ).toString('base64url');
    const content = `${header}.${payload}`;
    return `${content}.${sign('RSA-SHA256', Buffer.from(content), bootEnv.GITHUB_APP_PRIVATE_KEY).toString('base64url')}`;
};

type AuthorizationPurpose = 'oauth' | 'install';

const buildState = (onboarding: IOnboarding, purpose: AuthorizationPurpose) => {
    const nonce = randomBytes(20).toString('base64url');
    const payload = Buffer.from(
        JSON.stringify({
            onboardingId: onboarding._id.toString(),
            userId: onboarding.userId,
            nonce,
            purpose,
            exp: Date.now() + 10 * 60_000,
        }),
    ).toString('base64url');
    const signature = createHmac('sha256', bootEnv.JWT_SECRET).update(payload).digest('base64url');
    return {
        nonceHash: createHash('sha256').update(nonce).digest('hex'),
        state: `${payload}.${signature}`,
    };
};

export const buildUserAuthorization = (onboarding: IOnboarding) => {
    const authorization = buildState(onboarding, 'oauth');
    const query = new URLSearchParams({
        client_id: bootEnv.GITHUB_APP_CLIENT_ID,
        redirect_uri: bootEnv.GITHUB_CALLBACK_URL,
        state: authorization.state,
    });
    return {
        nonceHash: authorization.nonceHash,
        purpose: 'oauth' as const,
        url: `https://github.com/login/oauth/authorize?${query.toString()}`,
    };
};

export const buildInstallationAuthorization = (onboarding: IOnboarding) => {
    const authorization = buildState(onboarding, 'install');
    return {
        nonceHash: authorization.nonceHash,
        purpose: 'install' as const,
        url: `https://github.com/apps/${encodeURIComponent(bootEnv.GITHUB_APP_SLUG)}/installations/new?state=${encodeURIComponent(authorization.state)}`,
    };
};

export const verifyState = (state: string) => {
    const [payload, signature] = state.split('.');
    const expected = createHmac('sha256', bootEnv.JWT_SECRET).update(payload).digest('base64url');
    const actualBuffer = Buffer.from(signature || '');
    const expectedBuffer = Buffer.from(expected);
    if (
        actualBuffer.length !== expectedBuffer.length ||
        !timingSafeEqual(actualBuffer, expectedBuffer)
    )
        throw new UnauthorizedError('Invalid GitHub state');
    const value = JSON.parse(Buffer.from(payload, 'base64url').toString()) as {
        onboardingId: string;
        userId: string;
        nonce: string;
        purpose: AuthorizationPurpose;
        exp: number;
    };
    if (!['oauth', 'install'].includes(value.purpose))
        throw new UnauthorizedError('Invalid GitHub authorization purpose');
    if (value.exp < Date.now()) throw new UnauthorizedError('GitHub state expired');
    return value;
};

export const createInstallationToken = async (installationId: number) =>
    requestGitHub<{ token: string; expires_at: string }>(
        `${bootEnv.GITHUB_API_URL}/app/installations/${installationId}/access_tokens`,
        { method: 'POST', headers: apiHeaders(appJwt()), body: '{}' },
    );

const exchangeUserCode = (code: string) =>
    requestGitHub<{ access_token?: string; error?: string; error_description?: string }>(
        'https://github.com/login/oauth/access_token',
        {
            method: 'POST',
            headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
            body: JSON.stringify({
                client_id: bootEnv.GITHUB_APP_CLIENT_ID,
                client_secret: bootEnv.GITHUB_APP_CLIENT_SECRET,
                code,
                redirect_uri: bootEnv.GITHUB_CALLBACK_URL,
            }),
        },
    );

export const discoverUserInstallations = async (code?: string): Promise<GitHubInstallation[]> => {
    if (!code) throw new UnauthorizedError('GitHub user authorization was not completed');
    const userToken = await exchangeUserCode(code);
    if (!userToken.access_token)
        throw new UnauthorizedError(
            userToken.error_description || userToken.error || 'GitHub authorization failed',
        );
    const installations: GitHubInstallation[] = [];
    for (let page = 1; ; page += 1) {
        const result = await requestGitHub<{
            installations: {
                id: number;
                account: { login: string; type: string };
                html_url?: string;
            }[];
        }>(`${bootEnv.GITHUB_API_URL}/user/installations?per_page=100&page=${page}`, {
            headers: apiHeaders(userToken.access_token),
        });
        installations.push(
            ...result.installations.map((installation) => ({
                id: installation.id,
                accountLogin: installation.account.login,
                accountType: installation.account.type,
                htmlUrl: installation.html_url || '',
            })),
        );
        if (result.installations.length < 100) break;
    }
    return installations;
};

export const listRepositories = async (installationId: number): Promise<GitHubRepository[]> => {
    const { token } = await createInstallationToken(installationId);
    const repositories: {
        id: number;
        name: string;
        full_name: string;
        private: boolean;
        owner: { login: string };
    }[] = [];
    for (let page = 1; ; page += 1) {
        const result = await requestGitHub<{ repositories: typeof repositories }>(
            `${bootEnv.GITHUB_API_URL}/installation/repositories?per_page=100&page=${page}`,
            { headers: apiHeaders(token) },
        );
        repositories.push(...result.repositories);
        if (result.repositories.length < 100) break;
    }
    return repositories.map((repository) => ({
        id: repository.id,
        name: repository.name,
        fullName: repository.full_name,
        owner: repository.owner.login,
        private: repository.private,
    }));
};

export const listProjects = async (
    installationId: number,
    owner: string,
): Promise<GitHubProject[]> => {
    const { token } = await createInstallationToken(installationId);
    const query = `query($owner:String!,$after:String){ organization(login:$owner){ projectsV2(first:50,after:$after){ nodes{ id number title fields(first:50){ nodes{ ... on ProjectV2SingleSelectField{ id name options{ id name } } } } } pageInfo{ hasNextPage endCursor } } } user(login:$owner){ projectsV2(first:50,after:$after){ nodes{ id number title fields(first:50){ nodes{ ... on ProjectV2SingleSelectField{ id name options{ id name } } } } } pageInfo{ hasNextPage endCursor } } } }`;
    type ProjectsConnection = {
        nodes: Record<string, unknown>[];
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
    };
    type ProjectsResult = {
        organization?: { projectsV2: ProjectsConnection };
        user?: { projectsV2: ProjectsConnection };
    };
    const nodes: Record<string, unknown>[] = [];
    let after: string | null = null;
    for (;;) {
        const result: ProjectsResult = await requestGitHub<ProjectsResult>(
            `${bootEnv.GITHUB_API_URL}/graphql`,
            {
                method: 'POST',
                headers: apiHeaders(token),
                body: JSON.stringify({ query, variables: { owner, after } }),
            },
        );
        const connection: ProjectsConnection | undefined =
            result.organization?.projectsV2 || result.user?.projectsV2;
        if (!connection) break;
        nodes.push(...connection.nodes);
        if (!connection.pageInfo.hasNextPage || !connection.pageInfo.endCursor) break;
        after = connection.pageInfo.endCursor;
    }
    return nodes.map((node) => ({
        id: String(node.id),
        number: Number(node.number),
        title: String(node.title),
        owner,
        statusFields: (
            (
                node.fields as {
                    nodes: {
                        id?: string;
                        name?: string;
                        options?: { id: string; name: string }[];
                    }[];
                }
            )?.nodes || []
        )
            .filter((field) => field.id && field.options)
            .map((field) => ({ id: field.id!, name: field.name!, options: field.options! })),
    }));
};

export const listCollaborators = async (installationId: number, owner: string, repo: string) => {
    const { token } = await createInstallationToken(installationId);
    const users: { login: string; avatar_url: string }[] = [];
    for (let page = 1; ; page += 1) {
        const pageUsers = await requestGitHub<typeof users>(
            `${bootEnv.GITHUB_API_URL}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/collaborators?per_page=100&page=${page}`,
            { headers: apiHeaders(token) },
        );
        users.push(...pageUsers);
        if (pageUsers.length < 100) break;
    }
    return users.map((user) => ({ username: user.login, avatarUrl: user.avatar_url }));
};
