/**
 * 最小运行验证（无 Electron）：jsdom + 真引擎，走一遍面板选中链路。
 *
 *   node -e "esbuild.buildSync(...)" 见 docs/P5.md 的命令；
 *   运行前设 NODE_PATH=/tmp/jsd/node_modules（jsdom 装在那里，避免污染工程依赖）。
 *
 * 验证的是引擎真实代码：selectItem → getTypeHandler → 应用侧处理器 → 引擎原语 → 段落写回。
 */
import { JSDOM } from 'jsdom';

type Any = Record<string, any>;

function setupDom(): void {
  const dom = new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>', {
    pretendToBeVisual: true,
    url: 'http://localhost/',
  });
  const w = dom.window as Any & typeof globalThis;
  const g = globalThis as Any;

  // Node 22 里 navigator 等已经是只读 getter，必须 defineProperty 覆盖
  const define = (key: string, value: unknown): void => {
    Object.defineProperty(g, key, { value, writable: true, configurable: true, enumerable: false });
  };

  define('window', w);
  define('document', w.document);
  define('navigator', w.navigator);
  define('HTMLElement', w.HTMLElement);
  define('Node', w.Node);
  define('Element', w.Element);
  define('DocumentFragment', w.DocumentFragment);
  define('DOMParser', w.DOMParser);
  define('XMLSerializer', w.XMLSerializer);
  define('getSelection', () => w.getSelection());
  define('MutationObserver', w.MutationObserver);
  define('Event', w.Event);
  define('KeyboardEvent', w.KeyboardEvent);
  define('MouseEvent', w.MouseEvent);
  define('CustomEvent', w.CustomEvent);
  define('requestAnimationFrame', (cb: FrameRequestCallback) => setTimeout(() => cb(Date.now()), 16) as unknown as number);
  define('cancelAnimationFrame', (id: number) => clearTimeout(id));
  define('btoa', (s: string) => Buffer.from(s, 'binary').toString('base64'));
  define('atob', (s: string) => Buffer.from(s, 'base64').toString('binary'));

  // jsdom 不实现的两个观察器，给个空壳够用
  define(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  define(
    'IntersectionObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
      takeRecords() {
        return [];
      }
    },
  );
}

let failed = 0;
function assert(name: string, cond: boolean, detail = ''): void {
  if (!cond) failed += 1;
  console.log(`${cond ? 'OK  ' : 'FAIL'} ${name}${cond || !detail ? '' : ` → ${detail}`}`);
}

async function main(): Promise<void> {
  setupDom();
  const { default: Muya } = (await import('../packages/libs-muya-v3/src/core/index.js')) as Any;
  const { createQuickInsertProvider } = (await import('../frontend/src/editor/quickInsert')) as Any;
  const { quickInsertTypes } = (await import('../frontend/src/editor/insertHandlers')) as Any;

  const container = document.createElement('div');
  document.body.appendChild(container);

  const runes = [
    {
      id: 'r1',
      name: 'counter',
      template:
        '<template><div/></template><script>export default { props: { inheritFromPrevious: { default: true }, value: { default: 0 } } }</script>',
    },
  ];
  const echoes = [{ id: 'e1', name: 'demo', anno_source: 'export default {}' }];
  const notes = [{ id: 7, title: '周报模板', excerpt: '本周进展', category: '/工作' }];

  const provider = createQuickInsertProvider(() => ({ runes, echoes, notes }) as never, (key: string) => key);

  const muya = new Muya(container, {
    markdown: '',
    quickInsertProvider: provider,
    quickInsertTypes,
  });
  const qi = muya.quickInsert;
  assert('引擎实例化 + 面板对象就绪', Boolean(qi && qi.getTypeHandler));

  // 1) provider 分组（应用侧数据源）
  const renderObj = provider({ muya, block: null });
  const sections = Object.keys(renderObj.items);
  assert('面板三组：笔记/符文/回响', sections.length === 3, sections.join(','));
  assert('笔记分组有内容', renderObj.items[sections[0]]?.length === 1);
  assert('符文分组走 rune-core', renderObj.items[sections[1]]?.[0]?.meta?.type === 'rune');
  assert('回响分组走 echo-core', renderObj.items[sections[2]]?.[0]?.meta?.type === 'echo');

  // 2) 注册表分派：引擎不再内置 rune/echo
  assert('rune 走应用侧处理器', qi.getTypeHandler('rune') === quickInsertTypes.rune);
  assert('echo 走应用侧处理器', qi.getTypeHandler('echo') === quickInsertTypes.echo);
  assert('未注册类型无处理器', qi.getTypeHandler('codeblock') === null);
  assert('空类型无处理器', qi.getTypeHandler(undefined) === null);

  // 3) 真链路：选中 → 写入段落
  function selectInFreshBlock(item: Any): string {
    const block = muya.contentState.addBlock({ text: '@dem', type: 'paragraph' });
    qi.block = muya.contentState.getBlock(block.key);
    qi.selectItem(item);
    return String(muya.contentState.getBlock(block.key)?.text ?? '');
  }

  const runeItem = renderObj.items[sections[1]][0];
  const runeText = selectInFreshBlock(runeItem);
  assert('符文：落成 data-rune 占位', /data-rune-name="counter"/.test(runeText), runeText.slice(0, 80));
  assert('符文：四属性齐', ['data-rune-id', 'data-rune-node-id', 'data-rune-value'].every((a) => runeText.includes(a)));

  const echoItem = renderObj.items[sections[2]][0];
  const echoText = selectInFreshBlock(echoItem);
  assert('回响：落成 @名{echoId,value}()', /^@demo\{echoId: '[0-9a-f-]{36}', value: ''\}\(\)$/.test(echoText), echoText);

  const noteItem = renderObj.items[sections[0]][0];
  const noteText = selectInFreshBlock(noteItem);
  assert('笔记：落成 [[标题]]', noteText === '[[周报模板]]', noteText);

  // 4) 行内 @：保留前缀
  const inlineBlock = muya.contentState.addBlock({ text: '前文 @', type: 'paragraph' });
  qi.block = muya.contentState.getBlock(inlineBlock.key);
  qi.selectItem(noteItem);
  const inlineText = String(muya.contentState.getBlock(inlineBlock.key)?.text ?? '');
  assert('行内触发保留前缀', inlineText === '前文 [[周报模板]]', inlineText);

  console.log(failed === 0 ? '\n全部通过' : `\n失败 ${failed} 项`);
  if (failed > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error('FAIL 运行异常:', error?.message || error);
  if (error?.stack) console.error(String(error.stack).split('\n').slice(0, 6).join('\n'));
  process.exitCode = 1;
});
