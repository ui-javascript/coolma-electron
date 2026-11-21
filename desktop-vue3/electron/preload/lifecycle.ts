import { app as electronApp, Menu, screen } from 'electron';
import type { Event as ElectronEvent } from 'electron';
import { getConfig } from 'ee-core/config';
import { getMainWindow } from 'ee-core/electron';
import { logger } from 'ee-core/log';
import {
  fitWindowBounds,
  readWindowState,
  saveWindowState,
} from '../service/os/window-state';
import {
  allowWindowClose,
  isWindowCloseAllowed,
  isWindowCloseArmed,
} from '../service/os/window-close-guard';
import { IPC_EVENTS } from '../shared/ipc/channels';

class Lifecycle {
  async ready(): Promise<void> {
    logger.info('[lifecycle] ready');
  }

  async electronAppReady(): Promise<void> {
    logger.info('[lifecycle] electron-app-ready');

    // 图片附件协议：coolma://coolma.app/<kb>/<doc>/<name>
    try {
      // 动态 import 走 ESM 解析器，相对路径必须带 .js 后缀，否则找不到模块
      const { registerCoolmaProtocol } = await import('../service/coolma-protocol.js');
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

    // 系统关闭（Alt+F4 / 系统菜单 X）不经过标题栏按钮，必须在这里拦一次。
    // 渲染进程装好监听后通过 armCloseGuard 武装；确认后走 controller/window/close 放行。
    win.on('close', (event: ElectronEvent) => {
      if (
        isWindowCloseAllowed() ||
        !isWindowCloseArmed() ||
        win.webContents.isDestroyed() ||
        win.webContents.isLoading()
      ) {
        return;
      }
      event.preventDefault();
      logger.info('[lifecycle] system close intercepted, ask renderer');
      win.show();
      win.focus();
      win.webContents.send(IPC_EVENTS.windowCloseRequested);
    });
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
    // before-close 是 app.quit 的钩子（Cmd+Q / 更新安装 / 关窗后的退出），
    // 与 vue2 一致直接退出，不再走系统关闭确认。
    allowWindowClose();
  }
}

Lifecycle.toString = () => '[class Lifecycle]';

export { Lifecycle };
