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

test('scss mixin：@include 展开为真实声明，带默认参数与关键字参数', () => {
  const css = [
    '@mixin shadow($c: #000, $blur: 2px) { box-shadow: 0 0 $blur $c; }',
    '.a { @include shadow($blur: 4px); }',
    '.b { @include shadow(#0f0, 6px); }',
  ].join('\n');
  const out = preprocessRuneStyle(css, 'scss');
  assert.ok(out.includes('box-shadow: 0 0 4px #000;'), out);
  assert.ok(out.includes('box-shadow: 0 0 6px #0f0;'), out);
  assert.ok(!out.includes('@include'), out);
  assert.ok(!out.includes('@mixin'), out);
});

test('scss mixin：body 里的嵌套选择器与 & 会被拍平', () => {
  const css = '@mixin hover { &:hover { opacity: .8; } }\n.btn { @include hover; }';
  const out = preprocessRuneStyle(css, 'scss');
  assert.ok(out.includes('.btn:hover { opacity: .8; }'), out);
});

test('scss @extend：同文件选择器合并，含 %placeholder', () => {
  const css = [
    '%base { color: red; }',
    '.a { @extend %base; }',
    '.b { @extend %base; font-weight: bold; }',
  ].join('\n');
  const out = preprocessRuneStyle(css, 'scss');
  assert.ok(out.includes('.a, .b { color: red; }'), out);
  assert.ok(out.includes('.b { font-weight: bold; }'), out);
  assert.ok(!out.includes('%base'), out);
});

test('scss 插值：#{} 用变量值拼接选择器', () => {
  const out = preprocessRuneStyle('$name: teal;\n.rune-#{$name} { color: $name; }', 'scss');
  assert.ok(out.includes('.rune-teal { color: teal; }'), out);
});

test('scss 颜色函数：darken/lighten/rgba/mix 真正求值', () => {
  const out = preprocessRuneStyle([
    '.a { color: darken(#ff0000, 20%); }',
    '.b { color: lighten(#000000, 50%); }',
    '.c { background: rgba(#ffffff, .5); }',
    '.d { background: mix(#000, #fff, 40%); }',
  ].join('\n'), 'scss');
  assert.ok(out.includes('color: #990000;'), out);
  assert.ok(out.includes('color: #808080;'), out);
  assert.ok(out.includes('background: rgba(255, 255, 255, 0.5);'), out);
  assert.ok(out.includes('background: #999999;'), out);
});

test('scss 嵌套：没有高级语法时保持原样，交给原生 CSS Nesting', () => {
  const css = '.a { color: red; .b { color: blue; } }';
  assert.equal(preprocessRuneStyle(css, 'scss'), css);
});

test('scss 不支持的 @function：告警并原样保留，不静默丢样式', () => {
  const original = console.warn;
  const messages: string[] = [];
  console.warn = ((...args: unknown[]) => { messages.push(String(args[0])); return original(...args); }) as typeof console.warn;
  try {
    const out = preprocessRuneStyle('@function f($x) { @return $x; }\n.a { width: f(3px); }', 'scss');
    assert.ok(out.includes('@function'), out);
    assert.ok(messages.some((m) => m.includes('暂不支持')), messages.join('\n'));
  } finally {
    console.warn = original;
  }
});

test('less 的高级 mixin：告警并按原样注入', () => {
  const original = console.warn;
  let warned = false;
  console.warn = ((...args: unknown[]) => { warned = true; return original(...args); }) as typeof console.warn;
  try {
    const out = preprocessRuneStyle('@mixin shadow { box-shadow: 0 0 2px #000; }\n.a { @include shadow; }', 'less');
    assert.ok(out.includes('@include shadow'));
    assert.equal(warned, true);
  } finally {
    console.warn = original;
  }
});

test('空样式返回空串', () => {
  assert.equal(preprocessRuneStyle('   ', 'scss'), '');
});
