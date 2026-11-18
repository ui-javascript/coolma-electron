import { ZodError } from 'zod';
import type { IpcResult } from '../shared/ipc/contract';
import { fail, toErrorMessage } from '../shared/ipc/result';

export function failFromError(error: unknown, fallbackCode = 'INTERNAL_ERROR'): IpcResult<never> {
  if (error instanceof ZodError) {
    return fail(
      'VALIDATION_ERROR',
      'Invalid IPC payload',
      error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    );
  }

  return fail(fallbackCode, toErrorMessage(error));
}
