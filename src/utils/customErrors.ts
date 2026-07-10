export class StdError extends Error {
    readonly httpStatus: number;
    readonly appCode: string;
    readonly details?: unknown;

    constructor(params: {
        message: string;
        httpStatus: number;
        appCode: string;
        details?: unknown;
    }) {
        super(params.message);
        this.httpStatus = params.httpStatus;
        this.appCode = params.appCode;
        this.details = params.details;
    }
}
export class DuplicateKeyError extends StdError {
    constructor(message: string = 'Duplicate key error', details?: unknown) {
        super({
            message,
            httpStatus: 409,
            appCode: 'DUPLICATE_KEY',
            details,
        });
    }
}

export class ValidationError extends StdError {
    constructor(message: string = 'Validation error', details?: unknown) {
        super({
            message,
            httpStatus: 400,
            appCode: 'VALIDATION_ERROR',
            details,
        });
    }
}

export class NotFoundError extends StdError {
    constructor(message: string = 'Resource not found', details?: unknown) {
        super({
            message,
            httpStatus: 404,
            appCode: 'NOT_FOUND',
            details,
        });
    }
}

export class TooManyRequestsError extends StdError {
    constructor(message: string = 'Too many requests', details?: unknown) {
        super({
            message,
            httpStatus: 429,
            appCode: 'TOO_MANY_REQUESTS',
            details,
        });
    }
}

export class UnauthorizedError extends StdError {
    constructor(message: string = 'Unauthorized', details?: unknown) {
        super({
            message,
            httpStatus: 401,
            appCode: 'UNAUTHORIZED',
            details,
        });
    }
}

export class ForbiddenError extends StdError {
    constructor(message: string = 'Forbidden', details?: unknown) {
        super({
            message,
            httpStatus: 403,
            appCode: 'FORBIDDEN',
            details,
        });
    }
}
