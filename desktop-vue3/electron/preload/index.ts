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
  } catch (error) {
    // Keep the shell usable even when the database cannot be opened. The
    // database controller returns the concrete error to the renderer.
    logger.error('[preload] database init failed:', error);
  }
}

export { preload };
