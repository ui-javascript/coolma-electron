import { app } from 'electron';
import { isDev } from 'ee-core/ps';
import type { AppInfo, IpcResult } from '../shared/ipc/contract';
import { emptyPayloadSchema } from '../shared/ipc/schemas';

class AppController {
  /**
   * Basic application information for the shell/status bar.
   * This is the P1 smoke test for the typed IPC bridge.
   */
  async info(args?: unknown): Promise<IpcResult<AppInfo>> {
    emptyPayloadSchema.parse(args);

    return {
      ok: true,
      data: {
        name: 'Coolma Vue3',
        version: app.getVersion(),
        electron: process.versions.electron,
        chrome: process.versions.chrome,
        node: process.versions.node,
        platform: process.platform,
        arch: process.arch,
        isDev: isDev(),
      },
    };
  }
}

AppController.toString = () => '[class AppController]';

export default AppController;
