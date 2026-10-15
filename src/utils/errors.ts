export class AppError extends Error {
  code?: string;
  statusCode?: number;
  disableSentryLogging?: boolean;
  details?: unknown;

  constructor(
    message: string,
    opts?: {
      code?: string;
      statusCode?: number;
      disableSentryLogging?: boolean;
      details?: unknown;
    }
  ) {
    super(message);
    this.name = "AppError";
    this.code = opts?.code;
    this.statusCode = opts?.statusCode;
    this.disableSentryLogging = opts?.disableSentryLogging;
    this.details = opts?.details;
  }
}

export class ValidationAppError extends AppError {
  constructor(message: string = "Validation failed", details?: unknown) {
    super(message, { code: "VALIDATION_ERROR", statusCode: 400, details, disableSentryLogging: true });
    this.name = "ValidationAppError";
  }
}

export class NotFoundAppError extends AppError {
  constructor(message: string = "Not found") {
    super(message, { code: "NOT_FOUND", statusCode: 404, disableSentryLogging: true });
    this.name = "NotFoundAppError";
  }
}

export class UnauthorizedAppError extends AppError {
  constructor(message: string = "Unauthorized") {
    super(message, { code: "UNAUTHORIZED", statusCode: 401, disableSentryLogging: true });
    this.name = "UnauthorizedAppError";
  }
}

export class ForbiddenAppError extends AppError {
  constructor(message: string = "Forbidden") {
    super(message, { code: "FORBIDDEN", statusCode: 403, disableSentryLogging: true });
    this.name = "ForbiddenAppError";
  }
}