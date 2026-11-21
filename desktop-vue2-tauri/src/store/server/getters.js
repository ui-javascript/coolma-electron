import api from 'src/utils/api'
import _ from 'lodash'
import helper from 'src/utils/helper'
import ServerFileStorage from 'src/utils/storage/ServerFileStorage'
import { DEFAULT_NOTE_ORDER_TYPE } from 'src/utils/enum'

export default {
  avatarUrl: ({ userGuid }) => {
    return userGuid ? `${api.AccountServerApi.getBaseUrl()}/as/user/avatar/${userGuid}` : null
  },
  imageUrl: ({
    kbGuid,
    currentNote: { info: { docGuid } }
  }) => (url, imageUploadService) => {
    let img = ''
    switch (imageUploadService) {
      case 'wizOfficialImageUploadService':
        img = url.url
        // img = docGuid ? `${api.KnowledgeBaseApi.getBaseUrl()}/ks/note/view/${kbGuid}/${docGuid}/${url.url}` : url
        break
      case 'smmsImageUploadService':
      case 'customWebUploadService':
        img = url
        break
      default:
        break
    }
    return img
  },
  currentNotes: ({ currentNotes }, getters, rootState) => {
    const _currentNotes = _.cloneDeep(currentNotes)
    if (_.isArray(_currentNotes)) {
      const filteredNotes = _currentNotes.map((note) => {
        if (_.endsWith(note.title, '.md')) {
          note.abstractText = helper.removeMarkdownTag(note.abstractText)
        }
        return note
      }).filter(note => {
        if (rootState.client.markdownOnly) {
          return _.endsWith(note.title, '.md')
        }
        return true
      })

      // 视图层去重：同标题（trim 后）只保留最新创建的那一条（dataCreated 最大者）。
      // 不动数据库、不动新建逻辑；纯 getter 内合并展示。
      const dedupedNotes = (() => {
        const buckets = new Map()
        for (const note of filteredNotes) {
          const key = (note.title || '').toString().trim()
          if (!key) {
            // 标题缺失的笔记不参与按标题去重，单独保留
            buckets.set(`__no_title__:${note.docGuid || _.uniqueId('nt_')}`, note)
            continue
          }
          const existing = buckets.get(key)
          if (!existing) {
            buckets.set(key, note)
            continue
          }
          const existingTs = Number(existing.dataCreated) || 0
          const candidateTs = Number(note.dataCreated) || 0
          if (candidateTs > existingTs) buckets.set(key, note)
        }
        return Array.from(buckets.values())
      })()

      const orderType = rootState.client.noteOrderType || DEFAULT_NOTE_ORDER_TYPE
      const compareStrings = (v1 = '', v2 = '') => v1.localeCompare(v2, 'zh-Hans-CN', { sensitivity: 'base', numeric: true })
      const compareNumbers = (v1 = 0, v2 = 0) => (v1 || 0) - (v2 || 0)
      const comparators = {
        orderByNoteTitleAsc: (n1, n2) => compareStrings(n1.title, n2.title),
        orderByNoteTitleDesc: (n1, n2) => compareStrings(n2.title, n1.title),
        orderByCreatedTimeAsc: (n1, n2) => compareNumbers(n1.dataCreated, n2.dataCreated),
        orderByCreatedTimeDesc: (n1, n2) => compareNumbers(n2.dataCreated, n1.dataCreated),
        orderByModifiedTimeAsc: (n1, n2) => compareNumbers(n1.dataModified, n2.dataModified),
        orderByModifiedTimeDesc: (n1, n2) => compareNumbers(n2.dataModified, n1.dataModified)
      }

      return dedupedNotes.sort(comparators[orderType] || comparators[DEFAULT_NOTE_ORDER_TYPE])
    }
    return []
  },
  currentNote: ({ currentNote }) => {
    // ✅ 防御：如果 currentNote 为空/null/undefined
    if (helper.isNullOrEmpty(currentNote) || Object.keys(currentNote).length === 0) {
      console.log('[currentNote getter] EMPTY: currentNote is', currentNote)
      return ''  // 返回空字符串
    }

    console.log(`[currentNote getter] ⚡ FIRED! keys: ${Object.keys(currentNote)}, _isRawMarkdown: ${currentNote._isRawMarkdown}, title: ${currentNote.info?.title}, timestamp: ${currentNote._loadTimestamp}`)

    // 本地 SQLite 来的原始 markdown，直接返回不做任何处理
    if (currentNote._isRawMarkdown) {
      const raw = currentNote.html || ''
      
      // 防御：如果 html 是整个 API 响应对象而不是 markdown，返回空字符串
      if (typeof raw === 'object' || (typeof raw === 'string' && raw.trim().startsWith('{'))) {
        console.warn('[currentNote getter] REJECTED: malformed content')
        return ''
      }
      
      console.log(`[currentNote getter] ✅ RETURNING _isRawMarkdown, len: ${raw.length}, preview: ${JSON.stringify(raw.substring(0, 100))}`)
      
      // ✅ 关键改进：即使内容为空字符串，也确保触发 watcher
      // 通过拼接时间戳确保每次都是新值（Vue 会检测到变化）
      if (currentNote._loadTimestamp) {
        // 返回特殊格式：内容 + 分隔符 + 时间戳
        // Muya watcher 会解析这个格式并提取真实内容
        return { 
          __markdown: raw, 
          __timestamp: currentNote._loadTimestamp,
          __docGuid: currentNote.info?.docGuid,
          isEmpty: !raw || raw.length === 0
        }
      }
      
      return raw
    }

    if (helper.isNullOrEmpty(currentNote.info?.title)) {
      return ''
    }
    const isHtml = !_.endsWith(currentNote.info.title, '.md')

    const {
      html,
      info: {
        docGuid,
        kbGuid
      },
      resources
    } = currentNote
    let result = ''
    if (isHtml) {
      result = helper.convertHtml2Markdown(currentNote.html, kbGuid, docGuid, resources)
    } else {
      result = helper.extractMarkdownFromMDNote(html, kbGuid, docGuid, resources)
    }

    return helper.isNullOrEmpty(result) ? `# ${currentNote.info.title}` : result
  },
  currentNoteInfo: ({ currentNote }) => {
    return currentNote.info
  },
  currentNoteResources: ({ currentNote }) => {
    const { resources } = currentNote
    return resources
  },
  currentNoteResourceUrl: ({ currentNote }) => {
    const {
      info: {
        docGuid,
        kbGuid
      }
    } = currentNote
    return `${api.KnowledgeBaseApi.getBaseUrl()}/${kbGuid}/${docGuid}`
  },
  categories: ({ categories, categoriesPos }) => {
    if (!categories || categories.length === 0) return []
    // 如果已经是树节点格式（有 key 属性），直接返回
    if (categories[0] && categories[0].key !== undefined) {
      return categories
    }
    return helper.generateCategoryNodeTree(categories, categoriesPos)
  },
  tags: ({ tags }) => {
    return helper.generateTagNodeTree(tags)
  },
  activeNote: ({ currentNote }) => ({ docGuid }) => {
    return currentNote && currentNote.info && currentNote.info.docGuid === docGuid
  },
  uploadImageUrl: ({
    uploadImageUrl,
    kbGuid,
    currentNote
  }) => {
    if (!helper.isNullOrEmpty(uploadImageUrl) || helper.isNullOrEmpty(currentNote.info)) return uploadImageUrl
    const { info: { docGuid } } = currentNote
    return `${api.KnowledgeBaseApi.getBaseUrl()}/ks/resource/upload/${kbGuid}/${docGuid}`
  },
  wizNoteToken: () => {
    return ServerFileStorage.getValueFromLocalStorage('token')
  },
  tagsOfCurrentNote: ({
    currentNote,
    tags
  }) => {
    if (helper.isNullOrEmpty(currentNote?.info?.tags)) return []
    const tagGuids = currentNote.info.tags.split('*')
    return tags.filter(t => tagGuids.includes(t.tagGuid))
  }
}
