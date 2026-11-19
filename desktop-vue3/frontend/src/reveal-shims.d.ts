// reveal.js 自带类型只覆盖主入口，插件是未声明的 JS，这里补一份最小声明。

declare module 'reveal.js' {
  export default class Reveal {
    constructor(element: HTMLElement | string, options?: Record<string, unknown>);
    initialize(): Promise<void>;
    layout(): void;
    destroy(): void;
  }
}

declare module 'reveal.js/plugin/markdown/markdown' {
  const plugin: unknown;
  export default plugin;
}

declare module 'reveal.js/plugin/highlight/highlight' {
  const plugin: unknown;
  export default plugin;
}

declare module 'reveal.js/plugin/notes/notes' {
  const plugin: unknown;
  export default plugin;
}

declare module 'reveal.js/dist/reveal.css';
declare module 'reveal.js/dist/theme/white.css';
declare module 'reveal.js/plugin/highlight/monokai.css';
