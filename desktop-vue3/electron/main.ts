import { protocol } from 'electron';
import { ElectronEgg } from 'ee-core';
import { Lifecycle } from './preload/lifecycle';
import { preload } from './preload';

// 自定义协议必须在 app ready 之前声明特权，否则图片会被当成不安全资源
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'coolma',
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true },
  },
]);

const app = new ElectronEgg();

const life = new Lifecycle();
app.register('ready', life.ready);
app.register('electron-app-ready', life.electronAppReady);
app.register('window-ready', life.windowReady);
app.register('before-close', life.beforeClose);

app.register('preload', preload);

app.run();
