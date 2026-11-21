<!--
  CategoryPicker - 分类下钻 + 模板二级选择器（仿 heyui v1 category-picker）

  触发方式：el-popover 包裹一个输入触发器（带 placeholder 与已选项显示）。
  弹层内容：
    - 顶部面包屑（点击返回上级）
    - 一级分类节点列表（不可选中，只下钻）/ 二级模板节点列表（可选中并触发 @change）
  关键 props:
    value       v-model 绑定的当前值
    type        'key' | 'object'，与 v-model 双向同步
    option      { datas, fieldNames, selectable, showChildCount, getDatas, ... }
    showAllLevels     是否在已选区显示完整路径（true: "分类 / 模板"）
    placeholder       触发器占位文案
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
        <div class='category-picker-crumbs'>
          <span
            class='category-picker-crumb is-root'
            @click='goToLevel(-1)'
          >
            <i class='el-icon-arrow-left category-picker-crumb-back' />
            {{ rootLabel }}
          </span>
          <template v-if='crumbs.length > 0'>
            <i class='el-icon-arrow-right category-picker-crumb-sep' />
            <span
              v-for='(c, idx) in crumbs'
              :key='idx'
              class='category-picker-crumb'
              @click='goToLevel(idx)'
            >
              {{ c.title }}
            </span>
          </template>
        </div>

        <div class='category-picker-list'>
          <div
            v-for='node in currentLevelNodes'
            :key='nodeKeyOf(node)'
            class='category-picker-row'
            :class='{
              "is-category": isCategoryNode(node),
              "is-selectable": isSelectable(node),
              "is-selected": isCurrentSelected(node)
            }'
            @click='onRowClick(node)'
          >
            <span class='category-picker-row-title'>{{ nodeTitleOf(node) }}</span>
            <span v-if='showChildCount && childCountOf(node) > 0' class='category-picker-row-count'>
              {{ childCountOf(node) }}
            </span>
            <i v-if='isCategoryNode(node)' class='el-icon-arrow-right category-picker-row-arrow' />
          </div>
          <div v-if='currentLevelNodes.length === 0' class='category-picker-empty'>
            暂无内容
          </div>
        </div>
      </div>

      <div slot='reference' class='category-picker-trigger' :class='{ "is-empty": !displayLabel, "is-open": popoverVisible }' @click='onTriggerClick'>
        <span v-if='displayLabel' class='category-picker-trigger-label'>{{ displayLabel }}</span>
        <span v-else class='category-picker-trigger-placeholder'>{{ placeholder }}</span>
        <i class='el-icon-arrow-down category-picker-trigger-icon' />
      </div>
    </el-popover>
  </div>
</template>

<script>
const DEFAULT_FIELD_NAMES = {
  key: 'key',
  title: 'title',
  children: 'children'
}

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
    datasLabel: {
      type: String,
      default: 'child'
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
      crumbs: [],          // [{ title, node }]
      selectedPath: [],    // 当前已选节点的完整链路（最后一个元素是叶子）
      selectedLeaves: [],  // 多选场景下的多个叶子节点
      _outsideClickHandler: null
    }
  },
  computed: {
    fieldNames () {
      return Object.assign({}, DEFAULT_FIELD_NAMES, this.option.fieldNames || {})
    },
    currentLevelNodes () {
      if (this.crumbs.length === 0) {
        const datas = this.option.datas || []
        return Array.isArray(datas) ? datas : []
      }
      const last = this.crumbs[this.crumbs.length - 1]
      const children = (last && last.node && last.node[this.fieldNames.children]) || []
      return Array.isArray(children) ? children : []
    },
    selectedKey () {
      if (!this.selectedPath || this.selectedPath.length === 0) return null
      return this.selectedPath[this.selectedPath.length - 1].key
    },
    selectedNodes () {
      return this.selectedPath.map(n => n.node)
    },
    displayLabel () {
      if (!this.selectedPath || this.selectedPath.length === 0) return ''
      if (!this.showAllLevels) {
        const last = this.selectedPath[this.selectedPath.length - 1]
        return last ? last.title : ''
      }
      return this.selectedPath.map(c => c.title).join(' / ')
    }
  },
  watch: {
    value: {
      immediate: false,
      handler (val) {
        this.syncFromValue(val)
      }
    }
  },
  mounted () {
    this.syncFromValue(this.value)
    document.addEventListener('mousedown', this._handleDocumentMouseDown, true)
  },
  beforeDestroy () {
    document.removeEventListener('mousedown', this._handleDocumentMouseDown, true)
    this._unbindOutsideClickHandler()
  },
  methods: {
    nodeKeyOf (node) {
      if (!node) return ''
      const k = this.fieldNames.key
      return node[k] != null ? String(node[k]) : ''
    },
    nodeTitleOf (node) {
      if (!node) return ''
      const t = this.fieldNames.title
      return node[t] != null ? String(node[t]) : ''
    },
    isCategoryNode (node) {
      if (!node) return false
      // 显式标记 _isCategory=true 的视为分类节点（不可选，只能下钻）；
      // 有 children 的也视为可下钻节点
      if (node._isCategory === true) return true
      const children = node[this.fieldNames.children]
      return Array.isArray(children) && children.length > 0
    },
    isSelectable (node) {
      if (!node) return false
      const selectable = this.option.selectable
      if (typeof selectable === 'function') return !!selectable(node, this.crumbs.length)
      if (selectable === false) return false
      // 默认：有 children 的分类节点不可选，叶子可选
      return !this.isCategoryNode(node)
    },
    isCurrentSelected (node) {
      if (!node) return false
      const k = this.nodeKeyOf(node)
      if (!k) return false
      if (this.multiple) {
        return this.selectedLeaves.some(n => this.nodeKeyOf(n) === k)
      }
      return this.selectedKey === k
    },
    childCountOf (node) {
      const children = node && node[this.fieldNames.children]
      return Array.isArray(children) ? children.length : 0
    },
    onRowClick (node) {
      if (!node) return
      if (this.isCategoryNode(node)) {
        this.crumbs.push({ title: this.nodeTitleOf(node), node })
        return
      }
      if (!this.isSelectable(node)) return
      this.selectLeaf(node)
    },
    goToLevel (idx) {
      // idx = -1 → 回到根目录
      if (idx < 0) {
        this.crumbs = []
        return
      }
      this.crumbs = this.crumbs.slice(0, idx + 1)
    },
    selectLeaf (node) {
      const baseCrumbs = this.crumbs.slice()
      const pathCrumbs = baseCrumbs.concat([{ title: this.nodeTitleOf(node), node, key: this.nodeKeyOf(node) }])
      this.selectedPath = pathCrumbs
      let emitValue
      let emitNodes
      if (this.multiple) {
        if (this.selectedLeaves.some(n => this.nodeKeyOf(n) === this.nodeKeyOf(node))) {
          this.selectedLeaves = this.selectedLeaves.filter(n => this.nodeKeyOf(n) !== this.nodeKeyOf(node))
        } else {
          if (this.limit > 0 && this.selectedLeaves.length >= this.limit) {
            this.$emit('limit-reached', { limit: this.limit })
            return
          }
          this.selectedLeaves = this.selectedLeaves.concat([node])
        }
        emitNodes = this.selectedLeaves.slice()
        emitValue = this.type === 'object' ? emitNodes : emitNodes.map(n => this.nodeKeyOf(n))
      } else {
        emitNodes = pathCrumbs.map(c => c.node)
        emitValue = this.type === 'object' ? node : this.nodeKeyOf(node)
      }
      this.$emit('change', emitValue, emitNodes)
      this.$emit('input', emitValue)
      this.popoverVisible = false
      this.closePopover()
    },
    onTriggerClick () {
      if (this.disabled) return
      this.popoverVisible = !this.popoverVisible
    },
    onPopoverHide () {
      this.popoverVisible = false
      this._unbindOutsideClickHandler()
    },
    /**
     * 用捕获阶段 + mousedown 判定点击是否在 popper/reference 之外，
     * 避开 element-ui click-outside 与 manual 触发之间的死锁。
     */
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
    _unbindOutsideClickHandler () {
      if (this._outsideClickHandler) {
        this._outsideClickHandler = null
      }
    },
    showPopoverManually () {
      // manual 模式下不再需要手动 show，v-model=true 时 el-popover 会自动渲染 popper
    },
    closePopover () {
      this.popoverVisible = false
      try {
        if (this.$refs.popover && typeof this.$refs.popover.doClose === 'function') {
          this.$refs.popover.doClose()
        }
      } catch (_) { /* noop */ }
    },
    syncFromValue (val) {
      // 仅支持单选同步（多选也按单 key 数组的第 0 项还原路径，避免重算整树路径）
      if (val == null || val === '' || (Array.isArray(val) && val.length === 0)) {
        this.selectedPath = []
        this.crumbs = []
        this.selectedLeaves = []
        return
      }
      const datas = this.option.datas || []
      const keyName = this.fieldNames.key
      const titleName = this.fieldNames.title
      const childrenName = this.fieldNames.children
      let targetKey
      if (this.type === 'object') {
        if (Array.isArray(val)) {
          this.selectedLeaves = val.slice()
          targetKey = val[0] ? val[0][keyName] : null
        } else {
          this.selectedLeaves = [val]
          targetKey = val[keyName]
        }
      } else {
        targetKey = Array.isArray(val) ? val[0] : val
      }
      if (targetKey == null) return
      // 在 datas 树中查找 targetKey，回填 crumbs + selectedPath
      const trail = []
      const found = this.findPath(datas, targetKey, trail)
      if (found) {
        this.crumbs = []
        for (const ancestor of trail) {
          this.crumbs.push({ title: ancestor[titleName], node: ancestor })
        }
        this.selectedPath = this.crumbs.concat([{ title: found[titleName], node: found, key: targetKey }])
      }
    },
    findPath (nodes, key, trail) {
      const keyName = this.fieldNames.key
      const childrenName = this.fieldNames.children
      for (const n of nodes || []) {
        trail.push(n)
        if (String(n[keyName]) === String(key)) return n
        const children = n[childrenName]
        if (Array.isArray(children) && children.length > 0) {
          const inner = this.findPath(children, key, trail)
          if (inner) return inner
        }
        trail.pop()
      }
      return null
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
</style>

<style lang="scss">
/* el-popover 的 popper 在 body 末尾渲染，不能 scoped。覆盖选择器放在全局。
 * q-dialog QPortal 内可能让 popper 的 z-index 不够，覆盖提到 9999 让面板一定可见。 */
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

.category-picker-popover .category-picker-crumbs {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  padding: 6px 12px 8px 12px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
  font-size: 12px;
  color: rgba(0, 0, 0, 0.55);
}

.category-picker-popover .category-picker-crumb {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  color: #7E57C2;
  font-weight: 500;
  user-select: none;
}

.category-picker-popover .category-picker-crumb:hover {
  color: #6A1B9A;
}

.category-picker-popover .category-picker-crumb.is-root {
  font-weight: 600;
}

.category-picker-popover .category-picker-crumb-back {
  font-size: 12px;
  line-height: 1;
  color: inherit;
}

.category-picker-popover .category-picker-crumb-sep {
  font-size: 12px;
  line-height: 1;
  color: rgba(0, 0, 0, 0.35);
}

.category-picker-popover .category-picker-crumb-sep {
  color: rgba(0, 0, 0, 0.25);
  margin: 0 2px;
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

.category-picker-popover .category-picker-row.is-selectable {
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

.body--dark .category-picker-popover .category-picker-crumbs {
  border-bottom-color: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.55);
}

.body--dark .category-picker-popover .category-picker-crumb {
  color: #B39DDB;
}

.body--dark .category-picker-popover .category-picker-crumb:hover {
  color: #D1C4E9;
}

.body--dark .category-picker-popover .category-picker-row {
  color: rgba(255, 255, 255, 0.85);
}

.body--dark .category-picker-popover .category-picker-row.is-category {
  color: rgba(255, 255, 255, 0.55);
}

.body--dark .category-picker-popover .category-picker-row.is-selectable {
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