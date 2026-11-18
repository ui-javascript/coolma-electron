import type { IpcError, IpcResult } from './contract';

export function ok<T>(data: T): IpcResult<T> {
  return { ok: true, data };
}

export function fail(code: string, message: string, details?: unknown): IpcResult<never> {
  const error: IpcError = { code, message };
  if (details !== undefined) {
    error.details = details;
  }
  return { ok: false, error };
}

export function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
