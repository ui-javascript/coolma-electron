<template>
  <div class='rune-form-fields'>
    <!-- 名称 -->
    <div class='rune-form-field'>
      <div class='rune-form-label'>{{ nameLabel }}</div>
      <q-input
        v-model='formData.name'
        dense
        outlined
        :placeholder='nameLabel'
        class='rune-form-input rune-form-input--compact'
      />
    </div>

    <!-- 描述 -->
    <div class='rune-form-field rune-form-field--desc'>
      <div class='rune-form-label'>{{ descLabel }}
        <q-btn
          flat
          dense
          round
          size='sm'
          icon='auto_awesome'
          class='rune-form-ai-btn'
          @click='$emit("request-ai-help")'
        >
          <q-tooltip anchor='top middle' self='bottom middle' :offset='[0, 6]'>
            AI 辅助生成符文代码
          </q-tooltip>
        </q-btn>
      </div>
      <q-input
        v-model='formData.desc'
        dense
        outlined
        type='textarea'
        autogrow
        :placeholder='descLabel'
        class='rune-form-input rune-form-input--compact'
      />
    </div>

    <!-- 分类 -->
    <div class='rune-form-field rune-form-field--tight'>
      <div class='rune-form-label'>分类</div>
      <q-select
        v-model='formData.category'
        dense
        outlined
        :options='categoryOptions'
        option-label='label'
        option-value='value'
        emit-value
        map-options
        class='rune-form-input rune-form-input--compact'
      >
        <template v-slot:selected-item='scope'>
          <span>{{ scope.opt.label }}</span>
        </template>
        <template v-slot:option='scope'>
          <q-item v-bind='scope.itemProps' v-on='scope.itemEvents'>
            <q-item-section>
              <q-item-label>{{ scope.opt.label }}</q-item-label>
            </q-item-section>
          </q-item>
        </template>
      </q-select>
    </div>

    <!-- 图标 -->
    <div class='rune-form-field rune-form-field--tight'>
      <div class='rune-form-label'>图标</div>
      <q-select
        v-model='formData.icon'
        dense
        outlined
        :options='iconOptions'
        option-label='label'
        option-value='value'
        emit-value
        map-options
        class='rune-form-input rune-form-input--compact'
      >
        <template v-slot:selected-item='scope'>
          <div class='row items-center'>
            <q-icon :name='getIconName(scope.opt.value)' size='1em' class='q-mr-xs' />
            <span>{{ scope.opt.label }}</span>
          </div>
        </template>
        <template v-slot:option='scope'>
          <q-item v-bind='scope.itemProps' v-on='scope.itemEvents'>
            <q-item-section avatar>
              <q-icon :name='getIconName(scope.opt.value)' />
            </q-item-section>
            <q-item-section>
              <q-item-label>{{ scope.opt.label }}</q-item-label>
            </q-item-section>
          </q-item>
        </template>
      </q-select>
    </div>

    <!-- 颜色 -->
    <div class='rune-form-field rune-form-field--tight'>
      <div class='rune-form-label'>颜色</div>
      <div class='color-row'>
        <div
          v-for='c in colorOptions'
          :key='c.value'
          class='color-dot'
          :class="{ selected: formData.color === c.value }"
          :style='{ background: c.value }'
          @click='formData.color = c.value'
        />
      </div>
    </div>

    <!-- 继承行为 -->
    <div class='rune-form-field rune-form-field--tight'>
      <div class='rune-form-label'>继承行为</div>
      <q-toggle
        v-model='inheritFromPrevious'
        :label='$t("runeInheritFromPreviousLabel")'
        color='primary'
        dense
      />
      <div class='rune-form-hint'>
        {{ $t('runeInheritFromPreviousHint') }}
      </div>
    </div>
  </div>
</template>

<script>
import { RuneCategoryEnum } from 'src/utils/enum'

const ICON_NAME_MAP = {
  whatshot: 'local_fire_department',
  ac_unit: 'ac_unit',
  flash_on: 'flash_on',
  favorite: 'favorite',
  nights_stay: 'dark_mode',
  wb_sunny: 'wb_sunny',
  star: 'star',
  ring: 'filter_frames',
  security: 'security',
  flight: 'flight',
  skull: 'skull',
  gradient: 'gradient',
  eco: 'eco',
  water_drop: 'water_drop',
  show_chart: 'show_chart'
}

export default {
  name: 'runeFormFields',
  props: {
    form: {
      type: Object,
      required: true
    },
    mode: {
      type: String,
      default: 'rune'
    }
  },
  data () {
    return {
      iconOptions: [
        { label: '火焰', value: 'whatshot' },
        { label: '冰霜', value: 'ac_unit' },
        { label: '闪电', value: 'flash_on' },
        { label: '爱心', value: 'favorite' },
        { label: '月亮', value: 'nights_stay' },
        { label: '太阳', value: 'wb_sunny' },
        { label: '星星', value: 'star' },
        { label: '漩涡', value: 'ring' },
        { label: '护盾', value: 'security' },
        { label: '翅膀', value: 'flight' },
        { label: '骷髅', value: 'skull' },
        { label: '水晶', value: 'gradient' },
        { label: '叶子', value: 'eco' },
        { label: '水', value: 'water_drop' },
        { label: '图表', value: 'show_chart' }
      ],
      colorOptions: [
        { value: '#FF6B35' },
        { value: '#4FC3F7' },
        { value: '#AB47BC' },
        { value: '#66BB6A' },
        { value: '#7E57C2' },
        { value: '#FFD54F' },
        { value: '#EF5350' },
        { value: '#26A69A' },
        { value: '#FF7043' },
        { value: '#5C6BC0' },
        { value: '#EC407A' },
        { value: '#8D6E63' }
      ]
    }
  },
  computed: {
    isEchoMode () {
      return this.mode === 'echo'
    },
    nameLabel () {
      return this.isEchoMode ? this.$t('echoCardName') : this.$t('runeCardName')
    },
    descLabel () {
      return this.isEchoMode ? this.$t('echoCardDesc') : this.$t('runeCardDesc')
    },
    categoryOptions () {
      const opts = RuneCategoryEnum.items.map(c => ({ value: c.value, label: c.label }))
      if (opts.length) {
        const missing = opts.filter(o => !o.label).map(o => o.value)
        console.log(`[RUNE-TPL] RuneFormFields.categoryOptions size=${opts.length} first.label=${opts[0].label}` + (missing.length ? ` missing-labels=${missing.join(',')}` : ''))
      }
      return opts
    },
    formData: {
      get () {
        return this.form
      },
      set (val) {
        this.$emit('update:form', val)
      }
    },
    inheritFromPrevious: {
      get () {
        const value = this.form && this.form.inherit_from_previous
        return value === true || value === 1 || value === '1'
      },
      set (next) {
        this.$emit('update-inherit', next ? 1 : 0)
      }
    }
  },
  methods: {
    getIconName (value) {
      return ICON_NAME_MAP[value] || value
    }
  }
}
</script>

<style lang="scss" scoped>
.rune-form-fields {
  flex: 0 0 220px;
  min-width: 0;
  min-height: 0;
  height: 100%;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  padding-right: 2px;
}

.rune-form-field {
  margin-bottom: 12px;
}

.rune-form-field:last-child {
  margin-bottom: 0;
}

.rune-form-field--desc :deep(textarea) {
  min-height: 72px !important;
}

.rune-form-field--tight {
  margin-bottom: 10px;
}

.rune-form-field--tight:last-child {
  margin-bottom: 0;
}

.rune-form-ai-btn {
  color: #7c4dff;
  opacity: 0.8;
  transition: opacity 0.2s, transform 0.2s;
}

.rune-form-ai-btn:hover {
  opacity: 1;
  transform: scale(1.1);
}

.rune-form-label {
  font-size: 11px;
  color: rgba(0, 0, 0, 0.55);
  margin-bottom: 4px;
  font-weight: 500;
  line-height: 1.2;
  display: flex;
  align-items: center;
  gap: 4px;
}

.rune-form-input {
  width: 100%;
}

.rune-form-input--compact :deep(.q-field__control) {
  min-height: 36px;
}

.rune-form-input--compact :deep(.q-field__native),
.rune-form-input--compact :deep(.q-field__input) {
  font-size: 13px;
}

.rune-form-hint {
  font-size: 11px;
  line-height: 1.4;
  opacity: 0.65;
  margin-top: 4px;
  word-break: break-word;
}

.color-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 4px;
}

.color-dot {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  cursor: pointer;
  border: 2px solid transparent;
  transition: transform 0.15s, border-color 0.15s;
}

.color-dot:hover {
  transform: scale(1.12);
}

.color-dot.selected {
  border-color: #fff;
  box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.4);
}

/* Dark mode */
.body--dark .rune-form-label {
  color: rgba(255, 255, 255, 0.55);
}

.body--dark .color-dot.selected {
  border-color: #fff;
  box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.4);
}
</style>
