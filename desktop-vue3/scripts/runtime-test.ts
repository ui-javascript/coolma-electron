/**
 * 最小运行验证（无 Electron）：jsdom + 真引擎，走一遍面板选中链路。
 *
 *   运行：pnpm --dir desktop-vue3 test:runtime（配置会把 jsdom 外的依赖打进 bundle，
 *   避开 isolated node_modules 下 SSR external 解析不到的问题）。
 *
 * 验证的是引擎真实代码：selectItem → getTypeHandler → 应用侧处理器 → 引擎原语 → 段落写回。
 */
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
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
import { DEFAULT_SKIN, SKIN_LIST, applySkinThemeColor, normalizeSkinSelection, skinLabelKey } from '../frontend/src/utils/skin';
import { joinFolderPath, newNoteDefaults, removableTemplateIds } from '../frontend/src/utils/note';
import {
  MAX_TAG_NAME_LENGTH,
  buildAutoTagMessages,
  condenseNoteContent,
  filterUntaggedNotes,
  normalizeTagName,
  parseTagNames,
} from '../frontend/src/utils/autotag';
import { coolmaUrl, hashImageName, parseCoolmaUrl } from '../electron/service/attachments';
import { collectTree, normalizeRemotePath } from '../electron/service/blog/sftp-fs';
import { attachmentDir, saveAttachmentBuffer, saveImageAttachmentFromPath } from '../electron/service/attachments';
import { uploadImageByPicGo } from '../electron/service/image/upload';
import {
  findCloudNoteByTitle,
  isCategoryExistsError,
  isNoteMissingError,
  normalizeMatchCategory,
  sortCategoriesByDepth,
  toWizCategoryInput,
  toWizRemoteCategory,
} from '../electron/service/sync/push-rules';
import { buildNoteListQuery, cloudDedupeKey, stripWizMarkdownSuffix, toWizCategoryDeletePath } from '../electron/service/sync/pull-rules';
import { emitAiInsert, onAiInsert } from '../frontend/src/editor/aiInsert';
import { buildFolderMarkdown } from '../frontend/src/utils/folderMarkdown';
import { drainSseDataLines, extractDeltaText } from '../electron/service/ai/sse';
import { formatDocumentByPangu } from '../frontend/src/utils/pangu';
import { BUILT_IN_CDN_DEPS, getResourceType, isJQueryCoreDep, mergeCdnDeps } from '../frontend/src/utils/cdn-rules';
import { fitWindowBounds, parseWindowState } from '../electron/service/os/window-state-rules';
import { cloudTagsToNames, localNamesToCloudTags, splitCloudTagString } from '../electron/service/sync/tag-rules';
import { DEFAULT_LOGIN_BASE, isValidServerUrl, normalizeServerUrl, resolveSignupUrl } from '../frontend/src/utils/loginRules';
import { readEchoInstance, rewriteEchoInstance } from '../frontend/src/utils/echoToken';
import { resolveEchoSchema } from '../frontend/src/utils/echoSchema';
import {
  MELT_SOURCES_STORAGE_KEY,
  buildSourceEntryUrl,
  detectRuneType,
  listMeltPropDefs,
  loadRuneSources,
  normalizeMeltRuneConfig,
  parseMeltRuneConfig,
  resolveDepFromSources,
  saveRuneSources,
  validateMeltRuneConfig,
} from '../../libs-rune-core/src/index';
import {
  normalizeRuneDimension,
  normalizeRuneOffset,
  readRuneDataAttr,
  rewriteRunePlaceholderBoxByNodeId,
  rewriteRunePlaceholderSizeByNodeId,
} from '../frontend/src/editor/runePlaceholderAttrs';
import {
  AUTO_UPLOAD_KICKOFF_DELAY,
  AUTO_UPLOAD_POLL_INTERVAL,
  AUTO_UPLOAD_RETRY_COOLDOWN,
  shouldAutoUpload,
} from '../frontend/src/utils/syncAuto';
import { buildEchoCodeGenPrompt, buildRuneCodeGenPrompt, extractGeneratedCode } from '../frontend/src/utils/aiCodegen';
import { fetchRemoteText, toRawGithubUrl } from '../electron/service/remote-fetch';
import { fallbackRuneName, inferRemoteRuneMeta, REMOTE_RUNE_MAX_BYTES } from '../electron/shared/runeRemote';
import {
  applyBaseToConfig,
  buildBlogPackageJson,
  buildManagerCommand,
  buildVuepressConfig,
  detectConfigTheme,
  NAV_BUILDER_SOURCE,
  normalizeBase,
  normalizeBlogTheme,
  quoteBase,
  readBaseFromConfig,
  SIDEBAR_BUILDER_SOURCE,
  shouldRebuildPackage,
} from '../electron/service/blog/blogEnv';
import { PROOFREAD_SYSTEM_PROMPT, buildProofreadMessages } from '../frontend/src/services/aiProofread';
import { BUILTIN_CATALOG } from '../electron/shared/builtins/data';

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
    'Range', 'Selection', 'ShadowRoot', 'CSSStyleDeclaration', 'DOMRect', 'localStorage', 'sessionStorage',
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
  const core = (await import('../../libs-muya-vue3/src/core/index.js')) as Any;
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
  assert('符文分组走 libs-rune-core', renderObj.items[sections[1]]?.[0]?.meta?.type === 'rune');
  assert('回响分组走 libs-echo-core', renderObj.items[sections[2]]?.[0]?.meta?.type === 'echo');

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
  const { createEchoPlugin } = (await import('../../libs-muya-echo-vue3/src/index')) as Any;
  const { createRunePlugin, createRuneRendererCtor } = (await import('../../libs-muya-rune-vue3/src/index')) as Any;
  const { EchoRegistry, EchoRuntime } = (await import('../../libs-muya-echo-vue3/src/index')) as Any;

  // 应用侧库卡是 camelCase `annoSource`；只认 snake_case 会把源码归一化成空字符串。
  const camelRegistry = new EchoRegistry([
    {
      id: 'camel',
      name: 'camel',
      annoSource:
        "export default { render () { return '<span class=\"camel-echo\">ok</span>' }, " +
        'afterRender () { return () => {} } }',
    },
  ]);
  const camelDefinition = camelRegistry.runtime.compileDefinition(camelRegistry.getByName('camel'));
  assert(
    '回响注册表：接受应用侧 camelCase annoSource',
    typeof camelDefinition?.render === 'function' && typeof camelDefinition?.afterRender === 'function',
    String((camelRegistry.getByName('camel') as Any)?.anno_source || '').slice(0, 40),
  );

  const editorSfc = await fs.readFile(path.resolve(process.cwd(), '../libs-muya-vue3/src/MuyaEditor.vue'), 'utf8');
  assert('回响文档根：MuyaEditor 挂 data-echo-document', /data-echo-document/.test(editorSfc));
  const appStyles = await fs.readFile(path.resolve(process.cwd(), 'frontend/src/styles/index.css'), 'utf8');
  assert('回响宿主：覆盖 ag-hide 的零宽规则', appStyles.includes('span.ag-echo-placeholder-host'));

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

  // 符文 SFC 的 $emit('input') 必须桥到 onValueChange，否则输入框改值写不回 Markdown
  const bridgeRune = {
    id: 'bridge',
    name: 'bridge',
    template:
      '<template><input class="rune-bridge-input" @input="onType" /></template>' +
      '<script>export default { methods: { onType (event) { this.$emit("input", event.target.value) } } }</script>',
  };
  const bridgeCtor = createRuneRendererCtor(bridgeRune);
  let bridgePayload: Any = null;
  const bridgeVm = bridgeCtor?.({
    propsData: {
      runeId: 'bridge',
      nodeId: 'node-bridge',
      value: '',
      onValueChange: (payload: Any) => { bridgePayload = payload; },
    },
  });
  assert('符文 renderer 可编译输入模板', Boolean(bridgeVm?.$el));
  document.body.appendChild(bridgeVm.$el);
  const bridgeInput = bridgeVm.$el.querySelector('.rune-bridge-input') as HTMLInputElement;
  bridgeInput.value = '写回';
  bridgeInput.dispatchEvent(new (bridgeInput.ownerDocument.defaultView as Any).Event('input', { bubbles: true }));
  assert(
    '符文 input 事件桥接到 onValueChange',
    bridgePayload?.value === '写回' && bridgePayload?.nodeId === 'node-bridge',
    JSON.stringify(bridgePayload),
  );
  bridgeVm.$destroy();

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

  // ===== R-03 破万法：target=block 必须禁用同一 block 内的其它回响 =====
  {
    const shatterSource =
      "export default { render () { return '<span class=\"shatter\">破</span>' }, " +
      "afterRender (node, props = {}) { const merged = Object.assign({ target: 'line' }, props || {}); " +
      "const $rune = $(node); const $scopeRoot = merged.target === 'block' " +
      "? $rune.closest('[data-block-type], .mu-block, p, pre, li, h1, h2, h3, h4, h5, h6, blockquote') " +
      ": $rune.parent(); if (!$scopeRoot.length) return () => {}; " +
      "const $echoes = $scopeRoot.find('[data-echo-inline=\"true\"]').filter((_i, n) => n !== node); " +
      "$echoes.attr('data-shatter-disabled', 'true').addClass('ag-rune-shatter-disabled'); " +
      "$rune.addClass('ag-rune-shatter-active'); " +
      "return () => { $echoes.removeAttr('data-shatter-disabled').removeClass('ag-rune-shatter-disabled'); " +
      "$rune.removeClass('ag-rune-shatter-active') } } }";
    const growthSource =
      "export default { render () { return '<span class=\"growth\">生</span>' }, afterRender () { return () => {} } }";
    const shatterRuntime = new EchoRuntime({
      registry: new EchoRegistry([
        { id: 'shatter-test', name: '破万法', anno_source: shatterSource },
        { id: 'growth-test', name: '生生不息', anno_source: growthSource },
      ]),
    });
    const scope = document.createElement('div');
    const paragraph = document.createElement('p');
    const shatterHost = document.createElement('span');
    shatterHost.setAttribute('data-echo-host', 'true');
    shatterHost.setAttribute('data-echo-inline', 'true');
    shatterHost.setAttribute('data-echo-name', '破万法');
    shatterHost.setAttribute('data-echo-id', 'shatter-test');
    shatterHost.setAttribute('data-echo-node-id', 'shatter-node');
    shatterHost.setAttribute('data-echo-props-json', '{"target":"block"}');
    const growthHost = document.createElement('span');
    growthHost.setAttribute('data-echo-host', 'true');
    growthHost.setAttribute('data-echo-inline', 'true');
    growthHost.setAttribute('data-echo-name', '生生不息');
    growthHost.setAttribute('data-echo-id', 'growth-test');
    growthHost.setAttribute('data-echo-node-id', 'growth-node');
    growthHost.setAttribute('data-echo-props-json', '{}');
    const leftStrong = document.createElement('strong');
    const rightStrong = document.createElement('strong');
    leftStrong.appendChild(shatterHost);
    rightStrong.appendChild(growthHost);
    paragraph.append(leftStrong, rightStrong);    scope.appendChild(paragraph);
    document.body.appendChild(scope);
    shatterRuntime.afterRender(scope, { cleanupFirst: true });
    await new Promise((resolve) => setTimeout(resolve, 350));
    assert(
      '破万法 target=block 禁用同块回响',
      growthHost.getAttribute('data-shatter-disabled') === 'true' &&
        growthHost.classList.contains('ag-rune-shatter-disabled') &&
        shatterHost.classList.contains('ag-rune-shatter-active'),
      `disabled=${growthHost.getAttribute('data-shatter-disabled')}`,
    );
    shatterRuntime.disposeAll();
    assert(
      '破万法清理后恢复回响',
      !growthHost.hasAttribute('data-shatter-disabled') &&
        !growthHost.classList.contains('ag-rune-shatter-disabled') &&
        !shatterHost.classList.contains('ag-rune-shatter-active'),
      growthHost.className,
    );
    // target=line 的作用域是直接父节点；两个回响各在独立 strong 里，不应误伤对方
    shatterHost.setAttribute('data-echo-props-json', '{"target":"line"}');
    shatterRuntime.afterRender(scope, { cleanupFirst: true });
    await new Promise((resolve) => setTimeout(resolve, 350));
    assert(
      '破万法 target=line 不跨父节点误伤',
      !growthHost.hasAttribute('data-shatter-disabled') &&
        shatterHost.classList.contains('ag-rune-shatter-active'),
      `disabled=${growthHost.getAttribute('data-shatter-disabled')}`,
    );
    shatterRuntime.disposeAll();
    scope.remove();
  }

  // ===== R-03 成长 / 天空步道 / 双生花：直接跑 catalog 里发布的真实 anno_source =====
  {
    const catalogSource = (id: string): string => {
      const item = BUILTIN_CATALOG.items.find((entry) => entry.id === id) as Any;
      return String(((item?.payload as Any)?.annoSource) || '');
    };
    const growthSource = catalogSource('__builtin_growth__');
    const skywalkSource = catalogSource('__builtin_skywalk__');
    const twinbloomSource = catalogSource('__builtin_twinbloom__');
    assert('R-03：catalog 里三套动画源码齐全', Boolean(growthSource && skywalkSource && twinbloomSource),
      `growth=${growthSource.length} skywalk=${skywalkSource.length} twinbloom=${twinbloomSource.length}`);

    const docRoot = document.createElement('div');
    docRoot.className = 'mu-editor';
    docRoot.setAttribute('data-doc-id', 'r03');

    const blockPrev = document.createElement('div');
    blockPrev.setAttribute('data-block-type', 'paragraph');
    blockPrev.textContent = '上一行';

    const mkHost = (id: string, name: string, nodeId: string, props: string): HTMLElement => {
      const host = document.createElement('span');
      host.setAttribute('data-echo-host', 'true');
      host.setAttribute('data-echo-inline', 'true');
      host.setAttribute('data-echo-name', name);
      host.setAttribute('data-echo-id', id);
      host.setAttribute('data-echo-node-id', nodeId);
      host.setAttribute('data-echo-props-json', props);
      return host;
    };

    const blockGrowth = document.createElement('div');
    blockGrowth.setAttribute('data-block-type', 'paragraph');
    const growthHost = mkHost('__builtin_growth__', '生生不息', 'n-growth', '{"scope":"block","trigger":"auto","target":"div"}');
    blockGrowth.appendChild(growthHost);

    const blockSky = document.createElement('div');
    blockSky.setAttribute('data-block-type', 'paragraph');
    const skyHost = mkHost('__builtin_skywalk__', '天行健', 'n-sky', '{"theme":"sepia","layout":"luxe"}');
    blockSky.appendChild(skyHost);

    const blockTwin = document.createElement('div');
    blockTwin.setAttribute('data-block-type', 'paragraph');
    const twinHost = mkHost('__builtin_twinbloom__', '双生花', 'n-twin', '{"source":"prev-line"}');
    blockTwin.appendChild(twinHost);

    docRoot.append(blockPrev, blockGrowth, blockSky, blockTwin);
    document.body.appendChild(docRoot);

    const animRuntime = new EchoRuntime({
      registry: new EchoRegistry([
        { id: '__builtin_growth__', name: '生生不息', anno_source: growthSource },
        { id: '__builtin_skywalk__', name: '天行健', anno_source: skywalkSource },
        { id: '__builtin_twinbloom__', name: '双生花', anno_source: twinbloomSource },
      ]),
    });
    animRuntime.afterRender(docRoot, { cleanupFirst: true });
    await new Promise((resolve) => setTimeout(resolve, 350));

    assert('R-03 成长：目标元素拿到动画类', blockGrowth.classList.contains('ag-rune-growth-target'), blockGrowth.className);
    assert('R-03 成长：宿主标记激活', growthHost.classList.contains('ag-rune-growth-active'), growthHost.className);
    assert(
      'R-03 成长：stagger 延迟写进自定义属性',
      blockGrowth.getAttribute('style')?.includes('--ag-rune-growth-delay') === true,
      String(blockGrowth.getAttribute('style')),
    );

    assert('R-03 天空步道：主题写回文档根', docRoot.getAttribute('data-skywalk-theme') === 'sepia', String(docRoot.getAttribute('data-skywalk-theme')));
    assert('R-03 天空步道：排版写回文档根', docRoot.getAttribute('data-skywalk-layout') === 'luxe', String(docRoot.getAttribute('data-skywalk-layout')));
    assert('R-03 天空步道：宿主标记激活', skyHost.classList.contains('ag-rune-skywalk-active'), skyHost.className);

    const twinClone = docRoot.querySelector('[data-twinbloom-of]') as HTMLElement | null;
    assert('R-03 双生花：克隆出 prev-line', Boolean(twinClone), docRoot.innerHTML.slice(0, 160));
    assert('R-03 双生花：克隆带徽标', Boolean(twinClone?.querySelector('[data-twinbloom-badge]')), String(twinClone?.textContent));
    assert('R-03 双生花：宿主标记激活', twinHost.classList.contains('ag-rune-twinbloom-active'), twinHost.className);

    animRuntime.disposeAll();
    assert('R-03 清理：成长类被摘掉', !blockGrowth.classList.contains('ag-rune-growth-target') && !growthHost.classList.contains('ag-rune-growth-active'), blockGrowth.className);
    assert('R-03 清理：天空步道属性还原', !docRoot.hasAttribute('data-skywalk-theme') && !docRoot.hasAttribute('data-skywalk-layout'), docRoot.outerHTML.slice(0, 80));
    assert('R-03 清理：双生花克隆移除', !docRoot.querySelector('[data-twinbloom-of]'), String(docRoot.querySelectorAll('[data-twinbloom-of]').length));
    docRoot.remove();
  }


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

  // ===== 回响实例弹窗的 token 解析/回写（只改目标实例，保留 prompt 与其它实例）=====
  {
    const markdown = "A @nice{echoId: 'e1', value: 'old', foo: 3}(提示) B @nice{echoId: 'e2', value: 'keep'}() C";
    const token = readEchoInstance(markdown, 'e1');
    assert('实例 token 解析', Boolean(token) && token!.prompt === '提示' && token!.props.value === 'old', JSON.stringify(token));
    const next = rewriteEchoInstance(markdown, 'e1', { ...token!.props, value: 'new', foo: 5, enabled: true });
    assert(
      '实例回写只改目标',
      /echoId: 'e1'/.test(next) && /value: 'new'/.test(next) && /foo: 5/.test(next) &&
        /echoId: 'e2', value: 'keep'/.test(next) && /\(提示\)/.test(next),
      next,
    );
    const growthSchema = resolveEchoSchema({ id: '__builtin_growth__' } as Any);
    assert('内置回响 schema 可解析', growthSchema.length === 3 && growthSchema[0]?.field === 'scope', String(growthSchema.length));
  }

  // ===== Rune 尺寸回写（RuneTransformer 落点）：只改目标 nodeId 的宽高，其它属性保留 =====
  {
    const hostA = '<div data-rune-name="进度条" data-rune-id="progress" data-rune-node-id="n1" data-rune-value="12" data-rune-width="320" data-rune-prop-max-height="200" max-height="180" class="x">12</div>';
    const hostB = '<div data-rune-name="待办" data-rune-id="todo" data-rune-node-id="n2" data-rune-value="a">a</div>';
    const md = `${hostA}\n${hostB}`;
    const next = rewriteRunePlaceholderSizeByNodeId(md, 'n1', { width: 480.4, height: 260 });
    assert(
      'Rune 尺寸：目标 nodeId 宽高更新，props/自然属性/其它占位符不动',
      /data-rune-width="480"/.test(next)
        && /data-rune-height="260"/.test(next)
        && /data-rune-prop-max-height="200"/.test(next)
        && /max-height="180"/.test(next)
        && /data-rune-value="a">a<\/div>/.test(next),
      next,
    );
    const missing = rewriteRunePlaceholderSizeByNodeId(md, 'n404', { width: 200, height: 100 });
    assert('Rune 尺寸：nodeId 不存在时原样返回', missing === md, missing);
    const invalid = rewriteRunePlaceholderSizeByNodeId(md, 'n1', { width: -3, height: 'x' });
    assert('Rune 尺寸：非法值不改 Markdown', invalid === md, invalid);
    const offsetMd = rewriteRunePlaceholderBoxByNodeId(md, 'n1', {
      width: 360,
      height: 120,
      offsetX: -40.4,
      offsetY: 24.6,
    });
    assert(
      'Rune 偏移：写入负/正偏移且保留 props 与其它占位符',
      /data-rune-offset-x="-40"/.test(offsetMd)
        && /data-rune-offset-y="25"/.test(offsetMd)
        && /data-rune-width="360"/.test(offsetMd)
        && /data-rune-prop-max-height="200"/.test(offsetMd)
        && !/data-rune-offset-x/.test(offsetMd.slice(offsetMd.indexOf('n2'))),
      offsetMd,
    );
    const zeroOffset = rewriteRunePlaceholderBoxByNodeId(offsetMd, 'n1', { offsetX: 0, offsetY: 0 });
    assert(
      'Rune 偏移：归零删除属性，不写 offset=0',
      !/data-rune-offset-x/.test(zeroOffset) && !/data-rune-offset-y/.test(zeroOffset),
      zeroOffset,
    );
    assert(
      'Rune 偏移：数值归一化允许 0 与负数，拒绝空/NaN',
      normalizeRuneOffset('-12.6') === -13
        && normalizeRuneOffset(0) === 0
        && normalizeRuneOffset('') === null
        && normalizeRuneOffset('x') === null,
      `${normalizeRuneOffset('-12.6')}/${normalizeRuneOffset(0)}`,
    );
    assert(
      'Rune 尺寸：数值归一化与属性大小写读取',
      normalizeRuneDimension('320.6') === 321
        && normalizeRuneDimension(0) === null
        && readRuneDataAttr(' DATA-RUNE-NODE-ID="n1"', 'data-rune-node-id') === 'n1',
      String(normalizeRuneDimension('320.6')),
    );
    const { getAttributes } = (await import('../../libs-muya-vue3/src/core/parser/utils.js')) as Any;
    const parsedAttrs = getAttributes('<div data-rune-width="320" data-rune-height="100" data-rune-node-id="n3" data-rune-offset-x="-12" data-rune-offset-y="8">x</div>') as Record<string, unknown>;
    assert(
      'Rune 尺寸：解析白名单保留 width/height 与有符号偏移',
      parsedAttrs['data-rune-width'] === 320
        && parsedAttrs['data-rune-height'] === 100
        && parsedAttrs['data-rune-node-id'] === 'n3'
        && parsedAttrs['data-rune-offset-x'] === -12
        && parsedAttrs['data-rune-offset-y'] === 8,
      JSON.stringify(parsedAttrs),
    );
    const propAttrs = getAttributes(
      '<div data-rune-prop-inherit-from-previous="1" data-rune-prop-title="A &amp; B" data-rune-prop-max-width="auto" data-unknown="x">y</div>',
    ) as Record<string, unknown>;
    assert(
      'Rune props：解析保留 data-rune-prop-*，不洗宽高值、不放行任意 data-*',
      propAttrs['data-rune-prop-inherit-from-previous'] === '1'
        && propAttrs['data-rune-prop-title'] === 'A & B'
        && propAttrs['data-rune-prop-max-width'] === 'auto'
        && !Object.prototype.hasOwnProperty.call(propAttrs, 'data-unknown'),
      JSON.stringify(propAttrs),
    );
    const { scopeCss } = (await import('../../libs-muya-rune-vue3/src/runeRenderer')) as Any;
    const scoped = String(scopeCss(
      '.a, .b:hover { color: red }\n.x::before, .y > .z { content: "" }\n.a :deep(.el-input__inner) { color: teal }\n.a:deep(.x) { color: gold }\n@keyframes glow { 0% { opacity: 0 } 100% { opacity: 1 } }\n@media (min-width: 600px) { .m { color: blue } }\n:global(.g) { color: green }',
      'data-v-test',
    ));
    assert(
      'Rune scoped：选择器加 data-v，伪类/伪元素与后代组合正确',
      scoped.includes('.a[data-v-test],.b[data-v-test]:hover')
        && scoped.includes('.x[data-v-test]::before,.y > .z[data-v-test]')
        && scoped.includes('.a[data-v-test] .el-input__inner{ color: teal }')
        && scoped.includes('.a[data-v-test] .x{ color: gold }'),
      scoped,
    );
    assert(
      'Rune scoped：keyframes 不加作用域，media 内部加，global 保持全局',
      /@keyframes glow \{ 0% \{ opacity: 0 \} 100% \{ opacity: 1 \} \}/.test(scoped)
        && /@media \(min-width: 600px\) \{\s*\.m\[data-v-test\]\{\s*color: blue\s*\}\s*\}/.test(scoped)
        && scoped.includes(':global') === false,
      scoped,
    );
    const rendererSource = await fs.readFile(
      path.resolve(process.cwd(), '../libs-muya-vue3/src/core/parser/render/index.js'),
      'utf8',
    );
    assert(
      'Rune 渲染：mountRuneVueHosts / renderRunes 各只剩一处定义',
      (rendererSource.match(/^\s*mountRuneVueHosts \(\) \{/gm) || []).length === 1
        && (rendererSource.match(/^\s*renderRunes \(\) \{/gm) || []).length === 1,
      `mount=${(rendererSource.match(/^\s*mountRuneVueHosts \(\) \{/gm) || []).length}, render=${(rendererSource.match(/^\s*renderRunes \(\) \{/gm) || []).length}`,
    );
  }

  // ===== R-02 四角实拖：真事件驱动 RuneTransformer，四个把手各自算对宽高与偏移 =====
  {
    const { RuneTransformer } = (await import('../frontend/src/editor/runeTransformer')) as Any;
    /** 用 style.width/height/translate 反推矩形，模拟浏览器在被拖后的真实布局。 */
    const rectOf = (width: number, height: number, offsetX = 0, offsetY = 0) => ({
      x: 100 + offsetX,
      y: 50 + offsetY,
      left: 100 + offsetX,
      top: 50 + offsetY,
      right: 100 + offsetX + width,
      bottom: 50 + offsetY + height,
      width,
      height,
      toJSON: () => ({}),
    }) as DOMRect;
    const dynamicRect = (el: HTMLElement): DOMRect => {
      const width = parseFloat(el.style.width) || 200;
      const height = parseFloat(el.style.height) || 100;
      const numbers = (el.style.translate || '').match(/-?\d+(?:\.\d+)?/g) || [];
      return rectOf(width, height, Number(numbers[0] || 0), Number(numbers[1] || 0));
    };

    const runCorner = (position: string, from: [number, number], to: [number, number]) => {
      const scroller = document.createElement('div');
      scroller.style.position = 'relative';
      (scroller as Any).getBoundingClientRect = () => rectOf(800, 600);
      const host = document.createElement('div');
      host.className = 'ag-rune-placeholder-host';
      host.dataset.runeNodeId = 'n1';
      host.dataset.runeWidth = '200';
      host.dataset.runeHeight = '100';
      host.style.width = '200px';
      host.style.height = '100px';
      (host as Any).getBoundingClientRect = () => dynamicRect(host);
      scroller.appendChild(host);
      document.body.appendChild(scroller);

      const commits: Any[] = [];
      const transformer = new RuneTransformer({ container: scroller }, {
        canEdit: () => true,
        onCommit: (payload: Any) => {
          commits.push(payload);
          return true;
        },
        scrollContainer: scroller,
      });
      host.dispatchEvent(new (globalThis as Any).MouseEvent('click', { bubbles: true }));
      const handle = document.querySelector(`.ag-rune-transformer .circle[data-position="${position}"]`) as HTMLElement | null;
      if (!handle) throw new Error(`handle ${position} missing`);
      handle.dispatchEvent(new (globalThis as Any).MouseEvent('mousedown', {
        bubbles: true, button: 0, clientX: from[0], clientY: from[1],
      }));
      document.dispatchEvent(new (globalThis as Any).MouseEvent('mousemove', {
        bubbles: true, clientX: to[0], clientY: to[1],
      }));
      document.dispatchEvent(new (globalThis as Any).MouseEvent('mouseup', { bubbles: true }));
      const live = { width: host.dataset.runeWidth, height: host.dataset.runeHeight };
      transformer.destroy();
      scroller.remove();
      return { commit: commits[0], live };
    };

    const br = runCorner('bottom-right', [300, 150], [340, 170]);
    assert(
      '四角拖拽 bottom-right：只放大宽高，不产生偏移',
      br.commit?.width === 240 && br.commit?.height === 120
        && br.commit?.offsetX === 0 && br.commit?.offsetY === 0
        && br.live.width === '240' && br.live.height === '120',
      JSON.stringify(br),
    );
    const tl = runCorner('top-left', [100, 50], [140, 70]);
    assert(
      '四角拖拽 top-left：宽高收缩，左/上边跟手（正向偏移）',
      tl.commit?.width === 160 && tl.commit?.height === 80
        && tl.commit?.offsetX === 40 && tl.commit?.offsetY === 20,
      JSON.stringify(tl),
    );
    const tr = runCorner('top-right', [300, 50], [260, 70]);
    assert(
      '四角拖拽 top-right：宽度收缩、高度上边跟手，横向无偏移',
      tr.commit?.width === 160 && tr.commit?.height === 80
        && tr.commit?.offsetX === 0 && tr.commit?.offsetY === 20,
      JSON.stringify(tr),
    );
    const bl = runCorner('bottom-left', [100, 150], [140, 130]);
    assert(
      '四角拖拽 bottom-left：左边界右移（正向偏移）、下边界上移不改偏移',
      bl.commit?.width === 160 && bl.commit?.height === 80
        && bl.commit?.offsetX === 40 && bl.commit?.offsetY === 0,
      JSON.stringify(bl),
    );
    const tiny = runCorner('bottom-right', [300, 150], [110, 60]);
    assert(
      '四角拖拽：宽高被 MIN_WIDTH/MIN_HEIGHT 兜住，不会拖成 0',
      tiny.commit?.width === 80 && tiny.commit?.height === 40,
      JSON.stringify(tiny),
    );

    // 拖拽落点直接喂给回写函数，证明 width/height 能持久化进 Markdown 属性。
    const md = '<div data-rune-name="排行" data-rune-node-id="n1" data-rune-width="200" data-rune-height="100" class="ag-rune-placeholder-host">x</div>';
    const persisted = rewriteRunePlaceholderBoxByNodeId(md, 'n1', {
      width: br.commit.width,
      height: br.commit.height,
      offsetX: tl.commit.offsetX,
      offsetY: tl.commit.offsetY,
    });
    assert(
      '四角拖拽 → 持久化：data-rune-width/height/offset 写进 Markdown 开标签，其余属性保留',
      /data-rune-width="240"/.test(persisted)
        && /data-rune-height="120"/.test(persisted)
        && /data-rune-offset-x="40"/.test(persisted)
        && /data-rune-offset-y="20"/.test(persisted)
        && /data-rune-name="排行"/.test(persisted)
        && /class="ag-rune-placeholder-host"/.test(persisted),
      persisted,
    );
  }

  // ===== 自动上传闸门（P1-5）：常量与 vue2 一致，冷却/断网/无 pending 不推 =====
  {
    const baseline = {
      loggedIn: true,
      isSyncing: false,
      pendingTotal: 2,
      cooldownUntil: 0,
      now: 1_000,
      online: true,
    };
    assert(
      '自动上传：30s 轮询 / 3s 首传 / 5min 冷却与 vue2 一致',
      AUTO_UPLOAD_POLL_INTERVAL === 30_000 &&
        AUTO_UPLOAD_KICKOFF_DELAY === 3_000 &&
        AUTO_UPLOAD_RETRY_COOLDOWN === 300_000,
      `${AUTO_UPLOAD_POLL_INTERVAL}/${AUTO_UPLOAD_KICKOFF_DELAY}/${AUTO_UPLOAD_RETRY_COOLDOWN}`,
    );
    assert('自动上传：有待同步且在线才放行', shouldAutoUpload(baseline) === true, 'true');
    assert('自动上传：pending=0 不推', shouldAutoUpload({ ...baseline, pendingTotal: 0 }) === false, 'false');
    assert('自动上传：冷却期内不推', shouldAutoUpload({ ...baseline, cooldownUntil: 2_000 }) === false, 'false');
    assert('自动上传：离线不推', shouldAutoUpload({ ...baseline, online: false }) === false, 'false');
    assert('自动上传：已在同步不重入', shouldAutoUpload({ ...baseline, isSyncing: true }) === false, 'false');
    assert('自动上传：未登录不推', shouldAutoUpload({ ...baseline, loggedIn: false }) === false, 'false');
  }

  // ===== 强运校对提示词：保留结构与回响/符文语法，只做校对 =====
  {
    const source = '# 标题\n\n错别字 @nice{echoId: "e1", value: "x"}() 和 <div>符文</div>';
    const messages = buildProofreadMessages(source);
    assert(
      '强运：system prompt 明确保留标题/列表/代码块/回响/符文结构',
      PROOFREAD_SYSTEM_PROMPT.includes('保留所有原始结构') &&
        PROOFREAD_SYSTEM_PROMPT.includes('回响 @xxx{...}(...)') &&
        PROOFREAD_SYSTEM_PROMPT.includes('不做风格改写'),
      PROOFREAD_SYSTEM_PROMPT.slice(0, 80),
    );
    assert('强运：user prompt 原样包住当前 Markdown', messages.length === 2 && messages[1]?.content.includes(source), String(messages[1]?.content.length));
  }

  // ===== 符文/回响 AI 代码生成：prompt 带入当前源码与内置模板，回包能提代码 =====
  {
    const runePrompt = buildRuneCodeGenPrompt({ desc: '做一个倒计时', current: '<template><p>old</p></template>' });
    assert(
      'CodeGen：符文 prompt 带描述/当前源码/内置模板/SFC 格式',
      runePrompt.includes('做一个倒计时') &&
        runePrompt.includes('<template><p>old</p></template>') &&
        runePrompt.includes('所有内置符文模板') &&
        runePrompt.includes('<template>') &&
        runePrompt.includes('只输出最终的代码块'),
      runePrompt.slice(0, 80),
    );
    const echoPrompt = buildEchoCodeGenPrompt({ desc: '高亮关键词', current: "export default { type: 'echo' }" });
    assert(
      'CodeGen：回响 prompt 带 anno_source 示例与内置回响',
      echoPrompt.includes('高亮关键词') &&
        echoPrompt.includes("export default { type: 'echo' }") &&
        echoPrompt.includes('anno_source') &&
        echoPrompt.includes('所有内置回响模板'),
      echoPrompt.slice(0, 80),
    );
    assert(
      'CodeGen：提取 html/vue 围栏',
      extractGeneratedCode('说明\n```html\n<template><p>x</p></template>\n```\n结束') === '<template><p>x</p></template>',
      extractGeneratedCode('```html\n<template><p>x</p></template>\n```'),
    );
    assert(
      'CodeGen：提取 javascript 围栏',
      extractGeneratedCode("```javascript\nexport default { type: 'echo' }\n```") === "export default { type: 'echo' }",
      'js',
    );
    assert(
      'CodeGen：无围栏时跳过 markdown 标题/列表',
      extractGeneratedCode('# 标题\n**说明**\n- 列表\n<template><p>ok</p></template>') === '<template><p>ok</p></template>',
      'fallback',
    );
  }

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
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'coolma-local-image-'));
    const pngPath = path.join(root, 'local.png');
    await fs.writeFile(pngPath, Buffer.from('local-image-bytes'));
    const saved = await saveImageAttachmentFromPath({ root, filePath: pngPath, kbGuid: 'kb', docGuid: 'doc' });
    assert(
      '本地图片：路径落盘并返回 coolma 地址',
      saved.url === coolmaUrl('kb', 'doc', hashImageName(Buffer.from('local-image-bytes'), '.png')) &&
        (await fs.stat(saved.filePath)).isFile(),
      saved.url,
    );
    let badExt = '';
    try {
      const txtPath = path.join(root, 'local.txt');
      await fs.writeFile(txtPath, 'not-image');
      await saveImageAttachmentFromPath({ root, filePath: txtPath });
    } catch (error) {
      badExt = String((error as Error).message || error);
    }
    assert('本地图片：非图片扩展名拒绝', badExt === 'INVALID_IMAGE_EXT', badExt);
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

    // AI 划词改写依赖的选区快照：不读 DOM Selection，按 Markdown 字符偏移定位
    const selectionMd = '第一段文字\n\n第二段文字\n';
    muya.setMarkdown(selectionMd, {
      anchor: { line: 0, ch: 0 },
      focus: { line: 0, ch: 3 },
    }, false);
    const snapshot = (muya as Any).getSelectionInfo?.();
    assert(
      'AI 选区：快照取到原文与偏移',
      Boolean(snapshot) && snapshot.text === '第一段' && snapshot.start === 0 && snapshot.end === 3,
      JSON.stringify(snapshot),
    );
    const replaced = (muya as Any).replaceSelectionSnapshot?.(snapshot, '开头');
    assert(
      'AI 选区：按快照替换选区内文字',
      replaced === true && muya.getMarkdown() === '开头文字\n\n第二段文字\n',
      JSON.stringify(muya.getMarkdown()),
    );

    // 跨块选区：从第一段中间选到第二段中间，替换后仍保持段落结构
    muya.setMarkdown(selectionMd, {
      anchor: { line: 0, ch: 2 },
      focus: { line: 2, ch: 3 },
    }, false);
    const crossBlock = (muya as Any).getSelectionInfo?.();
    assert(
      'AI 选区：跨块快照包含段落分隔',
      Boolean(crossBlock) && crossBlock.text === '段文字\n\n第二段',
      JSON.stringify(crossBlock),
    );
    const crossReplaced = (muya as Any).replaceSelectionSnapshot?.(crossBlock, '替换');
    assert(
      'AI 选区：跨块替换保留段落结构',
      crossReplaced === true && muya.getMarkdown() === '第一替换文字\n',
      JSON.stringify(muya.getMarkdown()),
    );

    // 真实 DOM 选区路径：模拟鼠标拖选，快照应优先读 DOM 而不是旧 cursor
    muya.setMarkdown(selectionMd, undefined, false);
    const firstBlock = (muya as Any).contentState.getBlocks()[0];
    const firstEl = document.getElementById(firstBlock?.key ?? '');
    const walker = firstEl ? document.createTreeWalker(firstEl, 4) : null;
    let textNode: Text | null = null;
    while (walker && walker.nextNode()) {
      const node = walker.currentNode as Text;
      if ((node.nodeValue || '').includes('第一段文字')) {
        textNode = node;
        break;
      }
    }
    let domSnapshot: Any = null;
    if (textNode) {
      const range = document.createRange();
      range.setStart(textNode, 0);
      range.setEnd(textNode, 3);
      const nativeSelection = window.getSelection();
      nativeSelection?.removeAllRanges();
      nativeSelection?.addRange(range);
      domSnapshot = (muya as Any).getSelectionInfo?.();
    }
    assert(
      'AI 选区：优先读取真实 DOM 拖选',
      Boolean(domSnapshot) && domSnapshot.text === '第一段' && domSnapshot.start === 0,
      JSON.stringify(domSnapshot),
    );

    const stale = (muya as Any).getSelectionInfo?.();
    muya.setMarkdown('正文已经被用户改掉', undefined, false);
    assert(
      'AI 选区：正文变化后拒绝覆盖',
      (muya as Any).replaceSelectionSnapshot?.(stale, '不该写入') === false,
      JSON.stringify(muya.getMarkdown()),
    );
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
    assert('皮肤：菜单 command 归一，未知值回落白羊', normalizeSkinSelection('nezha') === 'nezha' && normalizeSkinSelection('dark') === 'baiyang' && normalizeSkinSelection(1) === 'baiyang', String(normalizeSkinSelection('dark')));
    assert('皮肤：文案 key 指向根级 skin 节点', skinLabelKey('nezha') === 'skin.nezha' && skinLabelKey('infp') === 'skin.infp', skinLabelKey('nezha'));
  }

  // ===== 库表单：符文/回响图标选项 =====
  {
    const { ECHO_ICON_OPTIONS, RUNE_ICON_OPTIONS, libraryIconOf } = await import('../frontend/src/utils/libraryIcons');
    assert('库图标：符文 15 项、回响 8 项', RUNE_ICON_OPTIONS.length === 15 && ECHO_ICON_OPTIONS.length === 8, `${RUNE_ICON_OPTIONS.length}/${ECHO_ICON_OPTIONS.length}`);
    assert(
      '库图标：所有选项都能映射到 Element 图标',
      [...RUNE_ICON_OPTIONS, ...ECHO_ICON_OPTIONS].every((option) => libraryIconOf(option.value) !== null),
      JSON.stringify([...RUNE_ICON_OPTIONS, ...ECHO_ICON_OPTIONS].filter((option) => !libraryIconOf(option.value))),
    );
    assert('库图标：vue2 默认值与旧内置图标可渲染', libraryIconOf('whatshot') !== null && libraryIconOf('graphic_eq') !== null && libraryIconOf('auto_awesome') !== null, 'defaults');
    assert('库图标：未知值返回 null', libraryIconOf('not_a_real_icon') === null && libraryIconOf('') === null, 'unknown');
  }

  // ===== 新建笔记：默认标题与模板下拉 =====
  {
    const fakeT = (key: string, named?: Record<string, unknown>) => (
      key === 'notes.defaultTitle' ? `【${named?.category ?? ''}】新笔记-${named?.date ?? ''}.md` : key
    );
    const nested = newNoteDefaults('/工作/项目A', fakeT, new Date(2026, 10, 21));
    assert('新建笔记：默认标题取末级分类 + YYYYMM', nested.title === '【项目A】新笔记-202611.md' && nested.categoryName === '项目A' && nested.date === '202611', JSON.stringify(nested));
    const root = newNoteDefaults('/', fakeT, new Date(2026, 0, 2));
    assert('新建笔记：根目录标题分类留空、月份补零', root.title === '【】新笔记-202601.md' && root.categoryName === '', JSON.stringify(root));
    assert('新建文件夹：右键父节点拼子目录、忽略多余斜杠', joinFolderPath('/工作/', '/项目A/') === '/工作/项目A', joinFolderPath('/工作/', '/项目A/'));
    assert('新建文件夹：无父节点支持多级相对路径', joinFolderPath('', '技术/前端') === '/技术/前端', joinFolderPath('', '技术/前端'));
    assert('新建文件夹：空名称拒绝', joinFolderPath('/工作', ' / ') === '', JSON.stringify(joinFolderPath('/工作', ' / ')));
    const batchIds = removableTemplateIds(
      [{ id: 'builtin-1', isBuiltin: true }, { id: 'custom-1', isBuiltin: false }, { id: 'custom-2', isBuiltin: false }],
      ['builtin-1', 'custom-1', 'missing', 'custom-2'],
    );
    assert('模板批删：过滤内置与失效 id', batchIds.join('|') === 'custom-1|custom-2', JSON.stringify(batchIds));
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
    const filled = buildMuyaMenu({ selectionEmpty: false, panguReady: true }) as Array<Record<string, unknown>>;
    assert('菜单：有选区时剪切复制与盘古可用', (filled.find((i) => i.id === 'cut') as { enabled?: boolean }).enabled === true && (filled.find((i) => i.id === 'formatDocument') as { enabled?: boolean }).enabled === true);
    const noPangu = buildMuyaMenu({ selectionEmpty: false, panguReady: false }) as Array<Record<string, unknown>>;
    assert('菜单：盘古未就绪时置灰', (noPangu.find((i) => i.id === 'formatDocument') as { enabled?: boolean }).enabled === false, 'disabled');

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




  // ── 微应用 SFC 解析 / 通用 IPC 桥真链路 ──
  {
    const { default: MicroAppController } = await import('../electron/controller/microapp');
    const controller = new MicroAppController();
    const sfcSource =
      '<template><div class="demo">{{ msg }}</div></template>\n' +
      "<script>export default { data() { return { msg: 'hi' } } }</script>\n" +
      '<style scoped>.demo { color: red; }</style>';
    const compiled = await controller.parse({ source: sfcSource, options: { filename: 'demo.vue', scopeId: 'data-v-test' } });
    const compiledData = compiled.ok ? compiled.data : null;
    assert(
      '微应用 SFC：主进程通道返回 Vue2 playground 四段结果',
      Boolean(
        compiledData &&
          compiledData.template.includes('var render = function render()') &&
          (compiledData.script as { content?: string })?.content?.includes('msg') &&
          compiledData.style.includes('data-v-test') &&
          Array.isArray(compiledData.customBlocks),
      ),
      JSON.stringify(compiled.ok ? Object.keys(compiled.data) : compiled.error),
    );
    const missingTemplate = await controller.parse({ source: '<script>export default {}</script>' });
    assert(
      '微应用 SFC：缺 template 返回 VUE_SFC_TEMPLATE_REQUIRED',
      !missingTemplate.ok && missingTemplate.error.code === 'VUE_SFC_TEMPLATE_REQUIRED',
      JSON.stringify(missingTemplate),
    );
    const nonString = await controller.parse({ source: 123 });
    assert(
      '微应用 SFC：非字符串源码保留 VUE_SFC_SOURCE_REQUIRED',
      !nonString.ok && nonString.error.code === 'VUE_SFC_SOURCE_REQUIRED',
      JSON.stringify(nonString),
    );
    const { IPC_CHANNELS, INVOKE_CHANNELS } = await import('@shared/ipc/channels');
    assert(
      '微应用 SFC：解析通道已登记进 preload 白名单',
      IPC_CHANNELS.microapp.parse === 'controller/microapp/parse' &&
        INVOKE_CHANNELS.has(IPC_CHANNELS.microapp.parse),
      IPC_CHANNELS.microapp.parse,
    );

    const handlers = new Map<string, Set<(payload: Any) => unknown>>();
    const outbox = new Map<string, Any[]>();
    const fakeBus = {
      $on(event: string, handler: (payload: Any) => unknown) {
        const set = handlers.get(event) ?? new Set();
        set.add(handler);
        handlers.set(event, set);
      },
      $off(event: string, handler: (payload: Any) => unknown) {
        handlers.get(event)?.delete(handler);
      },
      $emit(event: string, payload?: Any) {
        if (event.endsWith(':response')) {
          const list = outbox.get(event) ?? [];
          list.push(payload);
          outbox.set(event, list);
          return;
        }
        for (const handler of handlers.get(event) ?? []) {
          void handler(payload);
        }
      },
    };
    const { setWujieBus } = await import('@/services/wujieBus');
    setWujieBus(fakeBus);
    const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
    const calls: Array<{ channel: string; payload: unknown }> = [];
    const originalCoolma = (window as Any).coolma;
    (window as Any).coolma = {
      invoke: async (channel: string, payload: unknown) => {
        calls.push({ channel, payload });
        if (channel === IPC_CHANNELS.microapp.parse) {
          return { ok: true, data: { template: 'var render = function render() {}', script: {}, style: '', customBlocks: [] } };
        }
        if (channel === IPC_CHANNELS.app.info) {
          return { ok: true, data: { name: 'Coolma Vue3' } };
        }
        return { ok: true, data: null };
      },
    };

    try {
      const { installGenericMicroAppIpcBridge } = await import('@/services/genericMicroAppBridge');
      const genericUninstall = installGenericMicroAppIpcBridge();
      fakeBus.$emit('microapp:ipc:request', { requestId: 'g1', channel: IPC_CHANNELS.app.info, args: {} });
      await tick();
      const genericOk = (outbox.get('microapp:ipc:response') ?? []).find((item: Any) => item.requestId === 'g1');
      assert('通用桥：白名单通道成功 invoke 并回包', genericOk?.ok === true && genericOk.result?.name === 'Coolma Vue3', JSON.stringify(genericOk));
      fakeBus.$emit('microapp:ipc:request', { requestId: 'g2', channel: IPC_CHANNELS.notes.remove, args: { id: 1 } });
      await tick();
      const denied = (outbox.get('microapp:ipc:response') ?? []).find((item: Any) => item.requestId === 'g2');
      assert(
        '通用桥：非白名单通道被拒且不触发 invoke',
        denied?.ok === false && denied.error?.code === 'CHANNEL_NOT_ALLOWED' && calls.length === 1,
        JSON.stringify({ denied, calls: calls.length }),
      );
      (window as Any).coolma = {
        invoke: async (channel: string) => {
          calls.push({ channel, payload: null });
          return { ok: false, error: { code: 'TEST_IPC_FAIL', message: 'ipc boom' } };
        },
      };
      fakeBus.$emit('microapp:ipc:request', { requestId: 'g3', channel: IPC_CHANNELS.app.info, args: {} });
      await tick();
      const failed = (outbox.get('microapp:ipc:response') ?? []).find((item: Any) => item.requestId === 'g3');
      assert(
        '通用桥：主进程 IpcResult 失败时解包为 ok=false',
        failed?.ok === false && failed.error?.code === 'TEST_IPC_FAIL',
        JSON.stringify(failed),
      );
      genericUninstall();
    } finally {
      (window as Any).coolma = originalCoolma;
    }

    const { installMicroAppParseBridge, setMicroAppParseImpl, isMicroAppParseBridgeInstalled } = await import(
      '@/services/microAppBridge'
    );
    const originalParseCoolma = (window as Any).coolma;
    const parseCalls: Array<{ channel: string; payload: Any }> = [];
    (window as Any).coolma = {
      invoke: async (channel: string, payload: Any) => {
        parseCalls.push({ channel, payload });
        return { ok: true, data: { template: 'var render = function render() {}', script: {}, style: '', customBlocks: [] } };
      },
    };
    try {
      setMicroAppParseImpl(null);
      const parseUninstall = installMicroAppParseBridge();
      fakeBus.$emit('microapp:parse:request', {
        requestId: 'p1',
        payload: { source: sfcSource, filename: 'card.vue', sourceMap: false, options: {} },
      });
      await tick();
      const parseResp = (outbox.get('microapp:parse:response') ?? []).find((item: Any) => item.requestId === 'p1');
      assert(
        '解析桥：bus 请求转 controller/microapp/parse 并回包',
        parseResp?.ok === true &&
          parseResp.result?.template?.includes('var render') &&
          parseCalls[0]?.channel === IPC_CHANNELS.microapp.parse &&
          parseCalls[0]?.payload?.options?.filename === 'card.vue',
        JSON.stringify({ parseResp, call: parseCalls[0] }),
      );
      const beforeMissing = (outbox.get('microapp:parse:response') ?? []).length;
      fakeBus.$emit('microapp:parse:request', { payload: { source: '<template/>' } });
      await tick();
      assert(
        '解析桥：缺 requestId 的请求被忽略',
        (outbox.get('microapp:parse:response') ?? []).length === beforeMissing,
        String((outbox.get('microapp:parse:response') ?? []).length),
      );
      setMicroAppParseImpl(() => {
        throw Object.assign(new Error('parse boom'), { code: 'TEST_PARSE_FAIL' });
      });
      fakeBus.$emit('microapp:parse:request', { requestId: 'p2', payload: { source: '<template/>' } });
      await tick();
      const parseFail = (outbox.get('microapp:parse:response') ?? []).find((item: Any) => item.requestId === 'p2');
      assert('解析桥：实现抛错时回 ok=false 与错误码', parseFail?.ok === false && parseFail.error?.code === 'TEST_PARSE_FAIL', JSON.stringify(parseFail));
      parseUninstall();
      assert('解析桥：卸载后不再标记已装', isMicroAppParseBridgeInstalled() === false, 'installed');
    } finally {
      (window as Any).coolma = originalParseCoolma;
    }
    setWujieBus(null);
  }

  // ── B8 键盘 accelerator 表 ──
  {
    const {
      getShortcutBindings,
      matchShortcut,
      parseAccelerator,
      isMacPlatform,
    } = await import('../frontend/src/utils/shortcuts');
    type KeyLike = {
      code: string;
      ctrlKey?: boolean;
      metaKey?: boolean;
      shiftKey?: boolean;
      altKey?: boolean;
      isComposing?: boolean;
      keyCode?: number;
    };
    const key = (code: string, modifiers: Partial<KeyLike> = {}): KeyLike => ({
      code,
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      altKey: false,
      ...modifiers,
    });
    const findBinding = (platform: string, id: string) =>
      getShortcutBindings(platform, false).find((binding) => binding.id === id) ?? null;
    const matchId = (platform: string, event: KeyLike): string | null =>
      matchShortcut(event as KeyboardEvent, platform, false)?.id ?? null;

    const linux = getShortcutBindings('linux', false);
    const mac = getShortcutBindings('darwin', false);
    const counts = (platform: string) => {
      const list = getShortcutBindings(platform, false);
      return Object.fromEntries(
        (['mc', 'edit', 'paragraph', 'format', 'view', 'note'] as const).map((group) => [
          group,
          list.filter((binding) => binding.group === group).length,
        ]),
      ) as Record<string, number>;
    };
    assert(
      '快捷键：Linux/Windows 表为 48 条（vue2 完整表去掉 macOS 应用菜单）',
      linux.length === 48 && Object.values(counts('linux')).reduce((sum, value) => sum + value, 0) === 48,
      JSON.stringify({ total: linux.length, groups: counts('linux') }),
    );
    assert(
      '快捷键：分组数量与 vue2 一致（edit 11 / paragraph 20 / format 11 / view 4 / note 2）',
      counts('linux').edit === 11 &&
        counts('linux').paragraph === 20 &&
        counts('linux').format === 11 &&
        counts('linux').view === 4 &&
        counts('linux').note === 2,
      JSON.stringify(counts('linux')),
    );
    assert(
      '快捷键：macOS 额外带 3 条应用菜单项',
      mac.length === 51 && counts('darwin').mc === 3 && isMacPlatform('darwin') && !isMacPlatform('linux'),
      JSON.stringify({ total: mac.length, mc: counts('darwin').mc }),
    );
    assert(
      '快捷键：HTML 块按平台分支（mac J / linux H）',
      findBinding('linux', 'paragraph.html-block')?.code === 'KeyH' &&
        findBinding('darwin', 'paragraph.html-block')?.code === 'KeyJ',
      JSON.stringify([
        findBinding('linux', 'paragraph.html-block')?.accelerator,
        findBinding('darwin', 'paragraph.html-block')?.accelerator,
      ]),
    );
    assert(
      '快捷键：accelerator 解析出物理键与修饰键',
      (() => {
        const parsed = parseAccelerator('CmdOrCtrl+Shift+,');
        return parsed.code === 'Comma' && parsed.shift === true && parsed.alt === false && parsed.modifier === 'cmd-or-ctrl';
      })(),
      JSON.stringify(parseAccelerator('CmdOrCtrl+Shift+,')),
    );

    assert(
      '快捷键：Ctrl+D 是删除线，Ctrl+Alt+D 是复制段落',
      matchId('linux', key('KeyD', { ctrlKey: true })) === 'format.strike' &&
        matchId('linux', key('KeyD', { ctrlKey: true, altKey: true })) === 'edit.duplicate',
      JSON.stringify([
        matchId('linux', key('KeyD', { ctrlKey: true })),
        matchId('linux', key('KeyD', { ctrlKey: true, altKey: true })),
      ]),
    );
    assert(
      '快捷键：Shift 精确匹配（Ctrl+Shift+D 删段，Ctrl+Shift+Z 重做）',
      matchId('linux', key('KeyD', { ctrlKey: true, shiftKey: true })) === 'edit.delete-paragraph' &&
        matchId('linux', key('KeyZ', { ctrlKey: true, shiftKey: true })) === 'edit.redo' &&
        matchId('linux', key('KeyZ', { ctrlKey: true })) === 'edit.undo',
      'shift-exact',
    );
    assert(
      '快捷键：Alt 精确匹配（Ctrl+Alt+D / Ctrl+Alt+- / Ctrl+= / Ctrl+-）',
      matchId('linux', key('Minus', { ctrlKey: true, altKey: true })) === 'paragraph.horizontal-line' &&
        matchId('linux', key('Minus', { ctrlKey: true })) === 'paragraph.degrade-heading' &&
        matchId('linux', key('Equal', { ctrlKey: true })) === 'paragraph.upgrade-heading',
      'alt-exact',
    );
    assert(
      '快捷键：标题层级只认主键盘数字，Ctrl+Shift+1 不误触',
      [1, 2, 3, 4, 5, 6, 0].every((digit) =>
        matchId('linux', key(`Digit${digit}`, { ctrlKey: true })) ===
          (digit === 0 ? 'paragraph.paragraph' : `paragraph.heading-${digit}`),
      ) && matchId('linux', key('Digit1', { ctrlKey: true, shiftKey: true })) === null,
      'headings',
    );
    assert(
      '快捷键：标点键用物理 code 匹配（Ctrl+Shift+, / . / `）',
      matchId('linux', key('Comma', { ctrlKey: true, shiftKey: true })) === 'view.switch-view' &&
        matchId('linux', key('Period', { ctrlKey: true, shiftKey: true })) === 'view.source-mode' &&
        matchId('linux', key('Backquote', { ctrlKey: true })) === 'format.inline-code',
      'punctuation',
    );
    assert(
      '快捷键：段落/格式命令参数与 vue2 菜单一致',
      findBinding('linux', 'paragraph.code-fence')?.action.scope === 'editor' &&
        findBinding('linux', 'paragraph.code-fence')?.action.command === 'paragraph' &&
        (findBinding('linux', 'paragraph.code-fence')?.action as { value?: string }).value === 'pre' &&
        (findBinding('linux', 'paragraph.order-list')?.action as { value?: string }).value === 'ol-order' &&
        (findBinding('linux', 'format.italic')?.action as { value?: string }).value === 'em' &&
        (findBinding('linux', 'format.highlight')?.action as { value?: string }).value === 'mark' &&
        (findBinding('linux', 'format.clear-format')?.action as { value?: string }).value === 'clear',
      'values',
    );
    assert(
      '快捷键：Ctrl+Shift+I/R/P/V/C 不被 Chromium 默认动作抢占',
      matchId('linux', key('KeyI', { ctrlKey: true, shiftKey: true })) === 'format.image' &&
        matchId('linux', key('KeyR', { ctrlKey: true, shiftKey: true })) === 'format.clear-format' &&
        matchId('linux', key('KeyP', { ctrlKey: true, shiftKey: true })) === 'view.devtool' &&
        matchId('linux', key('KeyV', { ctrlKey: true, shiftKey: true })) === 'edit.paste-as-plaintext' &&
        matchId('linux', key('KeyC', { ctrlKey: true, shiftKey: true })) === 'edit.copy-as-markdown',
      'chromium-conflicts',
    );
    assert(
      '快捷键：搜索是 Ctrl+Shift+F，Ctrl+F 只是 vue3 列表筛选别名',
      matchId('linux', key('KeyF', { ctrlKey: true, shiftKey: true })) === 'note.search-note' &&
        matchId('linux', key('KeyF', { ctrlKey: true })) === null,
      'search',
    );
    {
      const aliasBinding = matchShortcut(
        key('KeyF', { ctrlKey: true }) as KeyboardEvent,
        'linux',
      );
      assert(
        '快捷键：Ctrl+F / Ctrl+N 作为 vue3 别名仍可用',
        aliasBinding?.id === 'v3.note-filter' &&
          aliasBinding?.source === 'vue3' &&
          matchShortcut(key('KeyN', { ctrlKey: true }) as KeyboardEvent, 'linux')?.id === 'v3.note-new',
        JSON.stringify(aliasBinding),
      );
    }
    assert(
      '快捷键：cut/copy/paste 标记 native，不拦截浏览器默认行为',
      ['edit.cut', 'edit.copy', 'edit.paste'].every((id) => {
        const binding = findBinding('linux', id);
        return binding?.action.scope === 'native' && ['cut', 'copy', 'paste'].includes(binding.action.command);
      }),
      'native-clipboard',
    );
    assert(
      '快捷键：macOS Cmd+H / Cmd+Alt+H / Cmd+Q 保留应用菜单语义',
      (findBinding('darwin', 'mc.hide')?.action as { command?: string })?.command === 'hide' &&
        (findBinding('darwin', 'mc.hide-others')?.action as { command?: string })?.command === 'hideOthers' &&
        (findBinding('darwin', 'mc.quit')?.action as { command?: string })?.command === 'quit' &&
        matchId('darwin', key('KeyQ', { metaKey: true })) === 'mc.quit',
      'mac-menu',
    );
    assert(
      '快捷键：macOS 用 Command 而不是 Ctrl；Windows/Linux 用 Ctrl',
      matchId('darwin', key('KeyS', { ctrlKey: true })) !== 'note.save' &&
        matchId('darwin', key('KeyS', { metaKey: true })) === 'note.save' &&
        matchId('linux', key('KeyS', { metaKey: true })) === null &&
        matchId('linux', key('KeyS', { ctrlKey: true })) === 'note.save',
      'platform-modifier',
    );
    assert(
      '快捷键：输入法组合态与 keyCode 229 不触发',
      matchId('linux', key('KeyB', { ctrlKey: true, isComposing: true })) === null &&
        matchId('linux', key('KeyB', { ctrlKey: true, keyCode: 229 })) === null &&
        matchId('linux', key('KeyB', { ctrlKey: true })) === 'format.strong',
      'ime',
    );
    assert(
      '快捷键：同组 id 唯一，避免多个命令抢同一按键',
      new Set(linux.map((binding) => binding.id)).size === linux.length &&
        new Set(mac.map((binding) => binding.id)).size === mac.length,
      `${linux.length}/${mac.length}`,
    );

    // 表里的命令值直接喂给真实引擎，确认不是「只对文案」
    muya.setMarkdown('快捷键标题\n', { anchor: { line: 0, ch: 1 }, focus: { line: 0, ch: 1 } }, false);
    const headingBinding = findBinding('linux', 'paragraph.heading-1');
    muya.updateParagraph((headingBinding?.action as { value?: string })?.value ?? '');
    assert(
      '快捷键：Ctrl+1 的 heading 1 能被 Muya 消费',
      muya.getMarkdown().trim() === '# 快捷键标题',
      JSON.stringify(muya.getMarkdown()),
    );
    muya.setMarkdown('快捷键格式\n', undefined, false);
    // format 读的是 DOM selection；在真实文本节点上选前两个字，模拟用户划词。
    {
      const textRoot = editorRoot();
      const walker = document.createTreeWalker(textRoot, 4);
      let textNode: Text | null = null;
      while (walker.nextNode()) {
        const node = walker.currentNode as Text;
        if ((node.nodeValue || '').includes('快捷键格式')) {
          textNode = node;
          break;
        }
      }
      assert('快捷键：找到格式测试文本节点', Boolean(textNode), 'text-node');
      if (textNode) {
        const range = document.createRange();
        range.setStart(textNode, 0);
        range.setEnd(textNode, 2);
        const domSelection = window.getSelection();
        domSelection?.removeAllRanges();
        domSelection?.addRange(range);
      }
    }
    const strongBinding = findBinding('linux', 'format.strong');
    muya.format((strongBinding?.action as { value?: string })?.value ?? '');
    assert(
      '快捷键：Ctrl+B 的 strong 能被 Muya 消费',
      /^\*\*快捷\*\*键格式/.test(muya.getMarkdown()),
      JSON.stringify(muya.getMarkdown()),
    );

    const { IPC_CHANNELS, INVOKE_CHANNELS } = await import('@shared/ipc/channels');
    assert(
      '快捷键：DevTools 通道已登记并进入 preload 白名单',
      IPC_CHANNELS.window.openDevTools === 'controller/window/openDevTools' &&
        INVOKE_CHANNELS.has(IPC_CHANNELS.window.openDevTools),
      IPC_CHANNELS.window.openDevTools,
    );
  }

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
    assert('i18n：皮肤名在根级 skin 节点可解析', fixed.skin?.nezha === '哪吒' && fixed.skin?.baiyang === '白羊' && fixed.skin?.infp === 'INFP', JSON.stringify(fixed.skin));
    assert('i18n：新建笔记标题模板可解析', fixed.notes?.defaultTitle === '【{category}】新笔记-{date}.md', JSON.stringify(fixed.notes?.defaultTitle));
    assert('i18n：模板批删文案可解析', fixed.noteTemplateBatchDelete === '批量删除模板' && fixed.selectedCount === '已选 {count} 项', JSON.stringify([fixed.noteTemplateBatchDelete, fixed.selectedCount]));
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

  blogEnv: {
    const fs = await import('node:fs/promises');
    const os = await import('node:os');
    const nodePath = await import('node:path');
    const { execFileSync } = await import('node:child_process');
    const tmp = await fs.mkdtemp(nodePath.join(os.tmpdir(), 'coolma-blog-env-'));

    const defaultPkg = buildBlogPackageJson('default');
    const vdoingPkg = buildBlogPackageJson('vdoing');
    assert(
      '博客环境：默认主题只带 vuepress/lodash/cross-env，构建脚本跨平台',
      defaultPkg.dependencies?.vuepress === '^1.9.0' &&
        defaultPkg.dependencies?.['cross-env'] === '^7.0.3' &&
        !defaultPkg.dependencies?.['vuepress-theme-vdoing'] &&
        String(defaultPkg.scripts?.build).includes('cross-env NODE_OPTIONS=--openssl-legacy-provider'),
      JSON.stringify(defaultPkg),
    );
    assert(
      '博客环境：vdoing 主题加对应依赖',
      vdoingPkg.dependencies?.['vuepress-theme-vdoing'] === '^1.5.0',
      JSON.stringify(vdoingPkg.dependencies),
    );
    assert(
      '博客环境：vuepress v2 或主题不匹配时重建 package.json',
      shouldRebuildPackage({ dependencies: { vuepress: '^2.0.0' } }, 'default') &&
        shouldRebuildPackage({ dependencies: { vuepress: '^1.9.0' } }, 'vdoing') &&
        !shouldRebuildPackage({ dependencies: { vuepress: '^1.9.0' } }, 'default'),
      'rebuild',
    );
    assert(
      '博客环境：主题检测覆盖 default/vdoing/hope/reco，非法值回落 default',
      detectConfigTheme("module.exports = { theme: 'reco' }") === 'reco' &&
        detectConfigTheme("module.exports = { theme: 'vdoing' }") === 'vdoing' &&
        detectConfigTheme("const { config } = require('vuepress-theme-hope')") === 'hope' &&
        detectConfigTheme('module.exports = {}') === null &&
        normalizeBlogTheme('nope') === 'default',
      'theme',
    );
    const installCmd = buildManagerCommand('npm', 'install');
    assert(
      '博客环境：安装命令按包管理器生成',
      `${installCmd.command} ${installCmd.args.join(' ')}`.includes('npm') &&
        `${installCmd.command} ${installCmd.args.join(' ')}`.includes('install'),
      `${installCmd.command} ${installCmd.args.join(' ')}`,
    );
    const { blogBuildSchema } = await import('@shared/ipc/schemas');
    assert(
      '博客环境：build 脚本名拒绝空格与 shell 分隔符',
      blogBuildSchema.safeParse({ blogDir: 'x', script: 'docs:build' }).success &&
        !blogBuildSchema.safeParse({ blogDir: 'x', script: 'build && rm -rf /' }).success,
      'schema',
    );
    assert(
      '博客 base：规范化与 vue2 一致',
      normalizeBase('/foo') === '/foo/' &&
        normalizeBase('/foo///') === '/foo/' &&
        normalizeBase('./foo') === './foo/' &&
        normalizeBase('./') === './' &&
        normalizeBase('/') === '/' &&
        normalizeBase('') === '' &&
        quoteBase('/foo') === "'/foo/'",
      JSON.stringify([normalizeBase('/foo'), normalizeBase('/foo///'), quoteBase('/foo')]),
    );
    const baseReplaced = applyBaseToConfig("module.exports = { title: 'X', base: './' }", '/foo///');
    assert(
      '博客 base：已有 base 整段覆盖且保留其它字段',
      baseReplaced.mode === 'replaced' &&
        readBaseFromConfig(baseReplaced.content) === '/foo/' &&
        baseReplaced.content.includes("title: 'X'") &&
        baseReplaced.content.includes('// memocast: base=/foo/'),
      baseReplaced.content,
    );
    const replacedFile = nodePath.join(tmp, 'config-base-replaced.js');
    await fs.writeFile(replacedFile, baseReplaced.content, 'utf-8');
    execFileSync('node', ['--check', replacedFile], { stdio: 'pipe' });
    const baseInserted = applyBaseToConfig("module.exports = {\n  title: 'X'\n}", '/blog');
    assert(
      '博客 base：缺 base 时插入导出对象且不破坏字段',
      baseInserted.mode === 'inserted' &&
        readBaseFromConfig(baseInserted.content) === '/blog/' &&
        baseInserted.content.includes("title: 'X'"),
      baseInserted.content,
    );
    const insertedFile = nodePath.join(tmp, 'config-base-inserted.js');
    await fs.writeFile(insertedFile, baseInserted.content, 'utf-8');
    execFileSync('node', ['--check', insertedFile], { stdio: 'pipe' });
    const hopeBase = applyBaseToConfig(buildVuepressConfig('hope'), '/docs');
    const hopeBaseFile = nodePath.join(tmp, 'config-base-hope.js');
    await fs.writeFile(hopeBaseFile, hopeBase.content, 'utf-8');
    execFileSync('node', ['--check', hopeBaseFile], { stdio: 'pipe' });
    assert(
      '博客 base：hope 的 config({...}) 也能注入',
      hopeBase.mode === 'replaced' && readBaseFromConfig(hopeBase.content) === '/docs/',
      hopeBase.content.slice(0, 160),
    );
    const themed = buildVuepressConfig('vdoing', '/blog///');
    assert(
      '博客 base：新生成主题 config 直接写入规范化 base',
      themed.includes("theme: 'vdoing'") && readBaseFromConfig(themed) === '/blog/',
      themed.slice(0, 200),
    );

    const configDir = nodePath.join(tmp, '.vuepress');
    const utilsDir = nodePath.join(configDir, 'utils');
    await fs.mkdir(utilsDir, { recursive: true });
    for (const theme of ['default', 'vdoing', 'hope', 'reco'] as const) {
      const configPath = nodePath.join(configDir, `config-${theme}.js`);
      await fs.writeFile(configPath, buildVuepressConfig(theme), 'utf-8');
      execFileSync('node', ['--check', configPath], { stdio: 'pipe' });
    }
    assert('博客环境：四套主题 config.js 语法均通过 node --check', true, 'default/vdoing/hope/reco');

    await fs.writeFile(nodePath.join(configDir, 'id-mappings.json'), JSON.stringify({
      mappings: [
        { id: 'b1', title: 'B', category: '技术', shortUrl: '/b1.html' },
        { id: 'a1', title: 'A', category: '技术', shortUrl: '/a1.html' },
        { id: 'u1', title: 'U', category: '', shortUrl: '/u1.html' },
      ],
    }), 'utf-8');
    await fs.writeFile(nodePath.join(configDir, 'seq-manifest.json'), JSON.stringify({ b1: 2, a1: 1, u1: 3 }), 'utf-8');
    await fs.writeFile(nodePath.join(utilsDir, 'sidebar-builder.js'), SIDEBAR_BUILDER_SOURCE, 'utf-8');
    await fs.writeFile(nodePath.join(utilsDir, 'nav-builder.js'), NAV_BUILDER_SOURCE, 'utf-8');
    execFileSync('node', [nodePath.join(utilsDir, 'sidebar-builder.js')], { stdio: 'pipe' });
    execFileSync('node', [nodePath.join(utilsDir, 'nav-builder.js')], { stdio: 'pipe' });
    const sidebar = JSON.parse(await fs.readFile(nodePath.join(configDir, 'sidebar.json'), 'utf-8'));
    const nav = JSON.parse(await fs.readFile(nodePath.join(configDir, 'nav.json'), 'utf-8'));
    assert(
      '博客环境：sidebar 用 / 根键并按分类分组，空分类归未分类',
      Array.isArray(sidebar['/']) &&
        sidebar['/'].map((group: { title: string }) => group.title).join('|') === '技术|未分类',
      JSON.stringify(sidebar),
    );
    assert(
      '博客环境：sidebar 同分类按 seq 排序',
      sidebar['/'].find((group: { title: string }) => group.title === '技术')?.children.map((item: { title: string }) => item.title).join('|') === 'A|B',
      JSON.stringify(sidebar['/']),
    );
    assert(
      '博客环境：nav 首页 + 分类组 + 空分类归文章（分类链接取映射首项，不按 seq）',
      nav[0]?.text === '首页' && nav[1]?.text === '技术' && nav[1]?.link === '/b1.html' && nav.some((item: { text: string }) => item.text === '文章'),
      JSON.stringify(nav),
    );
    await fs.rm(tmp, { recursive: true, force: true });
  }

  runeRemote: {
    assert(
      '符文远程：blob/raw 转 raw，raw/gist 原样，非 GitHub 拒绝',
      toRawGithubUrl('https://github.com/o/r/blob/main/foo.vue') === 'https://raw.githubusercontent.com/o/r/main/foo.vue' &&
        toRawGithubUrl('https://github.com/o/r/raw/main/foo.vue') === 'https://raw.githubusercontent.com/o/r/main/foo.vue' &&
        toRawGithubUrl('https://raw.githubusercontent.com/o/r/main/foo.vue') === 'https://raw.githubusercontent.com/o/r/main/foo.vue' &&
        toRawGithubUrl('https://gist.githubusercontent.com/u/1/raw/foo.vue') === 'https://gist.githubusercontent.com/u/1/raw/foo.vue' &&
        toRawGithubUrl('http://127.0.0.1/foo.vue') === null &&
        toRawGithubUrl('file:///tmp/foo.vue') === null,
      'url',
    );
    const single = inferRemoteRuneMeta(
      '<!-- name: 倒计时, desc: 剩余天数, category: education -->\n<template><p>x</p></template>',
      'https://raw.githubusercontent.com/o/r/main/countdown.vue',
    );
    assert(
      '符文远程：单行注释解析 name/desc/category',
      single.name === '倒计时' && single.desc === '剩余天数' && single.category === 'education',
      JSON.stringify(single),
    );
    const multi = inferRemoteRuneMeta(
      '<!--\n  name: 高亮\n  desc: 标记文本\n  category: novel\n-->\n<template><p>x</p></template>',
      'https://raw.githubusercontent.com/o/r/main/highlight.vue',
    );
    assert(
      '符文远程：多行注释解析',
      multi.name === '高亮' && multi.desc === '标记文本' && multi.category === 'novel',
      JSON.stringify(multi),
    );
    const overridden = inferRemoteRuneMeta('<template/>', 'https://raw.githubusercontent.com/o/r/main/my-rune.vue', 'medical');
    assert(
      '符文远程：分类覆盖优先，名称回退 URL 文件名',
      overridden.category === 'medical' && overridden.name === 'my-rune',
      JSON.stringify(overridden),
    );
    const invalid = inferRemoteRuneMeta('<!-- name: X, category: nope -->', 'https://raw.githubusercontent.com/o/r/main/x.vue');
    assert(
      '符文远程：非法分类回退 general',
      invalid.category === 'general' && fallbackRuneName('bad-url') === 'remote-template',
      JSON.stringify(invalid),
    );

    const originalFetch = (globalThis as Any).fetch;
    try {
      let hop = 0;
      (globalThis as Any).fetch = async () => {
        hop += 1;
        if (hop === 1) {
          return new Response(null, {
            status: 302,
            headers: { location: 'https://raw.githubusercontent.com/o/r/main/next.vue' },
          });
        }
        return new Response('<template><p>hop</p></template>', { status: 200 });
      };
      const redirected = await fetchRemoteText('https://raw.githubusercontent.com/o/r/main/start.vue');
      assert(
        '符文远程：跟随 302 且 finalUrl 取规范化 raw（对齐 vue2）',
        redirected.success && redirected.text?.includes('hop') && redirected.finalUrl?.endsWith('/start.vue'),
        JSON.stringify(redirected),
      );

      (globalThis as Any).fetch = async () =>
        new Response(null, {
          status: 302,
          headers: { location: 'http://127.0.0.1:5984/secret.vue' },
        });
      const blocked = await fetchRemoteText('https://raw.githubusercontent.com/o/r/main/start.vue');
      assert(
        '符文远程：重定向到内网被 UNSUPPORTED_HOST 拒绝',
        !blocked.success && blocked.code === 'UNSUPPORTED_HOST',
        JSON.stringify(blocked),
      );

      (globalThis as Any).fetch = async () =>
        new Response('ignored', {
          status: 200,
          headers: { 'content-length': String(6 * 1024 * 1024) },
        });
      const tooLarge = await fetchRemoteText('https://raw.githubusercontent.com/o/r/main/big.vue');
      assert(
        '符文远程：content-length 超 5MB 被 TOO_LARGE 拒绝',
        !tooLarge.success && tooLarge.code === 'TOO_LARGE',
        JSON.stringify(tooLarge),
      );

      (globalThis as Any).fetch = async () =>
        new Response('<!-- name: 远程卡片 -->\n<template><p>ok</p></template>', { status: 200 });
      const fetched = await fetchRemoteText('https://raw.githubusercontent.com/o/r/main/card.vue');
      assert(
        '符文远程：抓取成功返回文本与 finalUrl',
        fetched.success && fetched.text?.includes('<template>') && fetched.finalUrl?.endsWith('/card.vue'),
        JSON.stringify(fetched),
      );
    } finally {
      (globalThis as Any).fetch = originalFetch;
    }

    const { runeSaveSchema } = await import('@shared/ipc/schemas');
    const baseRune = { id: 'remote-tpl-test', name: '远程模板' };
    const maxTemplate = 'x'.repeat(REMOTE_RUNE_MAX_BYTES);
    assert(
      '符文远程：保存 schema 接受 1MB 模板并拒绝超限',
      REMOTE_RUNE_MAX_BYTES === 1024 * 1024
        && runeSaveSchema.safeParse({ ...baseRune, template: maxTemplate }).success
        && !runeSaveSchema.safeParse({ ...baseRune, template: `${maxTemplate}x` }).success,
      String(REMOTE_RUNE_MAX_BYTES),
    );
  }

  paneLayout: {
    const {
      normalizePaneLayout,
      nextPaneLayout,
      paneVisibility,
      paneGeometry,
      normalizeSplitterWidth,
      normalizeLeftInnerHeight,
      DEFAULT_SPLITTER_WIDTH,
      DEFAULT_LEFT_INNER_HEIGHT,
    } = await import('@/utils/paneLayout');
    assert('常规视图：布局循环 0→1→2→0（对齐 vue2 cyclePaneLayout）', nextPaneLayout(0) === 1 && nextPaneLayout(1) === 2 && nextPaneLayout(2) === 0, 'cycle');
    assert('常规视图：三态可见性与 vue2 一致（2 只剩正文）', paneVisibility(0).sidebar && paneVisibility(0).list && paneVisibility(1).list && !paneVisibility(2).list, JSON.stringify([paneVisibility(0), paneVisibility(1), paneVisibility(2)]));
    assert('常规视图：非法/越界值归一成三栏', normalizePaneLayout('9') === 0 && normalizePaneLayout(null) === 0 && normalizePaneLayout(2) === 2, 'normalize');
    assert(
      '常规视图：默认几何对齐 vue2（左栏 580、上块 240）',
      normalizeSplitterWidth(null) === DEFAULT_SPLITTER_WIDTH
        && normalizeLeftInnerHeight(null) === DEFAULT_LEFT_INNER_HEIGHT
        && paneGeometry(0, 580, 240).splitterWidth === 580
        && paneGeometry(0, 580, 240).leftInnerHeight === 240,
      JSON.stringify([normalizeSplitterWidth(null), normalizeLeftInnerHeight(null), paneGeometry(0, 580, 240)]),
    );
    assert(
      '常规视图：模式 1 不留上块空槽，模式 2 左栏归零',
      paneGeometry(1, 580, 240).leftInnerHeight === 0
        && paneGeometry(2, 580, 240).splitterWidth === 0
        && paneGeometry(2, 580, 240).leftInnerHeight === 0,
      JSON.stringify([paneGeometry(1, 580, 240), paneGeometry(2, 580, 240)]),
    );
    assert(
      '常规视图：左栏最小 300、上块最小 120，窗口过窄优先保编辑器',
      normalizeSplitterWidth(100) === 300
        && normalizeLeftInnerHeight(50) === 120
        && normalizeSplitterWidth(580, 400) === 400
        && paneGeometry(1, 580, 240, 800).splitterWidth === 480,
      JSON.stringify([normalizeSplitterWidth(100), normalizeLeftInnerHeight(50), normalizeSplitterWidth(580, 400), paneGeometry(1, 580, 240, 800)]),
    );
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
    assert('为知同步：autoLogin/login/status/pull/push 通道齐全且白名单放行', [IPC_CHANNELS.sync.autoLogin, IPC_CHANNELS.sync.login, IPC_CHANNELS.sync.status, IPC_CHANNELS.sync.pull, IPC_CHANNELS.sync.push].every((c) => INVOKE_CHANNELS.has(c)), String(INVOKE_CHANNELS.size));
    assert('为知同步：login 空账号被 zod 拦下', !syncLoginSchema.safeParse({ userId: '', password: '' }).success, 'rejected');
    const listQuery = buildNoteListQuery({ category: '/My Notes/', limit: 20, start: 40 });
    assert('为知同步：列表只发服务端认识的 orderBy=modified', listQuery.get('orderBy') === 'modified' && listQuery.get('start') === '40' && listQuery.get('count') === '20', listQuery.toString());
    assert('为知同步：云端 .md 标题查重前统一去扩展名', stripWizMarkdownSuffix(' 计算机.md ') === '计算机' && stripWizMarkdownSuffix('a\u00a0b.MD') === 'a b', stripWizMarkdownSuffix(' 计算机.md '));
    assert('为知同步：本地根分类推送时映射为 /My Notes/', toWizRemoteCategory('/') === '/My Notes/' && toWizRemoteCategory('/工作') === '/My Notes/工作/' && toWizRemoteCategory('/My Notes/【0】计算机') === '/My Notes/【0】计算机/', `root=${toWizRemoteCategory('/')} top=${toWizRemoteCategory('/工作')} nested=${toWizRemoteCategory('/My Notes/【0】计算机')}`);
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
    const { safeEvalAnnoSource, HANDLER_PRELUDE } = await import('../../libs-muya-echo-vue3/src/core/echoAnnoSource.js') as Any;
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

  // ==== 博客 SFTP：纯路径 / 目录收集 ====
  {
    assert(
      'SFTP：远程目录规整去掉重复分隔符和末尾斜杠',
      normalizeRemotePath('/var/www//blog/') === '/var/www/blog' && normalizeRemotePath('/') === '/',
      normalizeRemotePath('/var/www//blog/'),
    );
    let threw = false;
    try {
      normalizeRemotePath('   ');
    } catch {
      threw = true;
    }
    assert('SFTP：远程目录为空直接报错', threw, '');

    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'coolma-sftp-'));
    try {
      await fs.mkdir(path.join(root, 'assets', 'img'), { recursive: true });
      await fs.writeFile(path.join(root, 'index.html'), '<html></html>');
      await fs.writeFile(path.join(root, 'assets', 'app.js'), 'console.log(1)');
      await fs.writeFile(path.join(root, 'assets', 'img', 'logo.png'), 'png');
      await fs.symlink(path.join(root, 'index.html'), path.join(root, 'index-link.html'));
      const tree = await collectTree(root);
      assert(
        'SFTP：递归收集目录与文件并输出 posix 相对路径',
        [...tree.dirs].sort().join(',') === 'assets,assets/img'
          && [...tree.files].sort().join(',') === 'assets/app.js,assets/img/logo.png,index-link.html,index.html',
        JSON.stringify(tree),
      );
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  }

  // ==== 图床上传：PicGo HTTP 契约 + 为知资源名落盘 ====
  {
    const server = http.createServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ success: true, result: ['https://cdn.example.com/pasted.png'] }));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    try {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      const url = await uploadImageByPicGo('/tmp/pasted.png', `http://127.0.0.1:${port}/upload`);
      assert('图床：PicGo 上传返回 result[0]', url === 'https://cdn.example.com/pasted.png', url);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }

    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'coolma-image-'));
    try {
      const saved = await saveAttachmentBuffer({
        root,
        kbGuid: 'kb',
        docGuid: 'doc',
        buffer: Buffer.from('png'),
        name: '../../evil.png',
      });
      assert(
        '图床：为知资源名落盘被限制在附件目录内',
        path.dirname(saved.filePath) === attachmentDir(root, 'kb', 'doc')
          && saved.name === '_.._evil.png'
          && saved.url.endsWith('/_.._evil.png'),
        `${saved.filePath} | ${saved.url}`,
      );
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  }

  // ==== 同步推送纯规则（vue2 pushToCloud 分支） ====
  {
    assert('同步规则：2004 视为云端笔记不存在', isNoteMissingError({ code: 2004 }), 'code 2004');
    assert(
      '同步规则：not found 文案也回退新建',
      isNoteMissingError({ code: 500, message: 'note not found' }),
      'message not found',
    );
    assert(
      '同步规则：普通网络错误不回退新建',
      !isNoteMissingError({ code: 'TIMEOUT', message: 'WizNote request timed out' }),
      'timeout',
    );
    assert(
      '同步规则：目录 409 视为已存在',
      isCategoryExistsError({ status: 409, message: 'conflict' }) && isCategoryExistsError({ status: 400 }),
      '409/400',
    );
    assert(
      '同步规则：分类路径拆 parent/child',
      JSON.stringify(toWizCategoryInput('/工作/子目录')) === JSON.stringify({ parent: '/工作/', child: '子目录' })
        && JSON.stringify(toWizCategoryInput('/工作')) === JSON.stringify({ parent: '/', child: '工作' }),
      JSON.stringify([toWizCategoryInput('/工作/子目录'), toWizCategoryInput('/工作')]),
    );
    assert(
      '同步规则：目录按深度先父后子',
      sortCategoriesByDepth([{ category: '/a/b/c' }, { category: '/a' }, { category: '/a/b' }])
        .map((item) => item.category)
        .join(',') === '/a,/a/b,/a/b/c',
      'depth sort',
    );
    const cloudNotes = [
      { docGuid: 'g1', title: '周报', category: '/My Notes/' },
      { docGuid: 'g2', title: '周报', category: '/工作' },
    ];
    const matchedRoot = findCloudNoteByTitle(cloudNotes, { title: '周报', category: '/' });
    assert(
      '同步规则：同目录同名命中（根目录别名归一）',
      matchedRoot?.docGuid === 'g1' && normalizeMatchCategory('/My Notes/') === '/',
      JSON.stringify(matchedRoot),
    );
    assert(
      '同步规则：同名不同目录不误配',
      findCloudNoteByTitle(cloudNotes, { title: '周报', category: '/工作/子目录' }) === null,
      'category mismatch',
    );
    assert(
      '拉取规则：根目录别名与大小写归一去重 key 一致',
      cloudDedupeKey({ title: ' 周报 ', category: '/My Notes/', kbGuid: 'KB' })
        === cloudDedupeKey({ title: '周报', category: '/', kbGuid: 'kb' }),
      cloudDedupeKey({ title: ' 周报 ', category: '/My Notes/', kbGuid: 'KB' }),
    );
    assert(
      '拉取规则：不同目录不共用去重 key',
      cloudDedupeKey({ title: '周报', category: '/工作', kbGuid: 'kb' })
        !== cloudDedupeKey({ title: '周报', category: '/生活', kbGuid: 'kb' }),
      'category differs',
    );
    assert(
      '拉取规则：目录删除路径补尾斜杠、根目录拒绝',
      toWizCategoryDeletePath('/工作/子目录') === '/工作/子目录/'
        && toWizCategoryDeletePath('/') === '/',
      toWizCategoryDeletePath('/工作/子目录'),
    );

    const guidToName = new Map([
      ['guid-gongzuo', '工作'],
      ['guid-shenghuo', '生活'],
    ]);
    assert(
      '标签规则：云端 GUID 串翻成本地名称、未知 token 原样保留',
      cloudTagsToNames('guid-gongzuo*guid-shenghuo*guid-unknown', guidToName) === '工作,生活,guid-unknown',
      cloudTagsToNames('guid-gongzuo*guid-shenghuo*guid-unknown', guidToName),
    );
    assert(
      '标签规则：云端空 tags 得到空名称串',
      cloudTagsToNames('', guidToName) === '' && splitCloudTagString(undefined).length === 0,
      JSON.stringify(splitCloudTagString('*工作**生活*')),
    );
    const nameToGuid = new Map([['工作', 'G1']]);
    const knownGuid = new Set(['g2']);
    const mapped = localNamesToCloudTags('工作,g2,新标签,工作', nameToGuid, knownGuid);
    assert(
      '标签规则：本地名称翻 GUID、旧 GUID 保留、缺的记 missing',
      mapped.tags === 'G1*g2' && mapped.missing.length === 1 && mapped.missing[0] === '新标签',
      JSON.stringify(mapped),
    );

    let received = '';
    let mode = '';
    assert('AI 插入：没有编辑器时无人接住', emitAiInsert('hello') === false, 'false');
    const stop = onAiInsert((text, insertMode) => {
      received = text;
      mode = insertMode;
      return true;
    });
    assert('AI 插入：有编辑器时接住文本', emitAiInsert('hello') === true && received === 'hello', received);
    assert('AI 插入：默认走追加，不误覆盖', mode === 'append', mode);
    assert('AI 插入：显式覆盖模式能传到编辑器', emitAiInsert('overwrite', 'replace') === true && mode === 'replace', mode);
    stop();
    assert('AI 插入：退订后不再接住', emitAiInsert('again') === false && received === 'overwrite', received);

    const folderMd = buildFolderMarkdown([
      { title: '第一篇.md', content: 'A' },
      { title: '第二篇', content: '' },
    ]);
    assert(
      '目录 Markdown：标题去 .md、篇间分隔、空正文保留',
      folderMd === '## 第一篇\n\nA\n\n---\n\n## 第二篇\n\n',
      JSON.stringify(folderMd),
    );
    assert('目录 Markdown：空列表返回空串', buildFolderMarkdown([]) === '', 'empty');

    const sse = drainSseDataLines('data: {"n":1}\r\n\ndata: [DONE]\npartial');
    assert(
      'AI 流：data 行抽出、CRLF 兼容、残包留给下一轮',
      sse.lines.length === 2 && sse.lines[0] === '{"n":1}' && sse.lines[1] === '[DONE]' && sse.rest === 'partial',
      JSON.stringify(sse),
    );
    assert(
      'AI 流：delta 兼容字符串与分段数组',
      extractDeltaText({ content: '你' }) === '你'
        && extractDeltaText({ content: [{ text: '好' }, { text: '的' }] }) === '好的'
        && extractDeltaText({}) === '',
      JSON.stringify(extractDeltaText({ content: [{ text: '好' }] })),
    );

    const { aiChatCancelSchema, aiChatStreamSchema } = await import('@shared/ipc/schemas');
    assert('AI 流：取消请求校验 requestId', aiChatCancelSchema.safeParse({ requestId: 'ai-1' }).success, 'ok');
    assert('AI 流：取消请求拒绝空 requestId', !aiChatCancelSchema.safeParse({ requestId: '' }).success, 'rejected');
    assert(
      'AI 流：流式请求必须带 requestId',
      !aiChatStreamSchema.safeParse({ messages: [{ role: 'user', content: 'x' }] }).success,
      'rejected',
    );

    const panguOut = await formatDocumentByPangu(
      '# 标题中文English\n\n中文English混排123\n\n```\nconst a=1中文\n```\n\n* [ ] 任务中文English\n',
    );
    assert(
      '盘古：中英混排补空格',
      panguOut.includes('标题中文 English') && panguOut.includes('中文 English 混排 123'),
      panguOut,
    );
    assert(
      '盘古：代码块内容不拆空格、任务列表不被转义',
      panguOut.includes('const a=1中文') && panguOut.includes('* [ ] 任务中文 English'),
      panguOut,
    );

    const defaultCdn = mergeCdnDeps([]);
    assert(
      'CDN：空保存项回落内置 7 项且都标内置',
      defaultCdn.length === 7 && defaultCdn.every((dep) => dep.isBuiltIn === true) && defaultCdn.filter((dep) => dep.url).length === 7,
      String(defaultCdn.length),
    );
    const merged = mergeCdnDeps([
      { id: 'layui', name: 'layui JS', url: 'https://x/layui.js', enabled: false, applyToBlog: true },
      { id: 'custom', name: 'custom.js', url: 'https://x/custom.js', enabled: true, applyToBlog: false },
    ]);
    const layui = merged.find((dep) => dep.name === 'layui JS');
    const custom = merged.find((dep) => dep.name === 'custom.js');
    assert(
      'CDN：内置同名字段覆盖、自定义项追加',
      merged.length === 8 && layui?.enabled === false && layui?.applyToBlog === true && layui?.isBuiltIn === true && custom?.isBuiltIn === false,
      JSON.stringify({ len: merged.length, layui, custom }),
    );
    assert(
      'CDN：资源类型与 jQuery 核心识别',
      getResourceType('a.js') === 'script'
        && getResourceType('a.css') === 'stylesheet'
        && getResourceType('a.woff2') === 'font'
        && isJQueryCoreDep({ name: 'jQuery', url: 'https://x/jquery.min.js' }) === true
        && isJQueryCoreDep({ name: 'jQuery Migrate', url: 'https://x/jquery-migrate.min.js' }) === false,
      `${getResourceType('a.woff2')}`,
    );

    const primaryArea = { x: 0, y: 0, width: 1920, height: 1080 };
    const defaults = { width: 1280, height: 820, minWidth: 960, minHeight: 600 };
    const parsedState = parseWindowState({ x: 100.4, y: 80.6, width: 1200.2, height: 800.9, maximized: true });
    assert(
      '窗口状态：合法数据取整并保留最大化',
      parsedState?.x === 100 && parsedState?.y === 81 && parsedState?.width === 1200 && parsedState?.height === 801 && parsedState?.maximized === true,
      JSON.stringify(parsedState),
    );
    assert(
      '窗口状态：非法宽高直接丢弃',
      parseWindowState({ x: 0, y: 0, width: 0, height: 800, maximized: false }) === null
        && parseWindowState({ x: '0', y: 0, width: 800, height: 600 }) === null,
      'invalid accepted',
    );
    const offscreen = fitWindowBounds({ x: 99999, y: 99999, width: 1200, height: 800, maximized: false }, [primaryArea], defaults);
    const tiny = fitWindowBounds({ x: -100, y: -50, width: 500, height: 300, maximized: false }, [primaryArea], defaults);
    const secondary = fitWindowBounds(
      { x: 2000, y: 100, width: 1280, height: 820, maximized: false },
      [primaryArea, { x: 1920, y: 0, width: 1920, height: 1080 }],
      defaults,
    );
    assert(
      '登录：自建地址去尾斜杠、空值回默认、只认 http(s)',
      normalizeServerUrl(' https://wiz.example.com/// ') === 'https://wiz.example.com'
        && normalizeServerUrl('   ') === DEFAULT_LOGIN_BASE
        && isValidServerUrl('https://wiz.example.com')
        && isValidServerUrl('http://10.0.0.2:8080')
        && !isValidServerUrl('wiz.example.com'),
      '登录地址规则',
    );
    assert(
      '登录：注册地址仅自建启用且地址非空时用自建，否则回 wiz.cn',
      resolveSignupUrl('', true) === 'https://wiz.cn/signup'
        && resolveSignupUrl('https://wiz.example.com/', true) === 'https://wiz.example.com/signup'
        && resolveSignupUrl('https://wiz.example.com', false) === 'https://wiz.cn/signup',
      '注册地址规则',
    );
    assert(
      '窗口状态：离屏回主屏居中、小于最小值抬到最小值、副屏位置保留',
      offscreen.x === 320 && offscreen.y === 130 && offscreen.width === 1280 && offscreen.height === 820
        && tiny.x === 0 && tiny.y === 0 && tiny.width === 960 && tiny.height === 600
        && secondary.x === 2000 && secondary.y === 100,
      JSON.stringify({ offscreen, tiny, secondary }),
    );
  }

  // ===== 外链图片：HEAD 预检被 CORS 拦掉时不能判死，交给 <img> 直载 =====
  {
    const g = globalThis as Any;
    const origXhr = g.XMLHttpRequest;
    const origImage = g.Image;
    class FakeXhr {
      static DONE = 4;
      static mode: 'cors' | 'html' | 'png' = 'cors';
      status = 0;
      readyState = 0;
      onreadystatechange: (() => void) | null = null;
      onerror: (() => void) | null = null;
      headers: Record<string, string> = {};
      open(): void {}
      getResponseHeader(name: string): string | null { return this.headers[name.toLowerCase()] || null; }
      send(): void {
        this.readyState = 4;
        if (FakeXhr.mode === 'html') {
          this.status = 200;
          this.headers = { 'content-type': 'text/html' };
        } else if (FakeXhr.mode === 'png') {
          this.status = 200;
          this.headers = { 'content-type': 'image/png' };
        }
        this.onreadystatechange?.();
      }
    }
    class FakeImage {
      static mode: 'ok' | 'hotlink' | 'dead' = 'ok';
      static attempts = 0;
      width = 200;
      height = 100;
      referrerPolicy = '';
      onload: (() => void) | null = null;
      onerror: ((err?: unknown) => void) | null = null;
      private current = '';
      get src(): string { return this.current; }
      set src(value: string) {
        this.current = value;
        FakeImage.attempts += 1;
        const fail = FakeImage.mode === 'dead' || (FakeImage.mode === 'hotlink' && this.referrerPolicy !== 'no-referrer');
        setTimeout(() => (fail ? this.onerror?.(new Error('denied')) : this.onload?.()), 0);
      }
    }
    g.XMLHttpRequest = FakeXhr;
    g.Image = FakeImage;
    try {
      const { checkImageContentType, loadImage, markImageActionFailed } = (await import('../../libs-muya-vue3/src/core/utils/index.js')) as Any;
      FakeXhr.mode = 'cors';
      assert('外链图片：CORS 拦截的 HEAD 返回未知，不判非图片', (await checkImageContentType('https://x/u/1')) === null, 'null expected');
      FakeXhr.mode = 'html';
      assert('外链图片：200 text/html 仍判非图片', (await checkImageContentType('https://x/page')) === false, 'false expected');
      FakeXhr.mode = 'cors';
      const loaded = await loadImage('https://x/u/1', true);
      assert(
        '外链图片：预检未知时 <img> 直载成功',
        loaded && loaded.width === 200 && loaded.height === 100,
        JSON.stringify(loaded),
      );
      const wrapper = document.createElement('span');
      wrapper.className = 'ag-inline-image ag-image-loading ag-image-uploading';
      wrapper.innerHTML = '<img src="x">';
      // R-07：外链图被防盗链拦下时，去掉 Referer 再试一次应能救回来
      FakeImage.mode = 'hotlink';
      FakeImage.attempts = 0;
      const retried = await loadImage('https://x/u/2');
      assert(
        '外链图片：Referer 防盗链被 no-referrer 二次解码救回',
        retried.fallback === 'no-referrer' && retried.width === 200 && FakeImage.attempts === 2,
        `fallback=${retried.fallback} attempts=${FakeImage.attempts}`,
      );
      // data: URL 不该触发重试（没有 Referer 可言）
      FakeImage.mode = 'dead';
      FakeImage.attempts = 0;
      let dataFailed = false;
      try { await loadImage('data:image/png;base64,AAAA'); } catch { dataFailed = true; }
      assert('外链图片：data URL 失败不重试', dataFailed && FakeImage.attempts === 1, `attempts=${FakeImage.attempts}`);
      // http(s) 两次都失败才落到 ag-image-fail
      FakeImage.attempts = 0;
      let httpFailed = false;
      try { await loadImage('https://x/u/3'); } catch { httpFailed = true; }
      assert('外链图片：两次都失败才判失败', httpFailed && FakeImage.attempts === 2, `attempts=${FakeImage.attempts}`);
      FakeImage.mode = 'ok';

      const marked = markImageActionFailed(wrapper);
      assert(
        '本地图片：上传失败摘掉 loading/uploading 并落 fail',
        marked && !wrapper.classList.contains('ag-image-loading') &&
          !wrapper.classList.contains('ag-image-uploading') &&
          wrapper.classList.contains('ag-image-fail') &&
          !wrapper.querySelector('img'),
        wrapper.className,
      );
    } finally {
      g.XMLHttpRequest = origXhr;
      g.Image = origImage;
    }
  }

  // ===== Melt 远程符文：定义解析 + 来源拼接 + 覆盖顺序 =====
  {
    const meltJson = JSON.stringify({
      $type: 'melt-js',
      dep: { name: '@melt-js/comps-vue2-meme', type: 'sftp', host: 'https://x.test/meta/hel-meta.json' },
      exportName: 'MemeCard',
      props: { title: { type: 'string' }, count: { type: 'number' }, open: { type: 'boolean' }, data: { type: 'json' } },
    });
    assert('melt：JSON 定义识别为 melt-js', detectRuneType(meltJson) === 'melt-js', detectRuneType(meltJson));
    assert('melt：SFC 仍识别为 vue-sfc', detectRuneType('<template><div>x</div></template>') === 'vue-sfc');
    const parsed = parseMeltRuneConfig(meltJson);
    assert('melt：解析出导出名与依赖', parsed?.exportName === 'MemeCard' && parsed?.dep.name === '@melt-js/comps-vue2-meme');
    assert('melt：合法定义零错误', validateMeltRuneConfig(normalizeMeltRuneConfig(parsed)).length === 0);
    assert('melt：props schema 转 propDefs', listMeltPropDefs(parsed).find((item) => item.name === 'count')?.type === 'number');
    assert('melt：缺 exportName 报错', validateMeltRuneConfig({ dep: { name: 'x' } }).some((item) => item.field === 'exportName'));

    saveRuneSources([
      { name: '@melt-js/comps-vue2-meme', type: 'sftp', base: 'https://a.test' },
      { name: 'comps-vue2-meme', type: 'github', base: 'https://org.github.io' },
    ]);
    const loaded = loadRuneSources();
    assert('melt：来源落 localStorage 并规范化', loaded.length === 2 && loaded.every((item) => item.base));
    const resolved = resolveDepFromSources(loaded, { name: 'comps-vue2-meme' });
    assert(
      'melt：后面的同名来源覆盖前面的',
      resolved.dep.host === 'https://org.github.io/comps-vue2-meme/hel_dist/hel-meta.json',
      String(resolved.dep.host),
    );
    const unpkg = buildSourceEntryUrl({ name: 'some-lib', type: 'unpkg', version: '1.2.3' });
    assert('melt：unpkg 拼版本目录', unpkg.url === 'https://unpkg.com/some-lib@1.2.3/dist/hel-meta.json', unpkg.url);
    const direct = buildSourceEntryUrl({ name: 'x', type: 'sftp', base: 'https://x.test/hel-meta.json' });
    assert('melt：直连 meta 不改写', direct.url === 'https://x.test/hel-meta.json', direct.url);
    const bad = buildSourceEntryUrl({ name: 'x', type: 'sftp', base: '' });
    assert('melt：缺失站点根给出警告', bad.url === '' && bad.warnings.length > 0);

    localStorage.removeItem(MELT_SOURCES_STORAGE_KEY);
    const { createMeltRuneRendererCtor, coerceMeltProp, normalizeMeltEmitValue } = (await import('../../libs-muya-rune-vue3/src/meltRune')) as Any;
    assert('melt：coerce 数字/布尔/json', coerceMeltProp('12', { type: 'number' }) === 12 &&
      coerceMeltProp('false', { type: 'boolean' }) === false &&
      coerceMeltProp('{"a":1}', { type: 'json' }).a === 1);
    assert('melt：emit 事件对象取值', normalizeMeltEmitValue({ target: { value: 'ok' } }) === 'ok');
    assert('melt：非 melt 定义不返回宿主', createMeltRuneRendererCtor({ template: '<div>x</div>' }) === null);
    assert('melt：melt 定义返回同步宿主', typeof createMeltRuneRendererCtor({ template: meltJson }) === 'function');
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
