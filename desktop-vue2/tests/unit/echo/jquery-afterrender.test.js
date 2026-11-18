// ============================================================================
// tests/unit/echo/jquery-afterrender.test.js
// 从 scripts/verify-jquery-afterrender.js 迁移而来（v2026-07-29 接入 Jest，2026-07-29 适配拆分）。
//
// 锁定的契约（v2026-07-28 起）：
//   - handlerBody 全部用 $(node) 拿 jQuery 句柄
//   - 不再出现 native DOM 兜底（document.querySelector / .classList.add / .style.x = / etc.）
//   - echoBuiltins/ 子目录里 16 张卡片文件已清除 safeDollarRef / __safeDollarInner / createDefaultChantAnnoSource
//   - echoAnnoSource.js 暴露 HANDLER_PRELUDE（含 window.jQuery）+ createDefaultEchoAnnoSource
//
// === 拆分后的源文件位置 ===
//   拆分前是 src/components/echo/echoBuiltins.js（单文件）。
//   拆分后：
//     - src/components/echo/echoBuiltins/echoBuiltinsBase.js           baseRender / baseAfterRender / createAnnoSource / buildEchoCard 工厂
//     - src/components/echo/echoBuiltins/echoBuiltins{EachCardId}.js   16 张卡片各自的文件
//     - src/components/echo/echoBuiltins/echoBuiltins.js                聚合入口
// ============================================================================
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..', '..', '..', 'src', 'components', 'echo')
const ROOT_BUILTINS_DIR = path.join(ROOT, 'echoBuiltins')
const ROOT_RUNTIME = path.join(ROOT, 'echoRuntime.js')
const ROOT_ANNOSRC = path.join(ROOT, 'echoAnnoSource.js')

// 拆分后，"所有 builtin 源文件" = base + 16 张卡片 + index。扫描整个子目录。
const builtinDirEntries = fs.readdirSync(ROOT_BUILTINS_DIR).filter(f => f.endsWith('.js'))
const builtinSources = builtinDirEntries.map(f => ({
  file: f,
  src: fs.readFileSync(path.join(ROOT_BUILTINS_DIR, f), 'utf8')
}))

// 兼容旧的"单文件 builtinSrc" 语义：把所有 builtin 文件拼起来，等价原 echoBuiltins.js 全文
const builtinSrc = builtinSources.map(b => `// ===== ${b.file} =====\n` + b.src).join('\n')

// 旧测试里把 ROOT_BUILTINS（单文件路径）也作为字符串传出，这里再用 ROOT_BUILTINS
// 单独打印"对应路径不存在会失败"的消息。
const ROOT_BUILTINS_LEGACY_PATH = path.join(ROOT, 'echoBuiltins.js')

const runtimeSrc = fs.readFileSync(ROOT_RUNTIME, 'utf8')
const annoSrc = fs.readFileSync(ROOT_ANNOSRC, 'utf8')

describe('echo/jQuery 化与历史包袱清理', () => {
  describe('历史包袱清理（这些命名/签名不应再出现）', () => {
    test.each([
      ['safeDollarRef', builtinSrc],
      ['__safeDollarInner', builtinSrc],
      ['createDefaultChantAnnoSource', builtinSrc],
      ['$(domElement)', builtinSrc],
      ['$(chantNode)', builtinSrc]
    ])('echoBuiltins/ 子目录中不应再出现 %s', (pattern, src) => {
      expect(src).not.toMatch(new RegExp(pattern.replace(/[.()]/g, '\\$&')))
    })

    test('echoBuiltins.js 单文件已迁移到 echoBuiltins/ 子目录', () => {
      // 拆分后旧路径不再存在；防止有人重新把 16 张卡片合回到单文件。
      expect(fs.existsSync(ROOT_BUILTINS_LEGACY_PATH)).toBe(false)
    })

    test('echoRuntime.js 不应再使用 safeDollarRef', () => {
      expect(runtimeSrc).not.toMatch(/safeDollarRef/)
    })

    test('echoAnnoSource.js 已移除 createDefaultChantAnnoSource', () => {
      expect(annoSrc).not.toMatch(/createDefaultChantAnnoSource/)
    })
  })

  describe('handlerBody 直用 jQuery $(node)', () => {
    const handlerBodyPattern = /handlerBody:\s*`([\s\S]*?)`/g
    const handlerBodies = []
    let m
    while ((m = handlerBodyPattern.exec(builtinSrc)) !== null) {
      handlerBodies.push(m[1])
    }

    test('echoBuiltins/ 中至少存在 1 个 handlerBody', () => {
      expect(handlerBodies.length).toBeGreaterThan(0)
    })

    test.each(handlerBodies.map((body, idx) => [idx, body]))(
      'handlerBody[#%i] 使用 $(node) jQuery 化',
      (idx, body) => {
        expect(body).toMatch(/\$\(node\)/)
      }
    )
  })

  describe('禁用 native DOM 兜底（在 handlerBody 中不应出现）', () => {
    const bannedPatterns = [
      { name: 'document.querySelector', re: /document\.querySelector/ },
      { name: '.classList.add', re: /\.classList\.add/ },
      { name: '.previousElementSibling / .nextElementSibling', re: /\.(previous|next)ElementSibling/ },
      { name: '.style.x = 赋值', re: /\.style\.[a-zA-Z]+\s*=/ }
    ]
    test.each(bannedPatterns)('echoBuiltins/ 中不应再使用 %s', ({ re }) => {
      expect(builtinSrc).not.toMatch(re)
    })
  })

  describe('echoAnnoSource.js 暴露正确 API', () => {
    test('HANDLER_PRELUDE 注入 window.jQuery', () => {
      expect(annoSrc).toMatch(/HANDLER_PRELUDE\s*=\s*['"`].*\bwindow\.jQuery\b/)
    })
    test('export const createDefaultEchoAnnoSource 存在', () => {
      expect(annoSrc).toMatch(/export\s+const\s+createDefaultEchoAnnoSource\b/)
    })
  })
})
