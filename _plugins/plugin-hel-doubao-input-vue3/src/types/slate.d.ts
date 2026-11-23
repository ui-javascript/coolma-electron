import type { CustomEditor, CustomElement, CustomText } from '../components/type';

declare module 'slate-vue3/core' {
  interface CustomTypes {
    Editor: CustomEditor;
    Element: CustomElement;
    Text: CustomText;
  }
}
