import path from 'node:path';
import type { AppConfig } from 'ee-core/config';
import { getBaseDir, getElectronDir } from 'ee-core/ps';

const electronDir = getElectronDir() || path.join(getBaseDir(), 'public', 'electron');

const config: () => AppConfig = () => {
  return {
    openDevTools: false,
    singleLock: true,
    windowsOption: {
      title: 'Coolma Vue3',
      width: 1280,
      height: 820,
      minWidth: 960,
      minHeight: 600,
      backgroundColor: '#f5f6f8',
      frame: false,
      titleBarStyle: 'hidden',
      autoHideMenuBar: true,
      show: false,
      icon: path.join(getBaseDir(), 'public', 'images', 'logo-32.png'),
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webSecurity: true,
        preload: path.join(electronDir, 'preload', 'bridge.js'),
      },
    },
    logger: {
      level: 'INFO',
      outputJSON: false,
      appLogName: 'coolma.log',
      coreLogName: 'coolma-core.log',
      errorLogName: 'coolma-error.log',
    },
    remote: {
      enable: false,
      url: '',
    },
    socketServer: {
      enable: false,
      port: 7070,
      path: '/socket.io/',
      connectTimeout: 45000,
      pingTimeout: 30000,
      pingInterval: 25000,
      maxHttpBufferSize: 1e8,
      transports: ['polling', 'websocket'],
      cors: {
        origin: false,
      },
      channel: 'socket-channel',
    },
    httpServer: {
      enable: false,
      https: {
        enable: false,
        key: '/public/ssl/localhost+1.key',
        cert: '/public/ssl/localhost+1.pem',
      },
      host: '127.0.0.1',
      port: 7071,
    },
    mainServer: {
      indexPath: '/public/dist/index.html',
    },
  };
};

export default config;
