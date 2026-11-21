<template>
  <div class='echo-form-fields'>
    <!-- 名称 -->
    <div class='echo-form-field'>
      <div class='echo-form-label'>{{ $t('echoCardName') }}</div>
      <q-input
        v-model='formData.name'
        dense
        outlined
        :placeholder="$t('echoCardName')"
        :disable='isReadonly'
        :readonly='isReadonly'
        class='echo-form-input echo-form-input--compact'
      />
    </div>

    <!-- 描述 -->
    <div class='echo-form-field echo-form-field--desc'>
      <div class='echo-form-label'>
        {{ $t('echoCardDesc') }}
        <q-btn
          v-if='!isReadonly'
          flat
          dense
          round
          size='sm'
          icon='auto_awesome'
          class='echo-form-ai-btn'
          @click='$emit("request-ai-help")'
        >
          <q-tooltip anchor='top middle' self='bottom middle' :offset='[0, 6]'>
            AI 辅助生成回响代码
          </q-tooltip>
        </q-btn>
      </div>
      <q-input
        v-model='formData.desc'
        dense
        outlined
        type='textarea'
        autogrow
        :placeholder="$t('echoCardDesc')"
        :disable='isReadonly'
        :readonly='isReadonly'
        class='echo-form-input echo-form-input--compact'
      />
    </div>

    <!-- 分类 -->
    <div class='echo-form-field echo-form-field--tight'>
      <div class='echo-form-label'>分类</div>
      <q-select
        v-model='formData.category'
        dense
        outlined
        :options='categoryOptions'
        option-label='label'
        option-value='value'
        emit-value
        map-options
        :disable='isBuiltin'
        class='echo-form-input echo-form-input--compact'
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
    <div class='echo-form-field echo-form-field--tight'>
      <div class='echo-form-label'>图标</div>
      <q-select
        v-model='formData.icon'
        dense
        outlined
        :options='iconOptions'
        option-label='label'
        option-value='value'
        emit-value
        map-options
        :disable='isReadonly'
        class='echo-form-input echo-form-input--compact'
      >
        <template v-slot:selected-item='scope'>
          <div class='row items-center'>
            <q-icon :name='scope.opt.value' size='1em' class='q-mr-xs' />
            <span>{{ scope.opt.label }}</span>
          </div>
        </template>
        <template v-slot:option='scope'>
          <q-item v-bind='scope.itemProps' v-on='scope.itemEvents'>
            <q-item-section avatar>
              <q-icon :name='scope.opt.value' />
            </q-item-section>
            <q-item-section>
              <q-item-label>{{ scope.opt.label }}</q-item-label>
            </q-item-section>
          </q-item>
        </template>
      </q-select>
    </div>

    <!-- 颜色 -->
    <div class='echo-form-field echo-form-field--tight'>
      <div class='echo-form-label'>颜色</div>
      <div class='color-row'>
        <div
          v-for='c in colorOptions'
          :key='c.value'
          class='color-dot'
          :class="[
            { selected: formData.color === c.value },
            isReadonly ? 'color-dot--readonly' : ''
          ]"
          :style='{ background: c.value }'
          @click='!isReadonly && (formData.color = c.value)'
        />
      </div>
    </div>

    <!-- 注解语法帮助 -->
    <div class='echo-form-field echo-form-field--help'>
      <div class='echo-form-label'>注解语法</div>
      <div class='echo-form-help'>
        <div><code>@{{ formData.name || '回响名' }}{}()</code></div>
        <div class='echo-form-help__desc'>
          大括号里的字段会作为 <code>props</code> 注入（与 form-create 的 rule.props / rule.on 对齐），圆括号里的内容会作为 <code>prompt</code> 注入。
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { EchoCategoryEnum } from 'src/utils/enum'

export default {
  name: 'echoFormFields',
  props: {
    form: {
      type: Object,
      required: true
    },
    isReadonly: {
      type: Boolean,
      default: false
    },
    isBuiltin: {
      type: Boolean,
      default: false
    }
  },
  data () {
    return {
      iconOptions: [
        { label: '回响', value: 'graphic_eq' },
        { label: '高亮', value: 'auto_fix_high' },
        { label: '提示', value: 'campaign' },
        { label: '灵感', value: 'lightbulb' },
        { label: '波纹', value: 'waves' },
        { label: '星光', value: 'stars' },
        { label: '书签', value: 'bookmark' },
        { label: '标注', value: 'edit_note' }
      ],
      colorOptions: [
        { value: '#26A69A' },
        { value: '#5C6BC0' },
        { value: '#EC407A' },
        { value: '#FF7043' },
        { value: '#8E24AA' },
        { value: '#42A5F5' },
        { value: '#9CCC65' },
        { value: '#FFA726' }
      ],
      categoryOptions: EchoCategoryEnum.items.map(c => ({ value: c.value, label: c.label }))
    }
  },
  computed: {
    formData: {
      get () {
        return this.form
      },
      set (val) {
        this.$emit('update:form', val)
      }
    }
  }
}
</script>

<style lang="scss" scoped>
.echo-form-fields {
  flex: 0 0 240px;
  min-width: 0;
  min-height: 0;
  height: 100%;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  padding-right: 2px;
}

.echo-form-field {
  margin-bottom: 12px;
}

.echo-form-field:last-child {
  margin-bottom: 0;
}

.echo-form-field--desc :deep(textarea) {
  min-height: 72px !important;
}

.echo-form-field--tight {
  margin-bottom: 10px;
}

.echo-form-label {
  font-size: 11px;
  color: rgba(0, 0, 0, 0.55);
  margin-bottom: 4px;
  font-weight: 500;
  line-height: 1.2;
  display: flex;
  align-items: center;
  gap: 4px;
}

.echo-form-ai-btn {
  color: #7c4dff;
  opacity: 0.8;
  transition: opacity 0.2s, transform 0.2s;
}

.echo-form-ai-btn:hover {
  opacity: 1;
  transform: scale(1.1);
}

.echo-form-input {
  width: 100%;
}

.echo-form-input--compact :deep(.q-field__control) {
  min-height: 36px;
}

.echo-form-input--compact :deep(.q-field__native),
.echo-form-input--compact :deep(.q-field__input) {
  font-size: 13px;
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

.color-dot--readonly {
  cursor: not-allowed;
  opacity: 0.85;
  filter: saturate(0.85);
}

.echo-form-help {
  padding: 10px 12px;
  border-radius: 8px;
  background: rgba(38, 166, 154, 0.12);
  border: 1px solid rgba(38, 166, 154, 0.28);
  color: rgba(0, 0, 0, 0.75);
  font-size: 12px;
  line-height: 1.55;
  word-break: break-word;
}

.echo-form-help code {
  font-family: Consolas, Monaco, monospace;
  background: rgba(0, 0, 0, 0.08);
  padding: 1px 4px;
  border-radius: 4px;
}

.echo-form-help__desc {
  margin-top: 6px;
  color: rgba(0, 0, 0, 0.6);
}

/* Dark mode */
.body--dark .echo-form-label {
  color: rgba(255, 255, 255, 0.55);
}

.body--dark .echo-form-help {
  color: rgba(255, 255, 255, 0.88);
}

.body--dark .echo-form-help code {
  background: rgba(255, 255, 255, 0.08);
}

.body--dark .echo-form-help__desc {
  color: rgba(255, 255, 255, 0.72);
}

.body--dark .color-dot.selected {
  border-color: #fff;
  box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.4);
}
</style>
