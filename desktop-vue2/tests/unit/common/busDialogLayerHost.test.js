import { shallowMount } from '@vue/test-utils'
import BusDialogLayerHost from '../../../src/components/common/BusDialogLayerHost.vue'
import BusLayerContainer from '../../../src/components/common/BusLayerContainer.vue'

describe('BusDialog session shells', () => {
  test('forwards all Element UI container props while keeping registry discriminators private', () => {
    const wrapper = shallowMount(BusLayerContainer, {
      propsData: {
        kind: 'drawer',
        visible: true,
        busDialogProps: {
          container: 'drawer',
          kind: 'drawer',
          size: '420px',
          appendToBody: true,
          destroyOnClose: true
        }
      }
    })

    expect(wrapper.vm.containerProps).toEqual({
      size: '420px',
      appendToBody: true,
      destroyOnClose: true
    })

    wrapper.vm.updateVisible(false)
    expect(wrapper.emitted('update:visible')).toEqual([[false]])
  })

  test('keeps sessions independent when a shell or its content closes', () => {
    const first = {
      id: 'first',
      busDialogProps: { kind: 'dialog' },
      component: { name: 'FirstContent' },
      contentProps: { recordId: '1' },
      close: jest.fn()
    }
    const second = {
      id: 'second',
      busDialogProps: { kind: 'drawer' },
      component: { name: 'SecondContent' },
      contentProps: { recordId: '2' },
      close: jest.fn()
    }
    const wrapper = shallowMount(BusDialogLayerHost, {
      propsData: { sessions: [first, second] }
    })

    expect(wrapper.findAllComponents(BusLayerContainer)).toHaveLength(2)
    wrapper.vm.onVisibleChange(first, false)
    wrapper.vm.onVisibleChange(second, true)
    wrapper.vm.closeSession(second)

    expect(first.close).toHaveBeenCalledTimes(1)
    expect(second.close).toHaveBeenCalledTimes(1)
  })
})
