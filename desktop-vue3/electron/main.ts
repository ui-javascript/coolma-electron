import { ElectronEgg } from 'ee-core';
import { Lifecycle } from './preload/lifecycle';
import { preload } from './preload';

const app = new ElectronEgg();

const life = new Lifecycle();
app.register('ready', life.ready);
app.register('electron-app-ready', life.electronAppReady);
app.register('window-ready', life.windowReady);
app.register('before-close', life.beforeClose);

app.register('preload', preload);

app.run();
