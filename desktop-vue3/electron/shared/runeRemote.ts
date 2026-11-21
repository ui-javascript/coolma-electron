/**
 * 单条 GitHub `.vue` 符文导入：URL 回退名称 + SFC 头部注释元数据解析。
 * 对齐 vue2 rune-template-service.inferTemplateMeta / importFromRemote 的可观察结果。
 */
import { resolveLibraryCategory } from './enums/library';

export interface RemoteRuneMeta {
  name: string;
  desc: string;
  category: string;
}

/** 单条符文模板上限 1 MB，对齐 vue2 rune-template-service 的 MAX_TEMPLATE_BYTES。 */
export const REMOTE_RUNE_MAX_BYTES = 1024 * 1024;

/** 从 finalUrl 取文件名作为缺省名称；取不到时为 remote-template。 */
export function fallbackRuneName(finalUrl: string): string {
  try {
    const url = new URL(finalUrl);
    const last = url.pathname.split('/').filter(Boolean).pop() || 'remote-template';
    return decodeURIComponent(last).replace(/\.vue$/i, '') || 'remote-template';
  } catch {
    return 'remote-template';
  }
}

/**
 * 解析 SFC 前 20 行的 HTML 注释，逐条对齐 vue2 inferTemplateMeta：
 *   1. 单行：<!-- name: foo, desc: bar, category: baz -->
 *   2. 多行：<!--\n  name: foo\n  desc: bar\n-->
 * category 非法或缺失回退 general；名称缺失时用 URL 文件名。
 */
export function inferRemoteRuneMeta(body: string, finalUrl: string, categoryOverride?: string): RemoteRuneMeta {
  const lines = String(body || '').split(/\r?\n/).slice(0, 20);
  let name = '';
  let desc = '';
  let category = '';

  // 1) 单行 front-matter：从注释起点扫描到 -->，字段之间靠「空白 + 下一个键」切分。
  const singleLineRe = /<!--\s*(?:name|desc|category)\s*:/;
  let consumed = false;
  for (let i = 0; i < lines.length && !consumed; i += 1) {
    const line = lines[i].trim();
    if (!singleLineRe.test(line)) continue;
    const stopIdx = line.indexOf('-->');
    const scan = stopIdx >= 0 ? line.slice(0, stopIdx) : line;
    const fieldRe = /(name|desc|category)\s*:\s*([^\n]*?)(?=(?:\s+name\s*:|\s+desc\s*:|\s+category\s*:|-->|$))/gi;
    let matched: RegExpExecArray | null;
    while ((matched = fieldRe.exec(scan)) !== null) {
      const key = matched[1].toLowerCase() as 'name' | 'desc' | 'category';
      let value = (matched[2] || '').trim().replace(/-+>\s*$/, '').trim();
      value = value.replace(/[,;；]+\s*$/, '').trim();
      if (!value) continue;
      if (key === 'name' && !name) name = value;
      else if (key === 'desc' && !desc) desc = value;
      else if (key === 'category' && !category) category = value;
    }
    consumed = stopIdx >= 0;
  }

  // 2) 多行注释：只认行首的 `name: ...` / `desc: ...` / `category: ...`。
  if (!name || !category) {
    const block: string[] = [];
    let inBlock = false;
    for (const raw of lines) {
      const line = raw.trim();
      if (!inBlock) {
        if (line.startsWith('<!--')) {
          inBlock = true;
          const rest = line.replace(/^<!--/, '');
          if (rest) block.push(rest);
          if (line.endsWith('-->')) inBlock = false;
        }
        continue;
      }
      if (line.endsWith('-->')) {
        block.push(line.replace(/-+>.*$/, ''));
        break;
      }
      block.push(line);
    }
    for (const entry of block) {
      const matched = entry.match(/^\s*(name|desc|category)\s*:\s*(.+?)\s*$/i);
      if (!matched) continue;
      const key = matched[1].toLowerCase() as 'name' | 'desc' | 'category';
      const value = matched[2].trim();
      if (key === 'name' && !name) name = value;
      else if (key === 'desc' && !desc) desc = value;
      else if (key === 'category' && !category) category = value;
    }
  }

  return {
    name: name || fallbackRuneName(finalUrl),
    desc,
    category: resolveLibraryCategory('rune', categoryOverride || category),
  };
}
