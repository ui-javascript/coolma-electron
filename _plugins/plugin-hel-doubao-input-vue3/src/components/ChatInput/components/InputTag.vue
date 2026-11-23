<!-- PlaceholderTag.vue -->
<script setup lang="ts">
import { ref, watchEffect, onMounted, nextTick } from "vue";
import { type HTMLAttributes, useAttrs } from 'vue';
const attrs: HTMLAttributes = useAttrs()

interface Props {
    element: {
        label: string;
        children: Array<{ text: string }>;
    };
}

const props = defineProps<Props>();

// 创建标签文本宽度的引用
const labelWidth = ref('auto');
// 创建用于测量宽度的隐藏标签
const measureLabelRef = ref<HTMLSpanElement | null>(null);
// 创建占位符标签容器引用
const containerRef = ref<HTMLSpanElement | null>(null);
// 测量宽度
const measureWidth = ref<string>("auto");

// 动态计算是否显示标签
const showLabel = ref(true);

// 监听标签文本变化以测量宽度
watchEffect(() => {
    if (measureLabelRef.value && props.element.label) {
        nextTick(() => {
            measureWidth.value = `${measureLabelRef.value!.offsetWidth + 24}px`;
        });
    }
});

// 监听子节点文本内容变化
watchEffect(() => {
    const textContent = props.element.children
        .map(child => child.text)
        .join("")
        .replace(/\uFEFF/g, ""); // 移除零宽空格

    showLabel.value = textContent.trim() === "";

    // 有内容时重置宽度为 auto
    if (!showLabel.value && containerRef.value) {
        labelWidth.value = 'auto';
    } else if (containerRef.value) {
        labelWidth.value = measureWidth.value;
    }
});

// 空文本节点以确保光标位置正确
onMounted(() => {
    if (props.element.children.length === 0) {
        props.element.children.push({ text: "" });
    }
});
</script>

<template>
    <span ref="containerRef" v-bind="attrs" data-slate-inline="true" class="placeholder-tag"
        :style="{ minWidth: labelWidth }">
        <!-- 测量元素 -->
        <span ref="measureLabelRef" class="measure-label">{{ element.label }}</span>

        <!-- 标签部分 - 只在没有内容时显示 -->
        <div v-show="showLabel" contenteditable="false" class="start-point">
            <div class="placeholder">{{ element.label }}</div>
        </div>

        <!-- 可编辑区域 -->
        <span class="editable-content">
            <slot />
        </span>
    </span>
</template>

<style lang="scss" scoped>
.placeholder-tag {
    min-width: auto;
    position: relative;

    box-sizing: border-box;
    display: inline-block;
    padding: 2px 6px;
    margin: 2px 3px;
    border-radius: 10px;
    position: relative;
    background: var(--s-color-brand-primary-transparent-1, rgba(0, 102, 255, .06));
    font-weight: 600;
    line-height: 150%;
    word-break: break-word;
    border: 0 solid;
}

.start-point {
    display: inline-block;
    pointer-events: none;
    opacity: 0.7;
    position: absolute;
    top: 2px;
    left: 0;
    pointer-events: none;
}

.placeholder {
    pointer-events: none;
    color: var(--s-color-brand-primary-default, #06f);
    opacity: .3;
    display: inline-block;
    white-space: nowrap;
    padding: 0 12px;
    font-family: "HarmonyOS Sans SC";
    font-size: 16px;
    font-style: normal;
    font-weight: 500;
    line-height: 24px;
    text-transform: capitalize;

}

.editable-content {
    display: inline-block;
    min-width: 100%;
    position: relative;
    z-index: 1;
    color: var(--s-color-brand-primary-default, #06f);
    font-size: 16px;
    font-weight: 600;
    line-height: 150%;
    text-transform: capitalize;
    padding-left: 0;
}

.measure-label {
    visibility: hidden;
    position: absolute;
    white-space: nowrap;
    font-size: 16px;
}
</style>