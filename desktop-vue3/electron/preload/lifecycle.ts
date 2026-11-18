import { app as electronApp, Menu, screen } from 'electron';
import { getConfig } from 'ee-core/config';
import { getMainWindow } from 'ee-core/electron';
import { logger } from 'ee-core/log';

class Lifecycle {
  async ready(): Promise<void> {
    logger.info('[lifecycle] ready');
  }

  async electronAppReady(): Promise<void> {
    logger.info('[lifecycle] electron-app-ready');

    // Frameless window: remove the native menu entirely (File/Edit/View/...).
    Menu.setApplicationMenu(null);

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
    const workArea = screen.getPrimaryDisplay().workArea;
    const width = Math.min(1280, Math.max(960, workArea.width - 120));
    const height = Math.min(820, Math.max(600, workArea.height - 100));
    const x = Math.round(workArea.x + (workArea.width - width) / 2);
    const y = Math.round(workArea.y + (workArea.height - height) / 2);
    win.setBounds({ x, y, width, height });

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
