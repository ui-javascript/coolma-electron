<script lang='ts' setup>
import { Slate, Editable, type RenderElementProps, useInheritRef, type RenderLeafProps } from "slate-vue3"
import { h, ref, type Component } from "vue";
import { createEditor, Editor, Node, Text, Transforms, } from "slate-vue3/core";
import { withDOM } from "slate-vue3/dom";
import { withHistory } from "slate-vue3/history";
import type { CustomEditor, CustomElement } from "../type";
import SelectTag from "./components/SelectTag.vue";
import InputTag from "./components/InputTag.vue";

const emit = defineEmits<{
  (e: 'send', text: string): void;
}>();

// #region ➤ 初始化编辑器
// ================================================

const placeholder = ref('输入主题和写作要求')

const initialValue: CustomElement[] = [
    {
        type: 'paragraph', children: [
            { text: '', },
        ],
    },
]

const renderPlaceholder = () => {
    return h('div', { class: 'slate-common-placeholder', },
        [
            h('p', null, placeholder.value),
        ])
}

const renderLeaf = ({ attributes, children, leaf }: RenderLeafProps) => h('span', {
    ...attributes, style: {
        paddingLeft: leaf.text === '' ? '0.1px' : ''
    }
}, children)


const withInlines = (editor: CustomEditor) => {
    const { isInline } = editor;

    editor.isInline = element =>
        ['select-tag', 'input-tag'].includes((element as CustomElement).type) || isInline(element)

    return editor
}

const renderElement = ({ attributes, children, element }: RenderElementProps) => {
    const customElement = element as CustomElement;
    switch (customElement.type) {
        case 'select-tag':
            return h(SelectTag as unknown as Component, {
                ...useInheritRef(attributes),
                element
            }, () => children);
        case 'input-tag':
            return h(InputTag as unknown as Component, {
                ...useInheritRef(attributes),
                element
            }, () => children);
        default:
            return h('p', { ...attributes, class: 'slate-common-p' }, children)
    }
}

const editor = withHistory(withInlines(withDOM(createEditor())));
editor.children = initialValue;

// #endregion 初始化编辑器


// #region ➤ 获取发送内容
// ================================================

// 自定义序列化函数，处理所有元素类型
const serializeToPlainText = (nodes: any[]): string => {
    return nodes.map(node => {
        // 处理文本节点
        if (Text.isText(node)) {
            return node.text;
        }

        // 处理自定义元素
        const children = serializeToPlainText(node.children);

        switch (node.type) {
            case 'input-tag':
                return children || node.label || '';
            case 'select-tag':
                return node.value || '';
            case 'paragraph':
                return children + '\n\n';
            default:
                return children;
        }
    }).join('');
};

function send() {
    const content = serializeToPlainText(editor.children);
    if (content.trim()) {
        emit('send', content);
        // 清空编辑器
        Editor.withoutNormalizing(editor, () => {
            for (let i = editor.children.length - 1; i >= 0; i--) {
                Transforms.removeNodes(editor, { at: [i] });
            }
            Transforms.insertNodes(editor, initialValue);
        });
    }
}

// #endregion 获取发送内容


// #region ➤ 使用技能
// ================================================

function setEditValue(value: Node | Node[]) {
    Editor.withoutNormalizing(editor, () => {
        for (let i = editor.children.length - 1; i >= 0; i--) {
            Transforms.removeNodes(editor, { at: [i] });
        }
        Transforms.insertNodes(editor, value);
    });

    const startPoint = Editor.start(editor, [0, 0]);
    Transforms.select(editor, {
        anchor: startPoint,
        focus: startPoint
    });
}

// #endregion 使用技能

defineExpose({
    setEditValue
})
</script>

<template>
    <div class='input-container w-full h-128px w-full relative flex flex-col'>
        <!-- 输入框 -->
        <div class="editor-container flex flex-col relative wh-full min-h-0 min-w-0 flex-1 p-[12px_12px_12px_16px]">
            <!-- 输入框主体 -->
            <div class="wh-full flex-1 min-h-0 min-w-0">
                <Slate :editor="editor" :render-element="renderElement" :render-placeholder="renderPlaceholder"
                    :render-leaf="renderLeaf">
                    <Editable class="slate-container" :placeholder="placeholder" />
                </Slate>
            </div>
        </div>
        <!-- 技能 -->
        <div class="skill-box flex items-center justify-between p-[0_12px_12px_12px]">
            <div class="left-box flex flex-center gap-10px">
                <div class="btn-box !p-x-7px">
                    <!-- 旋转-45度 -->
                    <div class="icon i-mdi-attachment rotate-315 text-16px"></div>
                </div>
                <div class="btn-box">
                    <div class="icon i-custom-think"></div>
                    <div class="label">深度思考</div>
                </div>
                <div class="btn-box">
                    <div class="icon i-mdi-web"></div>
                    <div class="label">搜索资料</div>
                </div>
            </div>

            <div class="right-box flex flex-center">
                <div class="icon-btn ">
                    <div class="icon i-custom-microphone size-18px"></div>
                </div>
                <div class="split h-19px w-1px bg-[var(--s-color-border-tertiary)] m-l-4px m-r-12px"></div>
                <div class="icon-btn send-btn" @click="send">
                    <div class="icon i-custom-arrow-up size-16px color-[var(--s-color-text-inverse-tertiary)]"></div>
                </div>
            </div>
        </div>
    </div>
</template>

<style lang='scss' scoped>
.input-container {
    --chat-input-skill-border-radius: 12px;

    &::after {
        border: 1px solid var(--s-color-border-tertiary);
        border-radius: var(--chat-input-skill-border-radius);
        bottom: 0;
        content: "";
        left: 0;
        pointer-events: none;
        position: absolute;
        right: 0;
        top: 0;
    }

    .editor-container {

        .slate-container {
            position: relative;
            white-space: pre-wrap;
            overflow-wrap: break-word;
            flex-grow: 1;
            outline: 0;
            overflow-anchor: auto;
            overflow-x: hidden;
            overflow-y: auto;
            height: 100%;
        }


    }


    .skill-box {

        .btn-box {
            border: 1px solid var(--s-color-border-tertiary);
            color: var(--s-color-text-secondary);
            border-radius: 10px;

            display: flex;
            align-items: center;
            justify-content: center;
            gap: 4px;

            height: 36px;
            padding: 0 12px;

            .label {
                color: var(--s-color-text-secondary);
                font: var(--s-font-small-strong);
            }
        }

        .icon-btn {
            width: 32px;
            height: 32px;
            display: flex;
            align-items: center;
            justify-content: center;

        }

        .send-btn {
            border-radius: 18px;
            background-color: var(--s-color-brand-primary-default, #0057ff);
            cursor: pointer;
            transition: all 0.2s ease;
            
            &:hover {
                background-color: var(--s-color-brand-primary-hover, #004ad9);
                transform: scale(1.05);
            }
            
            &:active {
                transform: scale(0.95);
            }
        }
    }
}
</style>


<style lang='scss'>
.slate-common-placeholder {
    position: absolute;
    color: #C9CDD4;
    font-family: "HarmonyOS Sans SC";
    font-size: 16px;
    font-style: normal;
    font-weight: 300;
    line-height: 34px;
    text-transform: capitalize;
    top: 0 !important;
    pointer-events: none;
    user-select: none;
    text-decoration: none;
    width: 100%;
    max-width: 100%;
}

.slate-common-p {
    color: #020814;
    font-family: "HarmonyOS Sans SC";
    font-size: 16px;
    font-style: normal;
    font-weight: 300;
    line-height: 175%;
    text-transform: capitalize;
}
</style>
