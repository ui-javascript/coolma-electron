<template>
  <span
    class="ag-echo-live"
    :data-echo-name="name"
    :data-echo-attrs="attrs"
    :data-echo-field="echoDef ? echoDef.field : ''"
    :data-echo-action="hydrated ? 'echo-click' : null"
    :data-echo-runtime="runtimeState"
    :style="{ '--echo-color': echoDef ? echoDef.color || '#26A69A' : '#26A69A' }"
    :title="echoDef ? echoDef.desc : ''"
  >
    <span class="ag-echo-live__at">@</span>
    <span class="ag-echo-live__name">{{ echoDef ? echoDef.name : name }}</span>
    <code v-if="attrs" class="ag-echo-live__attrs">{{ attrs }}</code>
    <span v-if="echoDef && echoDef.field" class="ag-echo-live__hint">{{ echoDef.field }}</span>
    <span v-if="runtimeError" class="ag-echo-live__error">未生效</span>
  </span>
</template>

<script>
import { findEcho } from '../catalog'
import { applyEchoEffect } from 'libs-echo-runtime'

export default {
  name: 'EchoHost',
  props: {
    name: { type: String, required: true },
    attrs: { type: String, default: '' },
    prompt: { type: String, default: '' }
  },
  data () {
    return { echoDef: null, hydrated: false, runtimeState: 'idle', runtimeError: '' }
  },
  mounted () {
    this.hydrated = true
    this.echoDef = findEcho(this.name)
    this.runEffect()
  },
  beforeDestroy () {
    if (typeof this.cleanup === 'function') this.cleanup()
    this.cleanup = null
  },
  methods: {
    runEffect () {
      if (!this.echoDef) {
        this.runtimeState = 'missing'
        return
      }
      if (!this.echoDef.field) {
        this.runtimeState = 'anchor-only'
        return
      }
      try {
        this.cleanup = applyEchoEffect(this.$el, this.echoDef, this.attrs)
        this.runtimeState = 'running'
      } catch (error) {
        console.warn('[echo-host] apply failed:', error)
        this.runtimeError = error && error.message ? error.message : String(error)
        this.runtimeState = 'error'
      }
    }
  }
}
</script>

<style>
.ag-echo-live {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 1px 6px;
  border-radius: 999px;
  border: 1px dotted var(--echo-color, #26A69A);
  background: color-mix(in srgb, var(--echo-color, #26A69A) 10%, transparent);
  font-size: 12px;
  line-height: 1.6;
  vertical-align: baseline;
}
.ag-echo-live__at {
  color: var(--echo-color, #26A69A);
  font-weight: 600;
}
.ag-echo-live__name {
  color: var(--echo-color, #26A69A);
}
.ag-echo-live__attrs {
  font-family: Consolas, Monaco, monospace;
  font-size: 11px;
  opacity: 0.75;
}
.ag-echo-live__hint {
  margin-left: 4px;
  padding: 0 4px;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.06);
  font-size: 10px;
  opacity: 0.6;
}
.ag-echo-live__error {
  margin-left: 4px;
  color: #c62828;
  font-size: 10px;
}
</style>
