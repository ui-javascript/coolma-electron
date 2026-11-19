/**
 * 大纲解析：把 Markdown 扫成标题树（复刻 vue2 的 contentsList 形态）。
 *
 * vue2 是引擎 contentState 直接吐树；vue3 先走纯函数，理由：
 *  - 四端复用（编辑器无关），文档站也能用
 *  - 单测能跑，不依赖 DOM
 *
 * 规则：只认行首 `#` 到 `##`（最多 6 级），跳过代码块与 front-matter；
 * key 用「层级 + 出现序号」，保证同标题也不撞键。
 */
export interface OutlineNode {
  key: string;
  label: string;
  level: number;
  /** 行号（0 基），跳转时按这个定位 */
  line: number;
  children?: OutlineNode[];
}

export function buildOutline(markdown: string): OutlineNode[] {
  const lines = String(markdown ?? '').split(/\r?\n/);
  const roots: OutlineNode[] = [];
  const stack: OutlineNode[] = [];
  let inFence = false;
  let inFrontMatter = false;
  let index = 0;

  for (let line = 0; line < lines.length; line += 1) {
    const raw = lines[line];
    if (line === 0 && raw.trim() === '---') {
      inFrontMatter = true;
      continue;
    }
    if (inFrontMatter) {
      if (raw.trim() === '---') {
        inFrontMatter = false;
      }
      continue;
    }
    if (/^\s{0,3}(```|~~~)/.test(raw)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) {
      continue;
    }

    const match = /^(#{1,6})\s+(\S.*)$/.exec(raw);
    if (!match) {
      continue;
    }
    const level = match[1].length;
    const label = match[2].trim().replace(/[#*_`]/g, '').trim();
    if (!label) {
      continue;
    }
    index += 1;
    const node: OutlineNode = { key: `h${level}-${index}`, label, level, line };

    while (stack.length > 0 && stack[stack.length - 1].level >= level) {
      stack.pop();
    }
    if (stack.length === 0) {
      roots.push(node);
    } else {
      const parent = stack[stack.length - 1];
      parent.children = parent.children ?? [];
      parent.children.push(node);
    }
    stack.push(node);
  }

  return roots;
}

/** 展平成一级列表（跳转时按序号对应 DOM 里的第 n 个标题）。 */
export function flattenOutline(nodes: OutlineNode[]): OutlineNode[] {
  const out: OutlineNode[] = [];
  const walk = (list: OutlineNode[]): void => {
    list.forEach((node) => {
      out.push(node);
      if (node.children?.length) {
        walk(node.children);
      }
    });
  };
  walk(nodes);
  return out;
}
