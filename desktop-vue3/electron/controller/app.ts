import { BrowserWindow, app, dialog, shell } from 'electron';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { isDev } from 'ee-core/ps';
import { IPC_EVENTS } from '../shared/ipc/channels';
import type { AppInfo, IpcResult } from '../shared/ipc/contract';
import { emptyPayloadSchema, openExternalSchema } from '../shared/ipc/schemas';
import { fail, ok } from '../shared/ipc/result';

type UpdaterEvent =
  | { type: 'checking' }
  | { type: 'available'; info: unknown }
  | { type: 'not-available'; info: unknown }
  | { type: 'progress'; percent: number; bytesPerSecond: number; transferred: number; total: number }
  | { type: 'downloaded'; info: unknown }
  | { type: 'error'; message: string };

let updaterBound = false;

/**
 * 豆包 WebApp 是独立构建的 wujie 子应用：
 * - 打包后由 builder extraResources 放到 resources/doubao-input；
 * - 开发态优先找仓库根目录的 `_plugins/plugin-hel-doubao-input-vue3/dist`。
 */
function resolveDoubaoUrl(): string {
  const candidates = [
    path.join(process.resourcesPath, 'doubao-input', 'index.html'),
    path.resolve(app.getAppPath(), '..', '_plugins', 'doubao-input', 'dist', 'index.html'),
    path.resolve(process.cwd(), '_plugins', 'doubao-input', 'dist', 'index.html'),
    path.resolve(process.cwd(), '..', '_plugins', 'doubao-input', 'dist', 'index.html'),
  ];
  const hit = candidates.find((candidate) => existsSync(candidate));
  return hit ? pathToFileURL(hit).href : '';
}

/** 把 electron-updater 的事件推给所有窗口（对齐 vue2 memocast.js 的 updater-* 事件）。 */
function bindUpdaterEvents(updater: typeof import('electron-updater').autoUpdater): void {
  if (updaterBound) {
    return;
  }
  updaterBound = true;
  const send = (payload: UpdaterEvent): void => {
    BrowserWindow.getAllWindows().forEach((win) => {
      if (!win.isDestroyed()) {
        win.webContents.send(IPC_EVENTS.updater, payload);
      }
    });
  };
  updater.autoDownload = false;
  updater.on('checking-for-update', () => send({ type: 'checking' }));
  updater.on('update-available', (info) => send({ type: 'available', info }));
  updater.on('update-not-available', (info) => send({ type: 'not-available', info }));
  updater.on('download-progress', (progress) =>
    send({
      type: 'progress',
      percent: progress.percent,
      bytesPerSecond: progress.bytesPerSecond,
      transferred: progress.transferred,
      total: progress.total,
    }),
  );
  updater.on('update-downloaded', (info) => send({ type: 'downloaded', info }));
  updater.on('error', (error) => send({ type: 'error', message: String((error as Error)?.message || error) }));
}

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
        doubaoUrl: resolveDoubaoUrl(),
      },
    };
  }

  /**
   * 检查更新（对齐 vue2 checkUpdates）：没打包时直接告诉渲染层「开发模式不检查」，
   * 没配 publish 源时 electron-updater 会抛 No published versions，原文透传。
   */
  async updateCheck(args?: unknown): Promise<IpcResult<{ checking: boolean }>> {
    try {
      emptyPayloadSchema.parse(args);
      if (!app.isPackaged) {
        return fail('UPDATE_DEV_MODE', '开发模式不检查更新（打包产物才走 electron-updater）');
      }
      const { autoUpdater } = await import('electron-updater');
      bindUpdaterEvents(autoUpdater);
      void autoUpdater.checkForUpdates().catch(() => {
        // 错误已通过 updater-event 推给渲染层
      });
      return ok({ checking: true });
    } catch (error) {
      return fail('UPDATE_CHECK_ERROR', String((error as Error)?.message || error));
    }
  }

  /** 开始下载（vue2 needUpdate(true)）。 */
  async updateDownload(args?: unknown): Promise<IpcResult<{ downloading: boolean }>> {
    try {
      emptyPayloadSchema.parse(args);
      const { autoUpdater } = await import('electron-updater');
      bindUpdaterEvents(autoUpdater);
      void autoUpdater.downloadUpdate().catch(() => {});
      return ok({ downloading: true });
    } catch (error) {
      return fail('UPDATE_DOWNLOAD_ERROR', String((error as Error)?.message || error));
    }
  }

  /** 选目录（博客部署要选 vuepress 源目录）。 */
  async pickDirectory(args?: unknown): Promise<IpcResult<string | null>> {
    try {
      emptyPayloadSchema.parse(args);
      const result = await dialog.showOpenDialog({
        properties: ['openDirectory', 'createDirectory'],
      });
      return ok(result.canceled ? null : result.filePaths[0] ?? null);
    } catch (error) {
      return fail('PICK_DIRECTORY_ERROR', String((error as Error)?.message || error));
    }
  }

  /** 选择单个文件（SFTP 私钥路径等）。 */
  async pickFile(args?: unknown): Promise<IpcResult<string | null>> {
    try {
      emptyPayloadSchema.parse(args);
      const result = await dialog.showOpenDialog({
        properties: ['openFile'],
      });
      return ok(result.canceled ? null : result.filePaths[0] ?? null);
    } catch (error) {
      return fail('PICK_FILE_ERROR', String((error as Error)?.message || error));
    }
  }

  /** 用系统浏览器打开外链（复刻 vue2 `$q.electron.shell.openExternal`）。 */
  async openExternal(args?: unknown): Promise<IpcResult<true>> {
    try {
      const { url } = openExternalSchema.parse(args);
      await shell.openExternal(url);
      return ok(true as const);
    } catch (error) {
      return fail('OPEN_EXTERNAL_ERROR', String((error as Error)?.message || error));
    }
  }

  /** 退出并安装（vue2 quitAndUpdate）。 */
  async updateInstall(args?: unknown): Promise<IpcResult<true>> {
    try {
      emptyPayloadSchema.parse(args);
      const { autoUpdater } = await import('electron-updater');
      setImmediate(() => autoUpdater.quitAndInstall());
      return ok(true as const);
    } catch (error) {
      return fail('UPDATE_INSTALL_ERROR', String((error as Error)?.message || error));
    }
  }
}

AppController.toString = () => '[class AppController]';

export default AppController;
