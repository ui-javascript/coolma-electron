import { logger } from 'ee-core/log';
import { initDatabase } from '../service/db/database';
import { securityService } from '../service/os/security';

/**
 * Called by electron-egg after the main window has been created and before the
 * frontend is loaded. Keep this file free of feature demos.
 */
function preload(): void {
  logger.info('[preload] Coolma Vue3 bootstrap');
  securityService.create();

  try {
    initDatabase();
    // 启动时按策略自动备份（默认 24h 一次、保留 7 份），不阻塞窗口加载
    // 动态 import 走 ESM 解析器，相对路径必须带 .js 后缀，否则找不到模块
    void import('../service/db/backup.js')
      .then(({ autoBackupIfDue }) => {
        const created = autoBackupIfDue();
        if (created) {
          logger.info('[preload] auto backup:', created);
        }
      })
      .catch((error) => logger.warn('[preload] auto backup failed:', error));
  } catch (error) {
    // Keep the shell usable even when the database cannot be opened. The
    // database controller returns the concrete error to the renderer.
    logger.error('[preload] database init failed:', error);
  }
}

export { preload };
