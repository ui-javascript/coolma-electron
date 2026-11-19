/**
 * 为知附件/类型的纯函数（不依赖 electron / 数据库，方便 L3 直接测）。
 * 规则照 vue2：
 *   - 分类去掉所有 `/` 后等于 `Lite` 才算 lite/markdown；
 *   - HTML 里 `index_files/<name>` ↔ `coolma://coolma.app/<kb>/<doc>/<name>`。
 */
export function isLiteCategory(category?: string | null): boolean {
  return (category || '').replace(/\//g, '') === 'Lite';
}

export function replaceIndexFilesWithCoolma(
  html: string,
  kbGuid: string,
  docGuid: string,
  names: readonly string[],
): string {
  let result = html;
  for (const name of names) {
    result = result.split(`index_files/${name}`).join(`coolma://coolma.app/${kbGuid}/${docGuid}/${name}`);
  }
  return result;
}

export function replaceCoolmaWithIndexFiles(
  markdown: string,
  kbGuid: string,
  docGuid: string,
  names: readonly string[],
): string {
  let result = markdown;
  for (const name of names) {
    // 先按精确 kb/doc 替换；再兜底任意 kb/doc 段同名资源（本地新笔记 rebind guid 后，
    // 旧内容里的图片仍指向 local_ 占位，不能因此漏替换）。
    result = result.split(`coolma://coolma.app/${kbGuid}/${docGuid}/${name}`).join(`index_files/${name}`);
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    result = result.replace(new RegExp(`coolma:\\/\\/coolma\\.app\\/[^/\\s)]+\\/[^/\\s)]+\\/${escaped}`, 'g'), `index_files/${name}`);
  }
  return result;
}
