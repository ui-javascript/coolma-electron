import cloud, { CloudFnError } from 'src/services/cloud/CloudFunctionProvider'

const URL = 'admin/vkfiles/pub/listFiles'

/**
 * vkfiles 返回结果归一化为前端可消费的 NavCard。
 *
 * 后端字段约定不稳：兼容以下几种命名：
 *   image: img / image / icon / cover
 *   targetUrl: url / link / href
 *   title: name / label
 *   desc: summary / description
 */
function normalizeItem (raw) {
  if (!raw || typeof raw !== 'object') return null
  const pickFirst = (...keys) => {
    for (const k of keys) {
      const v = raw[k]
      if (v !== undefined && v !== null && String(v).trim() !== '') return v
    }
    return ''
  }
  const id = pickFirst('id', '_id', 'fileID', 'file_id', 'docId') || `${pickFirst('title', 'name') || 'nav'}-${Math.random().toString(36).slice(2, 8)}`
  const title = pickFirst('title', 'name', 'label')
  const desc = pickFirst('desc', 'summary', 'description', 'brief')
  const imageUrl = pickFirst('imageUrl', 'img', 'image', 'icon', 'cover', 'thumbnail')
  const targetUrl = pickFirst('targetUrl', 'url', 'link', 'href')
  const categoryNo = pickFirst('categoryNo', 'category')
  const createdAt = pickFirst('createdAt', 'created_at', 'createTime')
  return {
    id: String(id),
    title: String(title),
    desc: String(desc),
    imageUrl: String(imageUrl),
    targetUrl: String(targetUrl),
    categoryNo: categoryNo ? String(categoryNo) : '',
    createdAt: createdAt ? String(createdAt) : ''
  }
}

function extractList (result) {
  if (!result) return []
  if (Array.isArray(result)) return result
  if (Array.isArray(result.data)) return result.data
  if (Array.isArray(result.rows)) return result.rows
  if (Array.isArray(result.list)) return result.list
  if (Array.isArray(result.records)) return result.records
  return []
}

/**
 * 列出导航卡片。
 * @param {Object} [opts]
 * @param {String} [opts.categoryNo]
 * @param {String} [opts.title]
 * @returns {Promise<Array<NormalizedNavCard>>}
 */
export async function listFiles (opts = {}) {
  const data = {
    categoryNo: opts.categoryNo || '',
    title: opts.title || ''
  }
  const result = await cloud.invoke(URL, data)
  const list = extractList(result)
  return list
    .map(normalizeItem)
    .filter(item => item && (item.imageUrl || item.targetUrl || item.title))
}

export const __testing = { normalizeItem, extractList }

export default {
  listFiles,
  CloudFnError
}