/**
 * 插入语义断言（不依赖 Electron / 浏览器）：
 *   node -e "require('esbuild').buildSync({...})" 后 node 跑本文件编译产物
 *
 * 覆盖 libs-rune-core / libs-echo-core 的插入处理器，验证「引擎只留原语、语义在包里」这条边界。
 */
import { createEchoInsertHandler, buildEchoPlaceholderMarkup } from '../../libs-echo-core/src/index';
import { createRuneInsertHandler, readInheritFromTemplate } from '../../libs-rune-core/src/index';
import { markdownFileName, sanitizeFileName } from '../electron/service/export-utils';
import { coolmaUrl, hashImageName, parseCoolmaUrl, resolveDocSegment } from '../electron/service/attachments';
import { stripDataUrlBase64 } from '../electron/service/export-utils';
import { buildPrintDocument, buildSlidesHtml } from '../frontend/src/utils/slides';

type Call = [string, unknown];
const calls: Call[] = [];

function makeContext(over: Record<string, unknown> = {}) {
  return {
    replaceAtTrigger: (text: string) => {
      calls.push(['text', text]);
      return true;
    },
    insertHtmlAtTrigger: (html: string) => {
      calls.push(['html', html]);
      return true;
    },
    getBlockText: () => '@',
    isInlineTrigger: () => false,
    getPreviousLine: () => ({ text: '上一行的内容', isPlainText: true, removeTarget: { key: 'k1' } }),
    removeLine: (target: unknown) => {
      calls.push(['remove', target]);
      return true;
    },
    ...over,
  } as never;
}

const tplInherit =
  '<template><div/></template><script>export default { props: { inheritFromPrevious: { default: true }, value: { default: 0 } } }</script>';
const tplNoInherit =
  '<template><div/></template><script>export default { props: { value: { default: 0 } } }</script>';

let failed = 0;
function assert(name: string, cond: boolean): void {
  if (!cond) failed += 1;
  console.log(`${cond ? 'OK  ' : 'FAIL'} ${name}`);
}

assert('模板解析 inheritFromPrevious=true', readInheritFromTemplate(tplInherit) === true);
assert('模板未声明 → undefined', readInheritFromTemplate(tplNoInherit) === undefined);

const runeHandler = createRuneInsertHandler();

calls.length = 0;
runeHandler({ meta: { runeName: 'counter', insertContent: tplInherit } }, makeContext());
const html = calls.find((c) => c[0] === 'html')?.[1] as string;
assert('符文继承上一行文本', /data-rune-value="上一行的内容"/.test(html));
assert('符文行首继承后删掉上一行', calls.some((c) => c[0] === 'remove'));
assert(
  '符文占位四属性齐',
  ['data-rune-name', 'data-rune-id', 'data-rune-node-id', 'data-rune-value'].every((a) => html.includes(a)),
);

calls.length = 0;
runeHandler({ meta: { runeName: 'counter', insertContent: tplNoInherit } }, makeContext());
const html2 = calls.find((c) => c[0] === 'html')?.[1] as string;
assert('未声明继承 → value 为空', html2.includes('data-rune-value=""'));
assert('未声明继承 → 不删上一行', !calls.some((c) => c[0] === 'remove'));

calls.length = 0;
runeHandler(
  { meta: { runeName: 'counter', insertContent: tplInherit } },
  makeContext({ isInlineTrigger: () => true, getBlockText: () => '前文 @' }),
);
assert('行内插入不删上一行', !calls.some((c) => c[0] === 'remove'));
assert('行内插入仍带继承值', /data-rune-value="上一行的内容"/.test(calls.find((c) => c[0] === 'html')?.[1] as string));

assert('符文空名 → false', runeHandler({ meta: {} }, makeContext()) === false);

const echoHandler = createEchoInsertHandler();

calls.length = 0;
echoHandler({ meta: { echoName: 'demo' } }, makeContext());
const echoText = calls.find((c) => c[0] === 'text')?.[1] as string;
assert('回响占位格式正确', /^@demo\{echoId: '[0-9a-f-]+', value: '上一行的内容'\}\(\)/.test(echoText));
assert('回响空名 → false', echoHandler({ meta: {} }, makeContext()) === false);
assert('回响转义单引号', buildEchoPlaceholderMarkup({ name: 'x', value: "含'引号" }).includes("\\'"));

// ===== 导出文件名清洗（纯函数，不需要 Electron）=====
{
  assert('导出文件名：非法字符替换', sanitizeFileName('a/b:c*?"<>|') === 'a_b_c______', sanitizeFileName('a/b:c*?"<>|'));
  assert('导出文件名：空标题兜底', sanitizeFileName('   ') === 'Untitled', sanitizeFileName('   '));
  assert('导出文件名：后缀为 .md', markdownFileName('周报') === '周报.md', markdownFileName('周报'));
}

// ===== 附件路径与协议解析（纯函数）=====
{
  assert('附件：同一图片名稳定', hashImageName(Buffer.from('abc')) === hashImageName(Buffer.from('abc')));
  assert('附件：不同内容不同名', hashImageName(Buffer.from('abc')) !== hashImageName(Buffer.from('abd')));
  assert('附件：本地笔记目录兜底', resolveDocSegment('local_123', 7) === 'local_123', resolveDocSegment('local_123', 7));
  assert('附件：无 docGuid 用 noteId', resolveDocSegment(null, 7) === 'note-7', resolveDocSegment(null, 7));
  assert('附件：协议地址形态', coolmaUrl('kb1', 'doc1', 'a.png') === 'coolma://coolma.app/kb1/doc1/a.png', coolmaUrl('kb1', 'doc1', 'a.png'));
  assert('附件：协议解析三段', JSON.stringify(parseCoolmaUrl('coolma://coolma.app/kb1/doc1/a.png')) === JSON.stringify({ kbGuid: 'kb1', docGuid: 'doc1', name: 'a.png' }));
  assert('附件：拒绝路径穿越', parseCoolmaUrl('coolma://coolma.app/kb1/../../etc/passwd') === null);
  assert('附件：段数不对返回 null', parseCoolmaUrl('coolma://coolma.app/kb1/a.png') === null);
}

// ===== PNG 导出：dataURL 剥离 =====
{
  const url = 'data:image/png;base64,' + Buffer.from('png-bytes').toString('base64');
  assert('PNG：剥出 base64 主体', Buffer.from(stripDataUrlBase64(url), 'base64').toString() === 'png-bytes');
  assert('PNG：无前缀原样返回', stripDataUrlBase64('abc') === 'abc');
}

// ===== 演示稿切片（对齐 vue2 previewPptDialog）=====
{
  const manual = buildSlidesHtml({ markdown: '# A\n\n---\n\n# B', splitMode: 'manual', emptyTitle: '空', emptyHint: '提示' });
  assert('导图/演示：--- 切页数正确', (manual.match(/<section data-markdown>/g) || []).length === 2, String((manual.match(/<section data-markdown>/g) || []).length));
  const vertical = buildSlidesHtml({ markdown: '# A\n\n--\n\n# B\n\n---\n\n# C', splitMode: 'manual', emptyTitle: '空', emptyHint: '提示' });
  assert('导图/演示：-- 生成纵向分组', /<section>\s*<section data-markdown>/.test(vertical), vertical.slice(0, 90));
  const auto = buildSlidesHtml({ markdown: '# A\ntext\n## B\nmore', splitMode: 'auto', emptyTitle: '空', emptyHint: '提示' });
  assert('导图/演示：按标题切页为 2 页', (auto.match(/<section data-markdown>/g) || []).length === 2, String((auto.match(/<section data-markdown>/g) || []).length));
  const empty = buildSlidesHtml({ markdown: '   ', splitMode: 'manual', emptyTitle: '空标题', emptyHint: '空提示' });
  assert('导图/演示：空内容给占位页', empty.includes('空标题') && empty.includes('空提示'));
  const doc = buildPrintDocument({ slidesHtml: '<section>x</section>', title: '预览<&>', mode: 'pdf' });
  assert('导图/演示：导出文档含 print-pdf 样式', doc.includes('print-pdf/print-pdf.css'));
  // 与引擎 escapeHtml 保持同一套规则：只转 < > " '，不转 &
  assert('导图/演示：导出文档标题已转义', doc.includes('预览&lt;&&gt;'), doc.match(/<title>.*<\/title>/)?.[0] || '');
  assert('导图/演示：native 模式含 window.print', buildPrintDocument({ slidesHtml: '', title: 't', mode: 'native' }).includes('window.print()'));
}

console.log(failed === 0 ? '\n全部通过' : `\n失败 ${failed} 项`);
if (failed > 0) {
  process.exitCode = 1;
}
