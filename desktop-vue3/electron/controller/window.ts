import { getMainWindow } from 'ee-core/electron';
import type { IpcResult } from '../shared/ipc/contract';
import { emptyPayloadSchema } from '../shared/ipc/schemas';

class WindowController {
  minimize(args?: unknown): IpcResult<null> {
    emptyPayloadSchema.parse(args);
    getMainWindow()?.minimize();
    return { ok: true, data: null };
  }

  state(args?: unknown): IpcResult<{ maximized: boolean; fullScreen: boolean }> {
    emptyPayloadSchema.parse(args);
    const win = getMainWindow();
    if (!win) {
      return {
        ok: false,
        error: { code: 'WINDOW_NOT_READY', message: 'Main window is not available' },
      };
    }

    return {
      ok: true,
      data: {
        maximized: win.isMaximized(),
        fullScreen: win.isFullScreen(),
      },
    };
  }

  toggleMaximize(args?: unknown): IpcResult<boolean> {
    emptyPayloadSchema.parse(args);
    const win = getMainWindow();
    if (!win) {
      return {
        ok: false,
        error: { code: 'WINDOW_NOT_READY', message: 'Main window is not available' },
      };
    }

    if (win.isMaximized()) {
      win.unmaximize();
    } else {
      win.maximize();
    }

    return { ok: true, data: win.isMaximized() };
  }

  close(args?: unknown): IpcResult<null> {
    emptyPayloadSchema.parse(args);
    getMainWindow()?.close();
    return { ok: true, data: null };
  }
}

WindowController.toString = () => '[class WindowController]';

export default WindowController;
