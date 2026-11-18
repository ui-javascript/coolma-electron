import types from 'src/store/server/types'
import helper from 'src/utils/helper'
import api from 'src/utils/api'
import SessionStorageService from 'src/services/SessionStorageService'
import ClientFileStorage from 'src/utils/storage/ClientFileStorage'

export default {
  [types.INIT] (state, payload) {
    for (const key in state) {
      if (!helper.isNullOrEmpty(payload[key])) {
        state[key] = payload[key]
      }
    }
    return state
  },
  [types.LOGIN] (state, payload) {
    // replace the old state
    const { kbGuid, kbServer, lang, email, displayName, userGuid, token, isLogin } = payload
    if (!helper.isNullOrEmpty(kbServer)) {
      api.KnowledgeBaseApi.setBaseUrl(kbServer)
      SessionStorageService.setKbServer(kbServer)
    }
    if (!helper.isNullOrEmpty(token)) {
      SessionStorageService.setToken(token)
    }
    if (!helper.isNullOrEmpty(kbGuid)) {
      SessionStorageService.setKbGuid(kbGuid)
    }
    if (!helper.isNullOrEmpty(email)) {
      SessionStorageService.setUserId(email)
    }
    if (!helper.isNullOrEmpty(displayName)) {
      SessionStorageService.setDisplayName(displayName)
    }
    const data = { kbGuid, kbServer, lang, email, displayName, userGuid, isLogin }
    Object.assign(state, data)
    // state.currentNote = {}
    return state
  },
  [types.LOGOUT] (state) {
    // 保留 categories（目录树）和 currentCategory（当前目录）不变
    // 它们在退出登录时仍然有效，基于本地 SQLite 数据
    const preservedCategories = state.categories
    const preservedCurrentCategory = state.currentCategory
    for (const key in state) {
      if (key === 'currentNote') {
        state[key] = {}
      } else {
        state[key] = null
      }
    }
    state.isLogin = false
    state.noteState = 'default'
    state.categories = preservedCategories
    state.currentCategory = preservedCurrentCategory
    return state
  },
  [types.UPDATE_CURRENT_NOTES] (state, payload) {
    state.currentNotes = payload
    return state
  },
  [types.UPDATE_CURRENT_NOTE] (state, payload) {
    // 使用 _isRawMarkdown 标记判断是否是本地原始 markdown
    // 不能用 if (payload.html) 判断，因为空字符串 '' 也是 falsy
    if (payload._isRawMarkdown) {
      state.currentNote = payload
    } else if (payload.html != null) {
      // 云端返回的完整笔记对象
      state.currentNote = payload
    } else {
      // 只更新 info 字段（兼容只有 info 的调用）
      if (!state.currentNote) {
        state.currentNote = {}
      }
      const { currentNote } = state
      currentNote.info = payload
      state.currentNote = currentNote
    }
    state.noteState = 'default'
    return state
  },
  [types.UPDATE_CURRENT_NOTE_RESOURCE] (state, newResource) {
    if (state.currentNote && state.currentNote.resources) {
      if (Array.isArray(newResource)) {
        newResource.forEach(nr => state.currentNote.resources.push({ name: nr.name }))
      } else {
        state.currentNote.resources.push({ name: newResource.name })
      }
    }
  },
  [types.SAVE_TO_LOCAL_STORE_SYNC] (state, [key, value]) {
    ClientFileStorage.setItemInStore(key, value)
    return state
  },
  [types.UPDATE_ALL_CATEGORIES] (state, payload) {
    state.allCategories = payload
    return state
  },
  [types.UPDATE_CATEGORIES_POS] (state, payload) {
    state.categoriesPos = payload
    return state
  },
  [types.UPDATE_CURRENT_CATEGORY] (state, category) {
    state.currentCategory = category
    return state
  },
  [types.UPDATE_CURRENT_NOTE_LOADING_STATE] (state, loadingState) {
    state.isCurrentNoteLoading = loadingState
    return state
  },
  [types.UPDATE_CURRENT_NOTES_LOADING_STATE] (state, loadingState) {
    state.isCurrentNotesLoading = loadingState
    return state
  },
  [types.CLEAR_CURRENT_NOTE] (state) {
    state.currentNote = {}
    return state
  },
  [types.UPDATE_CONTENTS_LIST] (state, list) {
    state.contentsList = list
    return state
  },
  [types.UPDATE_NOTE_STATE] (state, noteState) {
    state.noteState = noteState
    return state
  },
  [types.UPDATE_ALL_TAGS] (state, tags) {
    state.tags = tags
    return state
  },
  [types.UPDATE_TAG_NOTES_COUNT] (state, countMap) {
    state.tagNotesCount = countMap
    return state
  },
  [types.UPDATE_CURRENT_NOTE_TAGS] (state, tags) {
    if (state.currentNote && state.currentNote.info) {
      state.currentNote.info.tags = tags
    }
    return state
  },
  [types.SET_CALENDAR_NOTE_DATES] (state, dates) {
    state.calendarNoteDates = dates
    return state
  },
  [types.SET_CATEGORIES] (state, categories) {
    state.categories = categories
    return state
  }
}
