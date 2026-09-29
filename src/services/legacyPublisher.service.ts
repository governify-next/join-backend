import { createHash } from 'node:crypto';
import YAML from 'yamljs';
import type { IOnboarding } from '../models/onboarding.model.js';
import { bootEnv } from '../config/bootConfig.js';
import { DuplicateKeyError, ExternalServiceError, ValidationError } from '../utils/customErrors.js';
import { readPath } from './requirement.service.js';

type LegacyProject = Record<string, unknown>;
type LegacyCourse = {
    classId: string;
    templateId?: string;
    autoRun?: boolean;
    calculationConfig?: Record<string, unknown>;
    projects: LegacyProject[];
};

const base = (url: string) => url.replace(/\/+$/, '');
const isRecord = (value: unknown): value is Record<string, unknown> =>
    Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const stable = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(stable);
    if (isRecord(value))
        return Object.fromEntries(
            Object.entries(value)
                .sort(([left], [right]) => left.localeCompare(right))
                .map(([key, nested]) => [key, stable(nested)]),
        );
    return value;
};
const sameProject = (left: LegacyProject, right: LegacyProject) =>
    JSON.stringify(stable(left)) === JSON.stringify(stable(right));

const request = async <T>(
    url: string,
    init: Parameters<typeof fetch>[1] = {},
): Promise<T | undefined> => {
    let response: Response;
    try {
        response = await fetch(url, init);
    } catch (error) {
        throw new ExternalServiceError(`Unable to reach ${new URL(url).host}`, error);
    }
    if (response.status === 404 && (!init.method || init.method === 'GET')) return undefined;
    const body = (await response.json().catch(() => null)) as
        | (Record<string, unknown> & { code?: number; message?: string })
        | null;
    if (!response.ok || (body?.code && body.code >= 400))
        throw new ExternalServiceError(
            `Legacy service rejected the request: ${body?.message || response.statusText}`,
            { status: response.status, code: body?.code },
        );
    return body as T;
};

const scopeHeaders = () => ({
    Authorization: bootEnv.LEGACY_SCOPE_AUTH_TOKEN,
    'Content-Type': 'application/json',
});

// This is the project section of the old info.yml, reconstructed from validated Join answers.
export const buildLegacyInfo = (onboarding: IOnboarding) => {
    const answers = onboarding.answers || {};
    const repository = answers.github_repository;
    const owner = readPath(repository, 'owner');
    const name = readPath(repository, 'name');
    const teamId = answers.scope_name;
    const members = answers.github_member_details;
    if (
        typeof owner !== 'string' ||
        !owner ||
        typeof name !== 'string' ||
        !name ||
        typeof teamId !== 'string' ||
        !teamId ||
        !Array.isArray(members) ||
        !members.length
    )
        throw new ValidationError(
            'Legacy publication requires a repository, scope name and members',
        );
    const memberEntries = members.map((member, index) => {
        const firstName = readPath(member, 'firstName');
        const lastName = readPath(member, 'lastName');
        const username = readPath(member, 'username');
        if (
            typeof firstName !== 'string' ||
            !firstName.trim() ||
            typeof lastName !== 'string' ||
            !lastName.trim() ||
            typeof username !== 'string' ||
            !username.trim()
        )
            throw new ValidationError(
                'Legacy publication requires every member name and GitHub username',
            );
        return [
            `member${index + 1}`,
            {
                name: firstName.trim(),
                surname: lastName.trim(),
                githubUsername: username.trim(),
            },
        ];
    });
    const legacyMembers: Record<string, { name: string; surname: string; githubUsername: string }> =
        Object.fromEntries(memberEntries);
    const emails = members.map((member) => {
        const email = readPath(member, 'email');
        if (typeof email !== 'string' || !email.trim())
            throw new ValidationError('Legacy publication requires every member email');
        return email.trim();
    });
    return {
        project: {
            name,
            owner,
            teamId,
            notifications: { email: emails.join(', ') },
            identities: {},
            members: legacyMembers,
        },
    };
};

const projectIdFor = (owner: string, repository: string) => {
    const hash = createHash('md5')
        .update(owner + repository)
        .digest('hex')
        .slice(0, 6);
    return `${bootEnv.LEGACY_COURSE_ID}-GH-${owner}_${repository}_${hash}`;
};

export const ensureLegacyScope = async (onboarding: IOnboarding) => {
    const { project: info } = buildLegacyInfo(onboarding);
    const projectId = projectIdFor(info.owner, info.name);
    const project: LegacyProject = {
        name: info.name,
        owner: info.owner,
        teamId: info.teamId,
        projectId,
        notifications: info.notifications,
        credentials: [],
        identities: [{ source: 'github', repository: info.name, repoOwner: info.owner }],
        members: Object.values(info.members).map((member) => ({
            memberId: `${member.name.replace(' ', '')}_${member.surname.replace(' ', '')}`,
            identities: [{ source: 'github', username: member.githubUsername }],
            credentials: [],
        })),
    };
    const url = `${base(bootEnv.LEGACY_SCOPE_URL)}/api/v1/scopes/development/${encodeURIComponent(bootEnv.LEGACY_COURSE_ID)}`;
    const getCourse = async (): Promise<LegacyCourse | undefined> => {
        const response = await request<{ code: number; scope?: LegacyCourse }>(url, {
            headers: scopeHeaders(),
        });
        if (!response?.scope) return undefined;
        if (!Array.isArray(response.scope.projects))
            throw new ExternalServiceError('Legacy course has no project collection');
        return response.scope;
    };
    const course = await getCourse();
    if (!course)
        throw new ExternalServiceError(
            `Legacy course '${bootEnv.LEGACY_COURSE_ID}' is unavailable`,
        );
    if (course.templateId && course.templateId !== bootEnv.LEGACY_TPA_TEMPLATE_ID)
        throw new DuplicateKeyError(`Legacy course '${bootEnv.LEGACY_COURSE_ID}' uses another TPA`);
    const existing = course.projects.find((candidate) => candidate.projectId === projectId);
    if (existing) {
        if (!sameProject(existing, project))
            throw new DuplicateKeyError(`Legacy project '${projectId}' exists with different data`);
    } else {
        const check = await request<{ projects?: { errors?: string[] }[] }>(
            `${base(bootEnv.LEGACY_SCOPE_URL)}/api/v1/scopes/development/check`,
            {
                method: 'POST',
                headers: scopeHeaders(),
                body: JSON.stringify({
                    name: 'Wizard',
                    data: YAML.stringify({ project: info }, 5, 2),
                }),
            },
        );
        const errors = check?.projects?.[0]?.errors;
        if (!Array.isArray(errors))
            throw new ExternalServiceError('Legacy Scope Manager did not validate info.yml');
        if (errors.length)
            throw new ValidationError(`Legacy info.yml is invalid: ${errors.join('; ')}`);
        await request(url, {
            method: 'PUT',
            headers: scopeHeaders(),
            body: JSON.stringify({ projects: [...course.projects, project] }),
        });
        const saved = await getCourse();
        if (!saved?.projects.some((candidate) => sameProject(candidate, project)))
            throw new ExternalServiceError(`Legacy project '${projectId}' was not persisted`);
    }
    return {
        projectId,
        autoRun: course.autoRun === true,
        calculationConfig: course.calculationConfig,
    };
};

const replaceTemplateValues = (
    template: Record<string, unknown>,
    projectId: string,
    notifications: { email: string },
) => {
    const serialized = JSON.stringify(template)
        .replaceAll('1010101010', projectId)
        .replaceAll('2020202020', bootEnv.LEGACY_COURSE_ID)
        .replaceAll(
            '$_[infrastructure.internal.assets.default]',
            base(bootEnv.LEGACY_INTERNAL_ASSETS_URL),
        )
        .replaceAll(
            '$_[infrastructure.internal.scopes.default]',
            base(bootEnv.LEGACY_INTERNAL_SCOPE_URL),
        );
    const agreement = JSON.parse(serialized) as Record<string, unknown>;
    const context = agreement.context;
    if (!isRecord(context)) throw new ValidationError('Legacy TPA template has no context');
    if (!isRecord(context.infrastructure)) context.infrastructure = {};
    const infrastructure = context.infrastructure as Record<string, unknown>;
    const agreementId = `tpa-${projectId}`;
    infrastructure.render = `${base(bootEnv.LEGACY_RENDER_URL)}/render?model=${base(bootEnv.LEGACY_REGISTRY_URL)}/api/v6/agreements/${agreementId}&view=/renders/tpa/default.html&ctrl=/renders/tpa/default.js`;
    if (!isRecord(context.definitions)) context.definitions = {};
    const definitions = context.definitions as Record<string, unknown>;
    definitions.notifications = notifications;
    delete agreement._id;
    delete agreement.id;
    return {
        id: agreementId,
        templateId: bootEnv.LEGACY_TPA_TEMPLATE_ID,
        ...agreement,
        type: 'agreement',
    };
};

export const ensureLegacyAgreement = async (
    projectId: string,
    notifications: { email: string },
) => {
    const registry = base(bootEnv.LEGACY_REGISTRY_URL);
    const agreementId = `tpa-${projectId}`;
    const verifyExisting = (agreement: Record<string, unknown>) => {
        if (agreement.templateId && agreement.templateId !== bootEnv.LEGACY_TPA_TEMPLATE_ID)
            throw new DuplicateKeyError(`Legacy agreement '${agreementId}' uses another template`);
        if (readPath(agreement, 'context.definitions.notifications.email') !== notifications.email)
            throw new DuplicateKeyError(
                `Legacy agreement '${agreementId}' has different notifications`,
            );
    };
    const existing = await request<Record<string, unknown>>(
        `${registry}/api/v6/agreements/${encodeURIComponent(agreementId)}`,
    );
    if (existing) {
        verifyExisting(existing);
        return agreementId;
    }
    const template = await request<Record<string, unknown>>(
        `${registry}/api/v6/templates/${encodeURIComponent(bootEnv.LEGACY_TPA_TEMPLATE_ID)}`,
    );
    if (!template) throw new ExternalServiceError('Legacy TPA template was not found');
    const agreement = replaceTemplateValues(template, projectId, notifications);
    try {
        await request(`${registry}/api/v6/agreements`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(agreement),
        });
    } catch (error) {
        const created = await request<Record<string, unknown>>(
            `${registry}/api/v6/agreements/${encodeURIComponent(agreementId)}`,
        );
        if (!created) throw error;
        verifyExisting(created);
    }
    return agreementId;
};

export const ensureLegacyCalculation = async (
    projectId: string,
    autoRun: boolean,
    calculationConfig?: Record<string, unknown>,
) => {
    if (!autoRun) return;
    const taskId = `tpaCalculation-${bootEnv.LEGACY_COURSE_ID}-${projectId}`;
    const director = base(bootEnv.LEGACY_DIRECTOR_URL);
    const existing = await request<Record<string, unknown>>(
        `${director}/api/v1/tasks/${encodeURIComponent(taskId)}`,
    );
    if (existing) {
        if (readPath(existing, 'config.agreementId') !== `tpa-${projectId}`)
            throw new DuplicateKeyError(`Legacy task '${taskId}' targets another agreement`);
        return taskId;
    }
    const body = {
        id: taskId,
        script: `${base(bootEnv.LEGACY_INTERNAL_ASSETS_URL)}/api/v1/public/director/tasks/system/requestTpaReport/script.js`,
        running: true,
        config: { agreementId: `tpa-${projectId}` },
        tags: {
            simple: ['tpaCalculation', 'createdByJoin'],
            keyValue: { type: 'tpaCalculation', courseId: bootEnv.LEGACY_COURSE_ID, projectId },
        },
        code: 0,
        message: 'message',
        init: new Date().toISOString(),
        end: new Date(Date.now() + 7 * 30 * 24 * 60 * 60_000).toISOString(),
        interval: 3_600_000,
        ...(calculationConfig || {}),
    };
    try {
        await request(`${director}/api/v1/tasks`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
    } catch (error) {
        if (!(await request(`${director}/api/v1/tasks/${encodeURIComponent(taskId)}`))) throw error;
    }
    return taskId;
};
