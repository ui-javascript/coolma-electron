import { app, net, protocol } from 'electron';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ATTACHMENT_ROOT_NAME, parseCoolmaUrl } from './attachments';

/**
 * 自定义协议 coolma://coolma.app/<kb>/<doc>/<name>
 *
 * 对齐 vue2 的 resource-loader：markdown 里的图片地址走这个协议，
 * 主进程按目录解析成真实文件再交给 net.fetch（Electron 39 的 protocol.handle）。
 * 只接受三段路径，并在 attachments.parseCoolmaUrl 里挡掉 `..` 穿越。
 */
export function registerCoolmaProtocol(): void {
  protocol.handle('coolma', async (request) => {
    const parsed = parseCoolmaUrl(request.url);
    if (!parsed) {
      return new Response('Invalid coolma url', { status: 400 });
    }
    const filePath = path.join(
      app.getPath('temp'),
      ATTACHMENT_ROOT_NAME,
      parsed.kbGuid,
      parsed.docGuid,
      parsed.name,
    );
    try {
      return await net.fetch(pathToFileURL(filePath).toString());
    } catch (error) {
      return new Response('Not found', { status: 404 });
    }
  });
}
