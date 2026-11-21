/**
 * 博客打包 VuePress 配置写入器
 *
 * 职责（在 renderer 里写完 _posts/*.md + shortlink-map.json 之后）：
 *   1. 把三个 .vuepress/utils/*.js (sidebar-builder / nav-builder / verify-paths) 写到博客目录
 *   2. 视情况补一份 .vuepress/config.js
 *   3. 跑 builder 生成 sidebar.json / nav.json
 *   4. 跑 verify-paths 检验所有 sidebar/nav 路径能在 _posts/<id>.md 物理命中
 *
 * 与文档 TODO-vuepress部署优化.md §5-§9 对齐。
 *
 * 注意：本模块不与 BlogDeployService.js 的 ID 算法耦合 —— 它的 ID 计算在 renderer 里做完了。
 * 这里只关心路径/URL 校验，所以传入 blogDir 即用。
 */
'use strict'

const fs = require('fs')
const fse = require('fs-extra')
const path = require('path')

// ============================================================
// 三个 .vuepress/utils/*.js 源码常量
// 这些最终会被写到  blogDir/.vuepress/utils/  下，然后由 .vuepress/config.js require 它们。
//
// 反斜杠策略（§10.1）：
//   - 模板字符串里 `\\` 写到磁盘是 2 字符 `\\`，JS 加载侧解析为 1 字面 `\`
//   - 需要匹配 win 分隔符的 regex (如 replace(/\\/g, '/')) 用 `\\\\` —— 磁盘 2 char `\\` → 加载后 `\\` 字面 regex body = 1 字面 `\` → regex 匹配 1 字面 `\`
// ============================================================

const SIDEBAR_BUILDER_SRC = `
const fs = require('fs')
const path = require('path')

const VP_DIR   = path.join(__dirname, '..')
const IDMAP    = path.join(VP_DIR, 'id-mappings.json')
const SEQ      = path.join(VP_DIR, 'seq-manifest.json')
const SHORTMAP = path.join(VP_DIR, 'shortlink-map.json')
const OUT      = path.join(VP_DIR, 'sidebar.json')

function readJson (p, fb) { try { return JSON.parse(fs.readFileSync(p, 'utf-8')) } catch (_) { return fb } }

function buildSidebar () {
  const idMap = readJson(IDMAP, { mappings: [] })
  const seq   = readJson(SEQ, {})
  const items = (idMap.mappings || []).map(m => ({
    title: m.title || m.id,
    path: m.shortUrl || m.defaultUrl,
    permalink: m.shortUrl || m.defaultUrl,
    seq: seq[m.id] || 0,
    category: m.category || ''
  }))
  items.sort((a, b) => (a.seq - b.seq) || a.title.localeCompare(b.title))

  const sidebar = { '_posts/': items.map(it => ({ title: it.title, path: it.path })) }

  fs.writeFileSync(OUT, JSON.stringify(sidebar, null, 2), 'utf-8')
  console.log('[sidebar-builder] wrote', items.length, 'entries ->', OUT)
  return sidebar
}

if (require.main === module) buildSidebar()
module.exports = { buildSidebar }
`.trim() + '\n'

const NAV_BUILDER_SRC = `
const fs = require('fs')
const path = require('path')

const VP_DIR = path.join(__dirname, '..')
const IDMAP  = path.join(VP_DIR, 'id-mappings.json')
const SHORT  = path.join(VP_DIR, 'shortlink-map.json')
const OUT    = path.join(VP_DIR, 'nav.json')

function readJson (p, fb) { try { return JSON.parse(fs.readFileSync(p, 'utf-8')) } catch (_) { return fb } }

function buildNav () {
  const idMap = readJson(IDMAP, { mappings: [] })
  const items = (idMap.mappings || []).map(m => ({
    title: m.title, link: m.shortUrl || m.defaultUrl, category: m.category || ''
  }))
  const byCategory = new Map()
  for (const it of items) {
    const arr = byCategory.get(it.category) || []
    arr.push({ text: it.title, link: it.link })
    byCategory.set(it.category, arr)
  }
  const nav = []
  for (const [cat, arr] of byCategory.entries()) {
    if (!cat) {
      nav.push({ text: '文章', items: arr })
    } else {
      const node = { text: cat }
      // 分类组 link: 指向分类子目录下 README.md (vuepress 默认主题把 README.md 路由到 /<cat>/)
      // 反斜杠规则: 模板字符串里 '\\/+' (2 source) -> string value '\\/+' (2 char) -> 磁盘 regex body '\\/+' = regex '\\/+' = 匹配 1+ 个 '/'
      node.link = './' + cat.replace(/^\\/+|\\/+$/g, '') + '/'
      node.items = arr
      nav.push(node)
    }
  }
  // 若 nav 里所有 node 都没有 link,补一个"首页"占位
  if (nav.length === 0 || !nav.some(n => n && n.link)) {
    nav.unshift({ text: '首页', link: './' })
  } else if (!nav.some(n => n.text === '首页')) {
    nav.unshift({ text: '首页', link: './' })
  }
  fs.writeFileSync(OUT, JSON.stringify(nav, null, 2), 'utf-8')
  console.log('[nav-builder] wrote', nav.length, 'groups ->', OUT)
  return nav
}

if (require.main === module) buildNav()
module.exports = { buildNav }
`.trim() + '\n'

// verify-paths: 注意 `\\\\` 在源码里 (4 source char) → string value 2 char `\\` → 磁盘 2 char `\\` → 加载后 regex body 字面 1 个 `\`,符合 §10.1
const VERIFY_PATHS_SRC = `
const fs = require('fs')
const path = require('path')

const VP_DIR    = path.join(__dirname, '..')
const BLOG_DIR  = path.join(VP_DIR, '..')
const POSTS_DIR = path.join(BLOG_DIR, '_posts')
const DIST_DIR  = path.join(VP_DIR, 'dist')
const SIDEBAR   = path.join(VP_DIR, 'sidebar.json')
const NAV       = path.join(VP_DIR, 'nav.json')
const IDMAP     = path.join(VP_DIR, 'id-mappings.json')

function readJson (p, fb) { try { return JSON.parse(fs.readFileSync(p, 'utf-8')) } catch (_) { return fb } }

function normalizeUrl (p) {
  return String(p || '').replace(/\\\\/g, '/').split('#')[0].split('?')[0]
}

function collectUrlLike (node, out) {
  out = out || []
  if (node == null) return out
  if (typeof node === 'string') {
    if (node.startsWith('/') || /\\.html$/.test(node) || /\\.md$/.test(node)) out.push(node)
    return out
  }
  if (Array.isArray(node)) {
    for (const it of node) collectUrlLike(it, out)
    return out
  }
  if (typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      collectUrlLike(k, out)
      collectUrlLike(v, out)
    }
  }
  return out
}

function main () {
  const sidebar = readJson(SIDEBAR, null)
  const nav     = readJson(NAV, null)
  const idMap   = readJson(IDMAP, { mappings: [] })

  const byId    = new Map()
  const byShort = new Map()
  const byFullP = new Map()
  for (const m of idMap.mappings || []) {
    if (m.id) byId.set(m.id, m)
    if (m.shortUrl) byShort.set(m.shortUrl, m)
    if (m.fullPath) byFullP.set(m.fullPath, m)
  }

  const all = []
  if (sidebar) collectUrlLike(sidebar, all)
  if (nav)     collectUrlLike(nav, all)

  const seen = new Set()
  const unresolved = []
  let total = 0, resolved = 0

  for (const raw of all) {
    const p = normalizeUrl(raw)
    if (!p || seen.has(p)) continue
    seen.add(p)
    if (p.indexOf('_posts') !== -1) continue  // 容器键
    if (p.startsWith('#') || /^https?:\\/\\//i.test(p) || p.startsWith('//')) continue
    if (p === '/' || p === '/index.html' || p === '/README.html') continue
    total++

    // §10.2 防御: 命中 id 短链后必须 fs.existsSync 对应 .md 文件
    const idMatch = p.match(/^\\/([a-z0-9]{6,})\\.html$/i)
    if (idMatch) {
      const id = idMatch[1]
      const cand = path.join(POSTS_DIR, id + '.md')
      if (fs.existsSync(cand)) { resolved++; continue }
    }
    const fullKey = p.replace(/^\\//, '')
    if (byFullP.has(fullKey)) {
      const cand = path.join(POSTS_DIR, fullKey + '.md')
      if (fs.existsSync(cand)) { resolved++; continue }
    }
    const baseMatch = p.match(/\\/([^\\/]+?)(?:\\.html|\\.md)?$/)
    if (baseMatch) {
      const cand = path.join(POSTS_DIR, baseMatch[1] + '.md')
      if (fs.existsSync(cand)) { resolved++; continue }
    }
    const distFile = path.join(DIST_DIR, p.replace(/^\\//, ''))
    if (fs.existsSync(distFile) || fs.existsSync(distFile + '.html')) {
      resolved++; continue
    }
    unresolved.push(p)
  }

  console.log('[verify-paths] total=' + total + ', resolved=' + resolved + ', unresolved=' + unresolved.length)
  if (unresolved.length > 0) {
    console.error('[verify-paths] unresolved paths:')
    for (const p of unresolved) console.error('  -', p)
    throw new Error('verify-paths found ' + unresolved.length + ' unresolved links - abort')
  }
  return { total, resolved, unresolved }
}

if (require.main === module) {
  try { main() } catch (e) { console.error(e.message || e); process.exit(1) }
}
module.exports = { main }
`.trim() + '\n'

// ============================================================
// 写入工具
// ============================================================

/**
 * 把三个 builder 写到 blogDir/.vuepress/utils/
 * @returns {Promise<string>} utilsDir 绝对路径
 */
async function writeBlogUtilities (blogDir) {
  const utilsDir = path.join(blogDir, '.vuepress', 'utils')
  await fse.ensureDir(utilsDir)
  await fse.writeFile(path.join(utilsDir, 'sidebar-builder.js'), SIDEBAR_BUILDER_SRC, 'utf-8')
  await fse.writeFile(path.join(utilsDir, 'nav-builder.js'),    NAV_BUILDER_SRC,    'utf-8')
  await fse.writeFile(path.join(utilsDir, 'verify-paths.js'),   VERIFY_PATHS_SRC,   'utf-8')
  console.log('[blog-config-writer] wrote utils/*.js ->', utilsDir)
  return utilsDir
}

/**
 * 写一份 .vuepress/config.js —— 仅在目标文件不存在时写,绝不覆盖用户已存在的 config.js
 * @returns {Promise<string|null>} config.js 绝对路径; 跳过返回 null
 */
async function writeVuepressConfig (blogDir, theme = 'default', opts = {}) {
  const vpDir = path.join(blogDir, '.vuepress')
  await fse.ensureDir(vpDir)
  const dest = path.join(vpDir, 'config.js')
  if (fs.existsSync(dest)) {
    console.log('[blog-config-writer] config.js exists, skip:', dest)
    return null
  }
  // 与 blog-deploy-handler.ensureBlogConfig 同源:
  //  - lodash patch: 修复高版本 Node.js 下 VuePress 1.x 编译时 lodash 各种未定义
  //  - base: './': 相对路径, github-pages 不需要 repo 子路径
  //  - 即时调用 buildSidebar()/buildNav(): 第一次构建就能拿到值

  // vuepress-theme-hope@1.x 用 config()
  if (theme === 'hope') {
    const content =
`const { config } = require('vuepress-theme-hope')

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
    navbar: require('./utils/nav-builder.js').buildNav(),
    sidebar: require('./utils/sidebar-builder.js').buildSidebar(),
    sidebarDepth: 2,
    blog: {
      name: 'Author',
      avatar: './avatar.png',
      links: { github: 'https://github.com' },
      roundAvatar: true,
      sidebarDisplay: 'always',
      perPage: 10,
      autoExcerpt: true
    }
  },
  markdown: { lineNumbers: true, extractTitleLevel: [2, 3, 4] },
  plugins: {
    readingTime: true,
    copyCode: true,
    photoSwipe: true
  }
})
`
    await fse.writeFile(dest, content, 'utf-8')
    console.log('[blog-config-writer] wrote hope config.js ->', dest)
    return dest
  }

  // vuepress-theme-reco@1.x 直接用 theme: 'reco'
  if (theme === 'reco') {
    const content =
`module.exports = {
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
    navbar: require('./utils/nav-builder.js').buildNav(),
    sidebar: require('./utils/sidebar-builder.js').buildSidebar(),
    blogConfig: {
      category: { location: 2, text: '分类' },
      tag: { location: 3, text: '标签' },
      socialLinks: [{ icon: 'reco-github', link: 'https://github.com' }]
    },
    socialLinks: { github: 'https://github.com' }
  },
  markdown: { lineNumbers: true }
}
`
    await fse.writeFile(dest, content, 'utf-8')
    console.log('[blog-config-writer] wrote reco config.js ->', dest)
    return dest
  }

  // vuepress-theme-vdoing@1.x 直接用 theme: 'vdoing'
  if (theme === 'vdoing') {
    const content =
`module.exports = {
  base: './',
  dest: '.vuepress/dist',
  head: [
    ['link', { rel: 'icon', href: './favicon.ico' }],
    ['meta', { name: 'viewport', content: 'width=device-width,initial-scale=1' }]
  ],
  theme: 'vdoing',
  themeConfig: {
    logo: './logo.png',
    authorAvatar: './avatar.png',
    darkmode: 'auto',
    defaultMode: 'auto',
    pageStyle: 'card',
    updateBar: { showToArticle: true, moreArticle: '/archives' },
    rightMenuBar: true,
    sidebarOpen: true,
    pageButton: true,
    category: true,
    tag: true,
    archive: true,
    categoryText: '随笔',
    socialLinks: { github: 'https://github.com' },
    nav: require('./utils/nav-builder.js').buildNav(),
    sidebar: require('./utils/sidebar-builder.js').buildSidebar(),
    sidebarDepth: 2
  },
  markdown: { lineNumbers: true, extractTitleLevel: [2, 3, 4] }
}
`
    await fse.writeFile(dest, content, 'utf-8')
    console.log('[blog-config-writer] wrote vdoing config.js ->', dest)
    return dest
  }

  // default 主题
  const content =
`// 修复高版本 Node.js 下 VuePress 1.x 编译时 lodash 各种未定义 (assignWith, arrayEach 等) 的 Bug
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

const path = require('path')
module.exports = (function () {
  const sidebarObj = require(path.join(__dirname, 'utils', 'sidebar-builder.js')).buildSidebar()
  const navObj     = require(path.join(__dirname, 'utils', 'nav-builder.js')).buildNav()
  return {
    title: ${JSON.stringify(opts.title || 'My Blog')},
    description: ${JSON.stringify(opts.description || 'Blog powered by Memocast')},
    base: './',
    dest: '.vuepress/dist',
    head: [
      ['link', { rel: 'icon', href: './favicon.ico' }],
      ['meta', { name: 'viewport', content: 'width=device-width,initial-scale=1' }]
    ],
    themeConfig: {
      nav: navObj,
      sidebar: sidebarObj,
      sidebarDepth: 2,
      lastUpdated: true
    },
    markdown: { lineNumbers: true }
  }
})()
`
  await fse.writeFile(dest, content, 'utf-8')
  console.log('[blog-config-writer] wrote config.js ->', dest)
  return dest
}

/**
 * 执行 verify-paths,发现 unresolved 即抛错。
 * 返回 { total, resolved, unresolved }
 */
async function runVerifyPaths (blogDir) {
  const vpDir = path.join(blogDir, '.vuepress')
  const verifyPath = path.join(vpDir, 'utils', 'verify-paths.js')
  if (!fs.existsSync(verifyPath)) {
    throw new Error('[blog-config-writer] verify-paths.js 不存在: ' + verifyPath + ' —— 请先 writeBlogUtilities')
  }
  // 清除缓存以便拿到最新 utils/*.js
  delete require.cache[require.resolve(verifyPath)]
  const verify = require(verifyPath)
  try {
    return verify.main()
  } catch (e) {
    const msg = e && e.message ? e.message : String(e)
    throw new Error('[blog-config-writer] verify-paths 失败: ' + msg)
  }
}

/**
 * 执行 sidebar-builder + nav-builder(需要 id-mappings.json / seq-manifest.json 已存在)
 */
async function runBuilders (blogDir) {
  const vpDir = path.join(blogDir, '.vuepress')
  const sidebarPath = path.join(vpDir, 'utils', 'sidebar-builder.js')
  const navPath     = path.join(vpDir, 'utils', 'nav-builder.js')
  for (const p of [sidebarPath, navPath]) {
    if (!fs.existsSync(p)) throw new Error('[blog-config-writer] 缺少 ' + p + ' —— 请先 writeBlogUtilities')
  }
  delete require.cache[require.resolve(sidebarPath)]
  delete require.cache[require.resolve(navPath)]
  const sidebar = require(sidebarPath)
  const nav     = require(navPath)
  const sb = sidebar.buildSidebar()
  const nv = nav.buildNav()
  return { sidebar: sb, nav: nv }
}

/**
 * 一次性: 写 utils -> 写 config.js -> 跑 builder -> 跑 verify
 * 任一步失败抛错;verify 失败不抛,作为 warning 返回 (与文档 §9 行为一致)
 */
async function ensureBlogConfig (blogDir, opts = {}) {
  const theme = opts.theme || 'default'
  await writeBlogUtilities(blogDir)
  await writeVuepressConfig(blogDir, theme, {
    title: opts.title || 'My Blog',
    description: opts.description || 'Blog powered by Memocast'
  })
  const buildResult = await runBuilders(blogDir)
  try {
    const verify = await runVerifyPaths(blogDir)
    return { ok: true, ...buildResult, verify }
  } catch (e) {
    return { ok: false, warning: e.message || String(e), ...buildResult }
  }
}

module.exports = {
  SIDEBAR_BUILDER_SRC,
  NAV_BUILDER_SRC,
  VERIFY_PATHS_SRC,
  writeBlogUtilities,
  writeVuepressConfig,
  runVerifyPaths,
  runBuilders,
  ensureBlogConfig
}