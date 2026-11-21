import Vue from 'vue'
import { createLayer, LayerNoContainer } from 'vue-layerx'
import busDialog from './busDialogBus'
import BusDialogLayerHost from './BusDialogLayerHost.vue'
import busDialogContext from './busDialogContext'

// The static webpack context discovers dialog names without loading business SFCs.
// A component chunk is requested only by XxxBusDialog.open.
const dialogs = new Map()

// vue-layerx must capture its host synchronously during App.setup(). A clone made
// later does not inherit that host, therefore one persistent portal host is bound
// per dialog type. That host renders multiple independent dialog sessions.
const useBusLayer = createLayer(LayerNoContainer)
let listening = false
let hostInitialized = false
let nextSessionId = 0

function dialogNameFromPath (path) {
  const match = path.match(/([^/]+)\.vue$/)
  return match ? match[1] : ''
}

function normalizeDialogProps (config, fallbackKind) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    throw new Error('[BusDialog] busDialogProps must be an object')
  }
  const { container = fallbackKind, ...props } = config
  if (container === undefined) return { kind: undefined, props }
  if (container !== 'dialog' && container !== 'drawer') {
    throw new Error('[BusDialog] Unsupported container: ' + container)
  }
  return { kind: container, props }
}

function getDefaultDialogProps (component, name) {
  const definition = component?.props?.busDialogProps
  if (!definition || !Object.prototype.hasOwnProperty.call(definition, 'default')) {
    throw new Error('[BusDialog] ' + name + ' must declare props.busDialogProps.default()')
  }
  const config = typeof definition.default === 'function'
    ? definition.default()
    : definition.default
  return normalizeDialogProps(config, 'dialog')
}

function splitOpenPayload (payload) {
  const source = payload && typeof payload === 'object' ? payload : {}
  const { busDialogProps, ...contentProps } = source
  return {
    contentProps,
    override: busDialogProps === undefined ? {} : busDialogProps
  }
}

function result (status, name, extra = {}) {
  return { status, name, ...extra }
}

function reportOpenResult (openResult) {
  if (openResult.status === 'failed') {
    console.error('[BusDialog] Failed to open ' + openResult.name + ':', openResult.error)
  }
}

function registerEntry (name, path, loader, component = null) {
  if (!name) throw new Error('[BusDialog] Cannot infer a dialog name from ' + path)
  const existing = dialogs.get(name)
  if (existing) {
    throw new Error('[BusDialog] Duplicate dialog name "' + name + '": ' + existing.path + ' and ' + path)
  }
  if (hostInitialized) {
    throw new Error('[BusDialog] ' + name + ' was registered after App.setup(); use *BusDialog.vue scanning')
  }

  const entry = {
    name,
    path,
    loader,
    component,
    layer: null,
    // Vue 2 must observe mutations, because this array is the portal host prop.
    sessions: Vue.observable([]),
    pending: new Set(),
    defaultDialogProps: component ? getDefaultDialogProps(component, name) : null,
    loading: null,
    handlers: null
  }
  entry.handlers = {
    open: payload => { void openBusDialog(name, payload).then(reportOpenResult) },
    // Event close without an id intentionally means close all. The Promise API
    // stays unambiguous: close(name, id) closes exactly one session.
    close: payload => payload && payload.id
      ? closeBusDialog(name, payload.id)
      : closeAllBusDialogs(name)
  }
  dialogs.set(name, entry)
  return entry
}

export function registerBusDialog (component, path) {
  return registerEntry(dialogNameFromPath(path), path, () => Promise.resolve(component), component)
}

export function registerLazyBusDialog (path, loader) {
  return registerEntry(dialogNameFromPath(path), path, loader)
}

busDialogContext.keys().forEach(path => {
  registerLazyBusDialog(path, () => busDialogContext(path))
})

// Calling this from App.setup() is required. useLayer() auto-binds the active
// host; explicit layer.bindHost() is redundant and deliberately not used.
export function bindBusDialogHost () {
  hostInitialized = true
  dialogs.forEach(entry => {
    if (!entry.layer) entry.layer = useBusLayer(BusDialogLayerHost)
  })
}

async function ensureLoaded (entry) {
  if (entry.component) return entry
  if (!entry.loading) {
    entry.loading = Promise.resolve(entry.loader())
      .then(module => {
        entry.component = module.default || module
        entry.defaultDialogProps = getDefaultDialogProps(entry.component, entry.name)
        entry.loading = null
        return entry
      })
      .catch(error => {
        entry.loading = null
        throw error
      })
  }
  return entry.loading
}

function createSessionId (name) {
  nextSessionId += 1
  return name + ':' + nextSessionId
}

function closeSession (entry, id) {
  const index = entry.sessions.findIndex(session => session.id === id)
  if (index === -1) return false
  entry.sessions.splice(index, 1)
  if (entry.sessions.length === 0) entry.layer.close()
  return true
}

function cancelPendingSession (entry, id) {
  for (const request of entry.pending) {
    if (request.id === id) {
      request.cancelled = true
      entry.pending.delete(request)
      return true
    }
  }
  return false
}

// Promise API. Every request becomes an independent session after the shared
// lazy chunk resolves. Concurrent opens never overwrite or supersede each other.
export async function openBusDialog (name, payload = {}) {
  const entry = dialogs.get(name)
  if (!entry) return result('unknown', name)
  if (!entry.layer) return result('not-ready', name)

  const { contentProps, override } = splitOpenPayload(payload)
  const request = { id: createSessionId(name), cancelled: false }
  entry.pending.add(request)

  let loaded
  try {
    loaded = await ensureLoaded(entry)
  } catch (error) {
    entry.pending.delete(request)
    return result('failed', name, { error })
  }
  entry.pending.delete(request)
  if (request.cancelled) return result('cancelled', name, { id: request.id })

  try {
    const overrideProps = normalizeDialogProps(override)
    const containerProps = {
      ...loaded.defaultDialogProps.props,
      ...overrideProps.props,
      kind: overrideProps.kind || loaded.defaultDialogProps.kind
    }
    const session = Vue.observable({
      id: request.id,
      component: loaded.component,
      contentProps,
      busDialogProps: containerProps,
      close: () => closeBusDialog(name, request.id)
    })
    entry.sessions.push(session)
    if (!entry.layer.visible) entry.layer.open({ props: { sessions: entry.sessions } })
    return result('opened', name, { id: session.id, close: session.close })
  } catch (error) {
    return result('failed', name, { error })
  }
}

// Close exactly one session. A dialog body closes itself with this.$emit('close').
// Use closeAllBusDialogs() for deliberate bulk teardown.
export function closeBusDialog (name, id) {
  const entry = dialogs.get(name)
  if (!entry) return result('unknown', name)

  if (id === undefined || id === null) return result('missing-id', name)
  const closed = closeSession(entry, id) || cancelPendingSession(entry, id)
  return result(closed ? 'closed' : 'missing', name, { id })
}

export function closeAllBusDialogs (name) {
  const entry = dialogs.get(name)
  if (!entry) return result('unknown', name)
  Array.from(entry.pending).forEach(request => {
    request.cancelled = true
    entry.pending.delete(request)
  })
  entry.sessions.splice(0)
  entry.layer?.close()
  return result('closed', name)
}

export function startBusDialogs () {
  if (listening) return
  listening = true
  dialogs.forEach(entry => {
    busDialog.$on(entry.name + '.open', entry.handlers.open)
    busDialog.$on(entry.name + '.close', entry.handlers.close)
  })
}

export function stopBusDialogs () {
  if (!listening) return
  dialogs.forEach(entry => {
    busDialog.$off(entry.name + '.open', entry.handlers.open)
    busDialog.$off(entry.name + '.close', entry.handlers.close)
    closeAllBusDialogs(entry.name)
  })
  listening = false
}

export function getBusDialog (name) {
  return dialogs.get(name)
}

// Concise event API: this.$busDialog.$emit('XxxBusDialog.open', payload).
// Session API: const opened = await this.$busDialog.open('XxxBusDialog', payload).
// Use close(name, id) for one session and closeAll(name) for deliberate teardown.
busDialog.open = openBusDialog
busDialog.close = closeBusDialog
busDialog.closeAll = closeAllBusDialogs
