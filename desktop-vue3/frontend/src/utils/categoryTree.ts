/**
 * 文件夹树 / 标签矩形树图（复刻 vue2 `helper.generateCategoryNodeTree` 与
 * `components/category/CategoryTreePanel.vue` 的 `calculateTagTreeMapData`）。
 * 纯函数，不碰 Vue / ECharts，L3 可以直接测。
 */
export interface CategoryTreeInput {
  category: string;
  count?: number;
}

export interface CategoryTreeNode {
  key: string;
  label: string;
  count: number;
  children: CategoryTreeNode[];
}

export interface TagTreemapItem {
  name: string;
  value: number;
  noteCount: number;
  tagGuid: string;
}

function normalizePath(category: string): string[] {
  return String(category ?? '')
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean);
}

/**
 * 分类路径 → 嵌套树。缺父级的叶子节点会自动补父节点；根级按 label 排序。
 * vue2 的 key 形如 `/My Notes/`（首尾都带斜杠）。
 */
export function buildCategoryTree(
  items: readonly CategoryTreeInput[],
  labelOf: (path: string, segment: string) => string = (_path, segment) => segment,
  pos: Readonly<Record<string, number>> = {},
): CategoryTreeNode[] {
  const roots: CategoryTreeNode[] = [];
  const nodeMap = new Map<string, CategoryTreeNode>();

  const ensureNode = (segments: string[]): CategoryTreeNode => {
    const path = `/${segments.join('/')}/`;
    const existing = nodeMap.get(path);
    if (existing) {
      return existing;
    }
    const node: CategoryTreeNode = {
      key: path,
      label: labelOf(path, segments[segments.length - 1]),
      count: 0,
      children: [],
    };
    nodeMap.set(path, node);
    if (segments.length === 1) {
      roots.push(node);
    } else {
      const parent = ensureNode(segments.slice(0, -1));
      if (!parent.children.some((child) => child.key === node.key)) {
        parent.children.push(node);
      }
    }
    return node;
  };

  for (const item of items) {
    const segments = normalizePath(item.category);
    if (segments.length === 0) {
      continue;
    }
    const node = ensureNode(segments);
    node.count += Math.max(0, item.count ?? 0);
  }

  const sortNodes = (nodes: CategoryTreeNode[]): void => {
    nodes.sort((left, right) => {
      // 照 vue2：两端都有 pos 才按服务端顺序，否则退回 label。
      const leftPos = pos[left.key];
      const rightPos = pos[right.key];
      if (leftPos !== undefined && rightPos !== undefined) {
        return leftPos - rightPos;
      }
      return left.label.localeCompare(right.label);
    });
    nodes.forEach((node) => sortNodes(node.children));
  };
  sortNodes(roots);
  return roots;
}

/**
 * 标签矩形树图数值规则（照 vue2）：
 * - 后 80% 固定同值，squarify 出来高度接近「一行」；
 * - 前 20% 按排名放大，最大的块能跨两行。
 */
export function buildTagTreemapData(
  tags: ReadonlyArray<{ name: string; count: number; id?: number | null }>,
): TagTreemapItem[] {
  if (tags.length === 0) {
    return [];
  }
  const total = tags.length;
  const top20 = Math.ceil(total * 0.2);
  const sorted = [...tags].sort((left, right) => right.count - left.count || left.name.localeCompare(right.name));
  const base = 100;
  return sorted.map((tag, index) => {
    let value = base;
    if (index < top20) {
      const rankFactor = (top20 - index) / top20;
      value = base * (1.8 + 1.5 * rankFactor);
    }
    return {
      name: tag.name,
      tagGuid: tag.name,
      noteCount: tag.count,
      value: Math.max(1, Math.round(value)),
    };
  });
}
