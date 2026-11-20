/**
 * 盘古格式化（对齐 vue2 `helper.formatDocumentByRemarkPangu`）：
 * remark + remark-pangu 只处理 Markdown 文本节点，代码块内容不拆空格；
 * 最后把 remark 转义出来的任务列表 `* \[` 还原成 `* [`。
 */
export async function formatDocumentByPangu(markdown: string): Promise<string> {
  const input = String(markdown ?? '');
  if (!input.trim()) {
    return input;
  }
  // 两个包都只在第一次格式化时加载，避免拖慢首屏。
  const [{ default: remark }, { default: pangu }] = (await Promise.all([
    import('remark'),
    import('remark-pangu'),
  ])) as Array<any>;

  return new Promise((resolve, reject) => {
    remark()
      .use(pangu)
      .process(input, (error: Error | null, file: { contents?: unknown } | null) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(String(file?.contents ?? '').replace(/\*\s*\\\[/g, '* ['));
      });
  });
}
