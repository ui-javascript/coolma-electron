jest.mock('vue-layerx', () => {
  const layers = []
  const createLayer = jest.fn(() => () => {
    const layer = {
      bindHost: jest.fn(),
      visible: false
    }
    layer.open = jest.fn(() => { layer.visible = true })
    layer.close = jest.fn(() => { layer.visible = false })
    layers.push(layer)
    return layer
  })
  return { createLayer, LayerNoContainer: {}, _layers: layers }
})

jest.mock('../../../src/components/common/busDialogContext', () => {
  const context = jest.fn()
  context.keys = () => []
  return { __esModule: true, default: context }
})

import busDialog from '../../../src/components/common/busDialogBus'
import {
  bindBusDialogHost,
  closeAllBusDialogs,
  closeBusDialog,
  getBusDialog,
  openBusDialog,
  registerBusDialog,
  registerLazyBusDialog,
  startBusDialogs,
  stopBusDialogs
} from '../../../src/components/common/busDialogRegistry'

describe('vue-layerx BusDialog registry', () => {
  const syncName = 'RegistryContractBusDialog'
  const lazyName = 'LazyContractBusDialog'
  const cancelledName = 'CancelledContractBusDialog'
  const failedName = 'FailedContractBusDialog'
  let resolveLazy
  let resolveCancelled
  const lazyLoader = jest.fn(() => new Promise(resolve => { resolveLazy = resolve }))
  const cancelledLoader = jest.fn(() => new Promise(resolve => { resolveCancelled = resolve }))

  beforeAll(() => {
    registerBusDialog({
      props: {
        busDialogProps: {
          type: Object,
          default: () => ({ container: 'drawer', size: '360px', appendToBody: true })
        }
      }
    }, './RegistryContractBusDialog.vue')
    registerLazyBusDialog('./LazyContractBusDialog.vue', lazyLoader)
    registerLazyBusDialog('./CancelledContractBusDialog.vue', cancelledLoader)
    registerLazyBusDialog('./FailedContractBusDialog.vue', () => Promise.reject(new Error('chunk unavailable')))
    bindBusDialogHost()
  })

  afterEach(() => {
    stopBusDialogs()
    closeAllBusDialogs(syncName)
    closeAllBusDialogs(lazyName)
    closeAllBusDialogs(cancelledName)
    closeAllBusDialogs(failedName)
  })

  test('creates a host-bound portal during App.setup without redundant bindHost calls', () => {
    const entry = getBusDialog(syncName)
    expect(entry.layer).toBeDefined()
    expect(entry.layer.bindHost).not.toHaveBeenCalled()
    expect(entry.layer.open).not.toHaveBeenCalled()
  })

  test('creates a session with default container props', async () => {
    const opened = await openBusDialog(syncName, { recordId: '42' })
    const entry = getBusDialog(syncName)

    expect(opened.status).toBe('opened')
    expect(opened.id).toEqual(expect.stringMatching(/^RegistryContractBusDialog:/))
    expect(entry.sessions).toEqual([expect.objectContaining({
      id: opened.id,
      component: entry.component,
      contentProps: { recordId: '42' },
      busDialogProps: { size: '360px', appendToBody: true, kind: 'drawer' }
    })])
    expect(entry.layer.open).toHaveBeenLastCalledWith({ props: { sessions: entry.sessions } })
  })

  test('merges busDialogProps only into each outer container', async () => {
    await openBusDialog(syncName, {
      busDialogProps: { title: 'Container title', size: '480px' },
      recordId: '43',
      title: 'Business title'
    })
    const entry = getBusDialog(syncName)

    expect(entry.sessions).toContainEqual(expect.objectContaining({
      contentProps: { recordId: '43', title: 'Business title' },
      busDialogProps: { size: '480px', appendToBody: true, title: 'Container title', kind: 'drawer' }
    }))
  })

  test('opens every concurrent request after one shared lazy load with isolated data', async () => {
    const first = openBusDialog(lazyName, { recordId: 'first' })
    const second = openBusDialog(lazyName, { recordId: 'second' })
    expect(lazyLoader).toHaveBeenCalledTimes(1)
    resolveLazy({
      default: {
        props: { busDialogProps: { default: () => ({ title: 'Lazy', width: '480px' }) } }
      }
    })

    expect((await first).status).toBe('opened')
    expect((await second).status).toBe('opened')
    const entry = getBusDialog(lazyName)
    expect(entry.layer.open).toHaveBeenCalledTimes(1)
    expect(entry.sessions).toEqual(expect.arrayContaining([
      expect.objectContaining({ contentProps: { recordId: 'first' } }),
      expect.objectContaining({ contentProps: { recordId: 'second' } })
    ]))
  })

  test('cancels a loading session when its id is closed before the chunk resolves', async () => {
    const opening = openBusDialog(cancelledName, { recordId: 'cancelled' })
    const entry = getBusDialog(cancelledName)
    const pendingId = [...entry.pending][0].id
    expect(cancelledLoader).toHaveBeenCalledTimes(1)

    expect(closeBusDialog(cancelledName, pendingId)).toMatchObject({ status: 'closed', id: pendingId })
    expect(entry.pending.size).toBe(0)
    resolveCancelled({
      default: { props: { busDialogProps: { default: () => ({ title: 'Cancelled' }) } } }
    })

    expect(await opening).toMatchObject({ status: 'cancelled', id: pendingId })
    expect(entry.sessions).toHaveLength(0)
  })

  test('returns a controlled failure instead of rejecting on lazy-load failure', async () => {
    const outcome = await openBusDialog(failedName)
    expect(outcome.status).toBe('failed')
    expect(outcome.error).toBeInstanceOf(Error)
  })

  test('closes one same-name session without touching the other', async () => {
    const first = await openBusDialog(syncName, { recordId: 'one' })
    const second = await openBusDialog(syncName, { recordId: 'two' })
    const entry = getBusDialog(syncName)
    const closeCallsBefore = entry.layer.close.mock.calls.length

    expect(closeBusDialog(syncName, first.id)).toMatchObject({ status: 'closed', id: first.id })
    expect(entry.sessions).toEqual([expect.objectContaining({ id: second.id, contentProps: { recordId: 'two' } })])
    expect(entry.layer.close).toHaveBeenCalledTimes(closeCallsBefore)

    second.close()
    expect(entry.sessions).toHaveLength(0)
    expect(entry.layer.close).toHaveBeenCalledTimes(closeCallsBefore + 1)
  })

  test('requires an id for the Promise close API and makes bulk close explicit', async () => {
    const first = await openBusDialog(syncName, { recordId: 'one' })
    const second = await openBusDialog(syncName, { recordId: 'two' })
    const entry = getBusDialog(syncName)

    expect(closeBusDialog(syncName)).toMatchObject({ status: 'missing-id' })
    expect(entry.sessions).toHaveLength(2)
    expect(closeAllBusDialogs(syncName)).toMatchObject({ status: 'closed' })
    expect(entry.sessions).toHaveLength(0)
    expect(first.id).not.toBe(second.id)
  })

  test('subscribes only to explicit open/close events and removes exact handlers', async () => {
    const on = jest.spyOn(busDialog, '$on')
    const off = jest.spyOn(busDialog, '$off')
    startBusDialogs()
    const entry = getBusDialog(syncName)
    expect(on).toHaveBeenCalledWith(syncName + '.open', entry.handlers.open)
    expect(on).toHaveBeenCalledWith(syncName + '.close', entry.handlers.close)
    expect(on).not.toHaveBeenCalledWith(syncName + '.toggle', expect.any(Function))

    busDialog.$emit(syncName + '.open', { recordId: 'from-bus' })
    await Promise.resolve()
    await Promise.resolve()
    expect(entry.sessions).toContainEqual(expect.objectContaining({ contentProps: { recordId: 'from-bus' } }))

    busDialog.$emit(syncName + '.close')
    expect(entry.sessions).toHaveLength(0)

    stopBusDialogs()
    expect(off).toHaveBeenCalledWith(syncName + '.open', entry.handlers.open)
    expect(off).toHaveBeenCalledWith(syncName + '.close', entry.handlers.close)
    expect(off).not.toHaveBeenCalledWith(syncName + '.toggle', expect.any(Function))
    on.mockRestore()
    off.mockRestore()
  })
})
