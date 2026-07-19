import { ExternalServiceError } from './customErrors.js';

export const requestJson = async <T>(
    url: string,
    init: Parameters<typeof fetch>[1] = {},
): Promise<T> => {
    let response: Response;
    try {
        response = await fetch(url, init);
    } catch (error) {
        throw new ExternalServiceError(`Unable to reach ${new URL(url).host}`, error);
    }
    const body = (await response.json().catch(() => null)) as
        | { data?: T; message?: string; error?: { message?: string } }
        | T
        | null;
    if (!response.ok) {
        const wrapped = body as { message?: string; error?: { message?: string } } | null;
        throw new ExternalServiceError(
            wrapped?.error?.message || wrapped?.message || `Request failed with ${response.status}`,
            { status: response.status },
        );
    }
    if (body && typeof body === 'object' && 'data' in body) return body.data as T;
    return body as T;
};
