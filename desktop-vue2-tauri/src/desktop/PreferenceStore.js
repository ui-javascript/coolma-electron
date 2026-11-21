import _ from 'lodash'

// Synchronous compatibility for the existing preference callers. Application
// settings already using DatabaseClient continue to live in SQLite.
export default class PreferenceStore {
  constructor ({ name }) {
    this.path = 'coolma-tauri:' + name
  }

  get store () {
    return JSON.parse(window.localStorage.getItem(this.path) || '{}')
  }

  get (key) { return _.get(this.store, key) }
  has (key) { return _.has(this.store, key) }
  get size () { return Object.keys(this.store).length }

  set (key, value) {
    window.localStorage.setItem(this.path, JSON.stringify(_.set(this.store, key, value)))
  }

  delete (key) {
    const data = this.store
    _.unset(data, key)
    window.localStorage.setItem(this.path, JSON.stringify(data))
  }

  clear () { window.localStorage.removeItem(this.path) }
}
