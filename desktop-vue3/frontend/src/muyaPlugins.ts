import { createEchoPlugin } from 'plugins-muya-echo';
import { createRunePlugin } from 'plugins-muya-rune';

export const muyaPlugins = [
  createEchoPlugin({
    cards: [{
      id: 'demo-echo',
      name: 'demo',
      type: 'echo',
      anno_source: 'export default { type: "echo", render (props = {}) { return "<span class=\"coolma-echo-demo\">" + String(props.value || props.prompt || "demo") + "</span>" } }',
    }],
  }),
  createRunePlugin({
    cards: [{
      id: 'demo-rune',
      name: 'counter',
      template: '<template><button class="coolma-rune-demo" type="button" @click="increment">{{ value || 0 }}</button></template><script>export default { props: { value: { default: 0 }, onValueChange: { default: null } }, methods: { increment () { if (this.onValueChange) this.onValueChange({ value: Number(this.value || 0) + 1 }) } } }</script>',
    }],
  }),
];
