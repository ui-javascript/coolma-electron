/**
 * 插入语义断言（不依赖 Electron / 浏览器）：
 *   node -e "require('esbuild').buildSync({...})" 后 node 跑本文件编译产物
 *
 * 覆盖 rune-core / echo-core 的插入处理器，验证「引擎只留原语、语义在包里」这条边界。
 */
import { createEchoInsertHandler, buildEchoPlaceholderMarkup } from '../../echo-core/src/index';
import { createRuneInsertHandler, readInheritFromTemplate } from '../../rune-core/src/index';
import { markdownFileName, sanitizeFileName } from '../electron/service/export-utils';

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

console.log(failed === 0 ? '\n全部通过' : `\n失败 ${failed} 项`);
if (failed > 0) {
  process.exitCode = 1;
}
