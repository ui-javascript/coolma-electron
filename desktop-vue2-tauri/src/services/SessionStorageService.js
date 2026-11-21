import ServerFileStorage from '../utils/storage/ServerFileStorage'

const SESSION_KEYS = {
  token: 'token',
  kbGuid: 'kbGuid',
  userId: 'userId',
  displayName: 'displayName',
  kbServer: 'kbServer'
}

function isBrowserStorageAvailable() {
  return typeof localStorage !== 'undefined'
}

function readRaw(key) {
  if (!isBrowserStorageAvailable()) return null
  const value = localStorage.getItem(key)
  return value == null ? null : value
}

function parseValue(value) {
  if (value == null) return null
  try {
    return JSON.parse(value)
  } catch (e) {
    return value
  }
}

function normalizeString(value) {
  if (value == null) return ''
  if (typeof value === 'string') return value
  return String(value)
}

class SessionStorageService {
  getToken() {
    return ServerFileStorage.getValueFromLocalStorage(SESSION_KEYS.token) || ''
  }

  setToken(token) {
    if (!token) {
      this.clearToken()
      return
    }
    ServerFileStorage.saveToLocalStorage(SESSION_KEYS.token, token)
  }

  clearToken() {
    ServerFileStorage.removeItemFromLocalStorage(SESSION_KEYS.token)
  }

  getKbGuid() {
    return normalizeString(parseValue(readRaw(SESSION_KEYS.kbGuid)))
  }

  setKbGuid(kbGuid) {
    if (!isBrowserStorageAvailable()) return
    if (!kbGuid) {
      localStorage.removeItem(SESSION_KEYS.kbGuid)
      return
    }
    localStorage.setItem(SESSION_KEYS.kbGuid, JSON.stringify(kbGuid))
  }

  getUserId() {
    return normalizeString(parseValue(readRaw(SESSION_KEYS.userId)))
  }

  setUserId(userId) {
    if (!isBrowserStorageAvailable()) return
    if (!userId) {
      localStorage.removeItem(SESSION_KEYS.userId)
      return
    }
    localStorage.setItem(SESSION_KEYS.userId, JSON.stringify(userId))
  }

  getDisplayName() {
    return normalizeString(parseValue(readRaw(SESSION_KEYS.displayName)))
  }

  setDisplayName(displayName) {
    if (!isBrowserStorageAvailable()) return
    if (!displayName) {
      localStorage.removeItem(SESSION_KEYS.displayName)
      return
    }
    localStorage.setItem(SESSION_KEYS.displayName, JSON.stringify(displayName))
  }

  getKbServer() {
    return normalizeString(parseValue(readRaw(SESSION_KEYS.kbServer)))
  }

  setKbServer(kbServer) {
    if (!isBrowserStorageAvailable()) return
    if (!kbServer) {
      localStorage.removeItem(SESSION_KEYS.kbServer)
      return
    }
    localStorage.setItem(SESSION_KEYS.kbServer, JSON.stringify(kbServer))
  }

  isLoggedIn() {
    const kbGuid = this.getKbGuid()
    return !!(kbGuid && kbGuid !== 'null')
  }

  getAccountInfo() {
    return {
      kbGuid: this.getKbGuid(),
      email: this.getUserId(),
      displayName: this.getDisplayName(),
      kbServer: this.getKbServer()
    }
  }

  clearSession({ clearToken = true } = {}) {
    if (!isBrowserStorageAvailable()) return
    if (clearToken) {
      this.clearToken()
    }
    localStorage.removeItem(SESSION_KEYS.kbGuid)
    localStorage.removeItem(SESSION_KEYS.userId)
    localStorage.removeItem(SESSION_KEYS.displayName)
    localStorage.removeItem(SESSION_KEYS.kbServer)
  }
}

export default new SessionStorageService()
