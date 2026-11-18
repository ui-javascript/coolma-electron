import { app as electronApp, session, shell, type WebContents } from 'electron';
import { getMainWindow } from 'ee-core/electron';
import { logger } from 'ee-core/log';
import { isDev } from 'ee-core/ps';

const DEV_ORIGINS = new Set(['http://127.0.0.1:8081', 'http://localhost:8081']);
const DEV_CONNECT_SOURCES = [...DEV_ORIGINS].flatMap((origin) => [
  origin,
  origin.replace(/^http:/, 'ws:'),
]).join(' ');

function isAllowedNavigation(rawUrl: string): boolean {
  if (rawUrl.startsWith('file://')) {
    return true;
  }

  if (isDev()) {
    try {
      return DEV_ORIGINS.has(new URL(rawUrl).origin);
    } catch {
      return false;
    }
  }

  return false;
}

function buildCsp(): string {
  if (isDev()) {
    return [
      "default-src 'self'",
      "script-src 'self' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      `connect-src 'self' ${DEV_CONNECT_SOURCES}`,
    ].join('; ');
  }

  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self' https:",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ');
}

function hardenContents(contents: WebContents): void {
  contents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) {
      void shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  contents.on('will-navigate', (event, url) => {
    if (!isAllowedNavigation(url)) {
      event.preventDefault();
      logger.warn('[security] blocked navigation:', url);
    }
  });

  contents.on('will-attach-webview', (event) => {
    event.preventDefault();
    logger.warn('[security] blocked webview attach');
  });

  contents.on('preload-error', (_event, preloadPath, error) => {
    logger.error('[security] preload failed:', preloadPath, error);
  });

  contents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    logger.error('[security] page load failed:', errorCode, errorDescription, validatedURL);
  });
}

class SecurityService {
  create(): void {
    logger.info('[security] CSP, navigation and permission hardening enabled');

    const mainWindow = getMainWindow();
    if (mainWindow) {
      hardenContents(mainWindow.webContents);
    }

    electronApp.on('web-contents-created', (_event, contents) => {
      hardenContents(contents);
    });

    session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => {
      callback(false);
    });

    const csp = buildCsp();
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [csp],
        },
      });
    });
  }
}

SecurityService.toString = () => '[class SecurityService]';

const securityService = new SecurityService();

export { SecurityService, securityService };
