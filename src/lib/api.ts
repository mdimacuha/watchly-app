import { NextResponse } from "next/server";
import type { ApiResponse, ApiError, PaginatedResponse } from "@/types/api";
import { AppError } from "@/utils/errors";
import { logger } from "@/lib/log";

// Optional: if you add Sentry later, wire it here.
// import * as Sentry from "@sentry/nextjs";

/**
 * Generic message we return on any non-AppError 5xx. The raw err.message
 * may include stack details, ORM internals, or third-party API error
 * shapes — none of which should reach the client.
 */
const GENERIC_5XX_MESSAGE = "Something went wrong on our end. Please try again.";

export function createApiResponse<T>(
  success: boolean,
  data?: T,
  error?: string | ApiError,
  message?: string
): ApiResponse<T> {
  return {
    success,
    data,
    error: typeof error === "string" ? error : error?.message,
    message,
  };
}

export function successResponse<T>(data: T, message?: string): ApiResponse<T> {
  return createApiResponse(true, data, undefined, message);
}

export function successPaginatedResponse<T>(
  data: T[],
  pagination: { page: number; limit: number; total: number; totalPages: number },
  message?: string
): PaginatedResponse<T> {
  return { success: true, data, message, pagination };
}

export function errorResponse(
  error: string | ApiError | Error | AppError,
  message?: string
): ApiResponse {
  // Logging now lives in apiErrorFromError (the canonical handleRoute
  // path). errorResponse stays a pure shape transform so direct callers
  // don't double-log.
  return createApiResponse(
    false,
    undefined,
    typeof error === "string"
      ? error
      : (error as ApiError).message || "Unknown error",
    message
  );
}

export async function handleApiRequest<T>(
  operation: () => Promise<T>
): Promise<ApiResponse<T>> {
  try {
    const data = await operation();
    return successResponse(data);
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "An unexpected error occurred";
    return errorResponse(errorMessage) as ApiResponse<T>;
  }
}

export function parsePaginationParams(
  searchParams: URLSearchParams,
  options?: { defaultLimit?: number; defaultPage?: number; maxLimit?: number }
): { limit: number; page: number } {
  const defaultLimit = options?.defaultLimit ?? 50;
  const defaultPage = options?.defaultPage ?? 1;
  const maxLimit = options?.maxLimit ?? 100;

  const limitRaw = Number(searchParams.get("limit") ?? defaultLimit);
  const limit = Math.min(Math.max(1, limitRaw), maxLimit);

  const pageParam = searchParams.get("page");
  const page = pageParam ? Math.max(1, Number(pageParam)) : defaultPage;

  return { limit, page };
}

export function paginationMeta(
  total: number,
  pagination: { limit: number; page: number }
): { page: number; limit: number; total: number; totalPages: number } {
  const totalPages = Math.max(1, Math.ceil(total / Math.max(1, pagination.limit)));
  return { page: pagination.page, limit: pagination.limit, total, totalPages };
}

/**
 * Next.js Route Handler helper:
 * Convert ApiResponse/PaginatedResponse into NextResponse with proper status code.
 */
export function toNextResponse<T>(
  res: ApiResponse<T> | PaginatedResponse<T>,
  status: number = res.success ? 200 : 400
) {
  return NextResponse.json(res, { status });
}

/**
 * Convert thrown errors to HTTP status codes consistently.
 * Services can throw AppError to control status and code.
 */
export function statusFromError(err: unknown): number {
  if (err instanceof AppError && err.statusCode) return err.statusCode;
  return 500;
}

export function apiErrorFromError(err: unknown): ApiError {
  // AppError messages are intentionally user-facing (ValidationAppError,
  // UnauthorizedAppError, NotFoundAppError, …) — the service author opted
  // into the wording. Forward them verbatim.
  if (err instanceof AppError) {
    return {
      code: err.code,
      message: err.message,
      details: err.details,
    };
  }

  // For non-AppError throws we treat the original message as untrusted:
  // it may include ORM internals, third-party error bodies, or stack
  // hints. Log the raw error server-side, return a generic message.
  logger.error("[api] unhandled error", err);
  return { code: "INTERNAL_ERROR", message: GENERIC_5XX_MESSAGE };
}

/**
 * A stricter handler: returns NextResponse directly.
 * Perfect for your "route.ts contains only the service function" rule.
 */
export async function handleRoute(operation: () => Promise<unknown>) {
  try {
    const data = await operation();
    return toNextResponse(successResponse(data), 200);
  } catch (err) {
    const status = statusFromError(err);
    const apiErr = apiErrorFromError(err);
    return toNextResponse(errorResponse(apiErr), status);
  }
}
