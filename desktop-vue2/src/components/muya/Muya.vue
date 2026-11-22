<template>
  <div class='exclude-header' v-show='!isCurrentNoteLoading && dataLoaded'>
    <div ref='muya' id='muya' class='editor-component' v-close-popup>
    </div>
  </div>
</template>

<script>

import { createNamespacedHelpers } from 'vuex'
import helper from 'src/utils/helper'
import Vue from 'vue'
import { createRuneRendererCtor } from './runeSfcRendererFactory.js'
import { createMeltRuneRendererCtor, clearAllMeltCaches, preloadMeltRunes } from 'src/components/rune/meltRuneHost.js'
import {
  readRuneDataAttr,
  rewriteRunePlaceholderByNodeId,
  rewriteRunePlaceholderSizeByNodeId
} from './runePlaceholderAttrs.js'
import {
  default as Muya,
  TablePicker,
  QuickInsert,
  CodePicker,
  EmojiPicker,
  ImagePathPicker,
  ImageSelector,
  FormatPicker,
  FrontMenu,
  ImageToolbar,
  LinkTools,
  TableBarTools,
  Transformer,
  // v2026-07-31 起：Memocast Settings → 编辑器 → 「语法解析」开关让 Muya parser
  // 的 inlineRules.echo_anno 可以按 echoRequireParens=true/false 实时切换。
  // 唯一入口 setEchoAnnoRule：直接 mutate libs-muya-vue2/lib/parser/rules.js
  // 导出的 inlineRules.echo_anno 引用（libs-muya-vue2 是 workspace 包，详见插件契约
  // plugin-vue-version.mdc + rune-echo-cloudfn-experimental.mdc 的「改本地源码实时生效」）。
  setEchoAnnoRule
} from 'libs-muya-vue2/lib'
import 'libs-muya-vue2/themes/default.css'
import appBus from '../common/bus.js'
import _ from 'lodash'
import { v4 as uuidv4 } from 'uuid'
import { EVENTS as appEvents } from 'src/utils/const/eventsConst'
import 'libs-muya-vue2/themes/default.css'
import debugLogger from 'src/utils/debugLogger'
import { attachThemeColor } from 'src/utils/theme'
import { showContextMenu as showEditorContextMenu } from 'src/components/contextMenu/muya'
import {
  EchoRegistry,
  EchoRuntime,
  decodeEchoPayload,
  encodeEchoPayload,
  createEchoPlaceholderPayload,
  parseEchoProps,
  extractPrevEchoTokenValue,
  echoInheritFromPrevious
} from '../echo/echoCore.js'
import { CURRENT_ECHO_PLACEHOLDER_RE } from '../echo/echoBuiltinsShared.js'
import AiProofreadService from 'src/services/AiProofreadService'
import RuneTransformer from './runeTransformer.js'

const {
  mapGetters: mapServerGetters,
  mapState: mapServerState,
  mapActions: mapServerActions
} = createNamespacedHelpers('server')

const {
  mapState: mapClientState,
  mapActions: mapClientActions
} = createNamespacedHelpers('client')

const EMPTY_RUNE_TEMPLATE = '<div></div>'
const RUNE_TEXT_SLOT = 'default'

const createRuneInstanceId = () => uuidv4()
const createRuneNodeId = () => `rune-${uuidv4()}`
const escapeHtmlAttribute = (value = '') => String(value)
  .replace(/&/g, '&amp;')
  .replace(/"/g, '&quot;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')

const escapeEchoAttrValue = (value = '') => String(value)
  .replace(/\\/g, '\\\\')
  .replace(/'/g, "\\'")
  .replace(/\r/g, '\\r')
  .replace(/\n/g, '\\n')
  .replace(/\t/g, '\\t')

const buildEchoAttrSource = ({ value = '', echoId = '', definitionId = '' } = {}) => {
  const parts = []
  // === 字段名约定（v2026-07-30 起固定） ===
  // 生成的 markdown 用 `echoId: 'uuid'` 而非 `id: 'uuid'`，
  // 目的：与 rune 端的 `data-rune-id` / `data-rune-node-id` 命名风格一致；
  // 语义上也更准确——「echo 实例 id」不是「通用 id」。
  // 兼容性：parser 端同时识别 `id` 和 `echoId`（旧手写 markdown 不会坏）。
  if (echoId) {
    parts.push(`echoId: '${escapeEchoAttrValue(echoId)}'`)
  }
  if (definitionId) {
    parts.push(`definitionId: '${escapeEchoAttrValue(definitionId)}'`)
  }
  parts.push(`value: '${escapeEchoAttrValue(value)}'`)
  return parts.join(', ')
}

const buildEchoAnnotationText = (echoName = '回响', payload = '', options = {}) => {
  const decoded = decodeEchoPayload(payload)
  const value = decoded.prompt || decoded?.props?.value || ''
  // === echoId 优先（v2026-07-30 起固定） ===
  // 字段名：decodeEchoPayload 出来的 payload 里 props.echoId 也优先于 props.id
  const echoId = String(options.echoId || decoded?.props?.echoId || decoded?.props?.id || '').trim() || createEchoInstanceId()
  const definitionId = String(options.definitionId || decoded?.props?.definitionId || '').trim()
  return `@${echoName}{${buildEchoAttrSource({ value, echoId, definitionId })}}()`
}

const createEchoInstanceId = () => uuidv4()
const createEchoNodeId = () => `echo-${uuidv4()}`

const createEchoPlaceholderMarkup = (echo = {}, options = {}) => {
  const echoName = String(echo?.name || '回响').trim() || '回响'
  // 「上一节点 value 继承」：默认不开启；当 echo 名片层（或调用方 options）声明 inheritFromPrevious: true 时，
  // 从 markdown 中 currentIndex 之前最近的 echo token 提取 value 注入 placeholder。
  const inheritEnabled = echoInheritFromPrevious(echo) || options.inheritFromPrevious === true
  const prevValue = inheritEnabled
    ? extractPrevEchoTokenValue(options.markdown || '', options.currentIndex, { echoName })
    : ''
  const payload = createEchoPlaceholderPayload(echo, {
    inheritFromPrevious: inheritEnabled,
    inheritedValue: prevValue
  })
  return buildEchoAnnotationText(echoName, payload, {
    echoId: createEchoInstanceId(),
    definitionId: String(echo?.id || '').trim()
  })
}

const RunePreviewRenderer = Vue.extend({
  name: 'RunePreviewRenderer',
  props: {
    runeId: {
      type: String,
      default: ''
    },
    nodeId: {
      type: String,
      default: ''
    },
    rune: {
      type: Object,
      default: null
    },
    value: {
      type: String,
      default: ''
    },
    onValueChange: {
      type: Function,
      default: null
    },
    runeProps: {
      // 用户手写的 data-rune-prop-* / 自然属性（已按 propDefs 归一），
      // 由 mountRuneVueHosts 采集后整包传来，这里再摊给真正的符文组件。
      type: Object,
      default: null
    }
    // 注：SFC 自定义的 props（如 inheritFromPrevious）由 mountRuneVueHosts
    // 通过三优先级合并写到 host.dataset，再按 Vue props 规则显式传入。
    // 因此本渲染层不预先声明这些 prop，交给 Vue 自身的 props 解析决定要不要传。
  },
  // v2026-08-08 恢复老 Muya 同步形态：rune.template 在视频编辑器启动时已经决断
  // （DB 里的 rune 卡片字符串就是 SFC），所以这里直接走同步工厂。
  // createRuneRendererCtor 是同步函数（vue-template-compiler 是同步 API），
  // 所以 computed 可以直接返回值，无需 async/await loading 占位。
  computed: {
    rendererCtor () {
      const rune = this.rune || {}
      if (!String(rune.template || '').trim()) return null
      // melt-js 定义在 template 里存的是 JSON 配置，必须先于 SFC 编译分流：
      // 交给壳工厂（同步返回 ctor，加载在 created 里异步进行）。
      try {
        const meltCtor = createMeltRuneRendererCtor(rune)
        if (meltCtor) return meltCtor
      } catch (meltError) {
        console.warn('[Muya.RunePreviewRenderer] melt-js ctor failed:', meltError)
        return null
      }
      try {
        // 工厂内部已含缓存：同 cacheKey 直接命中 map，无重复编译。
        return createRuneRendererCtor(rune) || null
      } catch (error) {
        console.warn('[Muya.RunePreviewRenderer] SFC compile failed:', error)
        return null
      }
    }
  },
  render (h) {
    if (!this.rendererCtor) {
      return h('div', {
        staticClass: 'rune-renderer-empty',
        attrs: { contenteditable: 'false' }
      })
    }

    const self = this
    return h(this.rendererCtor, {
      props: {
        // 用户 props 先摊开，运行时字段后写，保证 runeId/nodeId/value 不被覆盖
        ...(this.runeProps || {}),
        runeId: this.runeId,
        nodeId: this.nodeId,
        rune: this.rune,
        value: this.value
      },
      on: {
        input: function (...args) {
          if (typeof self.onValueChange !== 'function') return
          const raw = args[0]
          let nextValue
          if (raw && typeof raw === 'object' && 'target' in raw && raw.target) {
            nextValue = raw.target.value
          } else {
            nextValue = raw
          }
          self.onValueChange({
            runeId: self.runeId,
            nodeId: self.nodeId,
            value: nextValue == null ? '' : String(nextValue)
          })
        }
      }
    })
  }
})

const EchoPreviewRenderer = Vue.extend({
  name: 'EchoPreviewRenderer',
  props: {
    echoId: {
      type: String,
      default: ''
    },
    nodeId: {
      type: String,
      default: ''
    },
    echo: {
      type: Object,
      default: null
    },
    value: {
      type: String,
      default: ''
    },
    onCommit: {
      type: Function,
      default: null
    }
  },
  computed: {
    displayTitle () {
      return this.echo?.name || '回响'
    },
    displaySummary () {
      const raw = this.value || this.echo?.desc || ''
      return String(raw || '').replace(/\s+/g, ' ').trim()
    },
    accentColor () {
      return this.echo?.color || '#26A69A'
    }
  },
  methods: {
    handleClick (event) {
      event.preventDefault()
      event.stopPropagation()
      if (typeof this.onCommit === 'function') {
        this.onCommit({
          echoId: this.echoId,
          nodeId: this.nodeId,
          echoName: this.echo?.name || '',
          value: this.value,
          payload: encodeEchoPayload({
            prompt: this.value,
            props: {
              id: this.echoId || '',
              definitionId: this.echo?.id || '',
              value: this.value
            }
          }),
          mode: 'open-instance'
        })
      }
    }
  },
  render (h) {
    const title = this.displaySummary
      ? `${this.displayTitle}: ${this.displaySummary}`
      : this.displayTitle

    return h('span', {
      staticClass: 'ag-echo-anno-token ag-echo-inline-preview',
      style: {
        '--echo-accent': this.accentColor
      },
      attrs: {
        contenteditable: 'false'
      },
      on: {
        click: this.handleClick
      }
    }, [
      h('span', {
        staticClass: 'ag-echo-placeholder-marker',
        attrs: {
          title,
          contenteditable: 'false'
        }
      }, [
        h('span', {
          staticClass: 'ag-echo-anno-at',
          attrs: {
            contenteditable: 'false'
          }
        }, ['@']),
        h('span', {
          staticClass: 'ag-echo-anno-name',
          attrs: {
            contenteditable: 'false'
          }
        }, [this.displayTitle])
      ])
    ])
  }
})

const clearEditorHistory = (editor) => {
  if (!editor) return
  if (typeof editor.clearHistory === 'function') {
    editor.clearHistory()
    return
  }
  if (editor.contentState?.history && typeof editor.contentState.history.clearHistory === 'function') {
    editor.contentState.history.clearHistory()
  }
}

const EchoPlaceholderHost = EchoPreviewRenderer

export default {
  name: 'Muya',
  props: {
    data: {
      type: Object,
      default: () => ({
        markdown: '',
        cursor: {
          lineNumber: 0,
          column: 0
        }
      })
    },
    active: {
      type: Boolean,
      default: false
    }
  },
  data () {
    return {
      contentEditor: {},
      runeTransformer: null,
      firstTimeLoad: false,
      previousNoteInfo: null,
      previousResources: [],
      pendingSaveData: null, // 编辑变化时预捕获的数据（备用）
      echoRegistry: new EchoRegistry([])
    }
  },
  computed: {
    dataLoaded: function () {
      return !helper.isNullOrEmpty(this.currentNote)
    },
    ...mapServerState(['isCurrentNoteLoading', 'contentsList', 'noteState']),
    ...mapServerGetters(['currentNote', 'uploadImageUrl', 'currentNoteResources', 'currentNoteResourceUrl']),
    ...mapClientState([
      'darkMode',
      'enablePreviewEditor',
      'theme',
      'runeCards',
      'echoCards',
      // v2026-07-31：监听 vuex 内 echoRequireParens / runeRequireTemplateDiv 变化，
      // 触发 inlineRules.echo_anno 实时切换（无需重启 Muya）。
      'echoRequireParens',
      'runeRequireTemplateDiv'
    ])
  },
  methods: {
    updateEchoPlaceholderPayload ({ echoId = '', nodeId = '', echoName = '', payload = '', mode = '', value = '' } = {}) {
      if (mode === 'open-instance') {
        appBus.$emit(appEvents.ECHO_EVENTS.openInstanceEditor, {
          echoId: String(echoId || '').trim() || String(decodeEchoPayload(payload)?.props?.id || '').trim(),
          nodeId: String(nodeId || '').trim(),
          echoName: String(echoName || '').trim(),
          payload: payload || ''
        })
        return true
      }
      if (mode === 'open-definition') {
        appBus.$emit(appEvents.ECHO_EVENTS.openManager, {
          echoId: String(echoId || '').trim() || String(decodeEchoPayload(payload)?.props?.id || '').trim(),
          nodeId: String(nodeId || '').trim(),
          echoName: String(echoName || '').trim(),
          payload: payload || ''
        })
        return true
      }
      if (!this.contentEditor) return false
      const markdown = this.contentEditor.getMarkdown()
      if (!markdown) return false

      const resolvedValue = typeof value === 'string' ? value : (decodeEchoPayload(payload)?.prompt || decodeEchoPayload(payload)?.props?.value || '')
      const normalizedEchoId = String(echoId || '').trim()
      const decoded = decodeEchoPayload(payload)
      const propsFromPayload = decoded?.props || {}
      const normalizedDefinitionId = String(propsFromPayload?.definitionId || this.echoCards?.find(e => e.name === echoName)?.id || '').trim()

      const nextPayload = encodeEchoPayload({
        prompt: resolvedValue,
        props: {
          ...propsFromPayload,
          id: normalizedEchoId || String(propsFromPayload?.id || '').trim() || createEchoInstanceId(),
          definitionId: normalizedDefinitionId,
          value: resolvedValue
        }
      })

      let updated = false
      const nextMarkdown = markdown.replace(CURRENT_ECHO_PLACEHOLDER_RE, (match, matchedName = '', matchedProps = '', matchedPrompt = '') => {
        const currentName = String(matchedName || echoName || '').trim()
        const props = parseEchoProps(matchedProps)
        const matchedId = String(props.id || '').trim()
        if (updated) return match
        // For anonymous echo (@{}), match by echoId only
        const isAnonymous = !matchedName
        if (normalizedEchoId && matchedId && matchedId !== normalizedEchoId) return match
        if (!isAnonymous && !normalizedEchoId && echoName && currentName !== echoName) return match
        updated = true
        const resolvedEchoId = normalizedEchoId || matchedId || String(propsFromPayload?.id || '').trim() || createEchoInstanceId()
        return buildEchoAnnotationText(currentName || '回响', nextPayload, {
          echoId: resolvedEchoId,
          definitionId: String(props.definitionId || normalizedDefinitionId || '').trim()
        })
      })

      if (!updated || nextMarkdown === markdown) return false
      const cursor = typeof this.contentEditor.getCursor === 'function' ? this.contentEditor.getCursor() : null
      this.contentEditor.setMarkdown(nextMarkdown, cursor, false)
      this.updateContentsList(this.contentEditor.getTOC())
      this.updateNoteState('changed')
      return true
    },
    // lucky 全局回调：@强运() 点击后真正调 AI 校对。
    // 入参由 EchoRuntime 在 handler 内传 {node, props}
    async handleLuckyChantTrigger ({ node, props = {} } = {}) {
      try {
        if (!this.contentEditor || typeof this.contentEditor.getMarkdown !== 'function') return
        const markdown = this.contentEditor.getMarkdown() || ''
        if (!markdown.trim()) {
          this.$q && this.$q.notify && this.$q.notify({ message: this.$t('aiLuckyEmpty'), type: 'warning', position: 'top' })
          return
        }
        const loadingClass = 'ag-rune-lucky-loading'
        if (node && node.classList) node.classList.add(loadingClass)
        try {
          const result = await AiProofreadService.proofread(markdown, { model: props?.model || undefined })
          if (!result || !result.corrected) {
            this.$q && this.$q.notify && this.$q.notify({ message: this.$t('aiLuckyNoChange'), type: 'info', position: 'top' })
            return
          }
          if (result.corrected === markdown) {
            this.$q && this.$q.notify && this.$q.notify({ message: this.$t('aiLuckyNoChange'), type: 'info', position: 'top' })
            return
          }
          // 替换当前笔记内容
          const cursor = typeof this.contentEditor.getCursor === 'function' ? this.contentEditor.getCursor() : null
          this.contentEditor.setMarkdown(result.corrected, cursor, false)
          this.updateContentsList(this.contentEditor.getTOC())
          this.updateNoteState('changed')
          this.$q && this.$q.notify && this.$q.notify({
            message: this.$t('aiLuckyDone') + `（model=${result.model}）`,
            type: 'positive',
            position: 'top'
          })
        } finally {
          if (node && node.classList) node.classList.remove(loadingClass)
        }
      } catch (error) {
        console.error('[lucky] handler failed:', error)
        const code = error && error.code
        let message = this.$t('aiLuckyFailed')
        if (code === 'AI_PROOFREAD_NO_DEFAULT_CONFIG') {
          message = this.$t('aiLuckyNoConfig')
        } else if (code === 'AI_PROOFREAD_CONFIG_INCOMPLETE') {
          const fields = Array.isArray(error.missingFields) ? error.missingFields.join(', ') : ''
          message = this.$t('aiLuckyConfigIncomplete') + (fields ? ` (${fields})` : '')
        } else if (error && error.message) {
          message += `: ${error.message}`
        }
        this.$q && this.$q.notify && this.$q.notify({ message, type: 'negative', position: 'top' })
      }
    },
    // 打开笔记后 idle 预热 melt 依赖（失败只记日志，不阻塞编辑）
    scheduleMeltPrewarm () {
      const runes = Array.isArray(this.runeCards) ? this.runeCards : []
      if (!runes.length) return
      const start = () => { preloadMeltRunes(runes) }
      if (typeof window.requestIdleCallback === 'function') {
        window.requestIdleCallback(start, { timeout: 5000 })
      } else {
        setTimeout(start, 2000)
      }
    },
    // 设置里「刷新所有远程组件」后重挂符文：ctor/资源池已清，重渲染即走新链路
    onMeltCachesCleared () {
      const cleared = clearAllMeltCaches({ clearDisk: true })
      console.info(`[Muya] melt caches cleared (${cleared} deps), re-rendering runes`)
      this.$nextTick(() => {
        const renderer = this.contentEditor?.contentState?.stateRender
        if (renderer && typeof renderer.renderRunes === 'function') {
          renderer.renderRunes()
        }
      })
    },
    refreshEchoDefinitions () {
      this.echoRegistry.refresh(this.echoCards || [])
      // 让 runtime 实例保持与 registry 一致；新增/删除 echo 后让旧的 compiled definition 缓存失效
      if (!this._echoRuntime) {
        this._echoRuntime = new EchoRuntime({ registry: this.echoRegistry })
      }
      this._echoRuntime.invalidate()
      if (this.contentEditor && this.contentEditor.options) {
        this.contentEditor.options.echoRegistry = this.echoRegistry
        this.contentEditor.options.echoCards = this.echoCards || []
        this.contentEditor.options.echoRuntime = this._echoRuntime
        const quickInsert = this.contentEditor.ui && this.contentEditor.ui.quickInsert
        if (quickInsert) {
          quickInsert.renderObj = quickInsert.getRenderObj()
          if (quickInsert.oldVnode) {
            quickInsert.render()
          }
        }
        if (this.contentEditor?.contentState?.stateRender?.renderRunes) {
          this.contentEditor.contentState.stateRender.renderRunes()
        } else if (this.contentEditor?.contentState) {
          this.contentEditor.contentState.render(false, true)
        }
      }
    },
    /**
     * 把符文占位符里的 value 写回 Markdown 源（同步 data-rune-value 与 innerText）。
     * 取自 TODO「多符文渲染引擎机制」中 RuneValue { runeId, nodeId, value }，
     * 通过 nodeId 精准定位，只动当前实例的占位符，不影响其他符文或外部段落。
     */
    updateRunePlaceholderValue ({ runeId = '', nodeId = '', value = '' } = {}) {
      if (!this.contentEditor || typeof this.contentEditor.getMarkdown !== 'function') return false
      const markdown = this.contentEditor.getMarkdown()
      if (!markdown) return false
      const targetNodeId = String(nodeId || '').trim() || this.findRunePlaceholderNodeIdByRuneInstance(markdown, runeId)
      if (!targetNodeId) return false
      const nextMarkdown = rewriteRunePlaceholderByNodeId(markdown, targetNodeId, value)
      if (nextMarkdown === markdown) return false
      const cursor = typeof this.contentEditor.getCursor === 'function' ? this.contentEditor.getCursor() : null
      this.contentEditor.setMarkdown(nextMarkdown, cursor, false)
      this.updateContentsList(this.contentEditor.getTOC())
      this.updateNoteState('changed')
      // 显式触发 input 事件以让 noteState watcher / 词数统计等下游感知到
      this.contentEditor.dispatchEvent && this.contentEditor.dispatchEvent('change')
      if (typeof this.contentEditor.dispatchChange === 'function') {
        this.contentEditor.dispatchChange()
      }
      return true
    },
    updateRunePlaceholderSize ({ nodeId = '', width = null, height = null } = {}) {
      console.info('[Muya] updateRunePlaceholderSize:called', { nodeId, width, height, hasEditor: !!this.contentEditor })
      if (!this.contentEditor || typeof this.contentEditor.getMarkdown !== 'function') {
        console.warn('[Muya] updateRunePlaceholderSize:no editor')
        return false
      }
      const markdown = this.contentEditor.getMarkdown()
      const targetNodeId = String(nodeId || '').trim()
      if (!markdown || !targetNodeId) {
        console.warn('[Muya] updateRunePlaceholderSize:missing markdown/nodeId', { markdownLen: markdown?.length || 0, targetNodeId })
        return false
      }

      const nextMarkdown = rewriteRunePlaceholderSizeByNodeId(markdown, targetNodeId, { width, height })
      if (nextMarkdown === markdown) {
        console.warn('[Muya] updateRunePlaceholderSize:no markdown change', { nodeId: targetNodeId })
        return false
      }

      const cursor = typeof this.contentEditor.getCursor === 'function' ? this.contentEditor.getCursor() : null
      this.contentEditor.setMarkdown(nextMarkdown, cursor, false)
      console.info('[Muya] updateRunePlaceholderSize:committed to editor', {
        nodeId: targetNodeId,
        width,
        height,
        markdownPreview: nextMarkdown.slice(0, 320)
      })
      this.updateContentsList(this.contentEditor.getTOC())
      this.updateNoteState('changed')
      if (typeof this.contentEditor.dispatchChange === 'function') this.contentEditor.dispatchChange()
      return true
    },
    /**
     * 仅供 updateRunePlaceholderValue 兜底用：根据 runeId 找一个未指定 nodeId 的占位符。
     * 一般调用方都会带 nodeId，这里仅作防御。
     */
    findRunePlaceholderNodeIdByRuneInstance (markdown = '', runeId = '') {
      const targetRuneId = String(runeId || '').trim()
      if (!targetRuneId) return ''
      const re = new RegExp('<div(\\s+[^>]*?)>([\\s\\S]*?)</div>', 'gi')
      let found = ''
      re.lastIndex = 0
      String(markdown || '').replace(re, (_match, attrsSource = '') => {
        if (found) return _match
        if (readRuneDataAttr(attrsSource, 'data-rune-id') === targetRuneId) {
          found = readRuneDataAttr(attrsSource, 'data-rune-node-id')
        }
        return _match
      })
      return found
    },
    getValue: function () {
      if (!this.contentEditor || typeof this.contentEditor.getMarkdown !== 'function') {
        return null
      }
      return this.contentEditor.getMarkdown()
    },
    // ✅ 新增：主动捕获当前编辑器内容（供外部调用，如切换笔记前）
    captureCurrentContent: function () {
      if (!this.contentEditor || typeof this.contentEditor.getMarkdown !== 'function') return null

      const markdown = this.contentEditor.getMarkdown()
      const currentNote = this.$store.state.server.currentNote

      if (!currentNote?.info || typeof markdown !== 'string') return null

      const captureData = {
        markdown,
        docGuid: currentNote.info.docGuid,
        title: currentNote.info.title,
        resources: currentNote.resources || [],
        timestamp: Date.now(),
        noteState: this.noteState
      }

      // 更新待保存数据（供 watcher 使用）
      this.pendingSaveData = captureData

      console.log(`[Muya.captureCurrentContent] Captured: docGuid=${captureData.docGuid}, len=${markdown.length}, state=${this.noteState}`)

      return captureData
    },
    paragraphHandler: function (type) {
      if (this.active && this.enablePreviewEditor && this.contentEditor) {
        this.contentEditor.updateParagraph(type)
        this.updateContentsList(this.contentEditor.getTOC())
      }
    },
    insertParagraphHandler: function (location) {
      if (this.active && this.enablePreviewEditor && this.contentEditor) {
        this.contentEditor.insertParagraph(location)
      }
    },
    /**
     * 插入文本到编辑器末尾（用于从夯到拉回填 / AI 助手追加）
     * 仅在 Muya 是当前激活编辑器时执行，避免 Muya/Monaco 同时挂载时双写。
     */
    insertTextHandler: function (text) {
      if (!this.active) return
      if (!text || !this.contentEditor || typeof this.contentEditor.getMarkdown !== 'function') return

      const currentMarkdown = this.contentEditor.getMarkdown() || ''
      const newMarkdown = currentMarkdown + text
      const cursor = typeof this.contentEditor.getCursor === 'function' ? this.contentEditor.getCursor() : null
      this.contentEditor.setMarkdown(newMarkdown, cursor, false)
      this.updateContentsList(this.contentEditor.getTOC())
      this.updateNoteState('changed')
      this.$nextTick(() => {
        if (typeof this.contentEditor.scrollToEnd === 'function') {
          this.contentEditor.scrollToEnd()
        }
      })
    },
    formatDocumentByPanguHandler: function () {
      if (this.active && this.enablePreviewEditor && this.contentEditor) {
        const before = this.contentEditor.getMarkdown()
        helper.formatDocumentByRemarkPangu(before).then(after => {
          if (before !== after) {
            this.contentEditor.setMarkdown(after)
            this.updateContentsList(this.contentEditor.getTOC())
            this.updateNoteState('changed')
          }
        })
      }
    },
    formatHandler: function (type) {
      if (this.active && this.enablePreviewEditor && this.contentEditor) {
        this.contentEditor.format(type)
      }
    },
    editParagraphHandler: function (type) {
      if (this.active && this.enablePreviewEditor && this.contentEditor) {
        switch (type) {
          case 'duplicate': {
            return this.contentEditor.duplicate()
          }
          case 'createParagraph': {
            return this.contentEditor.insertParagraph('after', '', true)
          }
          case 'deleteParagraph': {
            return this.contentEditor.deleteParagraph()
          }
          default:
            console.error(`Cannot recognize paragraph edit type: ${type}`)
        }
      }
    },
    editCopyPasteHandler: function (type) {
      if (this.active && this.enablePreviewEditor && this.contentEditor) {
        this.contentEditor[type]()
      }
    },
    saveHandler: function () {
      if (this.active && this.enablePreviewEditor && this.contentEditor) {
        const markdown = this.pendingSaveData?.markdown || this.contentEditor.getMarkdown()
        this.updateNote(markdown)
      }
    },

    selectAllHandler: function () {
      if (this.active && this.enablePreviewEditor && this.contentEditor) {
        this.contentEditor.selectAll()
      }
    },
    undoHandler: function () {
      if (this.active && this.enablePreviewEditor && this.contentEditor) {
        this.contentEditor.undo()
      }
    },
    redoHandler: function () {
      if (this.active && this.enablePreviewEditor && this.contentEditor) {
        this.contentEditor.redo()
      }
    },
    scrollToHeaderHandler: function (slug) {
      this.scrollToElementHandler(`#${slug}`)
    },
    scrollToElementHandler: function (selector) {
      const { container } = this.contentEditor
      const anchor = document.querySelector(selector)
      if (anchor) {
        const STANDARD_Y = window.innerHeight * 0.065
        const { y } = anchor.getBoundingClientRect()
        const DURATION = this.$q.platform.is.mac ? 300 : 0
        helper.animatedScrollTo(container, container.scrollTop + y - STANDARD_Y, DURATION)
      }
    },
    getCursorPosition: function () {
      const cursor = this.contentEditor?.getCursor?.()
      const focus = cursor && cursor.focus ? cursor.focus : null
      if (!focus) {
        return { lineNumber: 1, column: 1 }
      }
      const line = Number(focus.line)
      const ch = Number(focus.ch)
      return {
        lineNumber: Number.isFinite(line) && line >= 1 ? Math.floor(line) : 1,
        column: Number.isFinite(ch) && ch >= 1 ? Math.floor(ch) : 1
      }
    },
    setCursorPosition: function (position) {
      if (!this.contentEditor) return
      const rawLine = Number(position && position.lineNumber)
      const rawColumn = Number(position && position.column)
      const lineNumber = Number.isFinite(rawLine) && rawLine >= 1 ? Math.floor(rawLine) : 1
      const column = Number.isFinite(rawColumn) && rawColumn >= 1 ? Math.floor(rawColumn) : 1
      this.contentEditor.setCursor({
        anchor: { line: lineNumber, ch: column },
        focus: { line: lineNumber, ch: column }
      })
    },
    ...mapServerActions(['updateNote', 'updateNoteWithInfo', 'updateNoteState', 'updateContentsList', 'uploadImage']),
    ...mapClientActions([
      'importImageFromLocal',
      // v2026-07-31：created() 内会 dispatch loadParsingSettings，
      // 从 SQLite 真源拉一次 echoRequireParens / runeRequireTemplateDiv 到 vuex。
      'loadParsingSettings'
    ])
  },
  created () {
    this.$nextTick(() => {
      Muya.use(TablePicker)
      Muya.use(QuickInsert)
      Muya.use(CodePicker)
      Muya.use(EmojiPicker)
      Muya.use(ImagePathPicker)
      Muya.use(ImageToolbar)
      Muya.use(ImageSelector)
      Muya.use(FormatPicker)
      Muya.use(FrontMenu)
      Muya.use(LinkTools, {
        jumpClick: (linkInfo) => {
          window.open(linkInfo.href)
        }
      })
      Muya.use(Transformer)
      Muya.use(TableBarTools)

      // v2026-07-31：启动时从 SQLite 真源拉取「语法解析」开关到 vuex。
      // 注意：Muya 不再读 options.echoAnnoRule，规则切换由 setEchoAnnoRule 这一
      // 个口子 mutate inlineRules.echo_anno 实现（libs-muya-vue2 是 workspace 包，
      // 直接改 parser 源码，详见 libs-muya-vue2/lib/parser/index.js 的
      // setEchoAnnoRule 注释）。
      // 流程：
      //   1) 同步分支：上方的 setEchoAnnoRule({ requireParens: this.echoRequireParens })
      //      用 vuex 初始值（默认 true）覆盖一次 inlineRules.echo_anno；
      //   2) 异步分支：dispatch loadParsingSettings 拉 SQLite 真值并 commit vuex；
      //      commit 后 echoRequireParens watcher 会再次 setEchoAnnoRule 并触发
      //      contentState.render(false, true) 全量重 render——首屏 retry 即生效。
      this.loadParsingSettings().catch(err => {
        console.warn('[Muya] loadParsingSettings dispatch failed:', err)
      })

      this.echoRegistry.refresh(this.echoCards || [])
      this._echoRuntime = new EchoRuntime({ registry: this.echoRegistry })

      // 注册全局 lucky 回调：@强运 点击后真正调 AI 校对。
      if (typeof window !== 'undefined') {
        window.__memocastEchoChantHandlers = Object.assign(window.__memocastEchoChantHandlers || {}, {
          lucky: this.handleLuckyChantTrigger.bind(this)
        })
      }

      // === v2026-07-31 新增：「语法解析 / echoRequireParens」开关同步到 Muya parser ===
      // 唯一入口：setEchoAnnoRule({ requireParens })，直接 mutate
      // libs-muya-vue2/lib/parser/rules.js 导出的 inlineRules.echo_anno 引用。
      // 与 plugin-vue-version.mdc + rune-echo-cloudfn-experimental.mdc 的
      // 「libs-muya-vue2 是 workspace 包，直接改源码让规则实时生效」口径一致。
      //
      // 数据流：
      //   SQLite 真源('setting/parsing/echoRequireParens')
      //     → vuex state.echoRequireParens (响应式 cache)
      //     → setEchoAnnoRule(...) 替换 inlineRules.echo_anno
      //     → 后续所有 token 化路径（backspaceCtrl / deleteCtrl / inputCtrl / formatCtrl /
      //        enterCtrl / renderLeafBlock / importMarkdown / hasEchoInlineToken / ...）
      //        都会自动拿到新 RE（都闭包引用 inlineRules.echo_anno）
      //     → 调用方再触发一次 contentState.render(false, true) 把已解析的 block 也重切
      //
      // created() 阶段做两件事：
      //   1) 同步先按 vuex mapState 的 echoRequireParens（初始默认 true）setEchoAnnoRule
      //      一次，确保 inlineRules.echo_anno 在 new Muya() 之前就已是正确形态；
      //   2) dispatch loadParsingSettings 异步拉真值 → 回填 vuex → watcher 触发自动刷新
      //      （窗口内的 race 用 1+2 双层解决：开门先开灶，发现值变了再补开）。
      const requireParensAtBoot = this.echoRequireParens !== undefined ? this.echoRequireParens : true
      setEchoAnnoRule({ requireParens: !!requireParensAtBoot })

      // 把 Vue 实例注入 Muya options，让 Muya 内部的 StateRender 能回调到我们的回写方法
      const muyaSelf = this
      this.scheduleMeltPrewarm()
      const { container } = this.contentEditor = new Muya(this.$refs.muya, {
        memoMuya: muyaSelf,
        onRuneResize: payload => {
          console.info('[Muya] onRuneResize option received', payload)
          return muyaSelf.updateRunePlaceholderSize(payload)
        },
        echoRuntime: this._echoRuntime,
        quickInsertProvider: () => {
          const runeItems = (this.runeCards || [])
            .filter(rune => rune && (rune.name || rune.text || rune.label))
            .map(rune => {
              return {
                title: () => rune.name || rune.text || rune.label || 'Rune',
                subTitle: () => rune.desc || rune.template || '',
                label: `rune:${rune.id}`,
                shortCut: '',
                icon: rune.icon,
                color: rune.color,
                searchText: [rune.name, rune.text, rune.label, rune.desc, rune.template].filter(Boolean).join(' '),
                meta: {
                  type: 'rune',
                  runeTemplateId: rune.id,
                  runeName: (rune.name || rune.text || rune.label || '').trim(),
                  color: rune.color,
                  insertContent: rune.template || ''
                }
              }
            })
          const echoItems = (this.echoCards || [])
            .filter(echo => echo && echo.name)
            .map(echo => ({
              title: () => echo.name || 'Echo',
              subTitle: () => echo.desc || '',
              label: `echo:${echo.id || echo.name}`,
              shortCut: '',
              icon: `data:image/svg+xml;base64,${window.btoa(unescape(encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="${echo.color || '#26A69A'}"/><text x="50%" y="50%" dy="0.35em" text-anchor="middle" font-size="28" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Arial,PingFang SC,Microsoft YaHei,sans-serif" font-weight="700" fill="#fff">${Array.from(String(echo.name || '回').trim())[0] || '回'}</text></svg>`)))}`,
              color: echo.color || '#26A69A',
              searchText: [echo.name, echo.desc, echo.anno_source].filter(Boolean).join(' '),
              insertContent: `@${echo.name || '回响'}{}()`,
              meta: {
                type: 'echo',
                echoName: (echo.name || '回响').trim(),
                color: echo.color || '#26A69A'
              }
            }))
          const runeSectionTitle = this.$t('runeSectionTitle')
          const echoSectionTitle = this.$t('echoSectionTitle') || this.$t('echo') || 'Echo'
          return {
            sectionName: runeSectionTitle,
            items: {
              [runeSectionTitle]: runeItems,
              [echoSectionTitle]: echoItems
            },
            echoSectionName: echoSectionTitle
          }
        },
        runeCards: this.runeCards,
        echoSectionName: this.$t('echo') || 'Echo',
        echoRegistry: this.echoRegistry,
        echoCards: this.echoCards,
        runeRendererCtor: RunePreviewRenderer,
        echoRendererCtor: EchoPlaceholderHost,
        enableRuneVueRenderer: true,
        enableEchoVueRenderer: false, // Echo 默认不使用 Vue 渲染模式
        onEchoPlaceholderCommit: this.updateEchoPlaceholderPayload,
        imagePathPicker: () => {
          return new Promise((resolve, reject) => {
            this.importImageFromLocal().then(paths => {
              debugLogger.Info(paths)
              resolve(paths ? paths[0] : '')
            }).catch(err => {
              debugLogger.Error(err)
              reject(err)
            })
          })
        },
        imageAction: this.uploadImage
      })

      this.runeTransformer = new RuneTransformer(this.contentEditor, {
        onCommit: payload => this.contentEditor?.options?.onRuneResize?.(payload)
      })

      attachThemeColor(this.theme)

      const handleNonEchoClick = _.debounce((event) => {
        if (event?.target?.type === 'checkbox') {
          const curData = this.contentEditor.getMarkdown()

          // ✅ 兼容新格式：提取 currentNote 的真实内容
          let currentNoteContent = ''
          if (typeof this.currentNote === 'string') {
            currentNoteContent = this.currentNote || ''
          } else if (this.currentNote && typeof this.currentNote === 'object') {
            currentNoteContent = this.currentNote.__markdown || ''
          }

          // eslint-disable-next-line eqeqeq
          if (curData != currentNoteContent) {
            this.updateNoteState('changed')
            this.updateContentsList(this.contentEditor.getTOC())
          } else {
            this.updateNoteState('default')
          }
        }
      }, 800)

      this.contentEditor.on('muya-click', (event) => {
        // 非 echo 路径（checkbox / 表格 / container 等）继续走 800ms debounce，
        // 避免连续 click 频繁触发 noteState 切换。
        // echo 占位符点击走 jQuery 委托（见下面的 $(container).on('click', ...)），
        // 委托直接挂在 Muya 容器 DOM 上，不依赖 eventCenter 链路，链路更短、更可靠。
        handleNonEchoClick(event)
      })

      // echo 占位符点击：document 级 capture，最稳的捕获。
// 不挂 container（会被 Muya 重建），用 closest('[data-echo-inline="true"]') 锁定 echo host。
const echoCaptureHandler = (event) => {
  const targetEl = event?.target
  if (!targetEl || typeof targetEl.closest !== 'function') return
  const echoTarget = targetEl.closest('[data-echo-inline="true"]')
  if (!echoTarget) return
  event.preventDefault()
  event.stopImmediatePropagation()
  const dataset = echoTarget.dataset || {}
  const echoId = String(dataset.echoId || '').trim()
  const echoName = String(dataset.echoName || '').trim()
  const definitionId = String(dataset.echoDefinitionId || '').trim()
  const value = String(dataset.echoValue || '')
  this.updateEchoPlaceholderPayload({
    echoId,
    echoName,
    value,
    payload: encodeEchoPayload({
      prompt: value,
      props: { id: echoId, definitionId, value }
    }),
    mode: 'open-instance'
  })
}
document.addEventListener('click', echoCaptureHandler, true)
this._echoDelegate = { container: document, handler: echoCaptureHandler }

      this.contentEditor.on('change', () => this.updateContentsList(this.contentEditor.getTOC()))

      this.contentEditor.on('change', () => appBus.$emit(appEvents.UPDATE_WORD_COUNT, this.contentEditor.getWordCount(this.contentEditor.getMarkdown())))

      this.contentEditor.on('contextmenu', (event, selection) => {
        showEditorContextMenu(event, selection)
      })

      this.contentEditor.on('selectionChange', changes => {
        const { y } = changes.cursorCoords

        if (container.clientHeight - y < 100) {
          const editableHeight = container.clientHeight - 100
          if (this.$q.platform.is.mac) {
            helper.animatedScrollTo(container, container.scrollTop + (y - editableHeight), 100)
          } else {
            container.scrollTop = container.scrollTop + (y - editableHeight)
          }
        }
      })

      this.contentEditor.on('change', _.debounce(({ markdown: curData }) => {
        // ✅ 兼容新格式：currentNote 可能是字符串或对象
        let currentNoteContent = ''

        if (typeof this.currentNote === 'string') {
          // 旧格式：直接是字符串
          currentNoteContent = this.currentNote || ''
        } else if (this.currentNote && typeof this.currentNote === 'object') {
          // 新格式：提取 __markdown 字段
          currentNoteContent = this.currentNote.__markdown || ''
        }

        // ✅ 使用提取后的内容进行比较
        if (curData.replace(/\s/g, '') === currentNoteContent.replace(/\s/g, '') || this.noteState === 'none' || this.firstTimeLoad) {
          this.updateNoteState('default')
          this.firstTimeLoad = false
        } else {
          this.updateNoteState('changed')
          this.updateContentsList(this.contentEditor.getTOC())

          // ✅ 关键改进：在内容变化时立即预捕获数据
          // 这样当后续切换笔记时，已经有可靠的数据可以保存
          const currentNote = this.$store.state.server.currentNote
          if (currentNote?.info) {
            this.pendingSaveData = {
              markdown: curData,
              docGuid: currentNote.info.docGuid,
              resources: currentNote.resources || [],
              timestamp: Date.now()
            }
            // console.log('[Muya] Pre-captured save data:', { docGuid: currentNote.info.docGuid, len: curData.length })
          }
        }
        this.updateContentsList(this.contentEditor.getTOC())
      }, 300, { leading: true }))

      appBus.$on('meltCachesCleared', this.onMeltCachesCleared)
      appBus.$on(appEvents.SCROLL_TO_HEADER, this.scrollToHeaderHandler)
      appBus.$on(appEvents.PARAGRAPH_SHORTCUT_CALL, this.paragraphHandler)
      appBus.$on(appEvents.FORMAT_SHORTCUT_CALL, this.formatHandler)
      appBus.$on(appEvents.EDIT_SHORTCUT_CALL.undo, this.editCopyPasteHandler)
      appBus.$on(appEvents.EDIT_SHORTCUT_CALL.redo, this.editCopyPasteHandler)
      appBus.$on(appEvents.EDIT_SHORTCUT_CALL.copyAsMarkdown, this.editCopyPasteHandler)
      appBus.$on(appEvents.EDIT_SHORTCUT_CALL.copyAsHtml, this.editCopyPasteHandler)
      appBus.$on(appEvents.EDIT_SHORTCUT_CALL.pasteAsPlainText, this.editCopyPasteHandler)
      appBus.$on(appEvents.EDIT_SHORTCUT_CALL.duplicate, this.editParagraphHandler)
      appBus.$on(appEvents.EDIT_SHORTCUT_CALL.selectAll, this.selectAllHandler)
      appBus.$on(appEvents.EDIT_SHORTCUT_CALL.createParagraph, this.editParagraphHandler)
      appBus.$on(appEvents.EDIT_SHORTCUT_CALL.deleteParagraph, this.editParagraphHandler)
      appBus.$on(appEvents.EDIT_SHORTCUT_CALL.insertParagraph, this.insertParagraphHandler)
      appBus.$on(appEvents.EDIT_SHORTCUT_CALL.formatDocumentByPangu, this.formatDocumentByPanguHandler)
      appBus.$on(appEvents.NOTE_SHORTCUT_CALL.save, this.saveHandler)
      appBus.$on(appEvents.ECHO_EVENTS.commitInstance, this.updateEchoPlaceholderPayload)
      appBus.$on(appEvents.ECHO_EVENTS.openInstanceEditor, this.updateEchoPlaceholderPayload)
      appBus.$on(appEvents.INSERT_TEXT, this.insertTextHandler)
      appBus.$on(appEvents.INSERT_AI_TEXT, this.insertTextHandler)
    })
  },
  beforeDestroy () {
    if (this.runeTransformer && typeof this.runeTransformer.destroy === 'function') {
      this.runeTransformer.destroy()
      this.runeTransformer = null
    }
    if (this.contentEditor && typeof this.contentEditor.destroy === 'function') {
      this.contentEditor.destroy()
    }
    if (typeof window !== 'undefined' && window.__memocastEchoChantHandlers) {
      delete window.__memocastEchoChantHandlers.lucky
    }
    appBus.$off(appEvents.PARAGRAPH_SHORTCUT_CALL)
    appBus.$off(appEvents.FORMAT_SHORTCUT_CALL)
    appBus.$off(appEvents.EDIT_SHORTCUT_CALL.undo)
    appBus.$off(appEvents.EDIT_SHORTCUT_CALL.redo)
    appBus.$off(appEvents.EDIT_SHORTCUT_CALL.save)
    appBus.$off(appEvents.EDIT_SHORTCUT_CALL.copyAsMarkdown)
    appBus.$off(appEvents.EDIT_SHORTCUT_CALL.copyAsHtml)
    appBus.$off(appEvents.EDIT_SHORTCUT_CALL.pasteAsPlainText)
    appBus.$off(appEvents.EDIT_SHORTCUT_CALL.duplicate)
    appBus.$off(appEvents.EDIT_SHORTCUT_CALL.selectAll)
    appBus.$off(appEvents.EDIT_SHORTCUT_CALL.createParagraph)
    appBus.$off(appEvents.EDIT_SHORTCUT_CALL.deleteParagraph)
    appBus.$off(appEvents.EDIT_SHORTCUT_CALL.insertParagraph)
    appBus.$off(appEvents.EDIT_SHORTCUT_CALL.formatDocumentByPangu)
    appBus.$off(appEvents.ECHO_EVENTS.commitInstance)
    appBus.$off(appEvents.ECHO_EVENTS.openInstanceEditor)
    appBus.$off(appEvents.INSERT_TEXT)
    appBus.$off(appEvents.INSERT_AI_TEXT)
    // 卸载 document 级 click listener
    if (this._echoDelegate && this._echoDelegate.container) {
      this._echoDelegate.container.removeEventListener('click', this._echoDelegate.handler, true)
      this._echoDelegate = null
    }
  },
  watch: {
    // v2026-07-31 新增：SettingsDialog 切换 echoRequireParens 后，无需重启编辑器即可让
    // Muya parser 把回响占位符解析规则切到新的形态：
    //   - true（默认）→ () 必填，@name{} / @name 不命中 echo_anno
    //   - false         → () 可选，@name{} / @name 也命中 echo_anno（兼容历史笔记）
    // 实现：
    //   - setEchoAnnoRule() mutate 全局 inlineRules.echo_anno，让后续 tokenizer() 走新 RE
    //     （parser/index.js 的默认合成路径会优先用 options.echoAnnoRule，但有很多
    //     contentState 子模块直接闭包引用 inlineRules，所以也要 mutate 引用）。
    //   - contentState.render(false, true) 强制重 render 所有 block，把已解析的 token
    //     全部按新规则重切。
    // 守卫：contentEditor 未就绪时跳过（created() 阶段已经处理过初始值）。
    echoRequireParens (requireParens) {
      if (!this.contentEditor || typeof this.contentEditor.getMarkdown !== 'function') {
        console.log('[Muya watcher] echoRequireParens changed before contentEditor ready, deferring')
        return
      }
      const next = !!requireParens
      const replaced = setEchoAnnoRule({ requireParens: next })
      console.log(`[Muya watcher] ⚡ echoRequireParens → ${next}, inlineRules.echo_anno replaced:`, String(replaced))
      // 同步生效到已渲染 block
      try {
        if (this.contentEditor.contentState && typeof this.contentEditor.contentState.render === 'function') {
          this.contentEditor.contentState.render(false, true)
        }
      } catch (error) {
        console.warn('[Muya watcher] render after echoRequireParens toggle failed:', error)
      }
    },
    currentNote: function (currentData) {
      if (!this.contentEditor || typeof this.contentEditor.getMarkdown !== 'function') {
        console.warn('[Muya watcher] ⚠️ contentEditor not ready, skipping')
        return
      }

      console.log(`\n[Muya watcher] ⚡ FIRED! type: ${typeof currentData}`)
      console.log(`[Muya watcher] Previous note: ${this.previousNoteInfo?.docGuid}, New note expected from store`)

      // ✅ 解析新格式：支持字符串和对象两种格式
      let markdownContent = ''
      let docGuid = null

      if (typeof currentData === 'string') {
        // 旧格式：直接是 markdown 字符串
        markdownContent = currentData || ''
        console.log(`[Muya watcher] 📄 String format, len=${markdownContent.length}`)
      } else if (currentData && typeof currentData === 'object') {
        // 新格式：包含 __markdown 和元数据的对象
        markdownContent = currentData.__markdown || ''
        docGuid = currentData.__docGuid || null

        console.log(`[Muya watcher] 📦 Object format:`)
        console.log(`[Muya watcher]   - markdown len=${markdownContent.length}`)
        console.log(`[Muya watcher]   - timestamp=${currentData.__timestamp}`)
        console.log(`[Muya watcher]   - docGuid=${docGuid}`)
        console.log(`[Muya watcher]   - isEmpty=${currentData.isEmpty}`)

        if (currentData.isEmpty) {
          console.log(`[Muya watcher] ℹ️ Content is empty, will show blank editor`)
        }
      } else {
        // 异常情况：既不是字符串也不是对象
        console.warn('[Muya watcher] ⚠️ Unexpected data type, clearing editor')
        markdownContent = ''
      }

      console.log(`[Muya watcher] Preview: ${JSON.stringify((markdownContent || '').substring(0, 120))}`)

      // ✅ 核心逻辑：加载内容到编辑器（即使是空字符串也要更新！）
      clearEditorHistory(this.contentEditor)
      try {
        this.contentEditor.focus()
        console.log(`[Muya watcher] 📝 Loading into editor: len=${markdownContent.length}`)

        // ✅ 强制设置内容（空字符串也是有效内容，会清空编辑器）
        this.contentEditor.setMarkdown(markdownContent)

        this.firstTimeLoad = true
        this.updateContentsList(this.contentEditor.getTOC())

        // 清除旧的待保存数据（新笔记开始编辑）
        this.pendingSaveData = null

        console.log(`[Muya watcher] ✅ Done! Editor now has content (len=${markdownContent.length})\n`)

      } catch (e) {
        if (e.message.indexOf('Md2V') !== -1) return
        debugLogger.Error(e, e.message)
        console.error('[Muya watcher] ❌ Error loading content:', e)
      }

      // 在下一个 tick 更新 previousNoteInfo
      this.$nextTick(() => {
        const currentNote = this.$store.state.server.currentNote
        this.previousNoteInfo = currentNote?.info || null
        this.previousResources = currentNote?.resources || []
        console.log(`[Muya watcher] 📌 Updated previousNoteInfo to: ${currentNote?.info?.docGuid}`)
      })
    },
    theme: function (t) {
      attachThemeColor(t)
    },
    enablePreviewEditor: function (val) {
      document.querySelector('.ag-show-quick-insert-hint').setAttribute('contenteditable', val)
    },
    data: function ({ markdown }) {
      clearEditorHistory(this.contentEditor)
      this.contentEditor.setMarkdown(markdown)
      this.updateContentsList(this.contentEditor.getTOC())
    },
    runeCards: function (cards) {
      if (this.contentEditor && typeof this.contentEditor.refreshRuneCards === 'function') {
        this.contentEditor.refreshRuneCards(cards || [])
        this.$nextTick(() => {
          if (this.contentEditor?.contentState?.stateRender?.renderRunes) {
            this.contentEditor.contentState.stateRender.renderRunes()
          }
        })
      }
    },
    echoCards: function () {
      this.$nextTick(() => {
        this.refreshEchoDefinitions()
        if (this.contentEditor?.contentState?.stateRender?.renderRunes) {
          this.contentEditor.contentState.stateRender.renderRunes()
        }
      })
    }
  }
}
</script>

<style scoped>
.editor-component {
  height: 100%;
  overflow: auto;
  box-sizing: border-box;
  margin-right: 5px;
}
</style>

<style>
.ag-rune-placeholder-host {
  display: block;
  margin: 6px 0;
  box-sizing: border-box;
  max-width: 100%;
}

.ag-rune-placeholder-host[data-rune-width] > *,
.ag-rune-placeholder-host[data-rune-height] > * {
  width: 100%;
  height: 100%;
  max-width: 100%;
  box-sizing: border-box;
}

.ag-echo-placeholder-host,
.ag-echo-inline-host {
  display: inline;
  vertical-align: baseline;
  margin: 0 2px;
}

.ag-echo-anno-token {
  display: inline;
  vertical-align: baseline;
  cursor: pointer;
  user-select: none;
}

.ag-echo-inline-preview {
  display: inline;
  vertical-align: baseline;
}

.ag-rune-placeholder-card,
.ag-rune-vue-card,
.ag-echo-placeholder-card,
.ag-echo-vue-card {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 56px;
  padding: 12px 14px;
  border-radius: 12px;
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.06);
}

.ag-rune-placeholder-card,
.ag-rune-vue-card {
  border: 1px solid rgba(126, 87, 194, 0.18);
  background: linear-gradient(180deg, rgba(126, 87, 194, 0.12), rgba(126, 87, 194, 0.06));
}

.ag-echo-placeholder-card,
.ag-echo-vue-card {
  flex-direction: column;
  align-items: stretch;
  border: 1px solid rgba(38, 166, 154, 0.2);
  background: linear-gradient(180deg, rgba(38, 166, 154, 0.12), rgba(38, 166, 154, 0.05));
}

.ag-echo-inline-preview.ag-echo-vue-card {
  display: inline;
  vertical-align: baseline;
  background: transparent;
  border: none;
  padding: 0;
  margin: 0;
}


.ag-rune-placeholder-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  flex-shrink: 0;
  color: var(--rune-accent, #7E57C2);
  background: rgba(255, 255, 255, 0.72);
  border-radius: 10px;
}

.ag-rune-placeholder-icon-image {
  display: inline-block;
  width: 24px;
  height: 24px;
  background-position: center;
  background-repeat: no-repeat;
  background-size: contain;
}

.ag-rune-placeholder-icon-font {
  font-size: 22px;
  line-height: 1;
}

.ag-rune-placeholder-body {
  min-width: 0;
  flex: 1;
}

.ag-echo-placeholder-main {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.ag-echo-placeholder-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  flex-shrink: 0;
  color: var(--echo-accent, #26A69A);
  background: rgba(255, 255, 255, 0.72);
  border-radius: 10px;
}

.ag-echo-placeholder-body {
  min-width: 0;
  flex: 1;
}

.ag-echo-placeholder-title {
  display: block;
  font-size: 14px;
  font-weight: 600;
  line-height: 1.3;
}

.ag-echo-placeholder-desc {
  display: block;
  margin-top: 4px;
  font-size: 12px;
  line-height: 1.4;
  opacity: 0.78;
  word-break: break-word;
}

.ag-echo-placeholder-value-marker {
  display: inline-block;
  min-width: 4px;
  min-height: 14px;
  outline: none;
  caret-color: rgba(38, 166, 154, 0.9);
}

.ag-echo-placeholder-editor {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 8px;
}

.ag-echo-placeholder-textarea {
  width: 100%;
  min-height: 88px;
  resize: vertical;
  padding: 10px 12px;
  border: 1px solid rgba(38, 166, 154, 0.24);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.86);
  font: inherit;
  color: inherit;
  box-sizing: border-box;
}

.ag-echo-placeholder-actions {
  display: flex;
  justify-content: flex-end;
}

.ag-echo-placeholder-save {
  padding: 6px 12px;
  border: 0;
  border-radius: 8px;
  background: var(--echo-accent, #26A69A);
  color: #fff;
  cursor: pointer;
}

.ag-rune-placeholder-title {
  font-size: 14px;
  font-weight: 600;
  line-height: 1.3;
  color: inherit;
}

.ag-rune-placeholder-desc {
  margin-top: 4px;
  font-size: 12px;
  line-height: 1.4;
  opacity: 0.72;
  word-break: break-word;
}

/* 符文 SFC 异步编译过渡态（与 .ag-rune-placeholder-host 形态保持一致，避免抖动） */
.rune-renderer-loading,
.rune-renderer-empty,
.rune-renderer-error {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  min-height: 56px;
  padding: 12px 14px;
  border-radius: 12px;
  box-sizing: border-box;
  font-size: 13px;
  line-height: 1.4;
  border: 1px dashed rgba(126, 87, 194, 0.28);
  background: linear-gradient(180deg, rgba(126, 87, 194, 0.06), rgba(126, 87, 194, 0.02));
  color: rgba(126, 87, 194, 0.78);
  user-select: none;
}

.rune-renderer-loading::before {
  content: '';
  display: inline-block;
  width: 12px;
  height: 12px;
  margin-right: 8px;
  border-radius: 50%;
  border: 2px solid currentColor;
  border-top-color: transparent;
  animation: rune-renderer-spin 0.8s linear infinite;
}

@keyframes rune-renderer-spin {
  to { transform: rotate(360deg); }
}

.rune-renderer-error {
  border-color: rgba(229, 57, 53, 0.32);
  background: linear-gradient(180deg, rgba(229, 57, 53, 0.08), rgba(229, 57, 53, 0.02));
  color: rgba(229, 57, 53, 0.92);
  border-style: solid;
}
</style>
