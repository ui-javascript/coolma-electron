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

  // 把 jsdom 里的常用构造器整体搬过来，避免逐个 add 漏项
  for (const key of [
    'window', 'document', 'navigator', 'HTMLElement', 'Node', 'Element', 'DocumentFragment',
    'Document', 'Text', 'Comment', 'SVGElement', 'HTMLCollection', 'NodeList',
    'HTMLInputElement', 'HTMLTextAreaElement', 'HTMLImageElement', 'HTMLAnchorElement',
    'HTMLDivElement', 'HTMLSpanElement', 'HTMLTableElement', 'HTMLCanvasElement',
    'DOMParser', 'XMLSerializer', 'MutationObserver', 'Event', 'KeyboardEvent',
    'MouseEvent', 'CustomEvent', 'UIEvent', 'FocusEvent', 'InputEvent', 'ClipboardEvent',
    'Range', 'Selection', 'ShadowRoot', 'CSSStyleDeclaration', 'DOMRect',
  ]) {
    if ((w as Any)[key] !== undefined) {
      define(key, (w as Any)[key]);
    }
  }

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
        '<template><button class="coolma-rune-demo" type="button">{{ value || 0 }}</button></template>' +
        '<script>export default { props: { inheritFromPrevious: { default: true }, value: { default: 0 } } }</script>',
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

  // 6) B5：插件装上之后，占位要被真正渲染成卡片
  const { createEchoPlugin } = (await import('plugins-muya-echo')) as Any;
  const { createRunePlugin } = (await import('plugins-muya-rune')) as Any;

  // anno_source 的 render 必须返回 HTML 字符串；afterRender 拿到的是 host 本身
  const echoSource =
    "export default { type: 'echo', render (props) { return '<span class=\"coolma-echo-demo\">' + (props.value || '空') + '</span>' }, " +
    "afterRender (node, props) { node.setAttribute('data-echo-hooked', props.value || '空'); node.setAttribute('data-echo-id-hooked', props.echoId || ''); " +
    "return () => { node.removeAttribute('data-echo-hooked'); node.removeAttribute('data-echo-id-hooked') } } }";

  const pluginList = [
    createEchoPlugin({ cards: [{ id: 'e1', name: 'demo', anno_source: echoSource }] }),
    createRunePlugin({ cards: [runes[0]] }),
  ];
  const disposers: Array<() => void> = [];
  for (const plugin of pluginList) {
    const dispose = plugin.install({ editor: muya, container });
    if (typeof dispose === 'function') disposers.push(dispose);
  }
  assert('rune/echo 插件安装完成', disposers.length === pluginList.length, `disposers=${disposers.length}`);

  // 引擎会用 getContainer() 换掉传入的容器，真正的根是 #ag-editor-id
  const editorRoot = (): Element => document.querySelector('div#ag-editor-id') ?? container;

  selectOn('@dem', runeItem);
  // 真实链路里输入事件会走 partialRender；harness 直接改块，这里补一次整篇渲染，
  // 让 renderRunes()（符文挂载 + 回响后处理）真正执行。
  muya.contentState.stateRender.renderRunes();
  const runeHost = editorRoot().querySelector('[data-rune-node-id]');
  assert('符文占位落到 DOM', Boolean(runeHost));
  assert('符文卡片已挂载（Vue 渲染）', Boolean(editorRoot().querySelector('.coolma-rune-demo')));

  // 取值回写：卡片改值 → 写回 markdown → 再渲染出新的值
  const runeNodeId = runeHost?.getAttribute('data-rune-node-id') || '';
  const runeWritten = (muya as Any).updateRunePlaceholderValue?.({ nodeId: runeNodeId, value: '7' });
  assert('符文取值回写 markdown', runeWritten === true && /data-rune-value="7"/.test(muya.getMarkdown()), String(runeWritten));
  // 已知缺口（见 docs/P5.md 10.13c）：符文回写走 setMarkdown 之后，div 在重新解析时
  // 会被判成 html 块（figure + 代码预览），不再是可挂载宿主，卡片会消失。
  // 这里只验到"值确实写进 markdown"，DOM 重新挂载记为待修项，不做假通过。
  const runeCardAfterWrite = editorRoot().querySelector('.coolma-rune-demo');
  const hostAfterWrite = editorRoot().querySelector('[data-rune-node-id]');
  assert('符文回写后宿主仍在 DOM', Boolean(hostAfterWrite), `${hostAfterWrite?.tagName}`);
  assert('符文卡片显示新值', (runeCardAfterWrite?.textContent || '').trim() === '7', String(runeCardAfterWrite?.textContent));

  selectOn('@', echoItem);
  // 第一次渲染只负责把行内 token 画成胶囊；第二次才轮到宿主后处理写回自定义 HTML
  muya.contentState.stateRender.renderRunes();
  muya.contentState.stateRender.renderRunes();
  const echoCard = editorRoot().querySelector('.coolma-echo-demo');
  assert('回响卡渲染（anno_source 执行）', Boolean(echoCard), container.innerHTML.slice(0, 120));
  assert('回响卡拿到 value', echoCard?.textContent === '空', String(echoCard?.textContent));

  // afterRender 是 250ms 节流后执行的，这里等一拍再验
  await new Promise((resolve) => setTimeout(resolve, 350));
  const echoHost = editorRoot().querySelector('[data-echo-host="true"]');
  assert('回响 afterRender 已执行', echoHost?.getAttribute('data-echo-hooked') === '空', echoHost?.getAttribute('data-echo-hooked'));
  assert('afterRender 拿到 echoId', Boolean(echoHost?.getAttribute('data-echo-id-hooked')), echoHost?.getAttribute('data-echo-id-hooked'));

  const echoIdInMd = (muya.getMarkdown().match(/echoId:\s*'([^']+)'/) || [])[1] || '';
  const echoWritten = (muya as Any).updateEchoPlaceholderValue?.({ echoId: echoIdInMd, value: '42' });
  assert('回响取值回写 markdown', echoWritten === true && /value:\s*'42'/.test(muya.getMarkdown()), String(echoWritten));
  muya.contentState.stateRender.renderRunes();
  muya.contentState.stateRender.renderRunes();
  assert(
    '回响卡片显示新值',
    (editorRoot().querySelector('.coolma-echo-demo')?.textContent || '').trim() === '42',
    String(editorRoot().querySelector('.coolma-echo-demo')?.textContent)
  );

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
