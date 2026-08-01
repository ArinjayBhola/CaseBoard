/**
 * Transport-agnostic errors thrown by the service layer.
 *
 * Route handlers map these to HTTP. When the API moves to Express in Phase 3+,
 * the services move unchanged and only the mapping is rewritten.
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export const badRequest = (msg: string, details?: unknown) => new ApiError(400, msg, details);
export const unauthorized = (msg = "Not signed in") => new ApiError(401, msg);
export const forbidden = (msg = "Not allowed") => new ApiError(403, msg);
export const notFound = (msg = "Not found") => new ApiError(404, msg);
export const conflict = (msg: string) => new ApiError(409, msg);
