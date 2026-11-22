import { execRequest as request } from 'boot/request'
import { UploadImageToCustomWebService } from 'src/services/imageCustomWebUploadService'
import ServerFileStorage from 'src/utils/storage/ServerFileStorage'
let AccountServerBaseUrl = 'https://as.wiz.cn'
let KnowledgeBaseBaseUrl = 'https://kshttps0.wiz.cn'

function execRequest (method, url, body, token, config, ...options) {
  const wiznote = url.startsWith(AccountServerBaseUrl + '/as/') || url.startsWith(KnowledgeBaseBaseUrl + '/ks/')
  const multipart = typeof FormData === 'function' && body instanceof FormData
  return request(method, url, body, token, { ...config, wiznote, ...(multipart && { multipart: true }) }, ...options)
}

function normalizeAccountServer (url) {
  let parsed
  try { parsed = new URL(url?.trim() || 'https://as.wiz.cn') } catch (_) {}
  if (!parsed || !['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error('请输入有效的为知笔记 HTTP 或 HTTPS 服务地址')
  }
  return parsed.href.replace(/\/+$/, '')
}

const AccountServerApi = {
  getBaseUrl () {
    return AccountServerBaseUrl
  },

  setBaseUrl (url) {
    AccountServerBaseUrl = normalizeAccountServer(url)
  },

  /**
   * 用户登录接口
   * @param params {userId,password}
   * @returns {Promise | Promise<unknown>}
   * @constructor
   */
  async Login ({ userId, password, url }) {
    const server = url === undefined ? this.getBaseUrl() : normalizeAccountServer(url)
    const result = await request(
      'POST',
      `${server}/as/user/login`,
      { userId, password },
      null,
      { skipWizToken: true, wiznote: true }
    )
    if (!result?.token || !result.kbGuid) throw new Error('为知笔记服务器未返回完整的登录信息')
    setKnowledgeBaseFromLogin(server, result)
    AccountServerBaseUrl = server
    return result
  },

  /**
   * 根据token获取用户信息
   * @param params {token}
   * @returns {Promise<unknown>}
   */
  async getUserInfo (params) {
    return await execRequest(
      'POST',
      `${this.getBaseUrl()}/as/user/login/token`,
      params
    )
  },

  /**
   * 获取用户头像
   * @param params {userGuid}
   * @returns {Promise<unknown>}
   */
  async getUserAvatar (params) {
    return await execRequest(
      'GET',
      `${this.getBaseUrl()}/as/user/avatar/${params.userGuid}`
    )
  },

  /**
   * 用户登出
   * @returns {Promise<unknown>}
   * @constructor
   */
  async Logout () {
    return await execRequest('GET', `${this.getBaseUrl()}/as/user/logout`)
  },

  /**
   * 延长token有效期
   * @returns {Promise<unknown>}
   */
  async keepTokenAlive () {
    return await execRequest('GET', `${this.getBaseUrl()}/as/user/keep`)
  }
}

function setKnowledgeBaseFromLogin (baseUrl, result) {
  const account = new URL(baseUrl)
  let advertised
  try { advertised = new URL(result.kbServer || account.href, account.href) } catch (_) {}
  // Use the address entered by the user when a self-hosted server advertises an internal host or port.
  const valid = advertised && !advertised.username && !advertised.password && !advertised.search && !advertised.hash &&
    (advertised.origin === account.origin || (account.origin === 'https://as.wiz.cn' && advertised.protocol === 'https:' &&
      (advertised.hostname === 'wiz.cn' || advertised.hostname.endsWith('.wiz.cn'))))
  result.kbServer = (valid ? advertised.href : account.href).replace(/\/+$/, '')
  KnowledgeBaseBaseUrl = result.kbServer
}

const KnowledgeBaseApi = {
  getBaseUrl () {
    return KnowledgeBaseBaseUrl
  },

  setBaseUrl (url) {
    KnowledgeBaseBaseUrl = url
  },
  /**
   * 根据ServerUrl,kbGuid和docGuid定位一篇笔记
   * @param kbGuid
   * @param docGuid
   * @returns {string}
   */
  getCacheKey (kbGuid, docGuid) {
    return `${this.getBaseUrl().replace(/\./g, '_')}_${kbGuid}_${docGuid}`
  },

  /**
   * 获取用户文件夹
   * @param params {{kbGuid: String}}
   * @returns {Promise<unknown>}
   */
  async getCategories (params) {
    return await execRequest(
      'GET',
      `${this.getBaseUrl()}/ks/category/all/${params.kbGuid}`,
      {},
      null,
      {},
      true
    )
  },

  /**
   * 获取文件夹下的笔记
   * @param params {kbServer,kbGuid,data:{start,count,category,orderBy}}
   * @returns {Promise<unknown>}
   */
  async getCategoryNotes (params) {
    return await execRequest(
      'GET',
      `${this.getBaseUrl()}/ks/note/list/category/${params.kbGuid}`,
      null,
      null,
      { params: params.data }
    )
  },

  /**
   * 获取笔记内容--下载笔记
   * @param params {kbServer,kbGuid,data:{downloadInfo,downloadData}}
   */
  async getNoteContent (params) {
    return await execRequest(
      'GET',
      `${this.getBaseUrl()}/ks/note/download/${params.kbGuid}/${params.docGuid}`,
      null,
      null,
      { params: params.data }
    )
  },

  /**
   * 获取笔记信息
   * @param params
   * @returns {Promise | Promise<unknown>}
   */
  async getNoteInfo (params) {
    return await execRequest(
      'GET',
      `${this.getBaseUrl()}/ks/note/info/${params.kbGuid}/${params.docGuid}?clientType=web&clientVersion=3.0&lang=zh-cn`,
      params.data
    )
  },

  /**
   * 更新修改笔记内容
   * @param params
   * @returns {Promise<unknown>}
   */
  async updateNote (params) {
    return await execRequest(
      'PUT',
      `${this.getBaseUrl()}/ks/note/save/${params.kbGuid}/${params.docGuid}?clientType=web&clientVersion=3.0&lang=zh-cn`,
      params.data
    )
  },

  /**
   * 更新笔记信息
   * @param params
   * @returns {Promise | Promise<unknown>}
   */
  async updateNoteInfo (params) {
    return await execRequest(
      'POST',
      `${this.getBaseUrl()}/ks/note/upload/${params.kbGuid}/${params.docGuid}`,
      params.data
    )
  },

  async copyNote (params) {
    return await execRequest(
      'POST',
      `${this.getBaseUrl()}/ks/note/copy/${params.kbGuid}/${params.docGuid}`,
      params.data
    )
  },

  /**
   * 创建新笔记
   * @param params
   * @returns {Promise | Promise<unknown>}
   */
  async createNote (params) {
    return await execRequest(
      'POST',
      `${this.getBaseUrl()}/ks/note/create/${params.kbGuid}`,
      params.data
    )
  },

  /**
   * 新建文件夹
   * @param params
   * @returns {Promise<unknown>}
   */
  async createCategory (params) {
    return await execRequest(
      'POST',
      `${this.getBaseUrl()}/ks/category/create/${params.kbGuid}?clientType=web&clientVersion=3.0&lang=zh-cn`,
      params.data
    )
  },

  /**
   * 删除笔记
   * @param params
   * @returns {Promise<unknown>}
   */
  async deleteNote (params) {
    return await execRequest(
      'DELETE',
      `${this.getBaseUrl()}/ks/note/delete/${params.kbGuid}/${params.docGuid}`
    )
  },

  /**
   * 删除文件夹
   * @param params
   * @returns {Promise<unknown>}
   */
  async deleteCategory (params) {
    return await execRequest(
      'DELETE',
      `${this.getBaseUrl()}/ks/category/delete/${params.kbGuid}`,
      null,
      null,
      { params: params.data }
    )
  },

  /**
   * 重命名文件夹
   * @param params
   * @returns {Promise | Promise<unknown>}
   */
  async renameCategory (params) {
    return await execRequest(
      'PUT',
      `${this.getBaseUrl()}/ks/category/rename/${params.kbGuid}`,
      params.data
    )
  },
  /**
   * 搜索笔记
   * @returns {Promise<*>}
   * @param {{data:String}} params
   */
  async searchNote (params) {
    return await execRequest(
      'GET',
      `${this.getBaseUrl()}/ks/note/search/${params.kbGuid}`,
      null,
      null,
      { params: params.data }
    )
  },

  /**
   * 上传图片
   * @param params
   * @returns {Promise | Promise<unknown>}
   */
  async uploadImage (params) {
    return await execRequest(
      'POST',
      `${this.getBaseUrl()}/ks/resource/upload/${params.kbGuid}/${params.docGuid}`,
      params.formData,
      params.token ?? null,
      params.config
    )
  },
  async getTagNotes (params) {
    return await execRequest(
      'GET',
      `${this.getBaseUrl()}/ks/note/list/tag/${params.kbGuid}`,
      null,
      null,
      { params: params.data }
    )
  },
  /**
   * 获取全部标签
   * @param params
   * @returns {Promise<*>}
   */
  async getAllTags (params) {
    return await execRequest(
      'GET',
      `${this.getBaseUrl()}/ks/tag/all/${params.kbGuid}`
    )
  },
  /**
   * 获取指定标签下的笔记数量
   * API /ks/note/list/tag/:kbGuid 返回笔记数组，无 count 字段
   * 需要分页获取所有笔记，返回数组长度
   * @param params
   * @returns {Promise<number>}
   */
  async getTagNoteCount (params) {
    let allNotes = []
    let start = 0
    const tagGuid = params.data.tag
    const baseUrl = this.getBaseUrl()
    const token = ServerFileStorage.getValueFromLocalStorage('token')

    for (;;) {
      const queryParams = new URLSearchParams({
        tag: tagGuid,
        start: String(start),
        count: '50',
        withAbstract: 'false',
        orderBy: 'modified',
        ascending: 'desc'
      })
      const url = `${baseUrl}/ks/note/list/tag/${params.kbGuid}?${queryParams.toString()}`

      let rawResponse
      try {
        // 走统一请求通道（tauri 下由 Rust 侧发出），避免在 WebView2 里被 CORS 拦掉
        const data = await execRequest('GET', url, {}, token, {}, true, true)
        if (!data || data.returnCode !== 200) {
          throw new Error(data?.returnMessage || 'request failed')
        }
        rawResponse = data.result
      } catch (err) {
        console.error(`[getTagNoteCount] Error:`, err.message)
        return 0
      }

      if (!rawResponse || !Array.isArray(rawResponse)) {
        break
      }

      if (rawResponse.length === 0) {
        break
      }

      allNotes = allNotes.concat(rawResponse)

      if (rawResponse.length < 50) break

      start += 50
      if (allNotes.length >= 10000) break
    }

    return allNotes.length
  },
  /**
   * 创建标签
   * @param params
   * @returns {Promise<*>}
   */
  async createTag (params) {
    return await execRequest(
      'POST',
      `${this.getBaseUrl()}/ks/tag/create/${params.kbGuid}`,
      params.data
    )
  },
  /**
   * 重命名标签
   * @param params
   * @returns {Promise<*>}
   */
  async renameTag (params) {
    return await execRequest(
      'PUT',
      `${this.getBaseUrl()}/ks/tag/rename/${params.kbGuid}`,
      params.data
    )
  },
  /**
   * 移动笔记
   * @param params
   * @returns {Promise<*>}
   */
  async moveTag (params) {
    return await execRequest(
      'PUT',
      `${this.getBaseUrl()}/ks/tag/move/${params.kbGuid}`,
      params.data
    )
  },
  /**
   * 删除标签
   * @param params
   * @returns {Promise<*>}
   */
  async deleteTag (params) {
    return await execRequest(
      'DELETE',
      `${this.getBaseUrl()}/ks/tag/delete/${params.kbGuid}/${params.tagGuid}`
    )
  }
}

const ThirdPartApi = {
  /**
   * upload image to SMMS image bed
   * @param {File} file
   * @param {{Authorization}} options
   */
  async uploadImageToSMMS (file, { Authorization }) {
    const formData = new FormData()
    formData.append('smfile', file)
    const config = {
      'Content-Type': 'multipart/form-data',
      Authorization: Authorization
    }
    return await execRequest(
      'POST',
      'https://sm.ms/api/upload',
      formData,
      null,
      config,
      true
    )
  },
  async getLatestVersion () {
    return await execRequest(
      'GET',
      // 'https://cdn.jsdelivr.net/gh/TankNee/Neeto-Vue@latest/package.json',
      'https://api.github.com/repos/TankNee/Neeto-Vue/releases/latest',
      null,
      null,
      null,
      true,
      true
    )
  },
  async sendToFlomo (content, url) {
    return await execRequest('POST', url, { content }, null, null, true, true)
  }
}

/**
 * Upload image to image service
 * @param type
 * @param data
 * @param options
 * @constructor
 */
const UploadImageApi = async (type, data, options) => {
  let result = {}
  switch (type) {
    case 'wizOfficialImageUploadService':
      result = await KnowledgeBaseApi.uploadImage(data)
      break
    case 'smmsImageUploadService':
      result = await ThirdPartApi.uploadImageToSMMS(data, options)
      break
    case 'customWebUploadService':
      result = await UploadImageToCustomWebService(options, data, execRequest)
      break
    default:
      break
  }
  return result
}

export default {
  AccountServerApi,
  KnowledgeBaseApi,
  ThirdPartApi,
  UploadImageApi
}
