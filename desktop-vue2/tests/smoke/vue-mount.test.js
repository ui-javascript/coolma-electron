// ============================================================================
// tests/smoke/vue-mount.test.js —— Jest + Vue 2 + @vue/test-utils 最小烟雾测试
//
// 目的：锁定「Jest 29 + @vue/vue2-jest + @vue/test-utils@1.3.6 + jsdom」这条工具链
// 在本仓库能跑通 Vue 2.7 组件挂载、props 渲染、emit 事件。
//
// 如果哪天有人升 jest / vue2-jest / @vue/test-utils，这条用例会先报警。
// ============================================================================
import { mount } from '@vue/test-utils'
import Vue from 'vue'

describe('Jest + Vue 2.7 + jsdom 烟雾测试', () => {
  test('能 require vue 2.7.16', () => {
    expect(Vue.version).toMatch(/^2\.7\./)
  })

  test('能 mount 一个最简单的 SFC', () => {
    const Hello = {
      template: '<div class="hi">hi {{ name }}</div>',
      props: { name: { type: String, default: 'world' } }
    }
    const wrapper = mount(Hello, { propsData: { name: 'coolma' } })
    expect(wrapper.classes()).toContain('hi')
    expect(wrapper.text()).toBe('hi coolma')
  })

  test('mount 后 $emit("input") 能被 @vue/test-utils 收到', () => {
    const Emitter = {
      template: '<button @click="emit">go</button>',
      methods: {
        emit () { this.$emit('input', 'from-emit') }
      }
    }
    const wrapper = mount(Emitter)
    wrapper.find('button').trigger('click')
    expect(wrapper.emitted().input).toBeTruthy()
    expect(wrapper.emitted().input[0]).toEqual(['from-emit'])
  })

  test('jsdom + jquery-setup 注入了 window.jQuery', () => {
    expect(typeof window).toBe('object')
    expect(window.jQuery).toBeDefined()
    expect(window.$).toBeDefined()
    expect(window.jQuery).toBe(window.$)
    // jquery 工厂调用后返回的是 jQuery 实例（fn + 集合），不是 function
    expect(typeof window.jQuery.fn).toBe('object')
  })

  test('vue2-jest 能编译一个最小 .vue 文件', () => {
    const SfcLike = {
      template: '<p class="vue-compiled">{{ msg }}</p>',
      data () { return { msg: 'vue2-jest works' } }
    }
    const wrapper = mount(SfcLike)
    expect(wrapper.find('p.vue-compiled').text()).toBe('vue2-jest works')
  })
})