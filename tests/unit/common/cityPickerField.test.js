// ============================================================================
// tests/unit/common/cityPickerField.test.js
//
// 「设置 → 通用 → 个人信息」的城市选择框。这里用最小的假 city-picker 插件
// 复现真实插件的两个行为：
//   1) 用户点选只更新 input.value / .city-select 的 data('item')，不派发
//      任何“已选择”事件（真实插件并没有 cp:updated）；
//   2) init 时优先用 input 里已有的文本覆盖传入的 province/city/district。
// 组件必须自己监听 dropdown 点击做同步，并在重建前清空旧文本。
// ============================================================================

jest.mock('src/utils/cdnDepsUtil', () => ({
  whenCdnDepsReady: jest.fn(() => Promise.resolve())
}))

const path = require('path')
const { mount } = require('@vue/test-utils')
const $ = require('jquery')

const CityPickerField = require(path.resolve(
  __dirname,
  '../../../src/components/common/cityPickerField.vue'
)).default

const EMPTY = { province: '', city: '', district: '' }
const ANHUI = { province: '安徽省', city: '蚌埠市', district: '禹会区' }
const SHANGHAI = { province: '上海市', city: '上海市', district: '黄浦区' }
const BEIJING = { province: '北京市', city: '北京市', district: '东城区' }

const wait = (ms = 30) => new Promise(resolve => setTimeout(resolve, ms))

function installFakeCitypicker () {
  $.fn.citypicker = function (option) {
    const $el = $(this)
    const existing = $el.data('citypicker')

    if (typeof option === 'string') {
      if (option === 'destroy' && existing) {
        existing.$span.remove()
        existing.$dropdown.remove()
        $el.removeData('citypicker')
      }
      return this
    }

    // 与真实插件一致：实例已存在时不会用新 options 重建
    if (existing) return this

    const opts = option || {}
    const $span = $('<span class="city-picker-span"></span>').insertAfter($el)
    const $dropdown = $('<div class="city-picker-dropdown"></div>').appendTo($el.parent())
    const selects = ['province', 'city', 'district'].map(key => {
      const $select = $('<div class="city-select ' + key + '"></div>').appendTo($dropdown)
      $select.data('item', opts[key] ? { address: opts[key], code: key } : null)
      $('<a></a>').attr('title', opts[key] || '').appendTo($select)
      return $select
    })
    // 真实插件的 refresh() 会用 input 当前文本覆盖 options，这里用一个
    // 显式的“旧文本优先”来模拟：清空 input 是调用方必须做的事。
    const current = $el.val()
    if (current) {
      const parts = String(current).split('/')
      selects.forEach(($select, i) => {
        $select.data('item', parts[i] ? { address: parts[i], code: i } : null)
      })
    }
    $el.val(selects.map($select => {
      const item = $select.data('item')
      return item ? item.address : ''
    }).filter(Boolean).join('/'))

    $el.data('citypicker', {
      $element: $el,
      $span,
      $dropdown,
      options: opts
    })
    return this
  }
}

function pickerInstance (wrapper) {
  return $(wrapper.vm.$refs.inputEl).data('citypicker')
}

describe('CityPickerField', () => {
  let wrapper

  beforeEach(() => {
    installFakeCitypicker()
  })

  afterEach(() => {
    if (wrapper) {
      wrapper.destroy()
      wrapper = null
    }
    delete $.fn.citypicker
    document.body.innerHTML = ''
  })

  it('回显：mount 后显示 value 里的省市区', async () => {
    wrapper = mount(CityPickerField, { propsData: { value: ANHUI } })
    await wait(50)

    expect(pickerInstance(wrapper)).toBeTruthy()
    expect(wrapper.vm.$refs.inputEl.value).toBe('安徽省/蚌埠市/禹会区')
  })

  it('回显：value 在 attach 之后变化时输入框要跟着刷新', async () => {
    wrapper = mount(CityPickerField, { propsData: { value: ANHUI } })
    await wait(50)
    expect(wrapper.vm.$refs.inputEl.value).toBe('安徽省/蚌埠市/禹会区')

    wrapper.setProps({ value: SHANGHAI })
    await wait(50)

    expect(wrapper.vm.internalValue).toEqual(SHANGHAI)
    expect(wrapper.vm.$refs.inputEl.value).toBe('上海市/上海市/黄浦区')
  })

  it('持久化：用户点选 dropdown 后要 emit input/change', async () => {
    wrapper = mount(CityPickerField, { propsData: { value: EMPTY } })
    await wait(50)
    const inst = pickerInstance(wrapper)
    expect(inst).toBeTruthy()

    ;['province', 'city', 'district'].forEach(key => {
      inst.$dropdown.find('.city-select.' + key)
        .data('item', { address: BEIJING[key], code: key })
    })
    inst.$dropdown.find('.city-select.district a').trigger('click')
    await wait(20)

    const inputs = wrapper.emitted('input')
    const changes = wrapper.emitted('change')
    expect(inputs).toBeTruthy()
    expect(changes).toBeTruthy()
    expect(inputs[inputs.length - 1][0]).toEqual(BEIJING)
    expect(changes[changes.length - 1][0]).toEqual(BEIJING)
  })
})
