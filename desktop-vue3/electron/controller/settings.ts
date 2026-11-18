import type { IpcResult } from '../shared/ipc/contract';
import { ok } from '../shared/ipc/result';
import { settingsGetSchema, settingsSetSchema } from '../shared/ipc/schemas';
import { settingsRepository } from '../service/db/settings-repository';
import { failFromError } from './controller-utils';

class SettingsController {
  async all(): Promise<IpcResult<Record<string, unknown>>> {
    try {
      return ok(settingsRepository.all());
    } catch (error) {
      return failFromError(error, 'SETTINGS_ALL_ERROR');
    }
  }

  async get(args?: unknown): Promise<IpcResult<unknown>> {
    try {
      const { key } = settingsGetSchema.parse(args);
      return ok(settingsRepository.get(key));
    } catch (error) {
      return failFromError(error, 'SETTINGS_GET_ERROR');
    }
  }

  async set(args?: unknown): Promise<IpcResult<{ saved: boolean }>> {
    try {
      const { key, value } = settingsSetSchema.parse(args);
      settingsRepository.set(key, value);
      return ok({ saved: true });
    } catch (error) {
      return failFromError(error, 'SETTINGS_SET_ERROR');
    }
  }

  async remove(args?: unknown): Promise<IpcResult<{ deleted: boolean }>> {
    try {
      const { key } = settingsGetSchema.parse(args);
      return ok({ deleted: settingsRepository.remove(key) });
    } catch (error) {
      return failFromError(error, 'SETTINGS_REMOVE_ERROR');
    }
  }
}

SettingsController.toString = () => '[class SettingsController]';

export default SettingsController;
