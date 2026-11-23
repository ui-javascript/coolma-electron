import type { BaseEditor, BaseElement } from "slate-vue3/core";
import type { DOMEditor } from "slate-vue3/dom";

export type CustomElement =
  | ParagraphElement  
  | InputTagElement
  | SelectTagElement;

// 段落元素
export interface ParagraphElement extends BaseElement {
  type: "paragraph";
  children: (CustomText | CustomElement)[];
}

// 输入标签元素
export interface InputTagElement extends BaseElement {
  type: "input-tag";
  label: string;
  children: CustomText[];
}

// 选择标签元素
export interface SelectTagElement extends BaseElement {
  type: "select-tag";
  value: string;
  options: { label: string; value: string }[];
  children: CustomText[];
}

// 节点联合类型
export type CustomNode = CustomElement | CustomText;

export interface CustomText {
  text: string;
}

export interface selectTagOption {
  label: string;
  value: string;
}

export type CustomEditor = BaseEditor & DOMEditor;
