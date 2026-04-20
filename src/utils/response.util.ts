// ─── Standard API Response Utilities ───────────────────────────────────────

export interface ApiSuccess<T> {
  success: true;
  message: string;
  data: T;
}

export interface ApiError {
  success: false;
  message: string;
  errors?: unknown[];
}

export function successResponse<T>(message: string, data: T): ApiSuccess<T> {
  return { success: true, message, data };
}

export function errorResponse(message: string, errors?: unknown[]): ApiError {
  return { success: false, message, ...(errors ? { errors } : {}) };
}
