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
  define('getComputedStyle', (el: unknown, pseudo?: string) => (w as Any).getComputedStyle(el, pseudo));
  define('innerWidth', (w as Any).innerWidth);
  define('innerHeight', (w as Any).innerHeight);
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
  const core = (await import('../packages/libs-muya-v3/src/core/index.js')) as Any;
  const Muya = core.default;
  // 与 MuyaEditor 一致：先注册整套 UI 插件，否则 quickInsert 不会实例化
  core.installDefaultUiPlugins();
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

  // 3) 真链路：选中 → 写入段落（用 markdown 造一个真实块，再交给面板）
  /** 造块 + 设置光标（cursorOffset 是引擎判定行内 @ 的唯一依据，真实链路里由 inputCtrl 派发）。 */
  function selectOn(markdown: string, item: Any): string {
    muya.setMarkdown(markdown);
    // 块是嵌套的：顶层 p + 文本 span，面板拿到的 block 是文本块（span）
    const flat: Any[] = [];
    for (const top of muya.contentState.getBlocks()) {
      if (Array.isArray(top.children) && top.children.length && top.type !== 'p') {
        flat.push(...top.children.map((c: Any) => muya.contentState.getBlock(c.key) ?? c));
      } else if (Array.isArray(top.children) && top.children.length) {
        flat.push(...top.children.map((c: Any) => muya.contentState.getBlock(c.key) ?? c));
      } else {
        flat.push(top);
      }
    }
    const block = flat.find((b: Any) => String(b.text ?? '').includes('@')) ?? flat[flat.length - 1];
    qi.block = muya.contentState.getBlock(block.key);
    const blocks = flat;
    const at = String(block.text ?? '').indexOf('@');
    qi.cursorOffset = at >= 0 ? at + 1 : String(block.text ?? '').length;
    qi.selectItem(item);
    // 以序列化 markdown 为准：符文插入后内容在容器块里，读单个 span.text 会漏
    return String(muya.getMarkdown() ?? '');
  }

  const runeItem = renderObj.items[sections[1]][0];
  const runeText = selectOn('@dem', runeItem);
  assert('符文：落成 data-rune 占位', /data-rune-name="counter"/.test(runeText), runeText.slice(0, 90));
  assert(
    '符文：四属性齐',
    ['data-rune-id', 'data-rune-node-id', 'data-rune-value'].every((a) => runeText.includes(a)),
    runeText.slice(0, 90),
  );

  const echoItem = renderObj.items[sections[2]][0];
  const echoText = selectOn('@dem', echoItem);
  assert('回响：落成 @名{echoId,value}()', /@demo\{echoId: '[0-9a-f-]{36}', value: ''\}\(\)/.test(echoText), echoText);

  const noteItem = renderObj.items[sections[0]][0];
  const noteText = selectOn('@', noteItem);
  assert('笔记：落成 [[标题]]', noteText.trim() === '[[周报模板]]', JSON.stringify(noteText));

  // 4) 行内 @：保留前缀
  const inlineText = selectOn('前文 @', noteItem);
  assert('行内触发保留前缀', inlineText.trim() === '前文 [[周报模板]]', JSON.stringify(inlineText));

  // 5) 继承：上一行文本被写进 data-rune-value
  const inheritText = selectOn('上一行的内容\n\n@dem', runeItem);
  assert('符文继承上文', /data-rune-value="上一行的内容"/.test(inheritText), inheritText.slice(0, 120));

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
