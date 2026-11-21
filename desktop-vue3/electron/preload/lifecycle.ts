import { app as electronApp, Menu, screen } from 'electron';
import { getConfig } from 'ee-core/config';
import { getMainWindow } from 'ee-core/electron';
import { logger } from 'ee-core/log';
import {
  fitWindowBounds,
  readWindowState,
  saveWindowState,
} from '../service/os/window-state';

class Lifecycle {
  async ready(): Promise<void> {
    logger.info('[lifecycle] ready');
  }

  async electronAppReady(): Promise<void> {
    logger.info('[lifecycle] electron-app-ready');

    // 图片附件协议：coolma://coolma.app/<kb>/<doc>/<name>
    try {
      const { registerCoolmaProtocol } = await import('../service/coolma-protocol');
      registerCoolmaProtocol();
    } catch (error) {
      logger.error('[lifecycle] register coolma protocol failed');
    }

    // Frameless window: remove the native menu entirely (File/Edit/View/...).
    // macOS 例外：保留系统 appMenu 角色，否则 Cmd+H / Cmd+Alt+H / Cmd+Q 会全部失效。
    if (process.platform === 'darwin') {
      Menu.setApplicationMenu(Menu.buildFromTemplate([{ role: 'appMenu' }]));
    } else {
      Menu.setApplicationMenu(null);
    }

    electronApp.on('second-instance', () => {
      const win = getMainWindow();
      if (!win) {
        return;
      }
      if (win.isMinimized()) {
        win.restore();
      }
      win.show();
      win.focus();
    });
  }

  async windowReady(): Promise<void> {
    logger.info('[lifecycle] window-ready');

    const win = getMainWindow();
    if (!win) {
      return;
    }

    win.setMenuBarVisibility(false);
    // 对齐 vue2 electron-window-state：恢复上次位置/尺寸/最大化，离屏则回主屏居中。
    const primary = screen.getPrimaryDisplay().workArea;
    const workAreas = [primary, ...screen.getAllDisplays().map((display) => display.workArea)];
    const defaults = {
      width: Math.min(1280, Math.max(960, primary.width - 120)),
      height: Math.min(820, Math.max(600, primary.height - 100)),
      minWidth: 960,
      minHeight: 600,
    };
    const bounds = fitWindowBounds(readWindowState(), workAreas, defaults);
    win.setBounds({ x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height });
    if (bounds.maximized) {
      win.maximize();
    }

    let saveTimer: ReturnType<typeof setTimeout> | null = null;
    const capture = (): void => {
      if (win.isDestroyed() || win.isMinimized()) {
        return;
      }
      const normal = win.isMaximized() ? win.getNormalBounds() : win.getBounds();
      saveWindowState({ ...normal, maximized: win.isMaximized() });
    };
    const schedule = (): void => {
      if (saveTimer) {
        clearTimeout(saveTimer);
      }
      saveTimer = setTimeout(capture, 500);
    };
    win.on('resize', schedule);
    win.on('move', schedule);
    win.on('maximize', schedule);
    win.on('unmaximize', schedule);
    win.on('close', () => {
      if (saveTimer) {
        clearTimeout(saveTimer);
        saveTimer = null;
      }
      capture();
    });

    const { windowsOption } = getConfig();
    if (windowsOption?.show === false) {
      win.once('ready-to-show', () => {
        win.show();
        win.focus();
      });
    }
  }

  async beforeClose(): Promise<void> {
    logger.info('[lifecycle] before-close');
  }
}

Lifecycle.toString = () => '[class Lifecycle]';

export { Lifecycle };
