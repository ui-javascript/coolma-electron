/**
 * 内置目录的通用类型：符文模板和内置回响共用一套壳，
 * 差异只放在 payload 里，后续加/删/筛选都按 kind 做统一处理。
 */
export type BuiltinKind = 'rune-template' | 'echo';

export interface BuiltinBase {
  kind: BuiltinKind;
  builtin: true;
  id: string;
  name: string;
  desc: string;
  category: string;
  color: string;
  icon: string;
  sortOrder: number;
}

export interface RuneTemplateBuiltin extends BuiltinBase {
  kind: 'rune-template';
  payload: {
    template: string;
  };
}

export interface EchoBuiltin extends BuiltinBase {
  kind: 'echo';
  payload: {
    annoSource: string;
    renderType: string;
  };
}

export type BuiltinItem = RuneTemplateBuiltin | EchoBuiltin;

export interface BuiltinCatalog {
  version: number;
  source: string;
  items: BuiltinItem[];
}
