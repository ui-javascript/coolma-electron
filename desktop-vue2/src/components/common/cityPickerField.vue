<template>
  <div class='city-picker-field' :style='containerStyle'>
    <input
      ref='inputEl'
      :id='inputId'
      readonly
      type='text'
      :placeholder='placeholder'
      class='city-picker-input'
    />
  </div>
</template>

<script>
import { whenCdnDepsReady } from 'src/utils/cdnDepsUtil'

let uniqueCounter = 0

export default {
  name: 'CityPickerField',
  model: {
    prop: 'value',
    event: 'input'
  },
  props: {
    value: {
      type: Object,
      default: () => ({ province: '', city: '', district: '' })
    },
    placeholder: {
      type: String,
      default: '点击选择省/市/区'
    },
    width: {
      type: [String, Number],
      default: 260
    },
    disabled: {
      type: Boolean,
      default: false
    }
  },
  data () {
    uniqueCounter += 1
    return {
      inputId: `city-picker-input-${Date.now().toString(36)}-${uniqueCounter}`,
      // whether the underlying jQuery citypicker instance is attached
      ready: false,
      pollTimer: null,
      // value we last initialized the picker with
      internalValue: this._normalize(this.value)
    }
  },
  computed: {
    containerStyle () {
      const w = typeof this.width === 'number' ? `${this.width}px` : this.width
      return { width: w }
    }
  },
  watch: {
    value: {
      deep: true,
      handler (val) {
        const normalized = this._normalize(val)
        const prev = this.internalValue
        if (prev.province === normalized.province
          && prev.city === normalized.city
          && prev.district === normalized.district) {
          return
        }
        this.internalValue = normalized
        if (this.ready) this._rebuildPicker(normalized)
      }
    },
    disabled (val) {
      const inputEl = this._input()
      const $ = window.$ || window.jQuery
      if (!inputEl || !$ || !$.fn || !$.fn.citypicker) return
      if (val) {
        this._detachPicker(inputEl, $)
        this.ready = false
      } else if (!this.ready) {
        this._attach(inputEl, $)
      }
    }
  },
  mounted () {
    this.$nextTick(() => this._scheduleInit())
  },
  beforeDestroy () {
    this._destroy()
  },
  methods: {
    _normalize (val) {
      const base = val && typeof val === 'object' ? val : {}
      return {
        province: base.province || '',
        city: base.city || '',
        district: base.district || ''
      }
    },
    _input () {
      return this.$refs.inputEl || document.getElementById(this.inputId)
    },
    _scheduleInit () {
      this._teardownPoll()
      // CDN 依赖是异步加载的（见 src/utils/cdnDepsUtil.js）。
      // 先 await 加载完成，再退化成短轮询兜底（CDN 失败 / 已被用户禁用时不会永久卡住）。
      whenCdnDepsReady()
        .then(() => this._tryAttachCitypicker())
        .catch(() => this._tryAttachCitypicker())
    },
    _tryAttachCitypicker () {
      this._teardownPoll()
      let attempt = 0
      const maxAttempts = 80
      const tryInit = () => {
        const inputEl = this._input()
        const $ = (typeof window !== 'undefined' && (window.$ || window.jQuery))
        const hasCitypicker = !!($ && $.fn && $.fn.citypicker)
        if (inputEl && $ && hasCitypicker) {
          this.pollTimer = null
          this._attach(inputEl, $)
          return
        }
        attempt += 1
        if (attempt >= maxAttempts) {
          console.warn('[CityPickerField] jQuery citypicker not ready, give up')
          this.pollTimer = null
          return
        }
        this.pollTimer = setTimeout(tryInit, 100)
      }
      this.pollTimer = setTimeout(tryInit, 0)
    },
    _attach (inputEl, $) {
      if (this.disabled) {
        this._detachPicker(inputEl, $)
        this.ready = true
        return
      }
      this._initPicker(inputEl, $, this.internalValue)
    },
    /**
     * 初始化 picker。
     *
     * 注意：city-picker 的 init 会调用 refresh()，后者优先读取输入框当前文本
     * （`$element.val()`）并覆盖传入的 options。所以必须先销毁旧实例、清空旧
     * 文本，否则重建时新的省/市/区永远被上一次的显示值顶掉，回显看起来“没生效”。
     */
    _initPicker (inputEl, $, val) {
      // 必须先 destroy：插件在 data('citypicker') 已存在时不会用新 options 重建实例
      this._detachPicker(inputEl, $)
      const v = this._normalize(val)
      $(inputEl).val('')
      // destroy() 会移除 city-picker-input，重建时补回来（scoped 样式依赖它）
      $(inputEl).addClass('city-picker-input')
      try {
        $(inputEl).citypicker({
          province: v.province || '',
          city: v.city || '',
          district: v.district || ''
        })
      } catch (err) {
        console.warn('[CityPickerField] citypicker init error:', err && err.message)
        this.ready = true
        return
      }
      this._bindPickerEvents(inputEl, $)
      this.ready = true
    },
    _detachPicker (inputEl, $) {
      if (!inputEl || !$ || !$.fn || !$.fn.citypicker) return
      $(inputEl).off('.cpf')
      const inst = $(inputEl).data && $(inputEl).data('citypicker')
      if (!inst) return
      if (inst.$dropdown) inst.$dropdown.off('.cpf')
      try {
        $(inputEl).citypicker('destroy')
      } catch (_) { /* noop */ }
    },
    _bindPickerEvents (inputEl, $) {
      const inst = $(inputEl).data && $(inputEl).data('citypicker')
      // 插件在部分版本里会把 $element 的 change 当作外部值变更入口
      $(inputEl).on('change.cpf', () => this._syncFromPicker(inputEl, $))
      // 关键：city-picker 用户点选时只会 feedVal()（直接写 input.value），
      // 并不会派发 cp:updated。旧代码监听 cp:updated 永远收不到事件，
      // 导致选择后既不写 SQLite 也不更新“当前选择”。这里改为在 dropdown
      // 上做事件委托，并用 setTimeout 让插件先更新完 data/item。
      if (inst && inst.$dropdown) {
        inst.$dropdown.on('click.cpf', '.city-select a', () => {
          setTimeout(() => this._syncFromPicker(inputEl, $), 0)
        })
      }
    },
    _rebuildPicker (val) {
      const inputEl = this._input()
      const $ = window.$ || window.jQuery
      if (!inputEl || !$ || !$.fn || !$.fn.citypicker) return
      this._initPicker(inputEl, $, val)
    },
    _syncFromPicker (inputEl, $) {
      let next
      try {
        // city-picker plugin does NOT expose a `getValue` method. The current
        // selection lives on each dropdown panel as `$(panel).data('item')`.
        const inst = $(inputEl).data && $(inputEl).data('citypicker')
        if (!inst || !inst.$dropdown) return
        const $selects = inst.$dropdown.find('.city-select').toArray()
        const items = $selects.map((el) => $(el).data('item') || null)
        next = {
          province: items[0] ? items[0].address || '' : '',
          city: items[1] ? items[1].address || '' : '',
          district: items[2] ? items[2].address || '' : ''
        }
      } catch (_) {
        return
      }
      const normalized = this._normalize(next)
      const prev = this.internalValue
      if (prev.province === normalized.province
        && prev.city === normalized.city
        && prev.district === normalized.district) {
        return
      }
      this.internalValue = normalized
      this.$emit('input', { ...normalized })
      this.$emit('change', { ...normalized })
    },
    _destroy () {
      this._teardownPoll()
      const inputEl = this._input()
      const $ = window.$ || window.jQuery
      this._detachPicker(inputEl, $)
      if (inputEl && inputEl.classList) {
        inputEl.classList.add('city-picker-input')
      }
      this.ready = false
    },
    _teardownPoll () {
      if (this.pollTimer) {
        clearTimeout(this.pollTimer)
        this.pollTimer = null
      }
    }
  }
}
</script>

<style lang='scss' scoped>
.city-picker-field {
  flex: 0 0 auto;
  position: relative;
  min-width: 240px;
}

.city-picker-input {
  width: 100%;
  height: 32px;
  font-size: 13px;
  padding: 0 10px;
  border-radius: 4px;
  border: 1px solid #c0c0c0;
  background: #fff;
  color: rgba(0, 0, 0, 0.85);
  outline: none;
  cursor: pointer;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.city-picker-input:hover,
.city-picker-input:focus {
  border-color: #43a047;
  box-shadow: 0 0 0 2px rgba(67, 160, 71, 0.2);
}

.body--dark .city-picker-input {
  background: #34383e;
  border-color: #4a4a4a;
  color: rgba(255, 255, 255, 0.85);
}
</style>
