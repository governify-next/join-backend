import { bootEnv } from '../config/bootConfig.js';
import { requestJson } from '../utils/http.js';
import { serviceHeaders } from '../utils/serviceAuthentication.js';

type Organization = Record<string, unknown> & { name: string };
type Membership = { userId: unknown };

const upstreamStatus = (error: unknown) =>
    (error as { details?: { status?: number } }).details?.status;

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

    const organizations = await requestJson<Organization[]>(
        `${bootEnv.SCOPE_MANAGER_SERVICE_URL}/api/v1/organizations`,
        { headers },
    );
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
