<!--
  CategoryPicker - 分类下钻 + 模板二级选择器（heyui v1 categoryPicker 复刻）

  设计灵感：heyui v1.26.1 src/components/category-picker/categorypicker.vue

  本组件复刻的核心机制：
   1. 标签 (tabs) + 当前层级列表（list）两段式布局
   2. categoryObj O(1) 索引 + parentKey 链（路径回溯无需线性扫描）
   3. selectable / checkable 双权限（单选 / 多选行为独立控制）
   4. getDatas(parent, success, error) 异步加载，按需下钻
   5. dataMode='list' 把扁平列表自动生成树
   6. showAllLevels + 自定义 separator 决定触发器显示文本
   7. v-model + @change 完全兼容
   8. 多选模式 tag 列表 + 关闭图标 / 单选模式显示文本 + 清空图标

  外部接口（保持与原组件完全兼容）：
    value           v-model 绑定的当前值
    type            'key' | 'object'，与 v-model 双向同步
    option          { datas, fieldNames, selectable, checkable, getDatas, dataMode, ... }
    showAllLevels   是否显示完整路径
    showChildCount  是否显示子节点数量
    placeholder     触发器占位文案
    separator       路径分隔符，默认 ' / '
    rootLabel       根节点标签
    disabled        是否禁用
    multiple        是否多选
    limit           多选上限
-->
<template>
  <div class='category-picker'>
    <el-popover
      ref='popover'
      v-model='popoverVisible'
      placement='bottom-start'
      :width='popoverWidth'
      trigger='manual'
      popper-class='category-picker-popover'
      :disabled='disabled'
      :append-to-body='true'
      @hide='onPopoverHide'
    >
      <div class='category-picker-panel'>
        <!-- 面包屑标签：横向 tab + 返回上级 + 根标签 -->
        <div class='category-picker-tabs'>
          <span
            class='category-picker-tab is-root'
            :class='{ "is-active": tabIndex < 0 }'
            @click='focusTab(null)'
          >
            <i v-if='tabIndex >= 0' class='el-icon-arrow-left category-picker-tab-back' />
            {{ rootLabel }}
          </span>
          <template v-if='tabs.length > 0'>
            <span
              v-for='(c, idx) in tabs'
              :key='c.key'
              class='category-picker-tab'
              :class='{ "is-active": tabIndex === idx }'
              @click='focusTab(c, idx)'
            >
              <span class='category-picker-tab-sep'>{{ separator }}</span>
              <span class='category-picker-tab-title'>{{ c.title }}</span>
            </span>
          </template>
        </div>

        <!-- 当前层级列表 -->
        <div class='category-picker-list'>
          <div
            v-for='data in currentLevelList'
            :key='data.key'
            class='category-picker-row'
            :class='{
              "is-category": isCategory(data),
              "is-selectable": isSelectable(data),
              "is-checkable": isCheckable(data),
              "is-selected": isChecked(data),
              "is-loading": data.status && data.status.loading
            }'
            @click='onRowClick(data, $event)'
          >
            <!-- 多选时的复选框（仅 checkable 的行显示） -->
            <el-checkbox
              v-if='multiple && isCheckable(data)'
              :value='isChecked(data)'
              class='category-picker-row-checkbox'
              @click.native.stop='onCheck(data, $event)'
            />
            <span class='category-picker-row-title'>{{ data.title }}</span>
            <span v-if='showChildCount && data.children && data.children.length' class='category-picker-row-count'>
              {{ data.children.length }}
            </span>
            <i v-if='data.status && data.status.loading' class='el-icon-loading category-picker-row-loading' />
            <i v-else-if='isCategory(data)' class='el-icon-arrow-right category-picker-row-arrow' />
          </div>
          <div v-if='currentLevelList.length === 0' class='category-picker-empty'>
            <span v-if='globalloading'>加载中…</span>
            <span v-else>暂无内容</span>
          </div>
        </div>
      </div>

      <div
        slot='reference'
        class='category-picker-trigger'
        :class='{ "is-empty": !displayLabel, "is-open": popoverVisible, "is-multiple": multiple }'
        @click='onTriggerClick'
      >
        <!-- 多选：tag 列表 + 关闭图标 + 占位 -->
        <template v-if='multiple'>
          <template v-if='selectedObjects.length > 0'>
            <div class='category-picker-tags'>
              <span
                v-for='obj in selectedObjects'
                :key='obj.key'
                class='category-picker-tag'
              >
                <span class='category-picker-tag-text'>{{ getShowText(obj) }}</span>
                <i
                  v-if='!disabled'
                  class='el-icon-close category-picker-tag-close'
                  @click.stop='removeObject(obj)'
                />
              </span>
            </div>
          </template>
          <span v-else class='category-picker-trigger-placeholder'>{{ placeholder }}</span>
        </template>
        <!-- 单选：value + 关闭图标 / 占位 -->
        <template v-else>
          <span v-if='selectedObject' class='category-picker-trigger-label'>{{ getShowText(selectedObject) }}</span>
          <span v-else class='category-picker-trigger-placeholder'>{{ placeholder }}</span>
          <i
            v-if='selectedObject && !disabled'
            class='el-icon-close category-picker-trigger-clear'
            @click.stop='clearSelection'
          />
        </template>
        <i class='el-icon-arrow-down category-picker-trigger-icon' />
      </div>
    </el-popover>
  </div>
</template>

<script>
const DEFAULT_FIELD_NAMES = {
  key: 'key',
  title: 'title',
  children: 'children',
  parent: 'parent'
}

const ROOT_TAB_KEY = '-------'

export default {
  name: 'CategoryPicker',
  model: {
    prop: 'value',
    event: 'change'
  },
  props: {
    value: {
      type: [String, Number, Array, Object],
      default: null
    },
    type: {
      type: String,
      default: 'key',
      validator: v => ['key', 'object'].indexOf(v) !== -1
    },
    option: {
      type: Object,
      default: () => ({})
    },
    showAllLevels: {
      type: Boolean,
      default: false
    },
    showChildCount: {
      type: Boolean,
      default: false
    },
    multiple: {
      type: Boolean,
      default: false
    },
    limit: {
      type: Number,
      default: 0
    },
    placeholder: {
      type: String,
      default: '点击选择'
    },
    rootLabel: {
      type: String,
      default: '全部'
    },
    separator: {
      type: String,
      default: ' / '
    },
    disabled: {
      type: Boolean,
      default: false
    },
    popoverWidth: {
      type: [Number, String],
      default: 280
    }
  },
  data () {
    return {
      popoverVisible: false,
      globalloading: false,
      categoryDatas: [],     // 规范化后的整棵树（带 status / parentKey / children）
      categoryObj: {},       // O(1) 索引: { [key]: node }
      objects: [],           // 多选已选项（规范化后的 node）
      object: null,          // 单选已选项
      tabs: [],              // 当前面包屑栈: [{ key, title }]
      tabIndex: -1,          // -1 表示根目录
      valueBak: null
    }
  },
  computed: {
    fieldNames () {
      return Object.assign({}, DEFAULT_FIELD_NAMES, this.option.fieldNames || {})
    },
    /**
     * 当前层级应展示的列表：
     *   - tabIndex < 0 时展示根目录（categoryDatas）
     *   - tabIndex >= 0 时展示 tabs[tabIndex].children
     * 与 heyui 的 `this.list` 一致。
     */
    currentLevelList () {
      if (this.tabIndex < 0) return this.categoryDatas
      const cur = this.tabs[this.tabIndex]
      if (!cur) return []
      // 通过 categoryObj 反查节点再读 children，保证树结构始终一致
      const node = this.categoryObj[cur.key]
      return (node && node.children) || []
    },
    /**
     * 多选：规范化的对象数组（仅包含 normalize 后的节点）
     * 单选：单个节点
     */
    selectedObjects () {
      return this.multiple ? this.objects : []
    },
    selectedObject () {
      return this.multiple ? null : this.object
    },
    displayLabel () {
      if (this.multiple) {
        return this.selectedObjects.length > 0
      }
      return !!this.selectedObject
    }
  },
  watch: {
    disabled (val) {
      if (val) this.popoverVisible = false
    },
    'option.datas': {
      immediate: false,
      handler () {
        this.initCategoryDatas()
      }
    },
    value: {
      immediate: false,
      handler (val) {
        if (this.valueBak !== val) {
          this.parseValue()
        }
      }
    }
  },
  mounted () {
    this.parseValue()
    this.initCategoryDatas()
    document.addEventListener('mousedown', this._handleDocumentMouseDown, true)
  },
  beforeDestroy () {
    document.removeEventListener('mousedown', this._handleDocumentMouseDown, true)
  },
  methods: {
    /**
     * ============ 核心：数据规范化（仿 heyui initTreeModeData）============
     * 把用户传入的 datas 树（支持 dataMode='list' 自动生成树）
     * 转换为带 status / parentKey / children 的内部表示。
     */
    initCategoryDatas () {
      const param = this.option
      let raw = []
      // 1. 加载数据（支持同步数组 / 同步函数 / 异步 getTotalDatas）
      if (Array.isArray(param.datas)) {
        raw = param.datas
      } else if (typeof param.datas === 'function') {
        raw = param.datas.call(param) || []
      } else if (typeof param.getTotalDatas === 'function') {
        this.globalloading = true
        param.getTotalDatas(
          result => {
            this.globalloading = false
            this._afterLoaded(this._generateTreeIfNeeded(result || []))
            this.$emit('load-data-success', result)
          },
          () => { this.globalloading = false }
        )
        return
      }
      this._afterLoaded(this._generateTreeIfNeeded(raw))
    },
    _generateTreeIfNeeded (datas) {
      if (this.option.dataMode === 'list' && datas.length > 0) {
        return this._generateTree(datas)
      }
      return datas
    },
    /**
     * 把扁平列表 [{ id, parent, ... }] 按 parent 关联生成树。
     * 仿 heyui utils.generateTree。
     */
    _generateTree (flatList) {
      const keyName = this.fieldNames.key
      const parentName = this.fieldNames.parent
      const map = new Map()
      const roots = []
      for (const item of flatList) {
        const k = item[keyName]
        if (k == null) continue
        map.set(k, { ...item, [this.fieldNames.children]: [] })
      }
      for (const item of flatList) {
        const k = item[keyName]
        const node = map.get(k)
        if (!node) continue
        const parentKey = item[parentName]
        if (parentKey == null || !map.has(parentKey)) {
          roots.push(node)
        } else {
          map.get(parentKey)[this.fieldNames.children].push(node)
        }
      }
      return roots
    },
    _afterLoaded (datas) {
      this.categoryObj = {}
      this.categoryDatas = this._buildTree(datas, null, false, 0)
      try {
        const total = this.categoryDatas.reduce((s, n) => s + (n.children ? n.children.length : 0), 0)
        console.log(`[RUNE-TPL] CategoryPicker._afterLoaded roots=${this.categoryDatas.length} total-leaves=${total} first-root=${this.categoryDatas[0] && this.categoryDatas[0].title}`)
      } catch (_) { /* noop */ }
      this.parseValue()
    },
    /**
     * 递归规范化：
     *   每个节点 = { key, title, value, parentKey, status, children }
     *   status.selectable / status.checkable 来自 option 的回调
     */
    _buildTree (list, parentKey, isWait, level) {
      const arr = []
      const keyName = this.fieldNames.key
      const titleName = this.fieldNames.title
      const childrenName = this.fieldNames.children
      const opt = this.option || {}
      for (const data of (list || [])) {
        const k = data[keyName]
        const t = data[titleName]
        const children = data[childrenName] || []
        // 先构造不含 status 的 node，再算 status，selectable/checkable 回调收到的就是规范化节点（含 .value 指向原数据）
        const node = {
          key: k,
          title: t,
          value: data,
          parentKey,
          status: null,
          children: this._buildTree(children, k, isWait, level + 1)
        }
        node.status = {
          level,
          loading: false,
          isWait: isWait || typeof opt.getDatas === 'function',
          opened: false,
          selected: false,
          selectable: typeof opt.selectable === 'function' ? !!opt.selectable(node, level) : (data.selectable !== false),
          checkable: typeof opt.checkable === 'function' ? !!opt.checkable(node, level) : (data.checkable !== false)
        }
        if (k != null) this.categoryObj[k] = node
        arr.push(node)
      }
      return arr
    },
    /**
     * ============ 路径与父链（仿 heyui getParent / getParentTitle）============
     */
    getParentChain (node) {
      const chain = [node]
      let cur = node
      while (cur && cur.parentKey != null && this.categoryObj[cur.parentKey]) {
        cur = this.categoryObj[cur.parentKey]
        chain.push(cur)
      }
      return chain
    },
    getParentTitleChain (node) {
      return this.getParentChain(node).map(n => n.title)
    },
    getShowText (node) {
      if (!node) return ''
      if (this.showAllLevels) {
        const titles = this.getParentTitleChain(node)
        return titles.reverse().join(this.separator)
      }
      return node.title
    },
    /**
     * ============ v-model 解析 / 派发（仿 heyui parse / dispose）============
     */
    parseValue () {
      if (this.multiple) {
        const list = []
        if (Array.isArray(this.value)) {
          for (const v of this.value) {
            const found = this._resolveValueToNode(v)
            if (found) list.push(found)
          }
        }
        this.objects = list
        this.object = null
      } else {
        this.object = this._resolveValueToNode(this.value)
        this.objects = []
      }
    },
    _resolveValueToNode (val) {
      if (val == null || val === '') return null
      if (this.type === 'key') {
        return this.categoryObj[val] || null
      }
      // type === 'object'：val 是原数据对象，按 keyName 查找
      const keyName = this.fieldNames.key
      const k = val && val[keyName]
      if (k == null) return null
      return this.categoryObj[k] || null
    },
    /**
     * 把内部 objects/object 转换为外部 v-model 所需的形态
     */
    disposeValue () {
      if (this.multiple) {
        return this.objects.map(o => this.type === 'key' ? o.key : this._stripChildren(o.value))
      }
      if (this.object) {
        return this.type === 'key' ? this.object.key : this._stripChildren(this.object.value)
      }
      return null
    },
    _stripChildren (raw) {
      if (!raw || typeof raw !== 'object') return raw
      const obj = { ...raw }
      delete obj[this.fieldNames.children]
      return obj
    },
    emitChange () {
      const v = this.disposeValue()
      this.$emit('change', v, this.multiple ? this.objects.slice() : this.object)
      this.$emit('input', v)
      this.valueBak = v
      this.popoverVisible = this._shouldKeepOpenAfterPick()
      if (!this.popoverVisible) this.closePopover()
    },
    /**
     * 选中后是否保持弹层打开：
     *   - 单选 + 选中节点仍有 children（分类节点）：保持打开（heyui 语义：半选）
     *   - 单选 + 选中 leaf：关闭
     *   - 多选：保持打开
     */
    _shouldKeepOpenAfterPick () {
      if (this.multiple) return true
      return !!(this.object && this.object.children && this.object.children.length)
    },
    /**
     * ============ 选中 / 多选 / 清空（仿 heyui change / remove / clear）============
     */
    isCategory (node) {
      // category：要么显式标记，要么有子节点
      if (!node) return false
      if (node.value && node.value._isCategory === true) return true
      return Array.isArray(node.children) && node.children.length > 0
    },
    isSelectable (node) {
      return !!(node && node.status && node.status.selectable)
    },
    isCheckable (node) {
      return !!(node && node.status && node.status.checkable)
    },
    isChecked (node) {
      if (!node) return false
      if (this.multiple) {
        return this.objects.some(o => o.key === node.key)
      }
      return !!(this.object && this.object.key === node.key)
    },
    /**
     * 行点击：分类节点 → 下钻；叶子节点 → 选中
     */
    onRowClick (node, evt) {
      if (!node) return
      // 异步加载中的节点忽略
      if (node.status && node.status.loading) return
      if (this.isCategory(node)) {
        // 走下钻路径
        this.openNew(node, evt)
        return
      }
      // 叶子：多选切换 / 单选选中
      this.change(node, evt)
    },
    /**
     * 多选复选框：直接切换选中态（即使节点是分类也允许 check）
     */
    onCheck (node, evt) {
      if (evt) {
        evt.preventDefault()
        evt.stopPropagation()
      }
      this.change(node, evt)
    },
    /**
     * 仿 heyui openNew：下钻 / 异步加载 / 选中
     */
    openNew (node, evt) {
      if (evt) {
        evt.stopPropagation()
        evt.preventDefault()
      }
      // 已有 children：直接下钻
      if (node.children && node.children.length) {
        this.tabIndex = this.tabs.length
        this.tabs.push({ key: node.key, title: node.title })
        // 单选时同步"半选"状态（heyui 行为：单选即选中当前下钻节点）
        if (!this.multiple) {
          this.change(node, evt)
        }
        return
      }
      // 异步加载子节点
      if (node.status && node.status.isWait && typeof this.option.getDatas === 'function') {
        node.status.loading = true
        this.option.getDatas(
          node.value,
          result => {
            node.children = this._buildTree(result || [], node.key, true, (node.status.level || 0) + 1)
            node.status.isWait = false
            node.status.loading = false
            node.status.opened = true
            // 加载完成后下钻
            this.tabIndex = this.tabs.length
            this.tabs.push({ key: node.key, title: node.title })
          },
          () => { node.status.loading = false }
        )
        return
      }
      // 无 children 又是叶子：change 选中
      this.change(node, evt)
    },
    /**
     * 仿 heyui change：根据单选 / 多选规则更新选中态
     */
    change (node, evt) {
      if (evt) {
        evt.stopPropagation()
        evt.preventDefault()
      }
      if (!node) return
      if (!this.multiple && !this.isSelectable(node)) return
      if (this.multiple && !this.isCheckable(node)) return

      if (this.multiple) {
        // 多选：limit 校验
        if (this.limit > 0 && this.objects.length >= this.limit && !this.objects.some(o => o.key === node.key)) {
          this.$emit('limit-reached', { limit: this.limit })
          return
        }
        const idx = this.objects.findIndex(o => o.key === node.key)
        if (idx >= 0) {
          this.objects.splice(idx, 1)
        } else {
          this.objects.push(node)
        }
      } else {
        this.object = node
      }
      this.emitChange()
    },
    removeObject (obj) {
      if (!this.multiple) return
      const idx = this.objects.findIndex(o => o.key === obj.key)
      if (idx >= 0) {
        this.objects.splice(idx, 1)
        this.emitChange()
      }
    },
    clearSelection () {
      if (this.disabled) return
      this.object = null
      this.emitChange()
    },
    /**
     * ============ Tab 切换（仿 heyui focusTab）============
     */
    focusTab (tab, idx) {
      if (idx == null) {
        this.tabIndex = -1
        this.tabs = []
        return
      }
      this.tabIndex = idx
      this.tabs = this.tabs.slice(0, idx + 1)
    },
    /**
     * ============ 弹层显隐与外部点击关闭（保持原实现）============
     */
    onTriggerClick () {
      if (this.disabled) return
      this.popoverVisible = !this.popoverVisible
    },
    onPopoverHide () {
      this.popoverVisible = false
    },
    _handleDocumentMouseDown (e) {
      if (!this.popoverVisible) return
      const ref = this.$refs.popover
      if (!ref) return
      const popperEl = ref.popperElm || (ref.$refs && ref.$refs.popper)
      const triggerEl = ref.referenceElm || (ref.$refs && ref.$refs.reference)
      const target = e.target
      if (popperEl && popperEl.contains(target)) return
      if (triggerEl && triggerEl.contains(target)) return
      this.popoverVisible = false
    },
    closePopover () {
      this.popoverVisible = false
      try {
        if (this.$refs.popover && typeof this.$refs.popover.doClose === 'function') {
          this.$refs.popover.doClose()
        }
      } catch (_) { /* noop */ }
    }
  }
}
</script>

<style lang="scss" scoped>
.category-picker {
  display: inline-block;
  width: 100%;
}

.category-picker-trigger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  min-height: 32px;
  padding: 4px 10px;
  font-size: 12px;
  color: rgba(0, 0, 0, 0.85);
  background: #fff;
  border: 1px solid #d9d9d9;
  border-radius: 4px;
  cursor: pointer;
  user-select: none;
  transition: border-color 0.15s, box-shadow 0.15s;
  box-sizing: border-box;
}

.category-picker-trigger:hover {
  border-color: #7E57C2;
}

.category-picker-trigger.is-empty .category-picker-trigger-placeholder {
  color: #c0c4cc;
}

.category-picker-trigger-label {
  flex: 1 1 auto;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.category-picker-trigger-placeholder {
  flex: 1 1 auto;
}

.category-picker-trigger-clear {
  margin-left: 6px;
  color: #c0c4cc;
  font-size: 12px;
  line-height: 1;
  cursor: pointer;
  padding: 2px;
}

.category-picker-trigger-clear:hover {
  color: #7E57C2;
}

.category-picker-trigger-icon {
  margin-left: 6px;
  color: #c0c4cc;
  font-size: 12px;
  line-height: 1;
  transition: transform 0.18s ease, color 0.18s ease;
}

.category-picker-trigger.is-open .category-picker-trigger-icon {
  transform: rotate(180deg);
  color: #7E57C2;
}

/* 多选 tag 列表 */
.category-picker-tags {
  display: flex;
  flex: 1 1 auto;
  flex-wrap: wrap;
  gap: 4px;
  align-items: center;
  overflow: hidden;
}

.category-picker-tag {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 1px 6px;
  font-size: 12px;
  color: #6A1B9A;
  background: rgba(126, 87, 194, 0.1);
  border-radius: 3px;
  max-width: 100%;
}

.category-picker-tag-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.category-picker-tag-close {
  font-size: 12px;
  line-height: 1;
  cursor: pointer;
  color: inherit;
}

.category-picker-tag-close:hover {
  color: #6A1B9A;
  font-weight: 600;
}
</style>

<style lang="scss">
/* el-popover 的 popper 在 body 末尾渲染，不能 scoped */
.category-picker-popover {
  padding: 8px 0 !important;
  z-index: 9999 !important;
}

.category-picker-popover .category-picker-panel {
  width: 100%;
  min-width: 240px;
  max-height: 320px;
  display: flex;
  flex-direction: column;
}

.category-picker-popover .category-picker-tabs {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
  padding: 6px 12px 8px 12px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
  font-size: 12px;
  color: rgba(0, 0, 0, 0.55);
}

.category-picker-popover .category-picker-tab {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  color: #7E57C2;
  font-weight: 500;
  user-select: none;
}

.category-picker-popover .category-picker-tab:hover {
  color: #6A1B9A;
}

.category-picker-popover .category-picker-tab.is-active {
  color: #6A1B9A;
  font-weight: 600;
}

.category-picker-popover .category-picker-tab.is-root {
  font-weight: 600;
}

.category-picker-popover .category-picker-tab-back {
  font-size: 12px;
  line-height: 1;
  color: inherit;
}

.category-picker-popover .category-picker-tab-sep {
  font-size: 11px;
  color: rgba(0, 0, 0, 0.25);
  margin-right: 2px;
}

.category-picker-popover .category-picker-tab-title {
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.category-picker-popover .category-picker-list {
  flex: 1 1 auto;
  overflow-y: auto;
  padding: 4px 0;
}

.category-picker-popover .category-picker-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 14px;
  font-size: 13px;
  color: rgba(0, 0, 0, 0.85);
  cursor: pointer;
  transition: background 0.12s;
}

.category-picker-popover .category-picker-row:hover {
  background: rgba(126, 87, 194, 0.08);
}

.category-picker-popover .category-picker-row.is-category {
  color: rgba(0, 0, 0, 0.55);
  font-weight: 500;
}

.category-picker-popover .category-picker-row.is-selectable,
.category-picker-popover .category-picker-row.is-checkable {
  color: #6A1B9A;
}

.category-picker-popover .category-picker-row.is-selected {
  background: rgba(126, 87, 194, 0.12);
  color: #6A1B9A;
  font-weight: 600;
}

.category-picker-popover .category-picker-row-title {
  flex: 1 1 auto;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.category-picker-popover .category-picker-row-count {
  font-size: 11px;
  color: rgba(0, 0, 0, 0.45);
  background: rgba(0, 0, 0, 0.05);
  border-radius: 8px;
  padding: 0 6px;
  min-width: 18px;
  text-align: center;
}

.category-picker-popover .category-picker-row-arrow {
  color: rgba(0, 0, 0, 0.35);
  font-size: 12px;
  line-height: 1;
}

.category-picker-popover .category-picker-row-loading {
  color: #7E57C2;
  font-size: 13px;
  line-height: 1;
  animation: rotating 1.5s linear infinite;
}

@keyframes rotating {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.category-picker-popover .category-picker-row-checkbox {
  margin-right: 2px;
}

.category-picker-popover .category-picker-empty {
  padding: 16px;
  text-align: center;
  color: rgba(0, 0, 0, 0.35);
  font-size: 12px;
}

.body--dark .category-picker-trigger {
  background: #2a2a2a;
  border-color: #434343;
  color: rgba(255, 255, 255, 0.85);
}

.body--dark .category-picker-trigger.is-empty .category-picker-trigger-placeholder {
  color: rgba(255, 255, 255, 0.35);
}

.body--dark .category-picker-trigger-clear {
  color: rgba(255, 255, 255, 0.45);
}

.body--dark .category-picker-trigger-clear:hover {
  color: #B39DDB;
}

.body--dark .category-picker-tag {
  background: rgba(179, 157, 219, 0.18);
  color: #D1C4E9;
}

.body--dark .category-picker-popover .category-picker-tabs {
  border-bottom-color: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.55);
}

.body--dark .category-picker-popover .category-picker-tab {
  color: #B39DDB;
}

.body--dark .category-picker-popover .category-picker-tab:hover,
.body--dark .category-picker-popover .category-picker-tab.is-active {
  color: #D1C4E9;
}

.body--dark .category-picker-popover .category-picker-tab-sep {
  color: rgba(255, 255, 255, 0.25);
}

.body--dark .category-picker-popover .category-picker-row {
  color: rgba(255, 255, 255, 0.85);
}

.body--dark .category-picker-popover .category-picker-row.is-category {
  color: rgba(255, 255, 255, 0.55);
}

.body--dark .category-picker-popover .category-picker-row.is-selectable,
.body--dark .category-picker-popover .category-picker-row.is-checkable {
  color: #B39DDB;
}

.body--dark .category-picker-popover .category-picker-row.is-selected {
  background: rgba(126, 87, 194, 0.22);
  color: #D1C4E9;
}

.body--dark .category-picker-popover .category-picker-row:hover {
  background: rgba(179, 157, 219, 0.12);
}

.body--dark .category-picker-popover .category-picker-row-count {
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.55);
}
</style>