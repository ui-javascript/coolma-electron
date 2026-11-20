import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import { logger } from 'ee-core/log';
import {
  fitWindowBounds,
  parseWindowState,
  type WindowDefaults,
  type WindowState,
} from './window-state-rules';

const FILE_NAME = 'window-state.json';

function statePath(): string {
  return path.join(app.getPath('userData'), FILE_NAME);
}

export function readWindowState(filePath = statePath()): WindowState | null {
  try {
    if (!fs.existsSync(filePath)) {
      return null;
    }
    return parseWindowState(JSON.parse(fs.readFileSync(filePath, 'utf8')));
  } catch (error) {
    logger.warn('[window-state] read failed:', error);
    return null;
  }
}

export function saveWindowState(state: WindowState, filePath = statePath()): void {
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(state), 'utf8');
  } catch (error) {
    logger.warn('[window-state] save failed:', error);
  }
}

export { fitWindowBounds, parseWindowState, type WindowDefaults, type WindowState };
