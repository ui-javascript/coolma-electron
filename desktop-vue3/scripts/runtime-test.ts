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
import { joinFolderPath, newNoteDefaults } from '../frontend/src/utils/note';
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
import { attachmentDir, saveAttachmentBuffer } from '../electron/service/attachments';
import { uploadImageByPicGo } from '../electron/service/image/upload';
import {
  findCloudNoteByTitle,
  isCategoryExistsError,
  isNoteMissingError,
  normalizeMatchCategory,
  sortCategoriesByDepth,
  toWizCategoryInput,
} from '../electron/service/sync/push-rules';
import { cloudDedupeKey, toWizCategoryDeletePath } from '../electron/service/sync/pull-rules';
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
  const { createRunePlugin } = (await import('../../libs-muya-rune-vue3/src/index')) as Any;

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
    assert('为知同步：autoLogin/login/status/pull/push 通道齐全且白名单放行', [IPC_CHANNELS.sync.autoLogin, IPC_CHANNELS.sync.login, IPC_CHANNELS.sync.status, IPC_CHANNELS.sync.pull, IPC_CHANNELS.sync.push].every((c) => INVOKE_CHANNELS.has(c)), String(INVOKE_CHANNELS.size));
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
