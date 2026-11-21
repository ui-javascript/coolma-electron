import { getMainWindow } from 'ee-core/electron';
import type { IpcResult } from '../shared/ipc/contract';
import { emptyPayloadSchema } from '../shared/ipc/schemas';
import { allowWindowClose, armWindowCloseGuard } from '../service/os/window-close-guard';

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

  /** 渲染进程装好 close 事件监听后调用，主进程才开始拦系统关闭。 */
  armCloseGuard(args?: unknown): IpcResult<null> {
    emptyPayloadSchema.parse(args);
    armWindowCloseGuard();
    return { ok: true, data: null };
  }

  close(args?: unknown): IpcResult<null> {
    emptyPayloadSchema.parse(args);
    // 渲染进程已弹过确认框；置位放行，避免 close 事件再次触发确认。
    allowWindowClose();
    getMainWindow()?.close();
    return { ok: true, data: null };
  }

  /** vue2 View 菜单 `openDevtool` 的等价入口（CmdOrCtrl+Shift+P）。 */
  openDevTools(args?: unknown): IpcResult<null> {
    emptyPayloadSchema.parse(args);
    const win = getMainWindow();
    if (!win) {
      return {
        ok: false,
        error: { code: 'WINDOW_NOT_READY', message: 'Main window is not available' },
      };
    }
    win.webContents.openDevTools({ mode: 'detach' });
    return { ok: true, data: null };
  }
}

WindowController.toString = () => '[class WindowController]';

export default WindowController;
