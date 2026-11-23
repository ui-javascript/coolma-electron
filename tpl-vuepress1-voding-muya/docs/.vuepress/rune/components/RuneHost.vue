<template>
  <span
    class="ag-rune-live"
    :data-rune-name="name"
    :data-rune-id="runeId"
    :data-rune-node-id="nodeId"
    :data-rune-state="phase"
    :data-rune-source="runeSource"
    :style="runeDef ? { '--rune-color': runeDef.color || '#26A69A' } : null"
  >
    <component
      v-if="phase === 'ready'"
      :is="ctor"
      v-bind="childProps"
      @input="handleInput"
    />

    <span v-else class="ag-rune-live__card">
      <span class="ag-rune-live__label">{{ displayName }}</span>
      <span v-if="innerValue" class="ag-rune-live__value">{{ innerValue }}</span>
      <span class="ag-rune-live__badge">
        {{ phase === 'error' ? '已降级为静态卡片' : '静态渲染' }}
      </span>
    </span>

    <span v-if="error" class="ag-rune-live__error">
      <span>{{ error }}</span>
      <button type="button" class="ag-rune-live__retry" @click="resolveRune">重试</button>
    </span>
  </span>
</template>

<script>
import { findRune } from '../catalog'
import { createSfcCtor } from '../sfcRuntime'
import { createMeltCtor } from '../meltRuntime'
import { detectRuneType, RUNE_TYPE_MELT_JS } from 'libs-muya-vue2/lib/rune/runeDefinition'

// 导出器把符文定义以 base64 JSON 内联进 definition，博客不必预先持有用户目录。
const decodeDefinition = raw => {
  const binary = atob(String(raw || ''))
  const bytes = Uint8Array.from(binary, ch => ch.charCodeAt(0))
  const parsed = JSON.parse(new TextDecoder().decode(bytes))
  return parsed && parsed.template ? parsed : null
}

export default {
  name: 'RuneHost',
  props: {
    name: { type: String, required: true },
    value: { type: [String, Number], default: '' },
    runeId: { type: String, default: '' },
    nodeId: { type: String, default: '' },
    definition: { type: String, default: '' }
  },
  data () {
    return {
      phase: 'static',
      ctor: null,
      runeDef: null,
      runeType: '',
      runeSource: '',
      supportsValueChange: false,
      innerValue: this.value == null ? '' : String(this.value),
      error: ''
    }
  },
  computed: {
    displayName () {
      return this.runeDef ? `${this.runeDef.name}` : this.name
    },
    childProps () {
      const base = {
        value: this.innerValue,
        runeId: this.runeId,
        nodeId: this.nodeId,
        rune: this.runeDef
      }
      // 只给 SFC 符文传 onValueChange；melt 壳不声明这个 prop，
      // 传了会作为未知属性落到 DOM 上（渲染成 function 字符串）。
      if (this.runeType !== RUNE_TYPE_MELT_JS && this.supportsValueChange) base.onValueChange = this.handleValueChange
      return base
    }
  },
  watch: {
    value (next) {
      const normalized = next == null ? '' : String(next)
      if (normalized !== this.innerValue) this.innerValue = normalized
    },
    name () {
      this.resolveRune()
    }
  },
  mounted () {
    // SSR 阶段只出静态卡片，真实组件只在浏览器 mounted 之后才解析 / 加载
    this.resolveRune()
  },
  errorCaptured (error) {
    this.error = `符文渲染失败：${error && error.message ? error.message : error}`
    this.phase = 'error'
    return false
  },
  methods: {
    async resolveRune () {
      this.error = ''
      this.phase = 'static'
      this.ctor = null
      this.runeSource = ''
      let rune = null
      if (this.definition) {
        try {
          rune = decodeDefinition(this.definition)
          if (rune) this.runeSource = 'inline'
        } catch (error) {
          // eslint-disable-next-line no-console
          console.warn('[rune-host] definition decode failed:', error)
        }
      }
      if (!rune) {
        rune = findRune(this.name)
        if (rune) this.runeSource = 'catalog'
      }
      if (!rune) {
        this.error = `目录里没有名为「${this.name}」的符文`
        this.phase = 'error'
        return
      }
      this.runeDef = rune
      this.runeType = detectRuneType(rune.template)
      try {
        if (this.runeType === RUNE_TYPE_MELT_JS) {
          this.ctor = await createMeltCtor(rune)
        } else {
          this.ctor = await createSfcCtor(rune)
        }
        this.supportsValueChange = !!(this.ctor && this.ctor.options && this.ctor.options.props && this.ctor.options.props.onValueChange)
        this.phase = 'ready'
      } catch (error) {
        // eslint-disable-next-line no-console
        console.warn('[rune-host] resolve failed:', error)
        this.error = `符文「${this.name}」挂载失败：${error && error.message ? error.message : error}`
        this.phase = 'error'
      }
    },
    handleInput (next) {
      const normalized = next == null ? '' : String(next)
      this.innerValue = normalized
      this.$emit('input', normalized)
      this.$emit('change', { runeId: this.runeId, nodeId: this.nodeId, value: normalized })
    },
    handleValueChange (payload) {
      const next = payload && payload.value != null ? String(payload.value) : ''
      if (next !== this.innerValue) this.innerValue = next
      this.$emit('input', next)
    }
  }
}
</script>

<style>
.ag-rune-live {
  display: block;
  margin: 12px 0;
}
.ag-rune-live__card {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border-radius: 10px;
  border: 1px dashed var(--rune-color, #26A69A);
  background: color-mix(in srgb, var(--rune-color, #26A69A) 8%, transparent);
  font-size: 13px;
  line-height: 1.5;
}
.ag-rune-live__label {
  font-weight: 600;
  color: var(--rune-color, #26A69A);
}
.ag-rune-live__value {
  padding: 1px 8px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.06);
  font-family: Consolas, Monaco, monospace;
  font-size: 12px;
}
.ag-rune-live__badge {
  margin-left: auto;
  font-size: 11px;
  opacity: 0.55;
}
.ag-rune-live__message {
  padding: 8px 12px;
  border-radius: 8px;
  background: rgba(38, 166, 154, 0.08);
  color: rgba(0, 0, 0, 0.6);
  font-size: 12px;
}
.ag-rune-live__message--error {
  background: rgba(255, 82, 82, 0.08);
  color: #c62828;
}
.ag-rune-live__retry {
  margin-left: 8px;
  border: none;
  background: transparent;
  color: inherit;
  text-decoration: underline;
  cursor: pointer;
  font-size: 12px;
}
.ag-rune-live__error {
  margin: 6px 0 0;
  color: #c62828;
  font-size: 12px;
}
</style>
