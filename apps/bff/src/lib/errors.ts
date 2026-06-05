export type ErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "CONFLICT"
  | "UPSTREAM_ERROR"
  | "CONFIGURATION_ERROR"
  | "INTERNAL_ERROR";

export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly statusCode = 400,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
