import test from 'node:test';
import assert from 'node:assert/strict';
import { preprocessRuneStyle, readStyleLang } from '../../../libs-muya-rune-vue3/src/runeStyle';

test('style lang：能读单双引号与无引号三种写法', () => {
  assert.equal(readStyleLang(' lang="scss" scoped'), 'scss');
  assert.equal(readStyleLang("lang='less'"), 'less');
  assert.equal(readStyleLang('lang=sass'), 'sass');
  assert.equal(readStyleLang(' scoped'), '');
});

test('无 lang 的普通 CSS 原样返回（不误伤 $、// 之类字面量）', () => {
  const css = '.a { color: #f00; }  // 不是注释';
  assert.equal(preprocessRuneStyle(css, ''), css);
});

test('scss：变量声明被摘掉，引用处替换为值', () => {
  const css = '$primary: #f00;\n.a { color: $primary; border: 1px solid $primary; }';
  const out = preprocessRuneStyle(css, 'scss');
  assert.ok(out.includes('color: #f00'));
  assert.ok(out.includes('border: 1px solid #f00'));
  assert.ok(!out.includes('$primary'));
  assert.ok(!out.includes('$primary: #f00;'));
});

test('less：@ 变量同样生效，且 !default 会被去掉', () => {
  const out = preprocessRuneStyle('@c: blue !default;\n.a { color: @c; }', 'less');
  assert.equal(out, '.a { color: blue; }');
});

test('链式变量最多展开 5 轮', () => {
  const out = preprocessRuneStyle('$a: 4px;\n$b: $a;\n.x { margin: $b; }', 'scss');
  assert.equal(out, '.x { margin: 4px; }');
});

test('未声明的变量原样保留，避免静默丢样式', () => {
  const out = preprocessRuneStyle('.a { color: $unknown; }', 'scss');
  assert.ok(out.includes('$unknown'));
});

test('// 注释剥离，但 http(s) 协议与引号内字符串不动', () => {
  const css = [
    "// 顶部注释",
    ".a { background: url(http://a.test/x.png); content: 'a // b'; } // 行尾",
  ].join('\n');
  const out = preprocessRuneStyle(css, 'scss');
  assert.ok(!out.includes('顶部注释'));
  assert.ok(!out.includes('行尾'));
  assert.ok(out.includes('url(http://a.test/x.png)'));
  assert.ok(out.includes("'a // b'"));
});

test('mixin/@extend 不做预处理，原样注入（仅告警）', () => {
  const original = console.warn;
  let warned = false;
  console.warn = ((...args: unknown[]) => { warned = true; return original(...args); }) as typeof console.warn;
  try {
    const out = preprocessRuneStyle('@mixin shadow { box-shadow: 0 0 2px #000; }\n.a { @include shadow; }', 'scss');
    assert.ok(out.includes('@include shadow'));
    assert.equal(warned, true);
  } finally {
    console.warn = original;
  }
});

test('空样式返回空串', () => {
  assert.equal(preprocessRuneStyle('   ', 'scss'), '');
});
