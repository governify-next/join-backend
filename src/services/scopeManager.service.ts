import { bootEnv } from '../config/bootConfig.js';
import type { AuthenticatedUser, JoinLinkOrganization } from '../types/onboarding.js';
import { ForbiddenError, NotFoundError } from '../utils/customErrors.js';
import { requestJson } from '../utils/http.js';
import { serviceHeaders } from '../utils/serviceAuthentication.js';

type Organization = Record<string, unknown> & {
    _id: string;
    name: string;
    displayName?: string;
    roles?: { _id?: string; name?: string }[];
};
type Membership = { userId: unknown; rolesId?: unknown[] };

const upstreamStatus = (error: unknown) =>
    (error as { details?: { status?: number } }).details?.status;

const organizationReference = (organization: Organization): JoinLinkOrganization => ({
    _id: String(organization._id),
    name: organization.name,
    displayName: organization.displayName,
});

const allOrganizations = () =>
    requestJson<Organization[]>(`${bootEnv.SCOPE_MANAGER_SERVICE_URL}/api/v1/organizations`, {
        headers: serviceHeaders(),
    });

const isOrganizationAdmin = async (organization: Organization, user: AuthenticatedUser) => {
    if (user.systemRole === 'SUPERADMIN') return true;

    const adminRole = organization.roles?.find(({ name }) => name === 'admin');
    if (!adminRole?._id) return false;
    const memberships = await requestJson<Membership[]>(
        `${bootEnv.SCOPE_MANAGER_SERVICE_URL}/api/v1/organizations/${encodeURIComponent(organization.name)}/members`,
        { headers: serviceHeaders() },
    );
    return memberships.some(
        ({ userId, rolesId }) =>
            String(userId) === user.id &&
            rolesId?.some((roleId) => String(roleId) === String(adminRole._id)),
    );
};

export const organizationsForUser = async (username: string, userId: string) => {
    const headers = serviceHeaders();

    try {
        return await requestJson<Organization[]>(
            `${bootEnv.SCOPE_MANAGER_SERVICE_URL}/api/v1/users/${encodeURIComponent(username)}/organizations`,
            { headers },
        );
    } catch (error) {
        if (upstreamStatus(error) !== 404) throw error;
    }

    const organizations = await allOrganizations();
    const memberships = await Promise.all(
        organizations.map((organization) =>
            requestJson<Membership[]>(
                `${bootEnv.SCOPE_MANAGER_SERVICE_URL}/api/v1/organizations/${encodeURIComponent(organization.name)}/members`,
                { headers },
            ),
        ),
    );
    return organizations.filter((_organization, index) =>
        memberships[index].some((membership) => String(membership.userId) === userId),
    );
};

export const requireOrganizationMember = async (
    organizationName: string,
    user: Pick<AuthenticatedUser, 'id' | 'username'>,
): Promise<JoinLinkOrganization> => {
    const organizations = await organizationsForUser(user.username, user.id);
    const organization = organizations.find(({ name }) => name === organizationName);
    if (!organization)
        throw new ForbiddenError(
            `You must be a member of organization '${organizationName}' to use this join link`,
        );
    return organizationReference(organization);
};

export const organizationsAdministeredBy = async (
    user: AuthenticatedUser,
): Promise<JoinLinkOrganization[]> => {
    const organizations =
        user.systemRole === 'SUPERADMIN'
            ? await allOrganizations()
            : await organizationsForUser(user.username, user.id);
    const adminChecks = await Promise.all(
        organizations.map((organization) => isOrganizationAdmin(organization, user)),
    );
    return organizations
        .filter((_organization, index) => adminChecks[index])
        .map(organizationReference)
        .sort((left, right) =>
            (left.displayName || left.name).localeCompare(right.displayName || right.name),
        );
};

export const requireOrganizationAdmin = async (
    organizationName: string,
    user: AuthenticatedUser,
): Promise<JoinLinkOrganization> => {
    const organization = await requestJson<Organization>(
        `${bootEnv.SCOPE_MANAGER_SERVICE_URL}/api/v1/organizations/${encodeURIComponent(organizationName)}`,
        { headers: serviceHeaders() },
    ).catch((error) => {
        if (upstreamStatus(error) === 404)
            throw new NotFoundError(`Organization '${organizationName}' not found`);
        throw error;
    });

    if (!(await isOrganizationAdmin(organization, user)))
        throw new ForbiddenError(
            `Organization administrator permissions are required for '${organizationName}'`,
        );

    return organizationReference(organization);
};
