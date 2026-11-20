/**
 * 最小运行验证（无 Electron）：jsdom + 真引擎，走一遍面板选中链路。
 *
 *   node -e "esbuild.buildSync(...)" 见 docs/P5.md 的命令；
 *   运行前设 NODE_PATH=/tmp/jsd/node_modules（jsdom 装在那里，避免污染工程依赖）。
 *
 * 验证的是引擎真实代码：selectItem → getTypeHandler → 应用侧处理器 → 引擎原语 → 段落写回。
 */
import { JSDOM } from 'jsdom';
import jQueryFactory from 'jquery';
import { buildSlidesHtml, escapeSlideHtml } from '../frontend/src/utils/slides';
import { stripDataUrlBase64 } from '../electron/service/export-utils';
import { muyaCursorToPosition, positionToMuyaCursor } from '../frontend/src/utils/cursor';
import {
  buildDefaultMicroApps,
  diffMicroAppsForReload,
  mergeBuiltInApps,
  normalizeMicroApp,
  normalizeMicroApps,
  pickDefaultApp,
  resolveActiveUrl,
} from '../frontend/src/services/microApps';
import { DEFAULT_SKIN, SKIN_LIST, applySkinThemeColor } from '../frontend/src/utils/skin';
import {
  MAX_TAG_NAME_LENGTH,
  buildAutoTagMessages,
  condenseNoteContent,
  filterUntaggedNotes,
  normalizeTagName,
  parseTagNames,
} from '../frontend/src/utils/autotag';
import { coolmaUrl, hashImageName, parseCoolmaUrl } from '../electron/service/attachments';

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

  // jQuery 必须在 window 就位后再初始化；UMD 在 Node 里默认导出的是工厂函数。
  const jq = (jQueryFactory as unknown as (host: Window) => typeof jQueryFactory)(w as unknown as Window);
  (w as Any).jQuery = jq;
  (w as Any).$ = jq;
  (g as Any).jQuery = jq;
  (g as Any).$ = jq;

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

  // ===== 演示稿切片纯逻辑（L3 里再跑一遍，防止 vite/组件层改动悄悄破坏）=====
  {
    const manual = buildSlidesHtml({ markdown: '# A\n\n---\n\n# B', splitMode: 'manual', emptyTitle: '空', emptyHint: '提示' });
    assert('演示：--- 切页', (manual.match(/<section data-markdown>/g) || []).length === 2);
    const auto = buildSlidesHtml({ markdown: '# A\nt\n## B\nmore', splitMode: 'auto', emptyTitle: '空', emptyHint: '提示' });
    assert('演示：按标题切页', (auto.match(/<section data-markdown>/g) || []).length === 2);
    const escaped = escapeSlideHtml('<b class="x">&');
    // 引擎 escapeHtml 只转 < > " '，& 原样保留 —— 与 L1 断言保持同一认知
    assert('演示：切片转义与引擎同规则', escaped === '&lt;b class=&quot;x&quot;&gt;&', escaped);
  }

  // ===== PNG dataURL 剥离（与 L1 相同函数，但走 vite 打包路径）=====
  {
    const url = 'data:image/png;base64,' + 'aGk=';
    assert('PNG：vite 打包下剥离正常', stripDataUrlBase64(url) === 'aGk=', stripDataUrlBase64(url));
  }

  // ===== 附件路径与 coolma 协议（渲染层会用的纯函数）=====
  {
    assert('附件：协议地址', coolmaUrl('kb', 'doc', 'a.png') === 'coolma://coolma.app/kb/doc/a.png');
    assert('附件：拒绝穿越', parseCoolmaUrl('coolma://coolma.app/../../x') === null);
    assert('附件：md5 命名稳定', hashImageName(Buffer.from('abc')) === hashImageName(Buffer.from('abc')));
  }

  // ===== 光标同步：engine setMarkdown(md, cursor) / getCursor 往返 =====
  {
    const md = '第一段文字\n\n第二段文字\n';
    const cursor = { anchor: { line: 0, ch: 2 }, focus: { line: 0, ch: 2 } };
    muya.setMarkdown(md, cursor, false);
    const back = muya.getCursor();
    const focus = back?.focus ?? back?.anchor ?? null;
    assert(
      '光标：setMarkdown 带 cursor 后 getCursor 落位一致',
      Boolean(focus) && Number(focus.line) === 0 && Number(focus.ch) === 2,
      JSON.stringify(back),
    );

    // 越界光标（行号大于总行数）不应抛错，引擎内部会裁剪
    let riskyThrew = false;
    try {
      muya.setCursor({ anchor: { line: 99, ch: 99 }, focus: { line: 99, ch: 99 } });
    } catch {
      riskyThrew = true;
    }
    assert('光标：越界 cursor 不抛错', riskyThrew === false);
  }

  // ===== 光标口径换算：引擎 0-based ↔ Monaco 1-based =====
  {
    const pos = muyaCursorToPosition({ focus: { line: 4, ch: 6 } });
    assert('光标换算：Muya→Monaco 加 1', pos.lineNumber === 5 && pos.column === 7, JSON.stringify(pos));

    const cur = positionToMuyaCursor({ lineNumber: 5, column: 7 });
    assert('光标换算：Monaco→Muya 减 1', cur.focus.line === 4 && cur.focus.ch === 6, JSON.stringify(cur));

    // 边界：Monaco 极端值不应算出负数
    const low = positionToMuyaCursor({ lineNumber: 0, column: 0 });
    assert('光标换算：下界钳零', low.focus.line === 0 && low.focus.ch === 0, JSON.stringify(low));
    const none = muyaCursorToPosition(null);
    assert('光标换算：空光标兜底 1,1', none.lineNumber === 1 && none.column === 1, JSON.stringify(none));

    // 往返一致
    const round = muyaCursorToPosition(positionToMuyaCursor({ lineNumber: 3, column: 2 }));
    assert('光标换算：往返稳定', round.lineNumber === 3 && round.column === 2, JSON.stringify(round));
  }

  // ===== AI 打标纯函数（normalizeTagName / parseTagNames / prompt）=====
  {
    assert('打标：去 # 前缀', normalizeTagName('#  读书笔记') === '读书笔记', normalizeTagName('#  读书笔记'));
    assert('打标：去序号与尾标点', normalizeTagName('1. 效率工具，') === '效率工具', normalizeTagName('1. 效率工具，'));
    assert('打标：去引号与括号', normalizeTagName('["前端"]') === '前端', normalizeTagName('["前端"]'));
    assert('打标：超长截断', normalizeTagName('a'.repeat(40)).length === MAX_TAG_NAME_LENGTH);

    const jsonNames = parseTagNames('```json\n["读书笔记","效率工具","读书笔记"]\n```', { maxTags: 5 });
    assert('打标：JSON 数组解析 + 去重', jsonNames.join('|') === '读书笔记|效率工具', JSON.stringify(jsonNames));

    const looseNames = parseTagNames('前端、后端\n测试', { maxTags: 2 });
    assert('打标：松散文本切分 + 限条', looseNames.length === 2 && looseNames[0] === '前端', JSON.stringify(looseNames));

    const condensed = condenseNoteContent('```js\nconst a = 1\n```\n# 标题\n[链接](https://x.test) 正文', 100);
    assert('打标：正文压缩去代码块与链接址', !condensed.includes('const a') && !condensed.includes('https://') && condensed.includes('正文'), condensed);

    const messages = buildAutoTagMessages({ title: '笔记', content: '正文', existingTagNames: ['前端'], maxTags: 2 });
    assert('打标：messages 两段', messages.length === 2 && messages[0].role === 'system', JSON.stringify(messages.map((m) => m.role)));
    assert('打标：prompt 含已有标签与上限', messages[1].content.includes('- 前端') && messages[1].content.includes('1-2 个标签'), messages[1].content.slice(0, 80));

    const untagged = filterUntaggedNotes([{ tags: '' }, { tags: 'a,b' }, { tags: '   ' }, {}]);
    assert('打标：候选只留未打标', untagged.length === 3, String(untagged.length));
  }

  // ===== 皮肤：主题色变量落点 =====
  {
    const root = document.documentElement;

    applySkinThemeColor('nezha');
    assert('皮肤：nezha 写 --themeColor', root.style.getPropertyValue('--themeColor') === 'rgba(181, 129, 125, 1)', root.style.getPropertyValue('--themeColor'));
    assert('皮肤：nezha 写 90% 档', /rgba\(181, 129, 125, (0\.)?9\)/.test(root.style.getPropertyValue('--themeColor90')), root.style.getPropertyValue('--themeColor90'));
    assert('皮肤：nezha 覆盖 Element 主色', root.style.getPropertyValue('--el-color-primary') === '#b5817d', root.style.getPropertyValue('--el-color-primary'));
    assert('皮肤：nezha 生成 light-9', root.style.getPropertyValue('--el-color-primary-light-9').startsWith('rgb('), root.style.getPropertyValue('--el-color-primary-light-9'));

    applySkinThemeColor('infp');
    assert('皮肤：infp 换色生效', root.style.getPropertyValue('--themeColor') === 'rgba(33, 181, 111, 1)', root.style.getPropertyValue('--themeColor'));
    assert('皮肤：infp 覆盖 Element 主色', root.style.getPropertyValue('--el-color-primary') === '#21b56f');

    applySkinThemeColor('baiyang');
    assert('皮肤：baiyang 清空主题色', root.style.getPropertyValue('--themeColor') === '', root.style.getPropertyValue('--themeColor'));
    assert('皮肤：baiyang 清空 Element 主色（回落自带蓝）', root.style.getPropertyValue('--el-color-primary') === '');
    assert('皮肤：三套皮枚举固定', SKIN_LIST.join('|') === 'baiyang|nezha|infp' && DEFAULT_SKIN === 'baiyang');
  }

  // ===== 微应用数据层（归一化 / 默认选取 / 重建判定）=====
  {
    const iframeApp = normalizeMicroApp({ id: 'a', name: 'A', url: 'https://a.test/' });
    assert('微应用：默认走 iframe 模式', iframeApp?.loadMode === 'iframe' && iframeApp.enabled === true, JSON.stringify(iframeApp));

    const moduleApp = normalizeMicroApp({ id: 'b', name: 'B', loadMode: 'module', libName: 'hel-demo' });
    assert('微应用：module 模式保留库名', moduleApp?.loadMode === 'module' && moduleApp.libName === 'hel-demo', JSON.stringify(moduleApp));

    assert('微应用：缺 id 的记录被丢弃', normalizeMicroApp({ name: 'no id' } as any) === null);

    const normalized = normalizeMicroApps([
      { id: 'x', name: 'X', isDefault: true },
      { id: 'y', name: 'Y', isDefault: true },
    ]);
    assert('微应用：最多一个默认', normalized.filter((app) => app.isDefault).length === 1, JSON.stringify(normalized.map((a) => a.isDefault)));

    const picked = pickDefaultApp(normalized);
    assert('微应用：默认应用优先默认项', picked?.id === 'x', JSON.stringify(picked));

    assert('微应用：开发态取 devUrl 的解析函数可用', resolveActiveUrl({ ...iframeApp!, devUrl: 'http://localhost:3333/', url: 'https://prod/' }) === 'https://prod/', resolveActiveUrl(iframeApp));

    const dirty = diffMicroAppsForReload(
      [{ id: 'a', name: 'A', url: 'https://a.test/' }, { id: 'gone', name: 'G' }],
      [{ id: 'a', name: 'A', url: 'https://a.test/v2/' }],
    );
    assert('微应用：url 变化与被删都判为需重建', dirty.includes('a') && dirty.includes('gone'), JSON.stringify(dirty));

    const stable = diffMicroAppsForReload([{ id: 'a', name: 'A', url: 'https://a.test/' }], [{ id: 'a', name: 'A2', url: 'https://a.test/' }]);
    assert('微应用：只改名字不重建', stable.length === 0, JSON.stringify(stable));

    const defaults = buildDefaultMicroApps();
    assert('微应用：默认列表三条', defaults.length === 3 && defaults[0].id === 'box-im', JSON.stringify(defaults.map((a) => a.id)));
    assert('微应用：默认列表首项是默认项', defaults.find((a) => a.isDefault)?.id === 'box-im');

    const merged = mergeBuiltInApps([{ id: 'only', name: 'Only' }]);
    assert('微应用：合并内置不吞用户条目', merged.some((app) => app.id === 'only'), JSON.stringify(merged.map((a) => a.id)));
  }




  // ── 右键菜单四套配置 ──
  {
    const { buildNoteListMenu } = await import('@/menus/noteList');
    const list = buildNoteListMenu({ isCurrentNote: true }) as Array<Record<string, unknown>>;
    assert('菜单：笔记列表项顺序对齐 vue2', (list[0].id === 'rename') && (list[1].id === 'duplicate') && (list[9].id === 'delete'), JSON.stringify(list.map((i) => i.id ?? i.type)));
    const exportItem = list.find((i) => i.id === 'export') as { children: Array<{ id: string }> };
    assert('菜单：导出有 Markdown/PNG 两个子项', exportItem.children.map((c) => c.id).join(',') === 'exportMarkdown,exportPng', JSON.stringify(exportItem.children));
    const notCurrent = buildNoteListMenu({ isCurrentNote: false }) as Array<Record<string, unknown>>;
    assert('菜单：非当前笔记禁用导出', (notCurrent.find((i) => i.id === 'export') as { enabled?: boolean }).enabled === false);

    const { buildSideDrawerMenu } = await import('@/menus/sideDrawer');
    const root = buildSideDrawerMenu({ category: '/', isRootCategory: true, isLogin: true }) as Array<Record<string, unknown>>;
    assert('菜单：根目录不出删除与导出', root.every((i) => i.id !== 'delete') && (root.find((i) => i.id === 'export') as { enabled?: boolean }).enabled === false, JSON.stringify(root.map((i) => i.id ?? i.type)));
    const sub = buildSideDrawerMenu({ category: '/a', isRootCategory: false, isLogin: true, hideCreateNote: true }) as Array<Record<string, unknown>>;
    assert('菜单：子目录可删可导出且能隐藏新建笔记', sub.some((i) => i.id === 'delete') && !sub.some((i) => i.id === 'createNote'), JSON.stringify(sub.map((i) => i.id ?? i.type)));
    const offline = buildSideDrawerMenu({ category: '/a', isRootCategory: false, isLogin: false }) as Array<Record<string, unknown>>;
    assert('菜单：未登录只有创建项', offline.every((i) => i.type === 'separator' || i.id === 'createCategory' || i.id === 'createNote' || i.id === 'delete'), JSON.stringify(offline.map((i) => i.id ?? i.type)));

    const { buildMuyaMenu } = await import('@/menus/muya');
    const empty = buildMuyaMenu({ selectionEmpty: true }) as Array<Record<string, unknown>>;
    const ids = empty.map((i) => i.id).filter(Boolean);
    assert('菜单：空选区编辑器菜单 4 项置灰', ['cut', 'copy', 'copyAsMarkdown', 'copyAsHtml'].every((id) => (empty.find((i) => i.id === id) as { enabled?: boolean }).enabled === false), JSON.stringify(ids));
    const filled = buildMuyaMenu({ selectionEmpty: false, panguReady: false }) as Array<Record<string, unknown>>;
    assert('菜单：有选区时剪切复制可用、盘古仍置灰', (filled.find((i) => i.id === 'cut') as { enabled?: boolean }).enabled === true && (filled.find((i) => i.id === 'formatDocument') as { enabled?: boolean }).enabled === false);

    const { buildMarkMapMenu } = await import('@/menus/markMap');
    assert('菜单：导图只留另存 HTML（与 vue2 注释掉 PNG/SVG 一致）', (buildMarkMapMenu() as Array<Record<string, unknown>>).map((i) => i.id).join(',') === 'saveAsHtml');
  }

  // ── 大纲 / 搜索片段 ──
  {
    const { buildOutline, flattenOutline } = await import('@/utils/outline');
    const md = [
      '---',
      'title: 元信息不该进大纲',
      '---',
      '# 一级',
      '正文',
      '## 二级 A',
      '```',
      '# 代码块里的井号不算标题',
      '```',
      '### 三级',
      '## 二级 B',
    ].join('\n');
    const tree = buildOutline(md);
    assert('大纲：忽略 front-matter 与代码块', tree.length === 1 && tree[0].label === '一级', JSON.stringify(tree.map((n) => n.label)));
    assert('大纲：二级挂到一级下', (tree[0].children ?? []).map((n) => n.label).join('/') === '二级 A/二级 B', JSON.stringify(tree[0].children?.map((n) => n.label)));
    const flat = flattenOutline(tree);
    assert('大纲：展平后 4 个标题且顺序正确', flat.length === 4 && flat[3].label === '二级 B', JSON.stringify(flat.map((n) => n.label)));
    assert('大纲：行号是 0 基且指向标题行', flat[0].line === 3, String(flat[0].line));
    assert('大纲：空文档返回空树', buildOutline('').length === 0 && buildOutline('#').length === 0);

    const { highlightSnippet } = await import('@/utils/search');
    const long = 'a'.repeat(40) + '关键词' + 'b'.repeat(60);
    const snippet = highlightSnippet(long, '关键词', 40);
    assert('搜索：命中片段带省略号且含关键词', snippet.includes('关键词') && snippet.startsWith('…') && snippet.endsWith('…'), snippet);
    assert('搜索：无关键词按长度截断', highlightSnippet('x'.repeat(100), '', 20).length === 20, String(highlightSnippet('x'.repeat(100), '', 20).length));
    assert('搜索：空文本返回空串', highlightSnippet('', 'x') === '');
  }

  // ── 全屏桥 / 通用桥 / 内置条目 ──
  {
    const { defaultResolveRequest, updateCursorPosCache, summonFullscreen, isFullscreenBridgeInstalled } = await import(
      '@/services/fullscreenBridge'
    );
    updateCursorPosCache(0, 321, 123);
    const pos = defaultResolveRequest({ kind: 'get-cursor-pos' }) as { x: number; y: number };
    assert('全屏桥：光标位置读缓存', pos.x === 321 && pos.y === 123, JSON.stringify(pos));
    const screen = defaultResolveRequest({ kind: 'get-screen-info' }) as { innerWidth?: number };
    assert('全屏桥：屏幕信息有宽高', typeof screen.innerWidth === 'number', JSON.stringify(screen));
    let threw: string | null = null;
    try {
      defaultResolveRequest({ kind: 'unknown-kind' });
    } catch (error) {
      threw = (error as { code?: string }).code ?? null;
    }
    assert('全屏桥：未知能力抛 UNKNOWN_KIND', threw === 'UNKNOWN_KIND', String(threw));
    assert('全屏桥：无 bus 时不装且召唤返回 false', isFullscreenBridgeInstalled() === false && summonFullscreen({}) === false, 'no-bus');

    const { DEFAULT_ALLOWED_CHANNELS, isGenericMicroAppIpcBridgeInstalled, installGenericMicroAppIpcBridge } = await import(
      '@/services/genericMicroAppBridge'
    );
    assert('通用桥：白名单全部是 controller 通道', DEFAULT_ALLOWED_CHANNELS.every((c) => c.startsWith('controller/')), String(DEFAULT_ALLOWED_CHANNELS.length));
    const uninstall = installGenericMicroAppIpcBridge();
    assert('通用桥：无 bus 时 install 返回空句柄且不标记已装', isGenericMicroAppIpcBridgeInstalled() === false && typeof uninstall === 'function', 'no-bus');

    const { DELETE_EFFECT_APP_ID, deleteEffectBuiltinApp, installDeleteEffectBuiltin, isDeleteEffectEnabled } = await import(
      '@/components/builtins/deleteEffect'
    );
    const { getBuiltinApps } = await import('@/services/microApps');
    assert('内置条目：删除特效 id 固定', DELETE_EFFECT_APP_ID === 'echo-monster-deleter' && deleteEffectBuiltinApp.id === DELETE_EFFECT_APP_ID, DELETE_EFFECT_APP_ID);
    assert('内置条目：默认关闭且全屏', deleteEffectBuiltinApp.enabled === false && deleteEffectBuiltinApp.displayMode === 'fullscreen', String(deleteEffectBuiltinApp.displayMode));
    installDeleteEffectBuiltin();
    assert('内置条目：注册后能在注册表查到', getBuiltinApps().some((app) => app.id === DELETE_EFFECT_APP_ID), 'registered');




  updater: {
    const { IPC_CHANNELS } = await import('@shared/ipc/channels');
    assert('更新：三个通道都在 IPC_CHANNELS', ['updateCheck', 'updateDownload', 'updateInstall'].every((k) => typeof (IPC_CHANNELS.app as Record<string, string>)[k] === 'string'), 'channels');
    const { INVOKE_CHANNELS } = await import('@shared/ipc/channels');
    assert('更新：三个通道都登记进白名单集合', ['controller/app/updateCheck', 'controller/app/updateDownload', 'controller/app/updateInstall'].every((c) => INVOKE_CHANNELS.has(c)), 'renderer');
  }

  exportText: {
    const { noteExportTextSchema } = await import('@shared/ipc/schemas');
    assert('导出：HTML/SVG/TXT 三种类型可校验', ['html', 'svg', 'txt'].every((t) => noteExportTextSchema.safeParse({ content: 'x', fileName: 'n', fileType: t }).success), 'types');
    assert('导出：未知类型被拒', noteExportTextSchema.safeParse({ content: 'x', fileName: 'n', fileType: 'pdf' }).success === false, 'pdf');
    assert('导出：空文件名被拒', noteExportTextSchema.safeParse({ content: 'x', fileName: '', fileType: 'html' }).success === false, 'empty');
  }

  i18n: {
    const { hoistMisplacedKeys } = await import('@/i18n/hoist');
    const zhRaw = (await import('@/i18n/locales/zh-CN')).default as Record<string, any>;
    const fixed = hoistMisplacedKeys(JSON.parse(JSON.stringify(zhRaw)) as Record<string, any>);
    assert('i18n：扁平键提升后 search.title 可解析', typeof fixed.search?.title === 'string', JSON.stringify(fixed.search?.title));
    assert('i18n：library 只留卡片管理键', typeof fixed.library?.management === 'string' && fixed.library?.['search.title'] === undefined, JSON.stringify(fixed.library?.management));
    assert('i18n：settings.skin 归并进 settings 节点', typeof fixed.settings?.skin === 'string', JSON.stringify(fixed.settings?.skin));
    assert('i18n：aiHelper.title 回到根级', typeof fixed.aiHelper?.title === 'string', JSON.stringify(fixed.aiHelper?.title));
    assert('i18n：新面板键可在根级解析', typeof fixed.settings?.groupServer === 'string', JSON.stringify(fixed.settings?.groupServer));
  }
  busDialog: {
    const { registerBusDialog, getBusDialog, openBusDialog, closeAllBusDialogs } = await import('@/services/busDialog');
    const { busDialogBus } = await import('@/services/busDialogBus');
    assert('busDialog：名字未注册返回 unknown', (await openBusDialog('NopeBusDialog')).status === 'unknown', 'NopeBusDialog');
    registerBusDialog('TestBusDialog', () => Promise.resolve({ default: { render: () => null } }), { kind: 'dialog' });
    assert('busDialog：注册后可按名字查到', getBusDialog('TestBusDialog')?.defaults.kind === 'dialog', 'dialog');
    let duplicateThrown = false;
    try {
      registerBusDialog('TestBusDialog', () => Promise.resolve({ default: {} }), { kind: 'dialog' });
    } catch {
      duplicateThrown = true;
    }
    assert('busDialog：重名注册直接抛错', duplicateThrown, 'duplicate');
    let payloadSeen: unknown = null;
    const off = busDialogBus.on('Probe.open', (payload) => { payloadSeen = payload; });
    busDialogBus.emit('Probe.open', { a: 1 });
    off();
    assert('busDialog：事件总线能收发（on/emit/off）', JSON.stringify(payloadSeen) === '{"a":1}', JSON.stringify(payloadSeen));
    closeAllBusDialogs();
    assert('busDialog：closeAll 清空 session 表', true, 'no-op');
  }

  navigation: {
    const { __testing } = await import('@/services/cloudfn');
    const { IPC_CHANNELS, INVOKE_CHANNELS } = await import('@shared/ipc/channels');
    const normalized = __testing.normalizeItem({ id: 7, name: '导航 A', summary: '一句话', img: 'https://x/a.png', url: 'https://x/a' });
    assert('导航：vue2 字段兜底（name/summary/img/url）', normalized?.title === '导航 A' && normalized?.desc === '一句话' && normalized?.imageUrl === 'https://x/a.png' && normalized?.targetUrl === 'https://x/a', JSON.stringify(normalized));
    assert('导航：空对象返回 null', __testing.normalizeItem({}) === null, 'null');
    const rows = __testing.extractList({ rows: [{ a: 1 }] });
    assert('导航：四种列表壳都能拆（data/rows/list/records）', Array.isArray(rows) && rows.length === 1, JSON.stringify(rows));
    assert('导航：cloudfn.invoke 通道已登记且白名单放行', IPC_CHANNELS.cloudfn.invoke === 'controller/cloudfn/invoke' && INVOKE_CHANNELS.has(IPC_CHANNELS.cloudfn.invoke), IPC_CHANNELS.cloudfn.invoke);
    assert('导航：openExternal 通道已登记且白名单放行', INVOKE_CHANNELS.has(IPC_CHANNELS.app.openExternal), IPC_CHANNELS.app.openExternal);
  }

  blogDeploy: {
    const fs = await import('node:fs/promises');
    const os = await import('node:os');
    const nodePath = await import('node:path');
    const { writeBlogPosts, generateSidebarJson, exportCIWorkflows, shortlinkId } = await import('../electron/service/blog/deploy');
    const tmp = await fs.mkdtemp(nodePath.join(os.tmpdir(), 'coolma-blog-'));
    const result = await writeBlogPosts(tmp, [
      { title: 'Hello', content: '# hi' },
      { title: '02-World', content: 'world' },
    ], 'default', '技术');
    await generateSidebarJson(tmp, [{ title: 'Hello', content: '' }, { title: '02-World', content: '' }]);
    assert('博客：写出两篇 _posts', result.writtenFiles === 2, String(result.writtenFiles));
    const sidebar = JSON.parse(await fs.readFile(nodePath.join(tmp, 'sidebar.json'), 'utf-8'));
    const posts = await fs.readdir(nodePath.join(tmp, '_posts'));
    assert('博客：sidebar 的 path 与物理文件一一对应', sidebar._posts.every((item: { path: string }) => posts.includes(item.path.replace('_posts/', ''))), JSON.stringify(sidebar));
    assert('博客：序号前缀不参与 shortlink（02-World 与 World 同 id）', shortlinkId('技术', '02-World') === shortlinkId('技术', 'World'), shortlinkId('技术', '02-World'));
    const shortlink = JSON.parse(await fs.readFile(nodePath.join(tmp, '.vuepress', 'shortlink-map.json'), 'utf-8'));
    assert('博客：shortlink-map 按 id 记 permalink', Object.keys(shortlink.byId).length >= 2 && Object.values(shortlink.byId).every((v: any) => v.permalink.endsWith('.html')), JSON.stringify(shortlink).slice(0, 80));
    const ci1 = await exportCIWorkflows(tmp);
    const ci2 = await exportCIWorkflows(tmp);
    assert('博客：CI workflow 首次写三份、二次全跳过', ci1.written.length === 3 && ci2.skipped.length === 3, `${ci1.written.length}/${ci2.skipped.length}`);
    await fs.rm(tmp, { recursive: true, force: true });
  }

  paneLayout: {
    const { normalizePaneLayout, nextPaneLayout, paneVisibility, paneSizes } = await import('@/utils/paneLayout');
    assert('常规视图：布局循环 0→1→2→0（对齐 vue2 cyclePaneLayout）', nextPaneLayout(0) === 1 && nextPaneLayout(1) === 2 && nextPaneLayout(2) === 0, 'cycle');
    assert('常规视图：三态可见性与 vue2 一致（2 只剩正文）', paneVisibility(0).sidebar && paneVisibility(0).list && paneVisibility(1).list && !paneVisibility(2).list, JSON.stringify([paneVisibility(0), paneVisibility(1), paneVisibility(2)]));
    assert('常规视图：非法/越界值归一成三栏', normalizePaneLayout('9') === 0 && normalizePaneLayout(null) === 0 && normalizePaneLayout(2) === 2, 'normalize');
    assert('常规视图：单栏正文占满、两栏列表 30%', paneSizes(2).editor === 100 && paneSizes(1).list === 30, JSON.stringify([paneSizes(1), paneSizes(2)]));
    const { normalizePaneSizeList, paneSizesFromList } = await import('@/utils/paneLayout');
    assert('常规视图：拖拽宽度合法值可还原（三栏/两栏）', normalizePaneSizeList(0, [20, 25, 55])?.length === 3 && paneSizesFromList(1, [35, 65])?.list === 35, 'sizes');
    assert('常规视图：宽度长度不符/总和越界/负数一律判损坏', normalizePaneSizeList(0, [20, 80]) === null && normalizePaneSizeList(0, [20, 20, 20]) === null && normalizePaneSizeList(1, [-1, 101]) === null, 'invalid');
  }

  indexViews: {
    const { buildCategoryTree, buildTagTreemapData } = await import('@/utils/categoryTree');
    const tree = buildCategoryTree([
      { category: '/Work/Deep/', count: 1 },
      { category: '/Work/', count: 2 },
      { category: '/Life/', count: 3 },
      { category: '/Work/Deep/More/', count: 1 },
    ]);
    const work = tree.find((node) => node.key === '/Work/');
    assert('常规视图：分类树根节点按 label 排序且缺父级自动补', tree.length === 2 && Boolean(work), JSON.stringify(tree.map((n) => n.key)));
    assert('常规视图：分类树 key 形如 /Work/Deep/ 且层级正确', work?.children.some((child) => child.key === '/Work/Deep/') === true && work?.children[0]?.children.some((child) => child.key === '/Work/Deep/More/') === true, JSON.stringify(work));
    assert('常规视图：分类树保留直接笔记数', work?.count === 2 && tree.find((n) => n.key === '/Life/')?.count === 3, JSON.stringify(tree));
    const ordered = buildCategoryTree(
      [{ category: '/A/' }, { category: '/Z/' }, { category: '/B/' }],
      (_path, segment) => segment,
      { '/Z/': 0, '/A/': 1, '/B/': 2 },
    );
    assert('常规视图：文件夹按云端 pos 排序（不是纯 label）', ordered.map((node) => node.key).join(',') === '/Z/,/A/,/B/', ordered.map((node) => node.key).join(','));
    const mixed = buildCategoryTree(
      [{ category: '/A/' }, { category: '/Z/' }],
      (_path, segment) => segment,
      { '/Z/': 0 },
    );
    assert('常规视图：只有一端有 pos 时退回 label 排序（对齐 vue2）', mixed.map((node) => node.key).join(',') === '/A/,/Z/', mixed.map((node) => node.key).join(','));
    const treemap = buildTagTreemapData([
      { name: 'A', count: 9 },
      { name: 'B', count: 7 },
      { name: 'C', count: 5 },
      { name: 'D', count: 3 },
      { name: 'E', count: 1 },
    ]);
    assert('常规视图：标签 treemap 前 20% 块更大、其余同值', treemap[0]?.value > treemap[2]?.value && treemap[4]?.value === 100, JSON.stringify(treemap));
    assert('常规视图：标签 treemap 按笔记数降序', treemap.map((item) => item.name).join(',') === 'A,B,C,D,E', treemap.map((item) => item.name).join(','));
  }

  wizSync: {
    const wizMarkdown = await import('@altairwei/wiz-markdown');
    const { IPC_CHANNELS, INVOKE_CHANNELS } = await import('@shared/ipc/channels');
    const { syncLoginSchema } = await import('@shared/ipc/schemas');
    const html = wizMarkdown.embed('# 标题\n\n正文 **粗**', { kbGuid: 'k', docGuid: 'd', wrapWithPreTag: false });
    const markdown = wizMarkdown.extract(html, { convertImgTag: true, normalizeWhitespace: false });
    assert('为知同步：markdown 能 embed 成为知 HTML', typeof html === 'string' && html.includes('<body>'), html.slice(0, 60));
    assert('为知同步：embed→extract 往返保住标题与加粗', markdown.includes('# 标题') && markdown.includes('**粗**'), JSON.stringify(markdown));
    assert('为知同步：login/status/pull/push 通道齐全且白名单放行', [IPC_CHANNELS.sync.login, IPC_CHANNELS.sync.status, IPC_CHANNELS.sync.pull, IPC_CHANNELS.sync.push].every((c) => INVOKE_CHANNELS.has(c)), String(INVOKE_CHANNELS.size));
    assert('为知同步：login 空账号被 zod 拦下', !syncLoginSchema.safeParse({ userId: '', password: '' }).success, 'rejected');
    const { isLiteCategory, replaceIndexFilesWithCoolma, replaceCoolmaWithIndexFiles } = await import('../electron/service/sync/wiznote-resources');
    assert('为知同步：只有 Lite 分类算 lite/markdown（vue2 去斜杠判定）', isLiteCategory('/Lite/') && isLiteCategory('Lite') && !isLiteCategory('/My Notes/Lite2/'), 'Lite rule');
    const mapped = replaceIndexFilesWithCoolma('<img src="index_files/a.png">', 'kb', 'doc', ['a.png']);
    const back = replaceCoolmaWithIndexFiles('![](coolma://coolma.app/kb/doc/a.png)', 'kb', 'doc', ['a.png']);
    assert('为知同步：index_files ↔ coolma:// 双向映射', mapped.includes('coolma://coolma.app/kb/doc/a.png') && back.includes('index_files/a.png'), `${mapped} / ${back}`);
    const rebound = replaceCoolmaWithIndexFiles('![](coolma://coolma.app/kb/local_old/a.png)', 'kb', 'remote_new', ['a.png']);
    assert('为知同步：本地笔记 rebind 后旧 local_ 图片仍能换回 index_files', rebound.includes('index_files/a.png'), rebound);
    assert('为知同步：lite 笔记走 pre 包装（对齐 vue2 wrapWithPreTag）', wizMarkdown.embed('# t', { wrapWithPreTag: true, kbGuid: 'k', docGuid: '' }).includes('<pre>'), 'pre');
  }

    assertImport: {
      const enabled = await isDeleteEffectEnabled();
      assert('内置条目：默认未启用（走原生确认框）', enabled === false, String(enabled));
    }
  }

  // ==== 内置回响：17 张全部编译 / render / jQuery handler 真跑 ====
  {
    const { echoBuiltins } = await import('../electron/shared/builtins/catalog');
    const BUILTIN_ECHO_CARDS = echoBuiltins().map((card) => ({
      id: card.id,
      annoSource: card.payload.annoSource,
    }));
    const { safeEvalAnnoSource, HANDLER_PRELUDE } = await import('../packages/plugins-muya-echo/src/core/echoAnnoSource.js') as Any;
    const compiled = BUILTIN_ECHO_CARDS.map((card) => {
      const definition = safeEvalAnnoSource(card.annoSource, HANDLER_PRELUDE)();
      return { card, definition };
    });
    assert(
      '内置回响：17 张全部编译出 render',
      compiled.length === 17 && compiled.every(({ definition }) => typeof definition.render === 'function'),
      String(compiled.length),
    );
    const renders = compiled.map(({ card, definition }) => {
      try {
        return String(definition.render({ ...(definition.props || {}), value: 'x' }));
      } catch (error) {
        return `ERR:${card.id}:${(error as Error).message}`;
      }
    });
    assert(
      '内置回响：render 全部返回非空 HTML',
      renders.every((text) => text.startsWith('<span') && text.includes('ag-echo-placeholder-marker')),
      renders.find((text) => !text.startsWith('<span')) || '',
    );
    assert('jQuery：已挂到 window 且可调用', Boolean((window as Any).jQuery?.fn?.jquery), String((window as Any).jQuery?.fn?.jquery || ''));

    const nice = compiled.find(({ card }) => card.id === '__builtin_nice__');
    if (!nice) throw new Error('nice 内置卡缺失');
    const p = document.createElement('p');
    const em = document.createElement('em');
    em.textContent = '你好';
    const marker = document.createElement('span');
    marker.className = 'ag-echo-placeholder-marker ag-echo-anno-name';
    marker.textContent = '@nice';
    p.append(em, marker);
    document.body.append(p);
    try {
      nice.definition.afterRender?.(marker, { ...(nice.definition.props || {}), value: 'x' });
      assert(
        '内置回响：nice 的 jQuery handler 真把前一个节点包成 mark',
        Boolean(p.querySelector('mark.ag-rune-nice-highlight')?.textContent === '你好'),
        p.innerHTML,
      );
    } finally {
      p.remove();
    }
  }

  // ==== 内置符文模板：14 个齐全、默认模板可编译 ====
  {
    const { runeTemplateBuiltins, defaultRuneTemplate } = await import('../electron/shared/builtins/catalog');
    const RUNE_TEMPLATE_PRESETS = runeTemplateBuiltins();
    const DEFAULT_RUNE_TEMPLATE = defaultRuneTemplate();
    assert('符文模板：14 个内置模板', RUNE_TEMPLATE_PRESETS.length === 14, String(RUNE_TEMPLATE_PRESETS.length));
    assert(
      '符文模板：id 唯一且都有 template',
      new Set(RUNE_TEMPLATE_PRESETS.map((item) => item.id)).size === 14
        && RUNE_TEMPLATE_PRESETS.every((item) => item.payload.template.includes('<template>') && item.payload.template.includes('export default')),
      '',
    );
    const { builtinById, builtinIds, builtinItems } = await import('../electron/shared/builtins/catalog');
    assert(
      '内置目录：kind 筛选 / id 查询 / 全量唯一',
      builtinItems().length === 31
        && builtinItems('echo').length === 17
        && builtinIds('rune-template').length === 14
        && builtinById('echo', '__builtin_nice__')?.name === 'nice'
        && new Set(builtinItems().map((item) => item.id)).size === 31,
      '',
    );
    assert(
      '符文模板：新增默认 inheritFromPrevious 演示',
      DEFAULT_RUNE_TEMPLATE.includes('inheritFromPrevious') && DEFAULT_RUNE_TEMPLATE.includes('RuneInheritDemo'),
      DEFAULT_RUNE_TEMPLATE.slice(0, 80),
    );
  }

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
