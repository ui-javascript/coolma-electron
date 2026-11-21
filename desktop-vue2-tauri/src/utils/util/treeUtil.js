/**
 * 分类 / 标签 树构建工具
 *
 * 从 src/utils/helper.js 抽出 `generateCategoryNodeTree` / `generateTagNodeTree` /
 * `wizIsPredefinedLocation` / `checkCategoryExistence` / `checkTagExistence`。
 * 任何 .vue / .js 中都可以通过 `this.$utils.treeUtil.xxx()` 调用。
 */

import lodash from 'lodash'

/**
 * 是否为知笔记内置分类（/My Notes/、/My Tasks/...）
 * @param {string} strLocation
 */
export function wizIsPredefinedLocation (strLocation) {
  return [
    '/Deleted Items/',
    '/My Notes/',
    '/My Journals/',
    '/My Contacts/',
    '/My Events/',
    '/My Sticky Notes/',
    '/My Emails/',
    '/My Drafts/',
    '/My Tasks/',
    '/My Tasks/Inbox/',
    '/My Tasks/Completed/'
  ].includes(strLocation)
}

/**
 * 生成分类树
 * @param {string[] | string[][]} categories
 * @param {{ [key: string]: number }} [categoriesPos]
 */
export function generateCategoryNodeTree (categories, categoriesPos = {}, t) {
  const result = []
  categories = categories || []
  categories = categories.map(category => {
    return lodash.isString(category)
      ? category.split('/').filter(c => !lodash.isEmpty(c))
      : category
  })
  const rootCategories = categories.filter(c => c.length === 1)
  const leafCategories = categories.filter(c => c.length !== 1)
  let _categories = []
  rootCategories.forEach(rc => {
    _categories.push(rc)
    const children = leafCategories
      .filter(lc => lc[0] === rc[0])
      .sort((a, b) => a.length - b.length)
    _categories = _categories.concat(children)
  })
  categories = _categories
  for (let i = 0; i < categories.length; i++) {
    const category = categories[i]
    if (category.length === 1) {
      result.push({
        label: wizIsPredefinedLocation(`/${category[0]}/`)
          ? (t ? t(`/${category[0]}/`) : `/${category[0]}/`)
          : category[0],
        originLabel: category[0],
        children: [],
        selectable: true,
        key: `/${category[0]}/`
      })
      result.sort((c1, c2) => {
        const pos1 = categoriesPos?.[c1.key]
        const pos2 = categoriesPos?.[c2.key]
        if (pos1 !== undefined && pos2 !== undefined) return pos1 - pos2
        return c1.originLabel.localeCompare(c2.originLabel)
      })
      continue
    }
    const rootNodeIndex = result.findIndex(c => c.originLabel === category[0])
    let rootNode = result[rootNodeIndex]
    const nodeKey = `/${category.join('/')}/`
    let lastNodeLabel = category.shift()
    while (category.length > 0) {
      const children = rootNode.children
      rootNode = children.find(c => c.originLabel === category[0]) || rootNode
      lastNodeLabel = category.shift()
    }
    rootNode.children.push({
      label: wizIsPredefinedLocation(nodeKey)
        ? (t ? t(nodeKey) : nodeKey)
        : lastNodeLabel,
      originLabel: lastNodeLabel,
      children: [],
      selectable: true,
      key: nodeKey
    })
    rootNode.children.sort((c1, c2) => {
      const pos1 = categoriesPos?.[c1.key]
      const pos2 = categoriesPos?.[c2.key]
      if (pos1 !== undefined && pos2 !== undefined) return pos1 - pos2
      return c1.originLabel.localeCompare(c2.originLabel)
    })
  }
  return result
}

/**
 * 生成标签树
 * @param {{ tagGuid: string, name: string, parentTagGuid?: string, pos?: number }[]} tags
 */
export function generateTagNodeTree (tags = []) {
  if (!tags || !tags.length) return []

  let result = []
  const rootTags = tags
    .filter(t => lodash.isEmpty(t.parentTagGuid))
    .sort((tagA, tagB) => tagA.pos - tagB.pos)
  result = result.concat(
    rootTags.map(t => ({
      label: t.name,
      children: [],
      selectable: true,
      key: t.tagGuid
    }))
  )
  const seekLeafTags = rootTag => {
    tags
      .filter(t => t.parentTagGuid === rootTag.key)
      .forEach(t => {
        rootTag.children.push({
          label: t.name,
          children: [],
          selectable: true,
          key: t.tagGuid
        })
      })
    rootTag.children.forEach(t => seekLeafTags(t))
  }
  result.forEach(t => seekLeafTags(t))
  return result
}

/**
 * 检查同名分类是否存在
 * @param {string[]} categories
 * @param {string} parentCategory
 * @param {string} childCategory
 */
export function checkCategoryExistence (categories, parentCategory, childCategory) {
  if (!categories || !Array.isArray(categories)) return false
  parentCategory = lodash.isEmpty(parentCategory) ? '/' : parentCategory
  const absolutePath = `${parentCategory}${childCategory}/`
  return categories.includes(absolutePath)
}

/**
 * 检查同名标签是否存在
 * @param {{ tagGuid: string, name: string }[]} tags
 * @param {string} newTag
 */
export function checkTagExistence (tags, newTag) {
  const tagTree = generateTagNodeTree(tags)
  for (const el of tagTree) {
    if (el.label === newTag) return true
  }
  return false
}