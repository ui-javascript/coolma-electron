/**
 * 整文件夹 Markdown 拼接（对齐 vue2 `copyMarkdownHandler`）：
 * `## 标题\n\n正文`，篇间 `\n\n---\n\n`；标题去掉 `.md` 后缀。
 */
export interface FolderMarkdownNote {
  title: string;
  content: string;
}

export function buildFolderMarkdown(notes: FolderMarkdownNote[]): string {
  return notes
    .map((note) => {
      const title = String(note.title || '').replace(/\.md$/i, '');
      return `## ${title}\n\n${note.content || ''}`;
    })
    .join('\n\n---\n\n');
}
