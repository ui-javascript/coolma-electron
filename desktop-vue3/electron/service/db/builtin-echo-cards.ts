// 由 desktop-vue2 src/components/echo/echoBuiltins 逐张导出，字段与 anno_source 原样保留。
// 不要手改；vue2 侧新增内置卡时执行 pnpm run gen:echo-cards 重新生成。
export interface BuiltinEchoSeed {
  id: string;
  name: string;
  desc: string;
  color: string;
  icon: string;
  category: string;
  annoSource: string;
  sortOrder: number;
}

export const BUILTIN_ECHO_CARDS: BuiltinEchoSeed[] = [
  {
    "id": "__builtin_nice__",
    "name": "nice",
    "desc": "把所在行除 @nice 之外的文本用 <mark> 包裹",
    "color": "#4CAF50",
    "icon": "thumb_up",
    "category": "builtin",
    "annoSource": "export default {\n  //   【nice】 —— 把所在行 / block 内除 @nice 之外的节点用 <mark> 包裹\n  //   使用示例：\n  //     - 你好世界 @nice              → li 内「你好世界」被 <mark> 高亮\n  //     # 今天天气真好 @nice          → h1 文本被 <mark> 高亮\n  //     普通段落 xxx @nice            → p 文本被 <mark> 高亮,\n  type: 'echo-chant',\n  field: 'nice',\n  title: 'nice',\n  version: 1,\n\n  props: {},\n\n  render (props = {}) {\n    return '<span class=\"ag-echo-placeholder-marker\"><span class=\"ag-echo-anno-at\" contenteditable=\"false\">@</span><span class=\"ag-echo-anno-name ag-rune ag-rune--nice\" contenteditable=\"false\" data-echo-chant-id=\"nice\">nice</span></span>'\n  },\n\n  //   【handler】把 block 内除 @nice 之外的节点用 <mark> 包起来\n  afterRender (node, props = {}) {\n    \n    const $rune = $(node)\n    if (!$rune.length) return\n    const $prev = $rune.prev()\n    if (!$prev.length) return\n    const $parent = $prev.parent()\n    if ($parent.attr('data-nice-marked')) return\n    const $mark = $('<mark class=\"ag-rune-nice-highlight\"></mark>').append($prev.clone())\n    $prev.replaceWith($mark)\n    $parent.attr('data-nice-marked', 'true')\n  }\n}",
    "sortOrder": 0
  },
  {
    "id": "__builtin_growth__",
    "name": "生生不息",
    "desc": "为附近符合条件的元素加上生长的动画特效",
    "color": "#43A047",
    "icon": "park",
    "category": "showy",
    "annoSource": "export default {\n  //   【生生不息 / growth】 —— 给附近符合条件的元素加上\"生长\"的动画特效\n  //   影响范围（scope）：\n  //     - siblings(默认)   同段落或同 block 的兄弟节点\n  //     - prev-block       前一块兄弟节点\n  //     - block            当前 block（含自身）\n  //     - document         整篇容器\n  //   命中元素（target）：CSS 选择器，默认 p/pre/h1~h6/li/blockquote/table\n  //   触发方式（trigger）：auto=自动 stagger；manual=需要外部触发器\n  //   示例：@生生不息{scope: \"siblings\", trigger: \"manual\", target: \"p, li\"}(春风吹又生),\n  type: 'echo-chant',\n  field: 'growth',\n  title: '生生不息',\n  version: 1,\n\n  props: {\"scope\":\"siblings\",\"trigger\":\"auto\",\"target\":\"[data-block-type], p, pre, li, h1, h2, h3, h4, h5, h6, blockquote, table\"},\n\n  render (props = {}) {\n    return '<span class=\"ag-echo-placeholder-marker\"><span class=\"ag-echo-anno-at\" contenteditable=\"false\">@</span><span class=\"ag-echo-anno-name ag-rune ag-rune--growth\" contenteditable=\"false\" data-echo-chant-id=\"growth\">生生不息</span></span>'\n  },\n\n  //   【handler】自动给目标元素加生长动画；trigger=auto 时按 index 设置 stagger delay\n  afterRender (node, props = {}) {\n    \n    const mergedProps = Object.assign({ scope: 'siblings', trigger: 'auto', target: '[data-block-type], p, pre, li, h1, h2, h3, h4, h5, h6, blockquote, table' }, props || {})\n    const targetSelector = mergedProps.target\n    const $container = $(node).closest('[data-block-type], .mu-block, p, pre, li, h1, h2, h3, h4, h5, h6, blockquote, table, ul, ol').parent()\n    if (!$container.length) return () => {}\n    const container = $container.get(0)\n    const $targets = $(container).find(targetSelector)\n    $targets.each((i, el) => {\n      $(el).addClass('ag-rune-growth-target')\n      if (mergedProps.trigger === 'auto') $(el).css('--ag-rune-growth-delay', (Math.min(i, 8) * 120) + 'ms')\n    })\n    $(node).addClass('ag-rune-growth-active')\n    return () => {\n      $targets.removeClass('ag-rune-growth-target').css('--ag-rune-growth-delay', '')\n      $(node).removeClass('ag-rune-growth-active')\n    }\n  }\n}",
    "sortOrder": 1
  },
  {
    "id": "__builtin_shatter__",
    "name": "破万法",
    "desc": "使附近一行或一个块的回响作用都失效",
    "color": "#E53935",
    "icon": "block",
    "category": "showy",
    "annoSource": "export default {\n  //   【破万法 / shatter】 —— 让附近一行或一个块的回响作用都失效\n  //   影响范围（target）：line(默认) 同段落的兄弟 echo；block 整个当前 block\n  //   示例：@破万法{target: \"block\"}(此段一切回响失效),\n  type: 'echo-chant',\n  field: 'shatter',\n  title: '破万法',\n  version: 1,\n\n  props: {},\n\n  render (props = {}) {\n    return '<span class=\"ag-echo-placeholder-marker\"><span class=\"ag-echo-anno-at\" contenteditable=\"false\">@</span><span class=\"ag-echo-anno-name ag-rune ag-rune--shatter\" contenteditable=\"false\" data-echo-chant-id=\"shatter\">破万法</span></span>'\n  },\n\n  //   【handler】target=line 时屏蔽同段 echo；target=block 时屏蔽整个 block 内的 echo\n  afterRender (node, props = {}) {\n    \n    const mergedProps = Object.assign({ target: 'line' }, props || {})\n    const $rune = $(node)\n    const $scopeRoot = mergedProps.target === 'block'\n      ? $rune.closest('[data-block-type], .mu-block, p, pre, li, h1, h2, h3, h4, h5, h6, blockquote')\n      : $rune.parent()\n    if (!$scopeRoot.length) return () => {}\n    const $echoes = $scopeRoot.find('[data-echo-inline=\"true\"]').filter((_i, n) => n !== node)\n    $echoes.attr('data-shatter-disabled', 'true').addClass('ag-rune-shatter-disabled')\n    $rune.addClass('ag-rune-shatter-active')\n    return () => {\n      $echoes.removeAttr('data-shatter-disabled').removeClass('ag-rune-shatter-disabled')\n      $rune.removeClass('ag-rune-shatter-active')\n    }\n  }\n}",
    "sortOrder": 2
  },
  {
    "id": "__builtin_skywalk__",
    "name": "天行健",
    "desc": "强化排版并指定某种主题",
    "color": "#1E88E5",
    "icon": "auto_awesome",
    "category": "showy",
    "annoSource": "export default {\n  //   【天行健 / skywalk】 —— 强化排版并切换主题（document 级别）\n  //   参数：theme(light/dark/sepia/auto) + layout(compact/enhanced/luxe)\n  //   CSS 钩子：data-skywalk-theme / data-skywalk-layout\n  //   示例：@天行健{theme: \"sepia\", layout: \"luxe\"}(本文走浓郁路线),\n  type: 'echo-chant',\n  field: 'skywalk',\n  title: '天行健',\n  version: 1,\n\n  props: {},\n\n  render (props = {}) {\n    return '<span class=\"ag-echo-placeholder-marker\"><span class=\"ag-echo-anno-at\" contenteditable=\"false\">@</span><span class=\"ag-echo-anno-name ag-rune ag-rune--skywalk\" contenteditable=\"false\" data-echo-chant-id=\"skywalk\">天行健</span></span>'\n  },\n\n  //   【handler】document scope：记忆原 theme/layout，cleanup 时还原\n  afterRender (node, props = {}) {\n    \n    const mergedProps = Object.assign({ theme: 'auto', layout: 'enhanced' }, props || {})\n    const $root = $(node).closest('[data-echo-document], .mu-editor, article, [data-doc-id]').first()\n    if (!$root.length) return () => {}\n    const root = $root.get(0)\n    const prev = {\n      theme: root.getAttribute('data-skywalk-theme'),\n      layout: root.getAttribute('data-skywalk-layout')\n    }\n    $root.attr('data-skywalk-theme', mergedProps.theme).attr('data-skywalk-layout', mergedProps.layout)\n    $(node).addClass('ag-rune-skywalk-active')\n    return () => {\n      if (prev.theme === null) $root.removeAttr('data-skywalk-theme')\n      else $root.attr('data-skywalk-theme', prev.theme)\n      if (prev.layout === null) $root.removeAttr('data-skywalk-layout')\n      else $root.attr('data-skywalk-layout', prev.layout)\n      $(node).removeClass('ag-rune-skywalk-active')\n    }\n  }\n}",
    "sortOrder": 3
  },
  {
    "id": "__builtin_twinbloom__",
    "name": "双生花",
    "desc": "复制前/后一个 block 并生成占位副本",
    "color": "#8E24AA",
    "icon": "local_florist",
    "category": "showy",
    "annoSource": "export default {\n  //   【双生花 / twinbloom】 —— 用 jQuery .clone() 复制「上一个元素 / 上一行」作占位\n  //   【核心】影响范围 source：\n  //     - prev-sibling(默认) 同行上一个 inline / element 兄弟节点\n  //     - prev-line          上一行 block 节点\n  //     - next-line          下一行 block 节点\n  //   参数：placeholderText=占位文本（若被克隆节点没有可见文本则用此填充）\n  //   示例：@twinbloom{source: \"prev-line\"}(克隆上一行),\n  type: 'echo-chant',\n  field: 'twinbloom',\n  title: '双生花',\n  version: 1,\n\n  props: {},\n\n  render (props = {}) {\n    return '<span class=\"ag-echo-placeholder-marker\"><span class=\"ag-echo-anno-at\" contenteditable=\"false\">@</span><span class=\"ag-echo-anno-name ag-rune ag-rune--twinbloom\" contenteditable=\"false\" data-echo-chant-id=\"twinbloom\">双生花</span></span>'\n  },\n\n  //   【handler】jQuery .clone()：按 source 复制 prev-sibling / prev-line / next-line；cleanup 时移除克隆块\n  afterRender (node, props = {}) {\n    \n    const $rune = $(node)\n    if (!$rune.length) return () => {}\n    const mergedProps = Object.assign({ source: 'prev-sibling', placeholderText: '双生节点' }, props || {})\n    const source = String(mergedProps.source || 'prev-sibling').toLowerCase()\n    const placeholderText = mergedProps.placeholderText || '双生节点'\n    const twinId = $rune.attr('data-echo-chant-id') || 'twinbloom'\n    const $block = $rune.closest('[data-block-type], .mu-block, p, pre, li, h1, h2, h3, h4, h5, h6, blockquote').first()\n    if (!$block.length) return () => {}\n    let $src, $target, insertBefore = false\n    if (source === 'prev-line' || source === 'prev-block') {\n      $src = $block.prev(); $target = $block\n    } else if (source === 'next-line' || source === 'next-block') {\n      $src = $block.next(); $target = $block; insertBefore = true\n    } else {\n      $src = $rune.prevAll(':not([data-echo-chant-id]):not(mark):not(.ag-rune)').first()\n      if (!$src.length) $src = $block\n      $target = $rune\n    }\n    if (!$src.length) return () => {}\n    const $neighbor = insertBefore ? $target.prev() : $target.next()\n    let $clone = $neighbor.filter(function () { return this.getAttribute('data-twinbloom-of') === twinId })\n    let existedBefore = $clone.length > 0\n    if (!existedBefore) {\n      $clone = $src.clone(true)\n        .attr('data-twinbloom-of', twinId)\n        .attr('data-twinbloom-source', source)\n        .attr('contenteditable', 'false')\n        .addClass('ag-rune-twinbloom-clone')\n        .css({ outline: '2px dashed #8E24AA', 'outline-offset': '2px',\n          'background-color': 'rgba(142,36,170,0.06)', 'border-radius': '6px',\n          padding: '8px 12px' })\n      if (!$clone.find('[data-twinbloom-badge]').length) {\n        $clone.prepend(\n          $('<span></span>').attr('data-twinbloom-badge', twinId)\n            .text('🌸 双生花 · ' + placeholderText)\n            .css({ 'font-size': '11px', color: '#8E24AA',\n              padding: '2px 8px', 'background-color': 'rgba(142,36,170,.12)',\n              border: '1px solid rgba(142,36,170,.4)', 'border-radius': '4px',\n              display: 'inline-block', 'margin-bottom': '6px' })\n        )\n      }\n      if (!$clone.text().replace(/🌸.*$/, '').trim()) {\n        $clone.append($('<span></span>').attr('data-twinbloom-placeholder', 'true').text(placeholderText))\n      }\n      insertBefore ? $target.before($clone) : $target.after($clone)\n    }\n    $rune.addClass('ag-rune-twinbloom-active')\n    return () => {\n      if (!existedBefore) $clone.remove()\n      $rune.removeClass('ag-rune-twinbloom-active')\n    }\n  }\n}",
    "sortOrder": 4
  },
  {
    "id": "__builtin_mindsteal__",
    "name": "夺心魄",
    "desc": "使附近符合条件的咏唱叠加或篡改某种制定的效果",
    "color": "#F4511E",
    "icon": "psychology",
    "category": "showy",
    "annoSource": "export default {\n  //   【夺心魄 / mindsteal】 —— 篡改附近符合条件的符文效果\n  //   参数：mode=override|stack|disable；targets=其它 id（逗号分隔）\n  //   示例：@夺心魄{mode: \"disable\", targets: \"growth,skywalk\"}(覆盖附近的生长与主题),\n  type: 'echo-chant',\n  field: 'mindsteal',\n  title: '夺心魄',\n  version: 1,\n\n  props: {},\n\n  render (props = {}) {\n    return '<span class=\"ag-echo-placeholder-marker\"><span class=\"ag-echo-anno-at\" contenteditable=\"false\">@</span><span class=\"ag-echo-anno-name ag-rune ag-rune--mindsteal\" contenteditable=\"false\" data-echo-chant-id=\"mindsteal\">夺心魄</span></span>'\n  },\n\n  //   【handler】mode=disable 直接停掉动画；targets 为空时作用于所有 echo-chant\n  afterRender (node, props = {}) {\n    \n    const mergedProps = Object.assign({ mode: 'override', targets: '' }, props || {})\n    const targetsCsv = String(mergedProps.targets || '').trim()\n    const targets = targetsCsv ? targetsCsv.split(',').map(s => s.trim()).filter(Boolean) : null\n    const $scope = $(node).parent()\n    if (!$scope.length) return () => {}\n    const $candidates = $scope.find('[data-echo-chant-id]')\n      .filter((_i, n) => n !== node)\n      .filter((_i, n) => !targets || targets.indexOf($(n).attr('data-echo-chant-id')) !== -1)\n    $candidates.each((_i, n) => {\n      $(n).attr('data-mindsteal-mode', mergedProps.mode)\n      if (mergedProps.mode === 'disable') $(n).css('animation', 'none', 'important')\n    })\n    $(node).addClass('ag-rune-mindsteal-active')\n    return () => {\n      $candidates.removeAttr('data-mindsteal-mode').css('animation', '')\n      $(node).removeClass('ag-rune-mindsteal-active')\n    }\n  }\n}",
    "sortOrder": 5
  },
  {
    "id": "__builtin_lucky__",
    "name": "强运",
    "desc": "点击后触发 AI 识别当前 Markdown 的错别字并修正",
    "color": "#FB8C00",
    "icon": "casino",
    "category": "showy",
    "annoSource": "export default {\n  //   【强运 / lucky】 —— 点击触发 AI 校对，是\"事件型 echo-chant\"样板\n  //   事件流：handler 给节点加 role=button / tabindex=0；点击时调用\n  //     window.__memocastEchoChantHandlers.lucky({node, props})，由应用层注册回调\n  //   示例：@强运{model: \"gpt-4o-mini\", action: \"ai-proofread\"}(一键润色),\n  type: 'echo-chant',\n  field: 'lucky',\n  title: '强运',\n  version: 1,\n\n  props: {},\n\n  render (props = {}) {\n    return '<span class=\"ag-echo-placeholder-marker\"><span class=\"ag-echo-anno-at\" contenteditable=\"false\">@</span><span class=\"ag-echo-anno-name ag-rune ag-rune--lucky\" contenteditable=\"false\" data-echo-chant-id=\"lucky\">强运</span></span>'\n  },\n\n  //   【handler】事件型：cleanup 必须解绑 + 移除属性；callback 走 window.__memocastEchoChantHandlers.lucky（应用层注册）\n  afterRender (node, props = {}) {\n    \n    const mergedProps = Object.assign({ label: '点击触发 AI 校对' }, props || {})\n    const $rune = $(node)\n    $rune.css('cursor', 'pointer').attr('role', 'button').attr('tabindex', '0')\n      .attr('title', mergedProps.label).addClass('ag-rune-lucky-active')\n    const trigger = async (ev) => {\n      ev.preventDefault(); ev.stopPropagation()\n      $rune.addClass('ag-rune-lucky-loading')\n      try {\n        const handler = (typeof window !== 'undefined')\n          ? (window.__memocastEchoChantHandlers && window.__memocastEchoChantHandlers.lucky)\n          : null\n        if (typeof handler === 'function') await handler({ node, props })\n        else console.info('[lucky] no window.__memocastEchoChantHandlers.lucky registered')\n      } catch (err) { console.error('[lucky] handler failed:', err) }\n      finally { $rune.removeClass('ag-rune-lucky-loading') }\n    }\n    const onClick = (ev) => trigger(ev)\n    const onKey = (ev) => { if (ev.key === 'Enter' || ev.key === ' ') trigger(ev) }\n    $rune.on('click', onClick).on('keydown', onKey)\n    return () => {\n      $rune.off('click', onClick).off('keydown', onKey)\n        .removeClass('ag-rune-lucky-active ag-rune-lucky-loading')\n        .css('cursor', '').removeAttr('role').removeAttr('tabindex').removeAttr('title')\n    }\n  }\n}",
    "sortOrder": 6
  },
  {
    "id": "__builtin_scapegoat__",
    "name": "替罪",
    "desc": "在作用域内接住后续 echo / DOM 抛出的错误，并以受伤态提示",
    "color": "#6D4C41",
    "icon": "shield",
    "category": "showy",
    "annoSource": "export default {\n  //   【替罪 / scapegoat】 —— 作用域内的\"救场位\"\n  //   回响种类：echo-chant（影响附近元素、做防灾 / 占位 / 兜底）\n  //   语义：把最近 block 标为 standby；后续 echo / DOM 抛错时把 standby 转 injured，错误写到 data-scapegoat-error\n  //   模仿提示：把 props.intensity 改成 0.5 可以让 standby 默认变 injured（模拟\"已知错误\"）,\n  type: 'echo-chant',\n  field: 'scapegoat',\n  title: '替罪',\n  version: 1,\n\n  props: {},\n\n  render (props = {}) {\n    return '<span class=\"ag-echo-placeholder-marker\"><span class=\"ag-echo-anno-at\" contenteditable=\"false\">@</span><span class=\"ag-echo-anno-name ag-rune ag-rune--scapegoat\" contenteditable=\"false\" data-echo-chant-id=\"scapegoat\">替罪</span></span>'\n  },\n\n  //   【handler】cleanup：移除监听 + 移除 standby/injured 状态\n  afterRender (node, props = {}) {\n    \n    const $block = $(node).closest('[data-block-type], .mu-block, p, pre, li, h1, h2, h3, h4, h5, h6, blockquote, table, ul, ol').first()\n    if (!$block.length) return () => {}\n    const intensity = Number(props.intensity) || 0\n    if (intensity > 0) {\n      $block.addClass('ag-rune-scapegoat-injured').attr('data-scapegoat-error', props.error || 'pre-injured by intensity')\n    } else {\n      $block.addClass('ag-rune-scapegoat-standby')\n    }\n    const onError = (event) => {\n      $block.removeClass('ag-rune-scapegoat-standby').addClass('ag-rune-scapegoat-injured')\n        .attr('data-scapegoat-error', (event && event.message) || 'unknown error')\n    }\n    const onRuneError = (event) => {\n      const detail = event && event.detail\n      if (!detail) return\n      $block.removeClass('ag-rune-scapegoat-standby').addClass('ag-rune-scapegoat-injured')\n        .attr('data-scapegoat-rune-error', String(detail.id || 'unknown'))\n    }\n    if (typeof window !== 'undefined') {\n      window.addEventListener('error', onError, true)\n      window.addEventListener('ag:rune:error', onRuneError)\n    }\n    return () => {\n      if (typeof window !== 'undefined') {\n        window.removeEventListener('error', onError, true)\n        window.removeEventListener('ag:rune:error', onRuneError)\n      }\n      $block.removeClass('ag-rune-scapegoat-standby ag-rune-scapegoat-injured')\n        .removeAttr('data-scapegoat-error').removeAttr('data-scapegoat-rune-error')\n    }\n  }\n}",
    "sortOrder": 7
  },
  {
    "id": "__builtin_calamity__",
    "name": "招灾",
    "desc": "在作用域内随机给文字片段染上哥特渐变彩",
    "color": "#5E35B1",
    "icon": "thunderstorm",
    "category": "showy",
    "annoSource": "export default {\n  //   【招灾 / calamity】 —— \"随机哥德\"：作用域内随机给文字片段染上哥特渐变彩\n  //   回响种类：echo-chant\n  //   参数：intensity = 0.1-0.8 的小数（默认 0.3，最大 0.8）\n  //   CSS 钩子：.ag-rune-calamity-gothic\n  //   示例：@招灾{intensity: 0.5}(周围一半文字染彩),\n  type: 'echo-chant',\n  field: 'calamity',\n  title: '招灾',\n  version: 1,\n\n  props: {},\n\n  render (props = {}) {\n    return '<span class=\"ag-echo-placeholder-marker\"><span class=\"ag-echo-anno-at\" contenteditable=\"false\">@</span><span class=\"ag-echo-anno-name ag-rune ag-rune--calamity\" contenteditable=\"false\" data-echo-chant-id=\"calamity\">招灾</span></span>'\n  },\n\n  //   【handler】cleanup：取消染彩 class\n  afterRender (node, props = {}) {\n    \n    const scope = props.scope || 'siblings'\n    const $scope = scope === 'block'\n      ? $(node).closest('[data-block-type], .mu-block, p, pre, li, h1, h2, h3, h4, h5, h6, blockquote')\n      : $(node).parent()\n    if (!$scope.length) return () => {}\n    const intensity = Math.max(0.05, Math.min(0.8, Number(props.intensity) || 0.3))\n    const textHosts = $scope.find('p, h1, h2, h3, h4, h5, h6, li, blockquote, td, th, dd, dt')\n      .filter((_i, el) => el && el !== node && $(el).text().trim().length >= 2)\n      .get()\n    if (!textHosts.length) return () => {}\n    const targetCount = Math.max(1, Math.floor(textHosts.length * intensity))\n    const pool = textHosts.slice()\n    for (let i = pool.length - 1; i > 0; i--) {\n      const j = Math.floor(Math.random() * (i + 1))\n      const tmp = pool[i]; pool[i] = pool[j]; pool[j] = tmp\n    }\n    const picked = pool.slice(0, Math.min(targetCount, pool.length))\n    $(picked).addClass('ag-rune-calamity-gothic')\n    return () => { $(picked).removeClass('ag-rune-calamity-gothic') }\n  }\n}",
    "sortOrder": 8
  },
  {
    "id": "__builtin_disperse__",
    "name": "离析",
    "desc": "使附近的元素使用更加宽松的排版",
    "color": "#00897B",
    "icon": "call_split",
    "category": "showy",
    "annoSource": "export default {\n  //   【离析 / disperse】 —— 让附近元素使用更宽松排版（block 级别）\n  //   参数：density=tight|normal|loose（loose 是默认）\n  //   CSS 钩子：data-disperse-density\n  //   示例：@离析{density: \"tight\"}(回归紧凑排版),\n  type: 'echo-chant',\n  field: 'disperse',\n  title: '离析',\n  version: 1,\n\n  props: {},\n\n  render (props = {}) {\n    return '<span class=\"ag-echo-placeholder-marker\"><span class=\"ag-echo-anno-at\" contenteditable=\"false\">@</span><span class=\"ag-echo-anno-name ag-rune ag-rune--disperse\" contenteditable=\"false\" data-echo-chant-id=\"disperse\">离析</span></span>'\n  },\n\n  //   【handler】block scope 写 data-disperse-density；CSS 据此调整 line-height/margin\n  afterRender (node, props = {}) {\n    \n    const mergedProps = Object.assign({ density: 'loose' }, props || {})\n    const $block = $(node).closest('[data-block-type], .mu-block, p, pre, li, h1, h2, h3, h4, h5, h6, blockquote').first()\n    if (!$block.length) return () => {}\n    const previous = $block.attr('data-disperse-density')\n    $block.attr('data-disperse-density', mergedProps.density)\n    $(node).addClass('ag-rune-disperse-active')\n    return () => {\n      if (previous === undefined) $block.removeAttr('data-disperse-density')\n      else $block.attr('data-disperse-density', previous)\n      $(node).removeClass('ag-rune-disperse-active')\n    }\n  }\n}",
    "sortOrder": 9
  },
  {
    "id": "__builtin_peek__",
    "name": "peek",
    "desc": "高亮展示内容，支持折叠展开",
    "color": "#FF7043",
    "icon": "visibility",
    "category": "builtin",
    "annoSource": "export default {\n  //   【peek】 —— 高亮展示内容，支持折叠展开\n  //   参数：collapsed=true|false（默认 false），level=1-3（高亮强度）\n  //   CSS 钩子：ag-rune-peek, ag-rune-peek-collapsed\n  //   示例：@peek{collapsed: true}(折叠展示),\n  type: 'echo-chant',\n  field: 'peek',\n  title: 'peek',\n  version: 1,\n\n  props: {},\n\n  render (props = {}) {\n    return '<span class=\"ag-echo-placeholder-marker\"><span class=\"ag-echo-anno-at\" contenteditable=\"false\">@</span><span class=\"ag-echo-anno-name ag-rune ag-rune--peek\" contenteditable=\"false\" data-echo-chant-id=\"peek\">peek</span></span>'\n  },\n\n  //   【handler】添加高亮 class，可交互折叠\n  afterRender (node, props = {}) {\n    \n    const mergedProps = Object.assign({ collapsed: false, level: 1 }, props || {})\n    const $rune = $(node)\n    const level = Math.max(1, Math.min(3, Number(mergedProps.level) || 1))\n    $rune.addClass('ag-rune-peek ag-rune-peek-level-' + level)\n    if (mergedProps.collapsed) $rune.addClass('ag-rune-peek-collapsed')\n    return () => {\n      $rune.removeClass('ag-rune-peek ag-rune-peek-collapsed ag-rune-peek-level-1 ag-rune-peek-level-2 ag-rune-peek-level-3')\n    }\n  }\n}",
    "sortOrder": 10
  },
  {
    "id": "__builtin_ignore__",
    "name": "ignore",
    "desc": "标记为可忽略内容，视觉淡化",
    "color": "#90A4AE",
    "icon": "visibility_off",
    "category": "builtin",
    "annoSource": "export default {\n  //   【ignore】 —— 标记为可忽略内容，视觉淡化\n  //   参数：opacity=0.1-1（淡化透明度，默认 0.4）\n  //   CSS 钩子：ag-rune-ignore\n  //   示例：@ignore{opacity: 0.3}(淡化次要内容),\n  type: 'echo-chant',\n  field: 'ignore',\n  title: 'ignore',\n  version: 1,\n\n  props: {},\n\n  render (props = {}) {\n    return '<span class=\"ag-echo-placeholder-marker\"><span class=\"ag-echo-anno-at\" contenteditable=\"false\">@</span><span class=\"ag-echo-anno-name ag-rune ag-rune--ignore\" contenteditable=\"false\" data-echo-chant-id=\"ignore\">ignore</span></span>'\n  },\n\n  //   【handler】降低 block 透明度，cleanup 时还原\n  afterRender (node, props = {}) {\n    \n    const mergedProps = Object.assign({ opacity: 0.4 }, props || {})\n    const $block = $(node).closest('[data-block-type], .mu-block, p, pre, li, h1, h2, h3, h4, h5, h6, blockquote').first()\n    if (!$block.length) return () => {}\n    const prevOpacity = $block.css('opacity') || '1'\n    $block.addClass('ag-rune-ignore').css('opacity', mergedProps.opacity)\n    return () => {\n      $block.removeClass('ag-rune-ignore').css('opacity', prevOpacity)\n    }\n  }\n}",
    "sortOrder": 11
  },
  {
    "id": "__builtin_ad__",
    "name": "ad",
    "desc": "插入广告占位或标注为广告内容",
    "color": "#FFB300",
    "icon": "campaign",
    "category": "builtin",
    "annoSource": "export default {\n  //   【ad】 —— 插入广告占位或标注为广告内容\n  //   参数：type=banner|inline|sidebar（默认 banner）\n  //   CSS 钩子：ag-rune-ad, ag-rune-ad-banner, ag-rune-ad-inline, ag-rune-ad-sidebar\n  //   示例：@ad{type: \"inline\"}(内联广告标注),\n  type: 'echo-chant',\n  field: 'ad',\n  title: 'ad',\n  version: 1,\n\n  props: {},\n\n  render (props = {}) {\n    return '<span class=\"ag-echo-placeholder-marker\"><span class=\"ag-echo-anno-at\" contenteditable=\"false\">@</span><span class=\"ag-echo-anno-name ag-rune ag-rune--ad\" contenteditable=\"false\" data-echo-chant-id=\"ad\">ad</span></span>'\n  },\n\n  //   【handler】添加广告标记样式\n  afterRender (node, props = {}) {\n    \n    const mergedProps = Object.assign({ type: 'banner' }, props || {})\n    const $block = $(node).closest('[data-block-type], .mu-block, p, pre, li, h1, h2, h3, h4, h5, h6, blockquote').first()\n    if (!$block.length) return () => {}\n    const adType = String(mergedProps.type || 'banner').toLowerCase()\n    $block.addClass('ag-rune-ad ag-rune-ad-' + adType)\n    return () => {\n      $block.removeClass('ag-rune-ad ag-rune-ad-banner ag-rune-ad-inline ag-rune-ad-sidebar')\n    }\n  }\n}",
    "sortOrder": 12
  },
  {
    "id": "__builtin_diff__",
    "name": "diff",
    "desc": "标记差异对比内容",
    "color": "#7E57C2",
    "icon": "difference",
    "category": "builtin",
    "annoSource": "export default {\n  //   【diff】 —— 标记差异对比内容\n  //   参数：mode=add|remove|change（默认 change）\n  //   CSS 钩子：ag-rune-diff, ag-rune-diff-add, ag-rune-diff-remove, ag-rune-diff-change\n  //   示例：@diff{mode: \"add\"}(新增内容),\n  type: 'echo-chant',\n  field: 'diff',\n  title: 'diff',\n  version: 1,\n\n  props: {},\n\n  render (props = {}) {\n    return '<span class=\"ag-echo-placeholder-marker\"><span class=\"ag-echo-anno-at\" contenteditable=\"false\">@</span><span class=\"ag-echo-anno-name ag-rune ag-rune--diff\" contenteditable=\"false\" data-echo-chant-id=\"diff\">diff</span></span>'\n  },\n\n  //   【handler】添加 diff 标记样式\n  afterRender (node, props = {}) {\n    \n    const mergedProps = Object.assign({ mode: 'change' }, props || {})\n    const $block = $(node).closest('[data-block-type], .mu-block, p, pre, li, h1, h2, h3, h4, h5, h6, blockquote').first()\n    if (!$block.length) return () => {}\n    const diffMode = String(mergedProps.mode || 'change').toLowerCase()\n    $block.addClass('ag-rune-diff ag-rune-diff-' + diffMode)\n    return () => {\n      $block.removeClass('ag-rune-diff ag-rune-diff-add ag-rune-diff-remove ag-rune-diff-change')\n    }\n  }\n}",
    "sortOrder": 13
  },
  {
    "id": "__builtin_ref__",
    "name": "ref",
    "desc": "标记为参考资料，可跳转链接",
    "color": "#29B6F6",
    "icon": "link",
    "category": "builtin",
    "annoSource": "export default {\n  //   【ref】 —— 标记为参考资料，可跳转链接\n  //   参数：url=外部链接（可选），title=标题（可选）\n  //   CSS 钩子：ag-rune-ref\n  //   示例：@ref{url: \"https://...\"}(参考资料),\n  type: 'echo-chant',\n  field: 'ref',\n  title: 'ref',\n  version: 1,\n\n  props: {},\n\n  render (props = {}) {\n    return '<span class=\"ag-echo-placeholder-marker\"><span class=\"ag-echo-anno-at\" contenteditable=\"false\">@</span><span class=\"ag-echo-anno-name ag-rune ag-rune--ref\" contenteditable=\"false\" data-echo-chant-id=\"ref\">ref</span></span>'\n  },\n\n  //   【handler】添加参考标记样式，可点击跳转\n  afterRender (node, props = {}) {\n    \n    const mergedProps = Object.assign({ url: '', title: '' }, props || {})\n    const $rune = $(node)\n    $rune.addClass('ag-rune-ref')\n    if (mergedProps.url) {\n      $rune.css('cursor', 'pointer')\n      $rune.on('click', (e) => {\n        e.preventDefault()\n        window.open(mergedProps.url, '_blank')\n      })\n    }\n    return () => { $rune.removeClass('ag-rune-ref').css('cursor', '').off('click') }\n  }\n}",
    "sortOrder": 14
  },
  {
    "id": "__builtin_todo__",
    "name": "todo",
    "desc": "标记待办事项，可交互勾选",
    "color": "#26A69A",
    "icon": "check_box",
    "category": "builtin",
    "annoSource": "export default {\n  //   【todo】 —— 标记待办事项，可交互勾选\n  //   参数：checked=true|false（默认 false）\n  //   CSS 钩子：ag-rune-todo, ag-rune-todo-checked\n  //   示例：@todo{checked: false}(待完成事项),\n  type: 'echo-chant',\n  field: 'todo',\n  title: 'todo',\n  version: 1,\n\n  props: {},\n\n  render (props = {}) {\n    return '<span class=\"ag-echo-placeholder-marker\"><span class=\"ag-echo-anno-at\" contenteditable=\"false\">@</span><span class=\"ag-echo-anno-name ag-rune ag-rune--todo\" contenteditable=\"false\" data-echo-chant-id=\"todo\">todo</span></span>'\n  },\n\n  //   【handler】添加待办标记样式\n  afterRender (node, props = {}) {\n    \n    const mergedProps = Object.assign({ checked: false }, props || {})\n    const $block = $(node).closest('[data-block-type], .mu-block, p, pre, li, h1, h2, h3, h4, h5, h6, blockquote').first()\n    if (!$block.length) return () => {}\n    $block.addClass('ag-rune-todo')\n    if (mergedProps.checked) $block.addClass('ag-rune-todo-checked')\n    return () => { $block.removeClass('ag-rune-todo ag-rune-todo-checked') }\n  }\n}",
    "sortOrder": 15
  },
  {
    "id": "__builtin_fold__",
    "name": "fold",
    "desc": "把当前标题到下一个标题之间的内容折叠（类似 <details>）",
    "color": "#5C6BC0",
    "icon": "unfold_more",
    "category": "builtin",
    "annoSource": "export default {\n  //   【fold / 折叠】 —— 将当前标题至下一个标题之间的内容折叠（类似 <details>）\n  //   触发方式：将 @fold 放置在标题行内（h1 - h6）\n  //   参数：collapsed = true/false（默认 true，并可通过 localStorage 持久化偏好）\n  //     localStorage 键：echo-fold-{echoId|nodeId|heading-index}\n  //   示例：# 第一章内容 @fold{collapsed:false}(点击折叠),\n  type: 'echo-chant',\n  field: 'fold',\n  title: 'fold',\n  version: 1,\n\n  props: {\"collapsed\":true},\n\n  render (props = {}) {\n    return '<span class=\"ag-echo-placeholder-marker\"><span class=\"ag-echo-anno-at\" contenteditable=\"false\">@</span><span class=\"ag-echo-anno-name ag-rune ag-rune--fold\" contenteditable=\"false\" data-echo-chant-id=\"fold\">fold</span></span>'\n  },\n\n  //   【handler】包裹标题之后兄弟节点并切换折叠，图标与标题文字同行，持久化折叠状态\n  afterRender (node, props = {}) {\n    \n    const $rune = $(node)\n    if (!$rune.length) return () => {}\n\n    // 找到包含该回响的标题元素\n    const $heading = $rune.closest('h1, h2, h3, h4, h5, h6')\n    if (!$heading.length) return () => {}\n\n    // Per-instance 幂等（挂在 $rune[0] 上，而不是 $heading 上）\n    //   - 同一 heading 行内允许多个 @fold 实例，各自独立\n    //   - Muya 重渲染 cleanup 时会清掉这个标记，下一次 afterRender 重装（这是正确的）\n    if ($rune[0].__agFoldInstalled) return () => {}\n\n    // === 显式找下一个 heading tag（替代 nextUntil，更可预期） ===\n    // nextUntil 的边界判断对 whitespace 文本节点 / comment / 内部 marker\n    // 节点的兼容性差；用 nextAll + findIndex 显式找下一个 h1-h6 tag，\n    // 避免吞掉下面不属于\"until\" 的兄弟节点。\n    const headingRe = /^h[1-6]$/i\n    const siblings = $heading.nextAll().toArray()\n    const nextHeadingIdx = siblings.findIndex(el => headingRe.test(el.tagName))\n    const $siblingsToWrap = nextHeadingIdx === -1\n      ? $(siblings)\n      : $(siblings.slice(0, nextHeadingIdx))\n    if (!$siblingsToWrap.length) return () => {}\n\n    // 读取 props 偏好；localStorage 中保存的偏好覆盖默认 collapsed\n    const mergedProps = Object.assign({ collapsed: true }, props || {})\n    // storageKey 三段降级：echoId（rune-style 稳定实例 id）> nodeId（向下兼容）>\n    //   heading 在同级 heading 集合里的索引 > 'fold'。\n    // 每行 heading 的 fold 是独立的偏好存储。\n    let headingIndex = ''\n    try {\n      const $allHeadings = $heading.parent().children('h1, h2, h3, h4, h5, h6')\n      headingIndex = String($allHeadings.index($heading[0]))\n    } catch (e) {}\n    const storageKey = 'echo-fold-' + (props.echoId || props.nodeId || headingIndex || 'fold')\n    let stored = null\n    try { stored = localStorage.getItem(storageKey) } catch (e) {}\n    if (stored !== null) {\n      mergedProps.collapsed = (stored === 'true')\n    }\n\n    // 包裹容器\n    const wrapperId = 'fold-container-' + Math.random().toString(36).substr(2, 9)\n    $siblingsToWrap.wrapAll('<div class=\"ag-fold-wrapper\" id=\"' + wrapperId + '\"></div>')\n    const $wrapper = $('#' + wrapperId)\n\n    // 确保标题支持图标绝对定位，并预留右侧空间\n    const prevPosition = $heading.css('position')\n    const prevPaddingRight = $heading.css('paddingRight')\n    if (prevPosition === 'static') $heading.css('position', 'relative')\n    $heading.css('padding-right', '28px')\n\n    // 创建折叠图标，绝对定位到标题右侧\n    const $toggleIcon = $(\n      '<span class=\"ag-fold-toggle-icon\" style=\"'\n      + 'position: absolute;'\n      + 'right: 4px;'\n      + 'top: 50%;'\n      + 'transform: translateY(-50%);'\n      + 'cursor: pointer;'\n      + 'font-size: 0.8em;'\n      + 'user-select: none;'\n      + 'line-height: 1;'\n      + '\">▼</span>'\n    )\n    $heading.append($toggleIcon)\n\n    // 折叠 / 展开逻辑\n    const toggleFold = (collapse) => {\n      if (collapse) {\n        $wrapper.slideUp(200)\n        $toggleIcon.text('▶')\n        $wrapper.addClass('ag-fold-collapsed')\n      } else {\n        $wrapper.slideDown(200)\n        $toggleIcon.text('▼')\n        $wrapper.removeClass('ag-fold-collapsed')\n      }\n    }\n\n    // 图标点击事件，同时更新 localStorage\n    const iconClickHandler = () => {\n      const nowCollapsed = $wrapper.hasClass('ag-fold-collapsed')\n      const newCollapsed = !nowCollapsed\n      toggleFold(newCollapsed)\n      try { localStorage.setItem(storageKey, newCollapsed ? 'true' : 'false') } catch (e) {}\n    }\n    $toggleIcon.on('click', iconClickHandler)\n\n    // 设置初始状态（已由 localStorage 调整）\n    toggleFold(!!mergedProps.collapsed)\n\n    // 给回响标记自身加激活样式\n    $rune.addClass('ag-rune-fold-active')\n\n    // 在 $rune 上挂 per-instance 已装标记（让 cleanup / 下次重渲染能识别）\n    $rune[0].__agFoldInstalled = true\n\n    // cleanup 函数：恢复所有改动，不清除 localStorage 偏好\n    return () => {\n      $toggleIcon.off('click', iconClickHandler)\n      $toggleIcon.remove()\n      if ($wrapper.length) {\n        $wrapper.children().unwrap()\n        $wrapper.remove()\n      }\n      $heading\n        .css('position', prevPosition === 'static' ? '' : prevPosition)\n        .css('padding-right', prevPaddingRight)\n      $rune.removeClass('ag-rune-fold-active')\n      try { delete $rune[0].__agFoldInstalled } catch (e) {}\n    }\n  \n  }\n}",
    "sortOrder": 16
  }
];
