import YAML from 'yamljs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { IOnboarding } from '../src/models/onboarding.model.js';
import { bootEnv } from '../src/config/bootConfig.js';
import {
    buildLegacyInfo,
    ensureLegacyAgreement,
    ensureLegacyCalculation,
    ensureLegacyScope,
} from '../src/services/legacyPublisher.service.js';

const original = { ...bootEnv };
afterEach(() => {
    Object.assign(bootEnv, original);
    vi.unstubAllGlobals();
});

const onboarding = {
    answers: {
        github_repository: { owner: 'students', name: 'team-repo' },
        scope_name: 'Team_7',
        github_member_details: [
            { firstName: 'Ana', lastName: 'García', username: 'ana', email: 'ana@example.com' },
            { firstName: 'Luis', lastName: 'Pérez', username: 'luis', email: 'luis@example.com' },
        ],
    },
} as unknown as IOnboarding;

const json = (body: unknown, status = 200) => Response.json(body, { status });

describe('Bluejay compatibility publisher', () => {
    it('reconstructs info.yml fields from validated Join answers', () => {
        expect(buildLegacyInfo(onboarding)).toEqual({
            project: {
                name: 'team-repo',
                owner: 'students',
                teamId: 'Team_7',
                notifications: { email: 'ana@example.com, luis@example.com' },
                identities: {},
                members: {
                    member1: { name: 'Ana', surname: 'García', githubUsername: 'ana' },
                    member2: { name: 'Luis', surname: 'Pérez', githubUsername: 'luis' },
                },
            },
        });
    });

    it('validates the generated YAML and publishes the legacy project only once', async () => {
        bootEnv.LEGACY_SCOPE_URL = 'https://old-scopes.example';
        bootEnv.LEGACY_SCOPE_AUTH_TOKEN = 'test-token';
        const projects: Record<string, unknown>[] = [];
        const calls: { url: string; init: RequestInit }[] = [];
        vi.stubGlobal(
            'fetch',
            vi.fn(async (url: string, init: RequestInit = {}) => {
                calls.push({ url, init });
                if (url.endsWith('/check')) {
                    const body = JSON.parse(String(init.body));
                    expect(YAML.parse(body.data)).toEqual(buildLegacyInfo(onboarding));
                    return json({ code: 200, projects: [{ errors: [] }] });
                }
                if (init.method === 'PUT') {
                    projects.splice(0, projects.length, ...JSON.parse(String(init.body)).projects);
                    return json({ code: 200 });
                }
                return json({
                    code: 200,
                    scope: { classId: bootEnv.LEGACY_COURSE_ID, autoRun: true, projects },
                });
            }),
        );
        const first = await ensureLegacyScope(onboarding);
        expect(first.projectId).toMatch(/^UCLM-ISII-2026-2027-GH-students_team-repo_[a-f0-9]{6}$/);
        expect(projects[0]).toMatchObject({
            teamId: 'Team_7',
            notifications: { email: 'ana@example.com, luis@example.com' },
            identities: [{ source: 'github', repository: 'team-repo', repoOwner: 'students' }],
            members: [{ memberId: 'Ana_García' }, { memberId: 'Luis_Pérez' }],
        });
        await ensureLegacyScope(onboarding);
        expect(calls.filter(({ init }) => init.method === 'PUT')).toHaveLength(1);
        expect(calls.filter(({ url }) => url.endsWith('/check'))).toHaveLength(1);
    });

    it('substitutes the legacy TPA template and schedules its calculation', async () => {
        Object.assign(bootEnv, {
            LEGACY_REGISTRY_URL: 'https://old-registry.example',
            LEGACY_DIRECTOR_URL: 'https://old-director.example',
            LEGACY_INTERNAL_ASSETS_URL: 'http://old-assets',
            LEGACY_INTERNAL_SCOPE_URL: 'http://old-scopes',
            LEGACY_RENDER_URL: 'https://old-render.example',
        });
        const posts: { url: string; body: Record<string, unknown> }[] = [];
        vi.stubGlobal(
            'fetch',
            vi.fn(async (url: string, init: RequestInit = {}) => {
                if (init.method === 'POST') {
                    posts.push({ url, body: JSON.parse(String(init.body)) });
                    return json({ id: 'created' });
                }
                if (url.includes('/templates/'))
                    return json({
                        id: 'template-id',
                        context: { infrastructure: {}, definitions: {} },
                        subject: '1010101010',
                        course: '2020202020',
                        assets: '$_[infrastructure.internal.assets.default]',
                        scopes: '$_[infrastructure.internal.scopes.default]',
                    });
                return json(null, 404);
            }),
        );
        const projectId = 'UCLM-ISII-2026-2027-GH-students_team-repo_123abc';
        expect(
            await ensureLegacyAgreement(
                projectId,
                buildLegacyInfo(onboarding).project.notifications,
            ),
        ).toBe(`tpa-${projectId}`);
        expect(await ensureLegacyCalculation(projectId, true)).toBe(
            `tpaCalculation-${bootEnv.LEGACY_COURSE_ID}-${projectId}`,
        );
        expect(posts[0].body).toMatchObject({
            id: `tpa-${projectId}`,
            templateId: bootEnv.LEGACY_TPA_TEMPLATE_ID,
            subject: projectId,
            course: bootEnv.LEGACY_COURSE_ID,
            assets: 'http://old-assets',
            scopes: 'http://old-scopes',
            context: {
                definitions: { notifications: { email: 'ana@example.com, luis@example.com' } },
            },
        });
        expect(posts[1].body).toMatchObject({
            running: true,
            config: { agreementId: `tpa-${projectId}` },
            interval: 3_600_000,
        });
    });
});
