// ============================================================================
// tests/unit/blog/blog-config-writer.test.js
//
// 锁定的契约（v2026-07-29 起固定）：
//   历史上 `scripts/blog/blog-config-writer.js` 是主进程版
//   `src-electron/main-process/service/blog-config-writer.js` 的镜像副本，
//   加上 `scripts/blog/run-smoke.js` 这一个独立测试入口。
//
//   1) 两个版本的 SIDEBAR_BUILDER_SRC / NAV_BUILDER_SRC / VERIFY_PATHS_SRC
//      **已不再同步**（实测两两不等），scripts/ 那份事实上已是孤儿副本。
//   2) scripts/blog/cyrb53.js 与 src/services/BlogDeployService.js 内嵌版
//      也已漂移，前者无 require 引用，是孤儿代码。
//   3) run-smoke.js 不被 yarn 任何 alias 引用，也无对应 jest 用例，
//      按"以后测试用例都放tests"原则迁移到本文件。
//
//   v2026-07-29 起：
//     - 删除 scripts/blog/{run-smoke.js, blog-config-writer.js, cyrb53.js}
//     - 主进程版的 blog-config-writer.js 成为唯一真相源
//     - run-smoke 的契约（positive: 4 条主流程 OK；negative: verify-paths 抛错）
//       由本测试承担
//
// 覆盖项：
//   1. writeBlogUtilities 写出 3 个 builder 文件 + verify-paths 文件
//   2. writeVuepressConfig 在目标不存在时写出 config.js，已存在则跳过（不覆盖）
//   3. runBuilders 跑完生成 sidebar.json / nav.json
//   4. runVerifyPaths positive：4 篇文章全部命中 _posts；fmErrors=0
//   5. runVerifyPaths negative：id-mappings 有 4 条但 _posts 没写文件 → 抛错
//   6. ensureBlogConfig 端到端：positive 走通；negative ok=false 但 sidebar/nav 仍写出
//
// 关键事实：本测试**只** require 主进程版，不依赖 scripts/blog/ 那份。
// ============================================================================

const path = require('path')
const fs = require('fs')
const fse = require('fs-extra')
const os = require('os')

const WRITER = require('../../../src-electron/main-process/service/blog-config-writer.js')

// === 静默主进程 blog-config-writer / 子 builder 的 console 输出（每次 runBuilders
//     都会刷大量 log，对测试信号没价值；jest 默认把 log 透传造成噪音）===
let logSpy, errSpy
beforeAll(() => {
  logSpy = jest.spyOn(console, 'log').mockImplementation(() => {})
  errSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
})
afterAll(() => {
  logSpy.mockRestore()
  errSpy.mockRestore()
})

// === 测试工具：每个 case 都在 os.tmpdir() 拿一个独立 sandbox
async function makeSandbox (label) {
  const root = path.join(os.tmpdir(), `memocast-blog-test-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
  await fse.ensureDir(root)
  await fse.ensureDir(path.join(root, '_posts'))
  return root
}

async function rmSandbox (root) {
  try { await fse.remove(root) } catch (_) { /* noop */ }
}

// 复用 scripts/runSmokeTest 的 4 条样本（保留 IPC payload 字段完整）
const ITEMS = [
  { id: 'aaaa1111bbbb2222', fileName: '序章.md',    title: '序章',    category: '技术/前端', seq: 1 },
  { id: 'cccc3333dddd4444', fileName: 'Hello.md',  title: 'Hello',  category: '技术/前端', seq: 2 },
  { id: 'eeee5555ffff6666', fileName: 'note-c.md', title: 'Note C', category: '随笔',      seq: 3 },
  { id: 'gggg7777hhhh8888', fileName: 'note-d.md', title: 'Note D', category: '',          seq: 4 }
]

// 把 ITEMS 落成 id-mappings.json + seq-manifest.json + _posts/*.md（positive 才写 md）
async function seedFixtures (root, { writePosts }) {
  const idMap = { mappings: [], stats: { total: ITEMS.length, conflicts: [] } }
  const seq = {}
  let n = 1
  for (const it of ITEMS) {
    if (writePosts) {
      const md = `---\ntitle: ${it.title}\ndate: 2026-07-05\npermalink: /${it.id}.html\n---\n\n# ${it.title}\n`
      await fse.writeFile(path.join(root, '_posts', it.id + '.md'), md)
    }
    const baseNoExt = it.fileName.replace(/\.md$/, '')
    const fullPath = (it.category ? it.category + '/' : '') + baseNoExt
    idMap.mappings.push({
      id: it.id,
      fileName: it.fileName,
      fullPath,
      title: it.title,
      category: it.category,
      defaultUrl: `/${it.id}.html`,
      shortUrl:   `/${it.id}.html`,
      level: it.category ? 2 : 1
    })
    seq[it.id] = it.seq || n++
  }
  const vpDir = path.join(root, '.vuepress')
  await fse.ensureDir(vpDir)
  await fse.writeJson(path.join(vpDir, 'id-mappings.json'), idMap, { spaces: 2 })
  await fse.writeJson(path.join(vpDir, 'seq-manifest.json'), seq, { spaces: 2 })
  return vpDir
}

// 用 writer 写完 utils 后真正 invoke 写到 .vuepress/utils/ 的子模块（清除 require.cache）
async function loadSubmodules (vpDir) {
  const builderDir = path.join(vpDir, 'utils')
  Object.keys(require.cache).forEach((k) => {
    if (k.startsWith(builderDir)) delete require.cache[k]
  })
  return {
    sidebar: require(path.join(builderDir, 'sidebar-builder.js')),
    nav: require(path.join(builderDir, 'nav-builder.js')),
    verify: require(path.join(builderDir, 'verify-paths.js'))
  }
}

// 把 sidebar 的 _posts/ 组计算帖子数（绕开 group 形态，直接统计 sidebar.tree）
function countPostsUnderPostsKey (sidebar) {
  if (!sidebar || typeof sidebar !== 'object') return 0
  const items = sidebar['_posts/'] || []
  return Array.isArray(items) ? items.length : 0
}

describe('blog-config-writer（v2026-07-29 起单一真相源：主进程版）', () => {
  describe('writeBlogUtilities / writeVuepressConfig', () => {
    let root
    beforeEach(async () => { root = await makeSandbox('utils') })
    afterEach(async () => { await rmSandbox(root) })

    test('写出 sidebar-builder.js / nav-builder.js / verify-paths.js 三个 builder 文件', async () => {
      await WRITER.writeBlogUtilities(root)
      const utilsDir = path.join(root, '.vuepress', 'utils')
      expect(fs.existsSync(path.join(utilsDir, 'sidebar-builder.js'))).toBe(true)
      expect(fs.existsSync(path.join(utilsDir, 'nav-builder.js'))).toBe(true)
      expect(fs.existsSync(path.join(utilsDir, 'verify-paths.js'))).toBe(true)
    })

    test('导出 SIDEBAR_BUILDER_SRC / NAV_BUILDER_SRC / VERIFY_PATHS_SRC 三个非空字符串模板', () => {
      expect(typeof WRITER.SIDEBAR_BUILDER_SRC).toBe('string')
      expect(WRITER.SIDEBAR_BUILDER_SRC.length).toBeGreaterThan(100)
      expect(typeof WRITER.NAV_BUILDER_SRC).toBe('string')
      expect(WRITER.NAV_BUILDER_SRC.length).toBeGreaterThan(100)
      expect(typeof WRITER.VERIFY_PATHS_SRC).toBe('string')
      expect(WRITER.VERIFY_PATHS_SRC.length).toBeGreaterThan(100)
    })

    test('writeVuepressConfig：目标不存在时写出 config.js；已存在则跳过（不覆盖用户配置）', async () => {
      const firstPath = await WRITER.writeVuepressConfig(root, 'default', { title: 'Hi' })
      expect(firstPath).toBeTruthy()
      expect(fs.existsSync(firstPath)).toBe(true)

      // 写入第二次：已存在 → 应跳过，返回 null
      const secondPath = await WRITER.writeVuepressConfig(root, 'default', { title: 'Hi Again' })
      expect(secondPath).toBe(null)

      // 验证内容没被覆盖（仍是第一次的 title 'Hi'，不是第二次的 'Hi Again'）
      const content = fs.readFileSync(firstPath, 'utf-8')
      expect(content).toContain('Hi') // 第一次的 title
      expect(content).not.toContain('Hi Again')
    })
  })

  describe('runBuilders / runVerifyPaths（等价于 scripts/run-smoke 的 positive 路径）', () => {
    let root
    beforeEach(async () => { root = await makeSandbox('positive') })
    afterEach(async () => { await rmSandbox(root) })

    test('positive: 4 篇文章 → sidebar[\'_posts/\'] 含 4 条 + nav.groups 存在 + verify 全部 resolved + fmErrors=0', async () => {
      const vpDir = await seedFixtures(root, { writePosts: true })
      await WRITER.writeBlogUtilities(root)
      const { sidebar, nav } = await WRITER.runBuilders(root)
      const fmErrors = []
      for (const it of ITEMS) {
        const fp = path.join(root, '_posts', it.id + '.md')
        const md = await fse.readFile(fp, 'utf-8')
        const m = md.match(/^---[\s\S]*?---/)
        expect(m).not.toBeNull()
        const re = new RegExp(`permalink:\\s*/${it.id}\\.html`)
        if (!re.test(m[0])) fmErrors.push(`${it.id}.md: permalink missing /${it.id}.html`)
      }
      const verify = await WRITER.runVerifyPaths(root)

      expect(countPostsUnderPostsKey(sidebar)).toBe(4)
      expect(Array.isArray(nav)).toBe(true)
      expect(verify.total).toBe(verify.resolved)
      expect(fmErrors.length).toBe(0)
    })
  })

  describe('runVerifyPaths（等价于 scripts/run-smoke 的 negative 路径）', () => {
    let root
    beforeEach(async () => { root = await makeSandbox('negative') })
    afterEach(async () => { await rmSandbox(root) })

    test('negative: id-mappings 有 4 条但 _posts/ 实际没文件 → verify 应抛错（verify.error 存在）', async () => {
      const vpDir = await seedFixtures(root, { writePosts: false })
      await WRITER.writeBlogUtilities(root)
      await WRITER.runBuilders(root)
      let verify
      try {
        verify = await WRITER.runVerifyPaths(root)
      } catch (e) {
        verify = { error: e.message || String(e) }
      }
      expect(verify.error).toBeTruthy()
    })
  })

  describe('ensureBlogConfig（端到端，与 blog-deploy-handler 同入口）', () => {
    let root
    beforeEach(async () => { root = await makeSandbox('ensureBlog') })
    afterEach(async () => { await rmSandbox(root) })

    test('positive 端到端：ok=true 且 sidebar/nav 都已写到磁盘', async () => {
      await seedFixtures(root, { writePosts: true })
      const result = await WRITER.ensureBlogConfig(root, { title: 'Smoke Blog' })
      expect(result.ok).toBe(true)
      expect(result.sidebar).toBeDefined()
      expect(result.nav).toBeDefined()
      expect(countPostsUnderPostsKey(result.sidebar)).toBe(4)
    })

    test('negative 端到端：ok=false 但 sidebar/nav 仍能写出（warning 含抛错信息）', async () => {
      await seedFixtures(root, { writePosts: false })
      const result = await WRITER.ensureBlogConfig(root, { title: 'Smoke Blog' })
      expect(result.ok).toBe(false)
      expect(result.warning).toBeTruthy()
      // 即使 negative，builder 已经把 _posts/ 组算进 sidebar
      expect(countPostsUnderPostsKey(result.sidebar)).toBe(4)
    })
  })
})
