<!-- SelectTag.vue -->
<script setup lang="ts">
import { useEditor } from 'slate-vue3'
import { ref, watch } from "vue";
import { type HTMLAttributes, useAttrs } from 'vue';
import { DOMEditor } from "slate-vue3/dom";
import { Element, Transforms } from 'slate-vue3/core'
import { type CustomElement, type selectTagOption } from '../../type';

const editor = useEditor()
const attrs: HTMLAttributes = useAttrs()

interface Props {
    element: {
        options: selectTagOption[];
        value?: string;
    };
}

const props = defineProps<Props>();
const emit = defineEmits(['change']);

// 当前选中的值
const selectedValue = ref(props.element.value || props.element.options[0].value);

// 当元素值变化时更新
watch(() => props.element.value, (newValue) => {
    if (newValue) {
        selectedValue.value = newValue;
    }
});

// 选择变化时触发
const onSelectChange = (event: Event) => {
    const value = (event.target as HTMLSelectElement).value;
    if (!props.element) return false;
    const path = DOMEditor.findPath(editor, props.element as unknown as Element)
    Transforms.setNodes(editor, { value: value } as Partial<CustomElement>, { at: path });
};
</script>

<template>
    <div v-bind="attrs" data-slate-inline="true" class="select-tag" contenteditable="false">
        <select v-model="selectedValue" @change="onSelectChange" class="custom-select">
            <option v-for="option in element.options" :key="option.value" :value="option.value">
                {{ option.label }}
            </option>
        </select>
    </div>
</template>

<style scoped>
.select-tag {

    display: inline-block;
    background: var(--s-color-brand-primary-transparent-1, rgba(0, 102, 255, .06));
    border-radius: 10px;
    padding: 2px 6px;
    margin: 2px 3px;
    line-height: 150%;
    word-break: break-word;
    border: 0 solid;
    box-sizing: border-box;

    padding-left: 11px;
}

.custom-select {
    /* 重置默认样式 */
    appearance: none;
    -webkit-appearance: none;
    -moz-appearance: none;

    /* 基本样式 */
    background: transparent;
    border: none;
    outline: none;
    font-size: 16px;
    color: var(--s-color-brand-primary-default, #06f);
    font-weight: 600;
    cursor: pointer;
    padding: 0 16px 0 0;

    /* 添加自定义下拉箭头 */
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%235356F0'%3E%3Cpath d='M7 10l5 5 5-5z'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: calc(100%) center;
    background-size: 16px;
}

.custom-select:focus {
    outline: none;
}
</style>