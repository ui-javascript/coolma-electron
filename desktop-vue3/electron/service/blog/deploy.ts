import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * 博客部署的本地产物生成（移植 vue2 src/services/BlogDeployService.js，646 行）。
 *
 * 保留：shortlink 算法（cyrb53，和 vuepress 构建脚本同源）、frontmatter（default/vdoing/hope/reco）、
 * _posts/<id>.md、sidebar.json、README、`.vuepress/shortlink-map.json`、id-mappings.json、
 * seq-manifest.json、分类 README、三份 GitHub Actions workflow。
 *
 * 未移植：vue2 主进程那套 1424 行的 blog-deploy-handler（Node 探测 / 装依赖 / vuepress 构建 /
 * GitHub workflow_dispatch / SFTP 上传）。本文件只管「把笔记写进博客目录」这一段。
 */
export interface BlogNote {
  title: string;
  content: string;
  category?: string;
  docGuid?: string;
}

export interface BlogEntry {
  id: string;
  title: string;
  permalink: string;
  category: string;
  docGuid: string;
}

function cyrb53(input: string, seed = 0): string {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < input.length; i += 1) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/** 短链 id：剥掉文件名序号前缀，把分类最后一段编进 hash 链（与 vuepress 构建脚本同源）。 */
export function shortlinkId(dir: string, base: string): string {
  const basename = String(base || '').replace(/^\d+[a-zA-Z]*[-_]/, '');
  return cyrb53((basename || 'index') + (dir ? `/${dir}` : ''));
}

export function permalinkFor(dir: string, base: string): string {
  return `/${shortlinkId(dir, base)}.html`;
}

function sidebarPathFor(dir: string, base: string): string {
  return `_posts/${shortlinkId(dir, base)}.md`;
}

const CI_WORKFLOWS: Record<string, string> = {
  'blog-build.yml': `name: blog-build

on:
  push:
    branches:
      - master
      - main
    tags: ['v*']
  pull_request:
    branches:
      - master
      - main
  workflow_dispatch:
    inputs:
      deploy:
        description: '发布到 gh-pages？'
        required: true
        type: boolean
        default: true

concurrency:
  group: blog-\${ github.ref }}
  cancel-in-progress: true

permissions:
  contents: write
  pages: write
  id-token: write

jobs:
  build:
    name: build & deploy blog
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: yarn
          cache-dependency-path: yarn.lock

      - name: Install dependencies
        run: yarn install --frozen-lockfile --network-timeout 600000

      - name: Restore memocast.db from artifact
        uses: actions/download-artifact@v4
        with:
          name: memocast-db
          path: .cache/db
        continue-on-error: true

      - name: Decode memocast.db from base64 secret
        if: \${ steps.restore-artifact.outcome == 'skipped' || steps.restore-artifact.outcome == 'failure' }}
        env:
          DB_B64: \${ secrets.MEMOCAST_DB_BASE64 }}
        run: |
          if [ -n "$DB_B64" ]; then
            mkdir -p .cache/db
            echo "$DB_B64" | base64 -d > .cache/db/memocast.db
          fi

      - name: Build sidebar & config
        run: |
          DB_PATH=$(find .cache/db -name 'memocast.db' | head -n1 || echo '')
          if [ -n "$DB_PATH" ]; then
            MEMOCAST_DB="$DB_PATH" yarn blog:sidebar
            MEMOCAST_DB="$DB_PATH" yarn blog:config
          else
            echo "::warning::无 memocast.db，跳过 sidebar/config 构建"
          fi

      - name: VuePress build
        run: |
          cd _docs
          yarn vuepress build .
          cp .vuepress/dist/index.html .vuepress/dist/404.html 2>/dev/null || true

      - name: Deploy to gh-pages
        if: \${ github.event_name != 'pull_request' }}
        uses: peaceiris/actions-gh-pages@v4
        with:
          github_token: \${ secrets.GITHUB_TOKEN }}
          publish_dir: _docs/.vuepress/dist
          publish_branch: gh-pages
`,

  'blog-db-upload.yml': `name: blog-db-upload

on:
  workflow_dispatch:

jobs:
  upload:
    runs-on: ubuntu-latest
    permissions:
      contents: read
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 1 }

      - name: Decode db from base64 secret
        run: |
          if [ -z "\${ secrets.MEMOCAST_DB_BASE64 }}" ]; then
            echo "::error::secrets.MEMOCAST_DB_BASE64 未配置"
            exit 1
          fi
          mkdir -p .cache
          echo "\${ secrets.MEMOCAST_DB_BASE64 }}" | base64 -d > .cache/memocast.db
          ls -la .cache/memocast.db

      - name: Sanity-check the db
        run: |
          node -e '
            const fs = require("fs");
            const buf = fs.readFileSync(".cache/memocast.db");
            const sig = buf.slice(0, 16).toString("ascii");
            if (!sig.startsWith("SQLite format 3")) {
              console.error("::error::文件不是合法 SQLite：", JSON.stringify(sig));
              process.exit(1);
            }
            console.log("[ok] SQLite 大小:", buf.length, "bytes");
          '

      - name: Upload as artifact
        uses: actions/upload-artifact@v4
        with:
          name: memocast-db
          path: .cache/memocast.db
          retention-days: 14
          if-no-files-found: error
`,

  'blog-preview.yml': `name: blog-preview

on:
  pull_request:
    branches:
      - master
      - main
    types: [opened, reopened, synchronize]

concurrency:
  group: blog-pr-\${ github.event.pull_request.number }}
  cancel-in-progress: true

permissions:
  contents: read
  pull-requests: write

jobs:
  preview:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: yarn
          cache-dependency-path: yarn.lock

      - name: Install dependencies
        run: yarn install --frozen-lockfile --network-timeout 600000

      - name: Build sidebar & config only
        run: |
          yarn blog:test 2>/dev/null || true
          yarn blog:sidebar 2>/dev/null || true
          yarn blog:config 2>/dev/null || true

      - name: Comment PR with summary
        uses: actions/github-script@v7
        with:
          script: |
            const fs = require('fs');
            const sidebarFile = '_docs/.vuepress/sidebar.json';
            let count = 0;
            try {
              const sb = JSON.parse(fs.readFileSync(sidebarFile, 'utf8'));
              count = Object.keys(sb.sidebar || {}).length;
            } catch (e) { /* ignore */ }
            const body = [
              '### 博客构建预览', '',
              '- sidebar 路由数: ' + count, '',
              '> 仅 PR 预览；部署在 push 到 master/main 时由 blog-build.yml 完成。'
            ].join('\\n');
            await github.rest.issues.createComment({
              owner: context.repo.owner,
              repo: context.repo.repo,
              issue_number: context.issue.number,
              body: '<!-- blog-preview -->\\n' + body
            });
`
}

export function buildFrontmatter(note: BlogNote, theme = 'default', dirTag = '', baseName = ''): string {
  const date = new Date().toISOString().split('T')[0];
  const title = (baseName || note.title).replace(/\.md$/i, '');
  const permalink = permalinkFor(dirTag, baseName || title);
  const catRaw = (note.category || '').trim();
  const catSafe = catRaw ? catRaw.replace(/'/g, "\\'") : '';
  const categoriesLine = catSafe ? `categories: ['${catSafe}']\n` : '';
  if (theme === 'vdoing') {
    return `---\ntitle: ${title}\ndate: ${date}\npermalink: ${permalink}\nsidebar: auto\n${categoriesLine}---\n`;
  }
  return `---\ntitle: ${title}\ndate: ${date}\npermalink: ${permalink}\n${categoriesLine}---\n`;
}

export async function ensureReadme(blogDir: string, categoryName: string): Promise<void> {
  const readmePath = path.join(blogDir, 'README.md');
  try {
    await fs.access(readmePath);
    return;
  } catch {
    // 不存在 -> 继续写
  }
  const folderName = categoryName.split('/').filter(Boolean).pop() || categoryName;
  await fs.writeFile(readmePath, `# ${folderName}\n\n${categoryName} 分类下的笔记。\n`, 'utf-8');
}

export async function generateSidebarJson(blogDir: string, noteFields: BlogNote[]): Promise<void> {
  const dirTag = path.basename(blogDir);
  const sidebarData: Record<string, Array<{ title: string; path: string }>> = {};
  noteFields.forEach((note) => {
    const filename = note.title.replace(/\.md$/i, '');
    if (!sidebarData._posts) {
      sidebarData._posts = [];
    }
    sidebarData._posts.push({ title: filename, path: sidebarPathFor(dirTag, filename) });
  });
  await fs.writeFile(path.join(blogDir, 'sidebar.json'), JSON.stringify(sidebarData, null, 2), 'utf-8');
}

async function readJson<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(file, 'utf-8')) as T;
  } catch {
    return null;
  }
}

async function writeJson(file: string, payload: unknown): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(payload, null, 2), 'utf-8');
}

export async function appendShortlinkMap(blogDir: string, entries: BlogEntry[]): Promise<{ count: number }> {
  if (entries.length === 0) {
    return { count: 0 };
  }
  const mapPath = path.join(blogDir, '.vuepress', 'shortlink-map.json');
  type MapShape = {
    version: number;
    byId: Record<string, { title: string; category: string; permalink: string; docGuid: string }>;
    byDocGuid: Record<string, string>;
    generatedAt?: string;
    count?: number;
  };
  const existing: MapShape = (await readJson<MapShape>(mapPath)) ?? { version: 1, byId: {}, byDocGuid: {} };
  for (const entry of entries) {
    existing.byId[entry.id] = {
      title: entry.title,
      category: entry.category || '',
      permalink: entry.permalink,
      docGuid: entry.docGuid || '',
    };
    if (entry.docGuid) {
      existing.byDocGuid[entry.docGuid] = entry.id;
    }
  }
  existing.version = 1;
  existing.generatedAt = new Date().toISOString();
  existing.count = Object.keys(existing.byId).length;
  await writeJson(mapPath, existing);
  return { count: existing.count };
}

export async function writeIdMappings(blogDir: string, entries: Array<{ id: string; fileName: string; fullPath: string; title: string; category: string; defaultUrl: string; shortUrl: string; level: number }>): Promise<{ count: number; conflicts: string[] }> {
  const seen = new Set<string>();
  const conflicts: string[] = [];
  const mappings = entries.map((entry) => {
    if (seen.has(entry.id)) {
      conflicts.push(entry.id);
    }
    seen.add(entry.id);
    return {
      id: entry.id,
      fileName: entry.fileName,
      fullPath: entry.fullPath || `${entry.category ? `${entry.category}/` : ''}${entry.title || ''}`,
      title: entry.title || entry.id,
      category: entry.category || '',
      defaultUrl: entry.defaultUrl || `/${entry.id}.html`,
      shortUrl: entry.shortUrl || `/${entry.id}.html`,
      level: typeof entry.level === 'number' ? entry.level : entry.category ? 2 : 1,
    };
  });
  await writeJson(path.join(blogDir, '.vuepress', 'id-mappings.json'), {
    mappings,
    stats: { total: mappings.length, conflicts },
  });
  return { count: mappings.length, conflicts };
}

export async function writeSeqManifest(blogDir: string, seqMap: Record<string, number>): Promise<void> {
  await writeJson(path.join(blogDir, '.vuepress', 'seq-manifest.json'), seqMap);
}

export async function writeCategoryReadme(blogDir: string, category: string, entries: BlogEntry[]): Promise<{ linkCount: number }> {
  if (!category) {
    return { linkCount: 0 };
  }
  const catPath = category.split('/').filter(Boolean).join('/');
  const displayName = catPath.split('/').pop() || catPath;
  const inCategory = entries.filter((entry) => entry.category === catPath);
  const lines = ['---', `title: ${displayName}`, 'sidebar: auto', '---', '', `# ${displayName}`, '', `> 分类路径: \`${catPath}\`，共 ${inCategory.length} 篇笔记。`, ''];
  if (inCategory.length > 0) {
    lines.push('## 笔记列表', '');
    inCategory.forEach((entry) => lines.push(`- [${entry.title}](${entry.permalink})`));
  } else {
    lines.push('## 笔记列表', '', '_暂无笔记_');
  }
  lines.push('');
  const readmePath = path.join(blogDir, catPath, 'README.md');
  await fs.mkdir(path.dirname(readmePath), { recursive: true });
  await fs.writeFile(readmePath, lines.join('\n'), 'utf-8');
  return { linkCount: inCategory.length };
}

/** 写 _posts/<id>.md + 全套映射（对齐 vue2 writeBlogPosts）。 */
export interface ExportManifestEntry {
  hash: string;
  size: number;
  file: string;
  title: string;
  category: string;
}

export interface ExportManifest {
  version: number;
  generatedAt?: string;
  files: Record<string, ExportManifestEntry>;
}

const EXPORT_MANIFEST = path.join('.vuepress', 'export-manifest.json');
/** 并发写盘上限：千篇级导出时避免同时开上千个 fd，也不退化成完全串行。 */
const EXPORT_CONCURRENCY = 8;

export function hashExportContent(content: string): string {
  return crypto.createHash('sha1').update(content).digest('hex');
}

async function readExportManifest(blogDir: string): Promise<ExportManifest> {
  const data = await readJson<ExportManifest>(path.join(blogDir, EXPORT_MANIFEST));
  return data && data.version === 1 && data.files ? data : { version: 1, files: {} };
}

export async function writeExportManifest(blogDir: string, manifest: ExportManifest): Promise<void> {
  manifest.generatedAt = new Date().toISOString();
  await writeJson(path.join(blogDir, EXPORT_MANIFEST), manifest);
}

/** 限并发 map，保持结果顺序。 */
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await fn(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

export async function writeBlogPosts(
  blogDir: string,
  notes: BlogNote[],
  theme = 'default',
  category = '',
  options: { incremental?: boolean } = {},
): Promise<{ writtenFiles: number; skippedFiles: number; entries: BlogEntry[]; shortlinkCount: number }> {
  const postsDir = path.join(blogDir, '_posts');
  await fs.mkdir(postsDir, { recursive: true });
  const dirTag = path.basename(blogDir);
  const incremental = options.incremental !== false;
  const manifest = incremental ? await readExportManifest(blogDir) : { version: 1, files: {} as Record<string, ExportManifestEntry> };

  const tasks = notes.map((note) => {
    const baseName = note.title.replace(/\.md$/i, '');
    const fileId = shortlinkId(dirTag, baseName);
    const filepath = path.join(postsDir, `${fileId}.md`);
    const frontmatter = buildFrontmatter(note, theme, dirTag, baseName);
    const content = `${frontmatter}\n\n${note.content}`;
    return { note, baseName, fileId, filepath, content, hash: hashExportContent(content) };
  });

  let writtenFiles = 0;
  let skippedFiles = 0;
  await mapLimit(tasks, EXPORT_CONCURRENCY, async (task) => {
    const cached = manifest.files[task.fileId];
    if (incremental && cached && cached.hash === task.hash) {
      const existing = await fs.stat(task.filepath).catch(() => null);
      if (existing?.isFile()) {
        skippedFiles += 1;
        return;
      }
    }
    await fs.writeFile(task.filepath, task.content, 'utf-8');
    writtenFiles += 1;
  });

  const entries: BlogEntry[] = tasks.map((task) => ({
    id: task.fileId,
    title: task.baseName,
    permalink: `/${task.fileId}.html`,
    category,
    docGuid: task.note.docGuid || '',
  }));

  const nextFiles: Record<string, ExportManifestEntry> = { ...manifest.files };
  for (const task of tasks) {
    nextFiles[task.fileId] = {
      hash: task.hash,
      size: Buffer.byteLength(task.content, 'utf-8'),
      file: `_posts/${task.fileId}.md`,
      title: task.baseName,
      category,
    };
  }
  await writeExportManifest(blogDir, { version: 1, files: nextFiles });

  const shortlink = await appendShortlinkMap(blogDir, entries);
  const idEntries = entries.map((entry) => ({
    id: entry.id,
    fileName: `${entry.title}.md`,
    fullPath: `${entry.category ? `${entry.category}/` : ''}${entry.title}`,
    title: entry.title,
    category: entry.category || '',
    defaultUrl: entry.permalink,
    shortUrl: entry.permalink,
    level: entry.category ? 2 : 1,
  }));
  await writeIdMappings(blogDir, idEntries);
  const seqMap: Record<string, number> = {};
  entries.forEach((entry, index) => {
    seqMap[entry.id] = index + 1;
  });
  await writeSeqManifest(blogDir, seqMap);
  if (category) {
    await writeCategoryReadme(blogDir, category, entries);
  }
  return { writtenFiles, skippedFiles, entries, shortlinkCount: shortlink.count };
}

export async function exportCIWorkflows(targetDir: string): Promise<{ written: string[]; skipped: string[] }> {
  const wfDir = path.join(targetDir, '.github', 'workflows');
  await fs.mkdir(wfDir, { recursive: true });
  const written: string[] = [];
  const skipped: string[] = [];
  for (const [name, content] of Object.entries(CI_WORKFLOWS)) {
    const dest = path.join(wfDir, name);
    try {
      await fs.access(dest);
      skipped.push(name);
      continue;
    } catch {
      // 不存在 -> 写
    }
    await fs.writeFile(dest, content, 'utf-8');
    written.push(name);
  }
  return { written, skipped };
}

export const __testing = { cyrb53, sidebarPathFor };
