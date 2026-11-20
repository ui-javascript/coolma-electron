/**
 * 侧栏文件夹右键菜单（复刻 vue2 contextMenu/sideDrawer）。
 *
 * 启用条件按 vue2 index.js：
 *  - 「创建文件夹 / 创建笔记」始终显示，离线也能建
 *  - 登录态才追加「导入 / 导出 / 榜单 / 导出到博客 / 复制 Markdown」
 *  - 根目录禁用导出与删除
 *  - hideCreateCategory / hideCreateNote 可分别隐藏
 */
export interface SideDrawerMenuInput {
  category: string;
  isRootCategory: boolean;
  isLogin: boolean;
  hideCreateCategory?: boolean;
  hideCreateNote?: boolean;
  tierRankingReady?: boolean;
  blogReady?: boolean;
}

export function buildSideDrawerMenu(input: SideDrawerMenuInput) {
  const items: Array<Record<string, unknown>> = [];
  const pushCreate = (): void => {
    if (!input.hideCreateCategory) {
      items.push({ id: 'createCategory', label: '新建文件夹' });
    }
    if (!input.hideCreateNote) {
      items.push({ id: 'createNote', label: '新建笔记' });
    }
  };

  pushCreate();
  if (input.isLogin) {
    items.push({ type: 'separator', label: '' });
    items.push({ id: 'importPack', label: '导入…' });
    items.push({
      id: 'export',
      label: '导出',
      enabled: !input.isRootCategory,
      children: [{ id: 'exportMarkdown', label: 'Markdown', enabled: !input.isRootCategory }],
    });
    items.push({ type: 'separator', label: '' });
    items.push({ id: 'tierRanking', label: '从夯到拉', enabled: input.tierRankingReady === true });
    items.push({ type: 'separator', label: '' });
    items.push({ id: 'exportToBlog', label: '导出到博客', enabled: input.blogReady === true });
    items.push({ id: 'copyMarkdown', label: '复制 Markdown' });
  }
  if (!input.isRootCategory) {
    items.push({ type: 'separator', label: '' });
    items.push({ id: 'delete', label: '删除文件夹', danger: true });
  }
  return items;
}
