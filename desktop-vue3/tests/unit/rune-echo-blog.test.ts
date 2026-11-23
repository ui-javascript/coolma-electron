import assert from 'node:assert/strict';
import test from 'node:test';
import { transformRuneEcho } from '../../electron/service/blog/runeEcho';
import type { EchoCard, RuneCard } from '../../electron/shared/types/domain';

const runeCard: RuneCard = {
  id: 'r1',
  name: '计算器',
  desc: '算一下',
  color: '#3b82f6',
  icon: '🧮',
  template: '<template><div /></template>',
  category: 'builtin',
  sortOrder: 1,
  inheritFromPrevious: 0,
};

const echoCard: EchoCard = {
  id: 'e1',
  name: 'lucky',
  desc: '强运',
  color: '#f59e0b',
  icon: '🍀',
  annoSource: '@lucky{p:1}(note:abc)',
  renderType: 'card',
  category: 'builtin',
  sortOrder: 1,
};

const catalog = { runes: [runeCard], echoes: [echoCard] };

test('符文：div 占位改写成 ag-rune 卡片并保留 data-* 锚点', () => {
  const md = '<div data-rune-name="计算器" data-rune-id="r1" data-rune-node-id="n1" data-rune-value="1+1">1+1</div>';
  const { content, stats } = transformRuneEcho(md, catalog);
  assert.equal(stats.runes, 1);
  assert.match(content, /class="ag-rune ag-rune--/);
  assert.match(content, /data-rune-name="计算器"/);
  assert.match(content, /data-rune-id="r1"/);
  assert.match(content, /data-rune-node-id="n1"/);
  assert.match(content, /data-rune-action="rune-click"/);
  assert.match(content, /🧮/);
  assert.doesNotMatch(content, /<div\b/);
});

test('符文：属性顺序无关且实体转义能还原', () => {
  const md = '<div data-rune-value="a &quot;b&quot;" data-rune-node-id="n2" data-rune-id="r1" data-rune-name="计算器">t</div>';
  const { content, stats } = transformRuneEcho(md, catalog);
  assert.equal(stats.runes, 1);
  assert.match(content, /data-rune-value="a &quot;b&quot;"/);
  assert.match(content, /data-rune-node-id="n2"/);
});

test('回响：目录里有的名字渲染成 ag-echo，未知名字原样保留', () => {
  const md = '前 @lucky{p:1}(note:abc) 后 @unknown{x}(y) 尾';
  const { content, stats } = transformRuneEcho(md, catalog);
  assert.equal(stats.echoes, 1);
  assert.match(content, /class="ag-echo ag-echo--lucky"/);
  assert.match(content, /data-echo-action="echo-click"/);
  assert.match(content, /data-echo-prompt="note:abc"/);
  assert.match(content, /@unknown\{x\}\(y\)/);
});

test('代码块与行内代码里的语法不被渲染', () => {
  const md = [
    '```md',
    '<div data-rune-name="计算器" data-rune-id="r1" data-rune-node-id="n" data-rune-value="v">t</div>',
    '@lucky{p:1}(note:abc)',
    '```',
    '行内 `@lucky{p:1}(note:abc)` 也不动',
    '',
    '@lucky{p:1}(note:abc)',
  ].join('\n');
  const { content, stats } = transformRuneEcho(md, catalog);
  assert.equal(stats.runes, 0, '代码块里的符文占位必须原样保留');
  assert.equal(stats.echoes, 1, '只有代码块外的那一条被渲染');
  assert.match(content, /```md[\s\S]*data-rune-name="计算器"[\s\S]*```/);
  assert.match(content, /`@lucky\{p:1\}\(note:abc\)`/);
});

test('没有符文/回响的正文保持不变', () => {
  const md = '# 标题\n\n普通正文，没有标记。';
  const { content, stats } = transformRuneEcho(md, catalog);
  assert.equal(content, md);
  assert.equal(stats.runes, 0);
  assert.equal(stats.echoes, 0);
});

test('符文正文里的 HTML 会被清掉，避免卡片里嵌标签', () => {
  const md = '<div data-rune-name="计算器" data-rune-id="r1" data-rune-node-id="n" data-rune-value="">  <b>x</b>  </div>';
  const { content } = transformRuneEcho(md, catalog);
  assert.doesNotMatch(content, /<b>x<\/b>/);
  assert.match(content, /ag-rune__value/);
});
