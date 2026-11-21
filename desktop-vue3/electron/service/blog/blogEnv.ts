/**
 * 博客构建环境（复刻 vue2 blog-deploy-handler 的 ensureBlogConfig / package.json /
 * node_modules 准备），保持纯函数，方便运行时断言。
 */

export type BlogTheme = 'default' | 'vdoing' | 'hope' | 'reco';
export type BlogPackageManager = 'npm' | 'pnpm' | 'yarn';

export const BLOG_THEMES: BlogTheme[] = ['default', 'vdoing', 'hope', 'reco'];
export const BLOG_PACKAGE_MANAGERS: BlogPackageManager[] = ['npm', 'pnpm', 'yarn'];

export type BlogPackageJson = {
  name?: string;
  version?: string;
  private?: boolean;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  overrides?: Record<string, string>;
  [key: string]: unknown;
};

export const BLOG_BUILD_SCRIPT = 'cross-env NODE_OPTIONS=--openssl-legacy-provider vuepress build .';

const THEME_DEPENDENCIES: Partial<Record<BlogTheme, [string, string]>> = {
  vdoing: ['vuepress-theme-vdoing', '^1.5.0'],
  hope: ['vuepress-theme-hope', '^1.30.0'],
  reco: ['vuepress-theme-reco', '^1.6.17'],
};

export function normalizeBlogTheme(value: unknown): BlogTheme {
  return BLOG_THEMES.includes(value as BlogTheme) ? (value as BlogTheme) : 'default';
}

export function normalizePackageManager(value: unknown): BlogPackageManager {
  return BLOG_PACKAGE_MANAGERS.includes(value as BlogPackageManager)
    ? (value as BlogPackageManager)
    : 'npm';
}

/** 与 vue2 buildBlogPackageJson 对齐：v1 依赖 + 主题依赖 + 跨平台 openssl 兼容脚本。 */
export function buildBlogPackageJson(theme: BlogTheme): BlogPackageJson {
  const dependencies: Record<string, string> = {
    vuepress: '^1.9.0',
    lodash: '^4.17.21',
    'cross-env': '^7.0.3',
  };
  const themeDep = THEME_DEPENDENCIES[theme];
  if (themeDep) {
    dependencies[themeDep[0]] = themeDep[1];
  }
  return {
    name: 'blog',
    version: '1.0.0',
    private: true,
    scripts: { build: BLOG_BUILD_SCRIPT },
    dependencies,
    overrides: {
      lodash: '^4.17.21',
      'lodash.template': '^4.5.0',
    },
  };
}

/** vue2 的 package.json 重建判断：vuepress v2 或主题依赖不匹配。 */
export function shouldRebuildPackage(pkg: BlogPackageJson | null, theme: BlogTheme): boolean {
  if (!pkg) {
    return false;
  }
  const deps = pkg.dependencies ?? {};
  const vuepress = String(deps.vuepress ?? '');
  if (/^[\^~]?2\./.test(vuepress)) {
    return true;
  }
  const themeDep = THEME_DEPENDENCIES[theme];
  if (themeDep) {
    return !deps[themeDep[0]];
  }
  return Boolean(deps['vuepress-theme-vdoing'] || deps['vuepress-theme-hope'] || deps['vuepress-theme-reco']);
}

const CANDIDATE_SCRIPTS = ['docs:build', 'blog:build', 'vuepress:build', 'build'];

export function detectBuildScript(pkg: BlogPackageJson | null): string | null {
  const scripts = pkg?.scripts ?? {};
  return CANDIDATE_SCRIPTS.find((name) => typeof scripts[name] === 'string') ?? null;
}

/** 已有 package.json 缺构建脚本时补一个，不丢用户其它脚本和依赖。 */
export function withBuildScript(pkg: BlogPackageJson): BlogPackageJson {
  if (detectBuildScript(pkg)) {
    return pkg;
  }
  return {
    ...pkg,
    scripts: { ...(pkg.scripts ?? {}), build: BLOG_BUILD_SCRIPT },
    dependencies: {
      vuepress: '^1.9.0',
      'cross-env': '^7.0.3',
      ...(pkg.dependencies ?? {}),
    },
  };
}

/**
 * 从已有 config.js 文本判断主题。对齐 vue2 detectCurrentTheme：
 * hope 用 require 判断，其余看 theme 字符串。
 */
export function detectConfigTheme(source: string): BlogTheme | null {
  if (!source) {
    return null;
  }
  if (/require\(\s*['"]vuepress-theme-hope/.test(source)) {
    return 'hope';
  }
  const matched = source.match(/\btheme\s*:\s*['"]([^'"]+)['"]/);
  if (!matched) {
    return null;
  }
  return normalizeBlogTheme(matched[1]);
}

/** 写侧栏 builder 源码：按 category 分组，空分类归「未分类」。 */
export const SIDEBAR_BUILDER_SOURCE = String.raw`const fs = require('fs')
const path = require('path')

const VP_DIR = path.join(__dirname, '..')
const IDMAP = path.join(VP_DIR, 'id-mappings.json')
const SEQ = path.join(VP_DIR, 'seq-manifest.json')
const OUT = path.join(VP_DIR, 'sidebar.json')

function readJson (file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf-8')) } catch (_) { return fallback }
}

function buildSidebar () {
  const idMap = readJson(IDMAP, { mappings: [] })
  const seq = readJson(SEQ, {})
  const groups = new Map()
  const items = (idMap.mappings || []).map((m) => ({
    id: m.id,
    title: m.title || m.id,
    path: m.shortUrl || m.defaultUrl || ('/' + m.id + '.html'),
    category: m.category || '',
    seq: typeof seq[m.id] === 'number' ? seq[m.id] : 0
  }))
  items.sort((a, b) => (a.seq - b.seq) || a.title.localeCompare(b.title))
  for (const item of items) {
    const category = item.category || '未分类'
    const group = groups.get(category) || { title: category, collapsable: true, children: [] }
    group.children.push({ title: item.title, path: item.path })
    groups.set(category, group)
  }
  const sidebar = { '/': Array.from(groups.values()) }
  fs.writeFileSync(OUT, JSON.stringify(sidebar, null, 2), 'utf-8')
  console.log('[sidebar-builder] wrote', items.length, 'entries ->', OUT)
  return sidebar
}

if (require.main === module) buildSidebar()
module.exports = { buildSidebar }
`;

/** 写导航 builder 源码：按 category 分组，空分类归「文章」。 */
export const NAV_BUILDER_SOURCE = String.raw`const fs = require('fs')
const path = require('path')

const VP_DIR = path.join(__dirname, '..')
const IDMAP = path.join(VP_DIR, 'id-mappings.json')
const OUT = path.join(VP_DIR, 'nav.json')

function readJson (file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf-8')) } catch (_) { return fallback }
}

function buildNav () {
  const idMap = readJson(IDMAP, { mappings: [] })
  const groups = new Map()
  for (const m of idMap.mappings || []) {
    const category = m.category || ''
    const link = m.shortUrl || m.defaultUrl || ('/' + m.id + '.html')
    const group = groups.get(category) || { category, items: [] }
    group.items.push({ text: m.title || m.id, link })
    groups.set(category, group)
  }
  const nav = []
  for (const group of groups.values()) {
    if (!group.category) {
      nav.push({ text: '文章', items: group.items })
      continue
    }
    const first = group.items[0]
    nav.push({ text: group.category, link: first ? first.link : './', items: group.items })
  }
  nav.unshift({ text: '首页', link: './' })
  fs.writeFileSync(OUT, JSON.stringify(nav, null, 2), 'utf-8')
  console.log('[nav-builder] wrote', nav.length, 'groups ->', OUT)
  return nav
}

if (require.main === module) buildNav()
module.exports = { buildNav }
`;

const LODASH_COMPAT = `// 修复高版本 Node.js 下 VuePress 1.x 编译时 lodash 各种未定义 (assignWith, arrayEach 等) 的 Bug
if (typeof global !== 'undefined') {
  const lodashInternal = ['assignWith', 'arrayEach', 'baseAssignValue', 'baseEach']
  lodashInternal.forEach(method => {
    if (!global[method]) {
      try {
        global[method] = require(\`lodash/\${method}\`);
      } catch (e) {
        if (method === 'assignWith') global[method] = Object.assign;
        if (method === 'arrayEach') global[method] = (arr, iter) => arr?.forEach(iter);
      }
    }
  });
}
`;

const DEFAULT_CONFIG = `${LODASH_COMPAT}
const path = require('path')

module.exports = {
  title: 'My Blog',
  description: 'Blog powered by Memocast',
  base: './',
  dest: '.vuepress/dist',
  head: [
    ['link', { rel: 'icon', href: './favicon.ico' }],
    ['meta', { name: 'viewport', content: 'width=device-width,initial-scale=1' }]
  ],
  themeConfig: {
    nav: require(path.join(__dirname, 'utils', 'nav-builder.js')).buildNav(),
    sidebar: require(path.join(__dirname, 'utils', 'sidebar-builder.js')).buildSidebar(),
    sidebarDepth: 2,
    lastUpdated: true
  },
  markdown: { lineNumbers: true }
}
`;

const VDOING_CONFIG = `// vuepress-theme-vdoing 配置 —— 知识库+博客主题
const path = require('path')

module.exports = {
  base: './',
  dest: '.vuepress/dist',
  head: [
    ['link', { rel: 'icon', href: './favicon.ico' }],
    ['meta', { name: 'viewport', content: 'width=device-width,initial-scale=1' }]
  ],
  theme: 'vdoing',
  themeConfig: {
    nav: require(path.join(__dirname, 'utils', 'nav-builder.js')).buildNav(),
    sidebar: require(path.join(__dirname, 'utils', 'sidebar-builder.js')).buildSidebar(),
    sidebarDepth: 2,
    category: true,
    tag: true,
    archive: true,
    categoryText: '随笔',
    darkmode: 'auto',
    defaultMode: 'auto',
    pageStyle: 'card',
    updateBar: { showToArticle: true, moreArticle: '/archives' },
    rightMenuBar: true,
    sidebarOpen: true,
    pageButton: true,
    logo: './logo.png',
    authorAvatar: './avatar.png',
    socialLinks: { github: 'https://github.com' }
  },
  markdown: { lineNumbers: true, extractTitleLevel: [2, 3, 4] }
}
`;

const HOPE_CONFIG = `// vuepress-theme-hope 配置 —— 功能丰富的文档+博客主题
const path = require('path')
const { config } = require('vuepress-theme-hope')

module.exports = config({
  base: './',
  dest: '.vuepress/dist',
  head: [
    ['link', { rel: 'icon', href: './favicon.ico' }],
    ['meta', { name: 'viewport', content: 'width=device-width,initial-scale=1' }]
  ],
  themeConfig: {
    logo: './logo.png',
    hostname: 'https://example.com',
    author: 'Author',
    darkmode: 'auto',
    navbar: require(path.join(__dirname, 'utils', 'nav-builder.js')).buildNav(),
    sidebar: require(path.join(__dirname, 'utils', 'sidebar-builder.js')).buildSidebar(),
    sidebarDepth: 2,
    blog: {
      name: 'Author',
      avatar: './avatar.png',
      intro: '/about.html',
      links: { github: 'https://github.com' },
      roundAvatar: true,
      sidebarDisplay: 'always',
      timeline: 'Yesterday once more',
      perPage: 10,
      autoExcerpt: true
    }
  },
  markdown: { lineNumbers: true, extractTitleLevel: [2, 3, 4] },
  plugins: { readingTime: true, copyCode: true, photoSwipe: true }
})
`;

const RECO_CONFIG = `// vuepress-theme-reco 配置 —— 简洁博客主题
const path = require('path')

module.exports = {
  base: './',
  dest: '.vuepress/dist',
  head: [
    ['link', { rel: 'icon', href: './favicon.ico' }],
    ['meta', { name: 'viewport', content: 'width=device-width,initial-scale=1' }]
  ],
  theme: 'reco',
  themeConfig: {
    type: 'blog',
    logo: './logo.png',
    author: 'Author',
    authorAvatar: './avatar.png',
    darkmode: 'auto',
    navbar: require(path.join(__dirname, 'utils', 'nav-builder.js')).buildNav(),
    sidebar: require(path.join(__dirname, 'utils', 'sidebar-builder.js')).buildSidebar(),
    blogConfig: {
      category: { location: 2, text: '分类' },
      tag: { location: 3, text: '标签' },
      socialLinks: [{ icon: 'reco-github', link: 'https://github.com' }]
    },
    socialLinks: { github: 'https://github.com' }
  },
  markdown: { lineNumbers: true },
  plugins: []
}
`;

export function buildVuepressConfig(theme: BlogTheme): string {
  if (theme === 'vdoing') {
    return VDOING_CONFIG;
  }
  if (theme === 'hope') {
    return HOPE_CONFIG;
  }
  if (theme === 'reco') {
    return RECO_CONFIG;
  }
  return DEFAULT_CONFIG;
}

export function buildManagerCommand(
  pm: BlogPackageManager,
  kind: 'install' | 'run',
  script?: string,
): { command: string; args: string[] } {
  const isWin = process.platform === 'win32';
  if (kind === 'install') {
    const args = pm === 'npm'
      ? ['install', '--include=dev', '--loglevel=info']
      : pm === 'pnpm'
        ? ['install']
        : ['install', '--loglevel=info'];
    return isWin
      ? { command: 'cmd.exe', args: ['/c', [pm, ...args].join(' ')] }
      : { command: pm, args };
  }
  const runArgs = ['run', script ?? 'build'];
  return isWin
    ? { command: 'cmd.exe', args: ['/c', [pm, ...runArgs].join(' ')] }
    : { command: pm, args: runArgs };
}
