export type ErrorCode =
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "LLM_NOT_CONFIGURED"
  | "LLM_ERROR"
  | "INTERNAL_ERROR";

export class ApiError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly status: number,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = "ApiError";
  }
}
