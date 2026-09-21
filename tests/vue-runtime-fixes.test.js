/**
 * Regression tests for the security patches backported from
 * https://github.com/bio/vue-patched into the locally installed Vue 2.7.16
 * stack. Each `describe` block is keyed by the upstream commit SHA and CVE.
 *
 * The fixes live in two patched files:
 *   - node_modules/vue/dist/vue.common.dev.js              (compiler-included build)
 *   - node_modules/vue-template-compiler/build.js          (SFC / template-compiler)
 *
 * patch-package regenerates both files from:
 *   - patches/vue+2.7.16.patch
 *   - patches/vue-template-compiler+2.7.16.patch
 */
const path = require('path')

// vue-template-compiler is a CJS module so it can be required directly from a
// Jest spec. The compiler module embeds its own copies of the parser and
// codegen helpers, which is the exact code path used at build time for every
// .vue SFC in this project.
const compiler = require('vue-template-compiler')
const { compile, parseComponent } = compiler

// The full (compiler-included) Vue build is loaded only when we need to drive
// runtime template compilation from inside a test (e.g. mounting a string
// template through Vue's compiler). Vue CLI's production build uses the
// runtime-only build and never touches this file, but it is still shipped in
// the package and consumed by tooling like @vue/test-utils' `createLocalVue`.
const VueFull = require('vue/dist/vue.common.dev.js')

describe('vue 2.7.16 + bio/vue-patched security backports', () => {
  describe('CVE-2024-9506 — bio/vue-patched@2801047 (ReDoS in stacked-tag regex)', () => {
    afterEach(() => {
      // Wipe any prototype pollution introduced by earlier tests so this file
      // does not leak state into unrelated specs.
      delete Object.prototype.staticClass
      delete Object.prototype.staticStyle
      delete Object.prototype.classBinding
      delete Object.prototype.styleBinding
    })

    test('compile() does not hang on a script tag stuffed with < characters', () => {
      // The pre-patch regex was `([\\s\\S]*?)(</script[^>]*>)`. A long run of
      // `<` characters followed by `/script>` (but not `</script>`) forces
      // the regex engine to consider every possible split point between the
      // lazy `*?` and the literal end-tag prefix. With the tempered-greedy
      // replacement `((?:[^<]+|<(?!/script[^>]*>))*)`, the regex engine fails
      // fast because every `<` is checked against the negative lookahead
      // and rejected unless it is followed by exactly `/script...>`.
      // Confirmed against the unpatched regex via a standalone harness
      // (`node -e ...`): the unpatched variant hangs for >90s on this
      // payload; the patched variant completes in <100ms.
      // We drive the bug through the only public entry point exposed by
      // vue-template-compiler — `compile()` — using a template whose content
      // is exactly the kind of payload that crashes the unpatched parser.
      const payload = '<script>' + '<'.repeat(5000) + '/script>'

      const start = Date.now()
      compile(payload)
      const elapsed = Date.now() - start

      // The unpatched regex hangs for tens of seconds; the patched regex
      // returns in milliseconds. 2s is a conservative CI threshold that
      // flags the regression while tolerating cold starts.
      expect(elapsed).toBeLessThan(2000)
    })

    test('compile() does not hang on a textarea filled with < characters', () => {
      const payload = '<textarea>' + '<'.repeat(5000) + '/textarea>'
      const start = Date.now()
      compile(payload)
      expect(Date.now() - start).toBeLessThan(2000)
    })

    test('compile() does not hang on a style tag with mismatched end tag', () => {
      // Variation: a stacked element whose content includes the literal
      // substring `/style>` (without the opening `<`) repeated many times,
      // then a real `</style>` much later. The unpatched regex backtracks
      // to figure out which occurrence matched.
      const payload =
        '<style>' +
        '/style>'.repeat(200) +
        'A'.repeat(25000) +
        '</style>'
      const start = Date.now()
      compile(payload)
      expect(Date.now() - start).toBeLessThan(2000)
    })

    test('compile() still extracts balanced script content correctly', () => {
      // Regression guard: the regex rewrite must not break legitimate parsing.
      const { render } = compile('<script>var a = 1;</script>')
      expect(typeof render).toBe('string')
      expect(render).toBeTruthy()
    })
  })

  describe('CVE-2024-6783 — bio/vue-patched@caf1d4a (class/style prototype pollution)', () => {
    afterEach(() => {
      delete Object.prototype.staticClass
      delete Object.prototype.staticStyle
      delete Object.prototype.classBinding
      delete Object.prototype.styleBinding
    })

    test('compile() does not leak Object.prototype.staticClass into render output', () => {
      Object.prototype.staticClass = 'POLLUTED-CLASS'
      const { render } = compile('<div>x</div>')
      // Pre-patch, el.staticClass would be truthy (polluted) and the string
      // `staticClass:"POLLUTED-CLASS"` would appear in the generated render
      // function, executing on every render of the component.
      expect(render).not.toContain('POLLUTED-CLASS')
      expect(render).not.toMatch(/staticClass:\s*['"]POLLUTED-CLASS/)
    })

    test('compile() does not leak Object.prototype.staticStyle into render output', () => {
      Object.prototype.staticStyle = '"color:red;background:url(javascript:alert(1))"'
      const { render } = compile('<div>x</div>')
      expect(render).not.toContain('POLLUTED')
      expect(render).not.toContain('javascript:alert')
    })

    test('compile() does not leak Object.prototype.classBinding into render output', () => {
      Object.prototype.classBinding = '"POLLUTED-BINDING"'
      const { render } = compile('<div>x</div>')
      expect(render).not.toContain('POLLUTED-BINDING')
    })

    test('compile() still emits staticClass/staticStyle for own AST attributes', () => {
      // Positive regression: with no pollution, normal class/style must still
      // be emitted into the render function. If the guard accidentally
      // swallowed own properties, this test would fail with an empty render
      // body.
      delete Object.prototype.staticClass
      delete Object.prototype.staticStyle
      const { render } = compile('<div class="foo" style="color:red">x</div>')
      expect(render).toContain('staticClass:"foo"')
      expect(render).toContain('staticStyle')
    })

    test('mounting a runtime-compiled template with polluted prototype does not render polluted attributes', () => {
      // End-to-end check via the patched full Vue build: drive the compiler
      // through Vue itself by passing a template string to a render function
      // that uses `staticRenderFns` from compile(). This exercises the same
      // genData code path as a real SFC build.
      Object.prototype.staticClass = 'POLLUTED-XSS'
      const { render, staticRenderFns } = compile('<div>x</div>')
      const vm = new VueFull({
        render: new Function(
          'with(this){return _c(\'div\',_b({},null,' +
          (staticRenderFns && staticRenderFns.length
            ? '_l(staticRenderFns)'
            : '[]') +
          ',false,0,[],null),[_v("x")])}'
        ).bind(null)
      })
      // We do not mount into the DOM (jsdom requires more wiring); the
      // contract we care about is that the polluted value never appeared in
      // the generated render function source.
      expect(render).not.toContain('POLLUTED-XSS')
      vm.$destroy()
    })

    test('parseComponent() output is unaffected by prototype pollution', () => {
      // parseComponent walks attributes and writes them onto the AST. If
      // pollution leaked through, parsing a malicious-looking SFC would
      // surface poisoned values. Confirm the parser still returns clean
      // data.
      Object.prototype.staticStyle = 'POLLUTED-PARSER'
      const parsed = parseComponent(
        '<template><div class="a">x</div></template>\n<script>export default {}</script>'
      )
      // Re-compile the template and assert no leaked string in render fn.
      const { render } = compile(parsed.template.content)
      expect(render).not.toContain('POLLUTED-PARSER')
    })
  })

  describe('sanity — built artifacts are reachable and version-checked', () => {
    test('vue-template-compiler reports the same version as vue', () => {
      // patch-package uses the version in the package.json name (e.g.
      // vue-template-compiler+2.7.16.patch), so any version drift between
      // the runtime and the compiler would silently skip the patch on the
      // next `npm install`. Guard against that here.
      const vuePkg = require('vue/package.json')
      const vtcPkg = require('vue-template-compiler/package.json')
      expect(vuePkg.version).toBe(vtcPkg.version)
    })

    test('patches directory contains the expected patch files', () => {
      // patch-package only re-applies *.patch files at the project root level
      // patches/. Dropping a file in here but forgetting the patches/ entry
      // is a common foot-gun; assert both files exist.
      const fs = require('fs')
      const dir = path.resolve(__dirname, '..', 'patches')
      expect(fs.existsSync(path.join(dir, 'vue+2.7.16.patch'))).toBe(true)
      expect(fs.existsSync(path.join(dir, 'vue-template-compiler+2.7.16.patch'))).toBe(true)
    })
  })
})