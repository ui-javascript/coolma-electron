<!-- 参考来源 https://github.com/dayun-cloud/tools -->
<template>
  <q-dialog ref='dialog' maximized class='tier-ranking-dialog'>
    <div class='tier-ranking-wrapper' @click.self='closeDialog'>
      <div class='tier-ranking-body'>
        <!-- 模式切换栏 -->
        <div class='mode-bar'>
          <span class='mode-label'>当前: {{ modeLabel }}</span>
          <span v-if='contextKey' class='context-label'>{{ contextKey }}</span>
          <div class='mode-actions'>
            <button v-if='mode === "note" && contextKey' type='button' class='fill-btn' @click='fillTierRankingToNote'>
              💾 回填到笔记
            </button>
          </div>
        </div>

        <div class='ranking-container'>
          <div
            v-for='(tier, tierIndex) in tiers'
            :key='tier.id'
            class='tier'
            :class='{ "fixed-height": fixedHeightSetting, "drag-over": tierDragOverIndex === tierIndex }'
            :data-tier='tier.id'
            @dragover.prevent='onTierDragOver(tierIndex, $event)'
            @dragleave='onTierDragLeave(tierIndex)'
            @drop.prevent='onTierDrop(tierIndex)'
          >
            <div
              class='tier-label'
              :style='{ backgroundColor: tier.color }'
            >
              <span
                class='tier-name'
                :contenteditable='editingTierIndex === tierIndex'
                @blur='finishEditTier(tierIndex, $event)'
                @keydown.enter.prevent='finishEditTier(tierIndex, $event)'
                @click.stop='startEditTier(tierIndex, $event)'
                ref='tierNameRefs'
              >{{ tier.name }}</span>
              <div class='tier-label-actions'>
                <input
                  type='color'
                  class='color-picker'
                  :value='tier.color'
                  @input='changeTierColor(tierIndex, $event)'
                  title='编辑颜色'
                />
                <button
                  type='button'
                  class='delete-tier-btn'
                  @click.stop='deleteTier(tierIndex)'
                  title='删除该评级'
                >×</button>
              </div>
            </div>
            <div
              class='tier-content'
              @dragover.prevent.stop='onTierContentDragOver(tierIndex, $event)'
              @dragleave='onTierContentDragLeave(tierIndex, $event)'
              @drop.prevent.stop='onTierContentDrop(tierIndex)'
            >
              <div
                v-for='img in tier.images'
                :key='img.id'
                class='image-item'
                :class='[
                  getImageSizeClass(tierIndex),
                  { selected: draggingImage && draggingImage.id === img.id }
                ]'
                :style='getImageSizeStyle(tierIndex)'
                draggable='true'
                @dragstart='onImageDragStart($event, img, tierIndex)'
                @dragend='onImageDragEnd'
                @click.stop='onImageClick(img)'
              >
                <img :src='img.src' :alt='img.name' />
                <div
                  class='image-name-overlay'
                  :style='{ display: showImageNamesSetting ? "block" : "none" }'
                >{{ img.name }}</div>
              </div>
            </div>
          </div>
        </div>

        <div class='gallery-row'>
          <div
            id='tier-image-gallery'
            class='image-gallery'
            @dragover.prevent='onGalleryDragOver'
            @dragleave='onGalleryDragLeave'
            @drop.prevent='onGalleryDrop'
            :class='{ "drag-over": galleryDragOver }'
          >
              <div
                v-for='img in unassignedImages'
                :key='img.id'
                class='image-item'
                :class='{ selected: draggingImage && draggingImage.id === img.id }'
                draggable='true'
                @dragstart='onImageDragStart($event, img, -1)'
                @dragend='onImageDragEnd'
                @click.stop='onImageClick(img)'
              >
                <img :src='img.src' :alt='img.name' />
                <div
                  class='image-name-overlay'
                  :style='{ display: showImageNamesSetting ? "block" : "none" }'
                >{{ img.name }}</div>
              </div>
            </div>
          <div class='gallery-right-panel'>
            <div class='tier-actions'>
              <div class='add-tier-btn' @click='addNewTier'>+ 添加评级</div>
              <div class='reset-tier-btn' @click='showResetModal = true'>↻ 重置排行榜</div>
            </div>
            <div
              class='upload-btn'
              @click='triggerFilePicker'
              @dragover.prevent='onUploadDragOver'
              @dragleave='onUploadDragLeave'
              @drop.prevent='onUploadDrop'
              :class='{ "drag-over": uploadDragOver }'
            >+</div>
            <div
              class='delete-zone'
              :class='{ "drag-over": deleteZoneDragOver }'
              @dragover.prevent='onDeleteDragOver'
              @dragleave='onDeleteDragLeave'
              @drop.prevent='onDeleteDrop'
            >-</div>
            <div class='help-close-actions'>
              <button type='button' class='help-btn' @click='showHelp = true'>?</button>
              <button type='button' class='close-btn' @click='closeDialog'>×</button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 帮助弹窗 -->
    <div v-if='showHelp' class='help-modal' @click.self='showHelp = false'>
      <div class='help-content'>
        <button class='close-help' @click='showHelp = false'>×</button>
        <h2>使用说明</h2>
        <ul>
          <li>添加图片：点击"+"按钮或拖拽图片到该按钮区域</li>
          <li>删除图片：将图片拖拽到"-"区域删除，或选中后按 Delete 键</li>
          <li>放大图片：点击图片可放大，再次点击任意区域恢复</li>
          <li>移动图片：选中图片后点击目标评级，或直接拖拽到评级区域</li>
          <li>编辑评级：点击评级名称可编辑文字</li>
          <li>编辑颜色：点击评级名称后右侧颜色按钮可编辑颜色</li>
          <li>删除评级：点击评级名称后右侧删除按钮可删除评级</li>
          <li>创建新评级：点击底部"+添加评级"按钮创建新的评级</li>
        </ul>
        <div class='toggle-container'>
          <label>
            <input type='checkbox' v-model='showImageNamesSetting' @change='saveState' />
            <span>显示图片名称</span>
          </label>
          <label>
            <input type='checkbox' v-model='fixedHeightSetting' @change='onFixedHeightChange' />
            <span>固定评级高度</span>
          </label>
        </div>
        <div class='save-image-container'>
          <button class='save-image-btn' @click='saveAsImage'>💾 保存为图片</button>
        </div>
      </div>
    </div>

    <!-- 重置确认弹窗 -->
    <div v-if='showResetModal' class='reset-modal' @click.self='showResetModal = false'>
      <div class='reset-content'>
        <h3>⚠️ {{ $t('resetRankingConfirmTitle') }}</h3>
        <p>{{ $t('resetRankingConfirmMessage') }}</p>
        <div class='reset-buttons'>
          <button class='reset-confirm-btn' @click='confirmReset'>{{ $t('resetRankingConfirm') }}</button>
          <button class='reset-cancel-btn' @click='showResetModal = false'>{{ $t('resetRankingCancel') }}</button>
        </div>
      </div>
    </div>

    <!-- 图片放大弹窗 -->
    <div v-if='previewImage' class='image-modal' @click='previewImage = null'>
      <img :src='previewImage' alt='放大的图片' />
    </div>

    <!-- 隐藏的文件选择器 -->
    <input
      type='file'
      ref='fileInput'
      accept='image/*'
      multiple
      style='display:none'
      @change='handleFileChange'
    />
  </q-dialog>
</template>

<script>
import html2canvas from 'html2canvas'
import DatabaseClient from 'src/utils/DatabaseClient'
import bus from '../common/bus.js'

const DEFAULT_TIERS = [
  { id: 's', name: '夯', color: '#e74d5a' },
  { id: 'a', name: '顶级', color: '#ff9f43' },
  { id: 'b', name: '人上人', color: '#5a61e7' },
  { id: 'c', name: 'NPC', color: '#2ed573' },
  { id: 'd', name: '拉完了', color: '#747d8c' }
]

const STORAGE_KEY_PREFIX = 'tierRanking/'

let imageCounter = 0

export default {
  name: 'rankingTierDialog',
  data () {
    return {
      mode: 'category', // 'category' | 'note'
      contextKey: '', // 文件夹路径 或 笔记 docGuid
      tiers: [],
      unassignedImages: [],
      fixedHeightSetting: false,
      showImageNamesSetting: false,
      editingTierIndex: -1,
      tierDragOverIndex: -1,
      uploadDragOver: false,
      deleteZoneDragOver: false,
      galleryDragOver: false,
      showHelp: false,
      showResetModal: false,
      previewImage: null,
      draggingImage: null,
      draggingImageTierIndex: -1,
      draggingImageIndex: -1,
      dragOverImageIndex: -1
    }
  },
  computed: {
    modeLabel () {
      return this.mode === 'category' ? '文件夹模式' : '笔记模式'
    }
  },
  mounted () {
    document.addEventListener('keydown', this.onKeyDown)
  },
  beforeDestroy () {
    document.removeEventListener('keydown', this.onKeyDown)
  },
  methods: {
    /**
     * 打开弹框
     * @param {Object} options
     * @param {string} options.mode - 'category' | 'note'
     * @param {string} options.contextKey - 文件夹路径 或 笔记 docGuid
     * @param {string} options.noteContent - 笔记的 markdown 内容（仅 note 模式需要）
     */
    toggle (options = {}) {
      const { mode = 'category', contextKey = '', noteContent = '' } = options
      this.mode = mode
      this.contextKey = contextKey
      this.loadState(noteContent)
      this.$refs.dialog.toggle()
    },

    closeDialog () {
      this.draggingImage = null
      this.draggingImageTierIndex = -1
      this.$refs.dialog.hide()
    },

    /**
     * 从 MD 内容提取图片 URL
     */
    extractImageUrls (markdown) {
      if (!markdown) return []
      const imageUrls = []
      // 匹配 ![] 或 ![alt](url) 格式的图片
      const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g
      let match
      while ((match = imageRegex.exec(markdown)) !== null) {
        const url = match[2]
        // 只保留本地相对路径或 base64 图片
        if (url && (url.startsWith('./') || url.startsWith('../') || url.startsWith('/') || url.startsWith('file://') || url.startsWith('data:'))) {
          imageUrls.push({
            id: 'extracted-' + imageUrls.length,
            name: match[1] || '图片',
            src: url,
            extracted: true
          })
        }
      }
      return imageUrls
    },

    // SQLite 存储
    async loadState (noteContent = '') {
      const storageKey = STORAGE_KEY_PREFIX + this.contextKey

      try {
        const stored = await DatabaseClient.appState.get(storageKey)
        if (stored) {
          const data = typeof stored === 'string' ? JSON.parse(stored) : stored
          this.tiers = data.tiers || DEFAULT_TIERS.map(t => ({ ...t, images: [] }))
          this.unassignedImages = data.unassignedImages || []
          this.showImageNamesSetting = !!data.showImageNames
          this.fixedHeightSetting = !!data.fixedHeight
        } else {
          this.resetToDefault()
          // 如果是笔记模式，提取 MD 中的图片作为初始候选
          if (this.mode === 'note' && noteContent) {
            const extractedImages = this.extractImageUrls(noteContent)
            if (extractedImages.length > 0) {
              this.unassignedImages = extractedImages
            }
          }
        }
      } catch (e) {
        console.error('[rankingTierDialog] Load state failed:', e)
        this.resetToDefault()
        if (this.mode === 'note' && noteContent) {
          const extractedImages = this.extractImageUrls(noteContent)
          if (extractedImages.length > 0) {
            this.unassignedImages = extractedImages
          }
        }
      }
    },

    async saveState () {
      const storageKey = STORAGE_KEY_PREFIX + this.contextKey
      const state = {
        tiers: this.tiers,
        unassignedImages: this.unassignedImages,
        showImageNames: !!this.showImageNamesSetting,
        fixedHeight: !!this.fixedHeightSetting
      }
      try {
        await DatabaseClient.appState.set(storageKey, JSON.stringify(state))
      } catch (e) {
        console.error('[rankingTierDialog] Save state failed:', e)
      }
    },

    resetToDefault () {
      imageCounter = 0
      this.tiers = DEFAULT_TIERS.map(t => ({ ...t, images: [] }))
      this.unassignedImages = []
    },

    // 评级操作
    addNewTier () {
      const tierCount = this.tiers.length + 1
      const colors = ['#e74d5a', '#ff9f43', '#5a61e7', '#2ed573', '#747d8c', '#e91e63', '#9c27b0', '#3f51b5', '#009688', '#ff5722']
      const color = colors[tierCount % colors.length]
      this.tiers.push({
        id: 'new' + tierCount,
        name: '新评级' + tierCount,
        color: color,
        images: []
      })
      this.saveState()
    },

    deleteTier (tierIndex) {
      const tier = this.tiers[tierIndex]
      tier.images.forEach(img => {
        this.unassignedImages.push(img)
      })
      this.tiers.splice(tierIndex, 1)
      this.saveState()
    },

    startEditTier (tierIndex, e) {
      this.editingTierIndex = tierIndex
      this.$nextTick(() => {
        const el = this.$refs.tierNameRefs
        if (el && typeof el === 'object' && el[tierIndex]) {
          el[tierIndex].focus()
        }
      })
    },

    finishEditTier (tierIndex, e) {
      const newName = e.target.textContent.trim()
      if (newName) {
        this.tiers[tierIndex].name = newName
      } else {
        e.target.textContent = this.tiers[tierIndex].name
      }
      this.editingTierIndex = -1
      this.saveState()
    },

    changeTierColor (tierIndex, e) {
      const color = e.target.value
      this.tiers[tierIndex].color = color
      this.saveState()
    },

    deleteSelectedImage () {
      if (!this.draggingImage) return
      const sourceTierIndex = this.draggingImageTierIndex
      if (sourceTierIndex === -1) {
        this.unassignedImages = this.unassignedImages.filter(i => i.id !== this.draggingImage.id)
      } else {
        this.tiers[sourceTierIndex].images =
          this.tiers[sourceTierIndex].images.filter(i => i.id !== this.draggingImage.id)
      }
      this.draggingImage = null
      this.draggingImageTierIndex = -1
      this.saveState()
    },

    onImageClick (img) {
      this.previewImage = img.src
    },

    onKeyDown (e) {
      if (e.key === 'Escape') {
        this.showHelp = false
        this.showResetModal = false
        this.previewImage = null
        this.draggingImage = null
        this.draggingImageTierIndex = -1
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (this.draggingImage) {
          this.deleteSelectedImage()
        }
      }
    },

    // 文件上传
    triggerFilePicker () {
      this.$refs.fileInput.click()
    },

    async handleFileChange (e) {
      const files = Array.from(e.target.files)
      for (const file of files) {
        if (file.type.startsWith('image/')) {
          const compressed = await this.compressImage(file)
          this.addImageToGallery(compressed, file.name)
        }
      }
      e.target.value = ''
    },

    compressImage (file) {
      return new Promise((resolve) => {
        const reader = new FileReader()
        reader.onload = (e) => {
          const img = new Image()
          img.onload = () => {
            const canvas = document.createElement('canvas')
            const ctx = canvas.getContext('2d')
            const maxSize = 800
            let width = img.width
            let height = img.height
            if (width > maxSize || height > maxSize) {
              if (width > height) {
                height = (height / width) * maxSize
                width = maxSize
              } else {
                width = (width / height) * maxSize
                height = maxSize
              }
            }
            canvas.width = width
            canvas.height = height
            ctx.drawImage(img, 0, 0, width, height)
            resolve(canvas.toDataURL('image/jpeg', 0.7))
          }
          img.src = e.target.result
        }
        reader.readAsDataURL(file)
      })
    },

    addImageToGallery (src, filename = '') {
      let displayName = filename || '图片'
      const lastDot = displayName.lastIndexOf('.')
      if (lastDot > 0) displayName = displayName.substring(0, lastDot)

      const imgId = 'img-' + (++imageCounter)
      this.unassignedImages.push({
        id: imgId,
        src,
        name: displayName
      })
      this.saveState()
    },

    onUploadDragOver (e) {
      e.preventDefault()
      this.uploadDragOver = true
    },

    onUploadDragLeave () {
      this.uploadDragOver = false
    },

    async onUploadDrop (e) {
      e.preventDefault()
      this.uploadDragOver = false
      const files = Array.from(e.dataTransfer.files)
      for (const file of files) {
        if (file.type.startsWith('image/')) {
          const compressed = await this.compressImage(file)
          this.addImageToGallery(compressed, file.name)
        }
      }
    },

    // 图片拖拽
    onImageDragStart (e, img, tierIndex) {
      this.draggingImage = img
      this.draggingImageTierIndex = tierIndex
      this.draggingImageIndex = tierIndex === -1
        ? this.unassignedImages.findIndex(i => i.id === img.id)
        : this.tiers[tierIndex]?.images.findIndex(i => i.id === img.id)
      e.dataTransfer.effectAllowed = 'move'
      e.dataTransfer.setData('text/plain', img.id)
    },

    onImageDragEnd () {
      this.tierDragOverIndex = -1
      this.deleteZoneDragOver = false
      this.galleryDragOver = false
      this.draggingImage = null
      this.draggingImageTierIndex = -1
      this.draggingImageIndex = -1
      this.dragOverImageIndex = -1
    },

    onTierDragOver (tierIndex, e) {
      e.preventDefault()
      this.tierDragOverIndex = tierIndex
    },

    onTierDragLeave (tierIndex) {
      if (this.tierDragOverIndex === tierIndex) {
        this.tierDragOverIndex = -1
      }
    },

    onTierContentDragOver (tierIndex, e) {
      e.preventDefault()
      e.stopPropagation()
      this.tierDragOverIndex = tierIndex

      const targetImgEl = e.target.closest('.image-item')
      if (targetImgEl) {
        const targetImgId = targetImgEl.querySelector('img')?.alt
        if (targetImgId) {
          const targetIndex = this.tiers[tierIndex].images.findIndex(i => i.id === targetImgId)
          if (targetIndex !== -1) {
            this.dragOverImageIndex = targetIndex
          }
        }
      } else {
        this.dragOverImageIndex = -1
      }
    },

    onTierContentDragLeave (tierIndex, e) {
      e.stopPropagation()
      const rect = e.currentTarget.getBoundingClientRect()
      const x = e.clientX
      const y = e.clientY
      if (x < rect.left || x >= rect.right || y < rect.top || y >= rect.bottom) {
        if (this.tierDragOverIndex === tierIndex) {
          this.tierDragOverIndex = -1
        }
      }
    },

    onTierContentDrop (tierIndex) {
      if (!this.draggingImage) return

      const img = this.draggingImage
      const sourceTierIndex = this.draggingImageTierIndex

      if (sourceTierIndex === tierIndex) {
        const images = this.tiers[tierIndex].images
        const fromIndex = this.draggingImageIndex
        let toIndex = this.dragOverImageIndex

        if (toIndex === -1) {
          toIndex = images.length - 1
        }

        if (fromIndex !== toIndex) {
          images.splice(fromIndex, 1)
          const insertIndex = toIndex > fromIndex ? toIndex : toIndex
          images.splice(insertIndex, 0, img)
          this.saveState()
        }
      } else {
        this.moveImageToTier(tierIndex)
      }

      this.tierDragOverIndex = -1
      this.dragOverImageIndex = -1
      this.draggingImage = null
      this.draggingImageTierIndex = -1
      this.draggingImageIndex = -1
    },

    moveImageToTier (tierIndex) {
      const img = this.draggingImage
      const sourceTierIndex = this.draggingImageTierIndex
      if (!img) return

      if (sourceTierIndex === tierIndex) {
        this.tierDragOverIndex = -1
        this.draggingImage = null
        this.draggingImageTierIndex = -1
        return
      }

      if (sourceTierIndex === -1) {
        this.unassignedImages = this.unassignedImages.filter(i => i.id !== img.id)
      } else {
        this.tiers[sourceTierIndex].images =
          this.tiers[sourceTierIndex].images.filter(i => i.id !== img.id)
      }

      this.tiers[tierIndex].images.push(img)

      this.tierDragOverIndex = -1
      this.draggingImage = null
      this.draggingImageTierIndex = -1
      this.saveState()
    },

    onTierDrop (tierIndex, e) {
      e.preventDefault()
      this.tierDragOverIndex = -1
      const img = this.draggingImage
      const sourceTierIndex = this.draggingImageTierIndex
      if (!img) return

      if (sourceTierIndex === -1) {
        this.unassignedImages = this.unassignedImages.filter(i => i.id !== img.id)
      } else {
        this.tiers[sourceTierIndex].images =
          this.tiers[sourceTierIndex].images.filter(i => i.id !== img.id)
      }

      this.tiers[tierIndex].images.push(img)

      this.draggingImage = null
      this.draggingImageTierIndex = -1
      this.saveState()
    },

    onGalleryDragOver (e) {
      if (!this.draggingImage) return
      e.preventDefault()
      this.galleryDragOver = true
    },

    onGalleryDragLeave (e) {
      const rect = e.currentTarget.getBoundingClientRect()
      const x = e.clientX
      const y = e.clientY
      if (x < rect.left || x >= rect.right || y < rect.top || y >= rect.bottom) {
        this.galleryDragOver = false
      }
    },

    onGalleryDrop (e) {
      e.preventDefault()
      this.galleryDragOver = false
      const img = this.draggingImage
      const sourceTierIndex = this.draggingImageTierIndex
      if (!img) return

      if (sourceTierIndex === -1) {
        this.draggingImage = null
        this.draggingImageTierIndex = -1
        return
      }

      this.tiers[sourceTierIndex].images =
        this.tiers[sourceTierIndex].images.filter(i => i.id !== img.id)

      this.unassignedImages.push(img)

      this.draggingImage = null
      this.draggingImageTierIndex = -1
      this.saveState()
    },

    onDeleteDragOver (e) {
      e.preventDefault()
      this.deleteZoneDragOver = true
    },

    onDeleteDragLeave () {
      this.deleteZoneDragOver = false
    },

    onDeleteDrop (e) {
      e.preventDefault()
      this.deleteZoneDragOver = false
      const img = this.draggingImage
      const sourceTierIndex = this.draggingImageTierIndex
      if (!img) return

      if (sourceTierIndex === -1) {
        this.unassignedImages = this.unassignedImages.filter(i => i.id !== img.id)
      } else {
        this.tiers[sourceTierIndex].images =
          this.tiers[sourceTierIndex].images.filter(i => i.id !== img.id)
      }

      this.draggingImage = null
      this.draggingImageTierIndex = -1
      this.saveState()
    },

    // 固定高度
    onFixedHeightChange () {
      this.saveState()
    },

    recalculateTierSizes (tierIndex) {
      const tier = this.tiers[tierIndex]
      if (!tier) return
      const tierEl = document.querySelector(`.tier[data-tier="${tier.id}"]`)
      if (!tierEl) return
      const content = tierEl.querySelector('.tier-content')
      if (!content) return
      const images = content.querySelectorAll('.image-item')
      if (images.length === 0) return

      const containerWidth = content.clientWidth - 10
      const gap = 5
      const maxPerRow = Math.floor(containerWidth / (120 + gap))

      if (images.length <= maxPerRow) {
        images.forEach(img => {
          img.classList.remove('multi-row', 'adaptive')
          img.classList.add('single-row')
          img.style.width = ''
          img.style.height = ''
        })
        content.style.overflowY = 'hidden'
      } else {
        const avail = containerWidth - (images.length - 1) * gap
        const calcWidth = Math.floor(avail / images.length)
        if (calcWidth >= 70) {
          images.forEach(img => {
            img.classList.remove('single-row', 'multi-row')
            img.classList.add('adaptive')
            img.style.width = calcWidth + 'px'
            img.style.height = calcWidth + 'px'
          })
          content.style.overflowY = 'hidden'
        } else {
          images.forEach(img => {
            img.classList.remove('single-row', 'adaptive')
            img.classList.add('multi-row')
            img.style.width = '70px'
            img.style.height = '70px'
          })
          content.style.overflowY = 'auto'
        }
      }
    },

    getImageSizeClass (tierIndex) {
      if (!this.fixedHeightSetting) return ''
      const tier = this.tiers[tierIndex]
      if (!tier || tier.images.length === 0) return 'single-row'
      const tierEl = document.querySelector(`.tier[data-tier="${tier.id}"]`)
      if (!tierEl) return 'single-row'
      const content = tierEl.querySelector('.tier-content')
      if (!content) return 'single-row'
      const containerWidth = content.clientWidth - 10
      const gap = 5
      const maxPerRow = Math.floor(containerWidth / (120 + gap))
      if (tier.images.length <= maxPerRow) return 'single-row'
      const avail = containerWidth - (tier.images.length - 1) * gap
      const calcWidth = Math.floor(avail / tier.images.length)
      if (calcWidth >= 70) return 'adaptive'
      return 'multi-row'
    },

    getImageSizeStyle (tierIndex) {
      if (!this.fixedHeightSetting) return {}
      const tier = this.tiers[tierIndex]
      if (!tier || tier.images.length === 0) return {}
      const tierEl = document.querySelector(`.tier[data-tier="${tier.id}"]`)
      if (!tierEl) return {}
      const content = tierEl.querySelector('.tier-content')
      if (!content) return {}
      const containerWidth = content.clientWidth - 10
      const gap = 5
      const maxPerRow = Math.floor(containerWidth / (120 + gap))
      if (tier.images.length <= maxPerRow) return {}
      const avail = containerWidth - (tier.images.length - 1) * gap
      const calcWidth = Math.floor(avail / tier.images.length)
      if (calcWidth >= 70) return { width: calcWidth + 'px', height: calcWidth + 'px' }
      return { width: '70px', height: '70px' }
    },

    // 重置
    confirmReset () {
      this.tiers = DEFAULT_TIERS.map(t => ({ ...t, images: [] }))
      this.unassignedImages = []
      this.draggingImage = null
      this.draggingImageTierIndex = -1
      imageCounter = 0
      this.showResetModal = false
      this.saveState()
    },

    // 保存为图片
    async saveAsImage () {
      this.showHelp = false
      const container = document.querySelector('.ranking-container')
      if (!container) return
      try {
        const canvas = await html2canvas(container, {
          scale: 2,
          useCORS: true,
          allowTaint: true,
          backgroundColor: '#1a1a1a'
        })
        const dataUrl = canvas.toDataURL('image/png')
        const link = document.createElement('a')
        link.download = '从夯到拉排行榜.png'
        link.href = dataUrl
        link.click()
        this.$q.notify({ message: '排行榜已保存', color: 'positive' })
      } catch (err) {
        console.error('截图失败:', err)
        this.$q.notify({ message: '截图失败: ' + err.message, color: 'negative' })
      }
    },

    /**
     * 回填：从夯到拉导出图片到 MD 末尾
     * 返回所有已排序图片的 Markdown 格式文本
     */
    exportTierRankingToMarkdown () {
      const lines = []
      lines.push('\n\n---\n')
      lines.push('## 从夯到拉排行榜\n')

      for (const tier of this.tiers) {
        if (tier.images.length > 0) {
          lines.push(`\n### ${tier.name}\n`)
          for (const img of tier.images) {
            // 保持原 URL（如果是提取的本地路径，直接用；如果是 base64，需要转换）
            if (img.src.startsWith('data:')) {
              // base64 图片，保持原样
              lines.push(`![${img.name}](${img.src})\n`)
            } else {
              // 本地路径或 URL
              lines.push(`![${img.name}](${img.src})\n`)
            }
          }
        }
      }

      if (this.unassignedImages.length > 0) {
        lines.push(`\n### 未分类\n`)
        for (const img of this.unassignedImages) {
          if (img.src.startsWith('data:')) {
            lines.push(`![${img.name}](${img.src})\n`)
          } else {
            lines.push(`![${img.name}](${img.src})\n`)
          }
        }
      }

      return lines.join('')
    },

    /**
     * 回填到笔记
     */
    fillTierRankingToNote () {
      if (this.mode !== 'note') return

      const markdownContent = this.exportTierRankingToMarkdown()
      // 通过 bus 事件触发编辑器插入文本
      bus.$emit('insert.text', markdownContent)
      this.$q.notify({ message: '已回填到笔记', color: 'positive' })
      this.closeDialog()
    }
  }
}
</script>

<style scoped>
.tier-ranking-dialog >>> .q-dialog__inner {
  padding: 0 !important;
  min-width: 100vw !important;
  min-height: 100vh !important;
  width: 100vw !important;
  height: 100vh !important;
  max-width: 100vw !important;
  max-height: 100vh !important;
}

.tier-ranking-dialog >>> .q-dialog__backdrop {
  background: transparent;
}

.tier-ranking-dialog >>> .q-card {
  border-radius: 0;
  max-width: none;
  max-height: none;
  width: 100%;
  height: 100%;
  box-shadow: none;
}

.tier-ranking-wrapper {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: #1a1a1a;
  display: flex;
  flex-direction: column;
  user-select: none;
  overflow: hidden;
}

.tier-ranking-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-height: 0;
}

.mode-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  background: #2d2d2d;
  border-bottom: 1px solid #404040;
  flex-shrink: 0;
}

.mode-label {
  font-size: 14px;
  color: #7dbece;
  font-weight: 600;
}

.context-label {
  font-size: 12px;
  color: #999;
  max-width: 300px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mode-actions {
  margin-left: auto;
}

.fill-btn {
  background: #4090f0;
  border: none;
  color: white;
  padding: 6px 12px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  transition: background 0.2s;
}

.fill-btn:hover {
  background: #5090ff;
}

.ranking-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow-x: hidden;
  overflow-y: auto;
  min-height: 0;
}

.ranking-container::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

.ranking-container::-webkit-scrollbar-track {
  background: #2d2d2d;
}

.ranking-container::-webkit-scrollbar-thumb {
  background: #555;
  border-radius: 4px;
}

.ranking-container::-webkit-scrollbar-thumb:hover {
  background: #777;
}

.ranking-container::-webkit-scrollbar-corner {
  background: #2d2d2d;
}

.tier {
  display: flex;
  align-items: stretch;
  min-height: 100px;
  border-bottom: 2px solid #404040;
  transition: background-color 0.2s ease;
  flex-shrink: 0;
  overflow-x: hidden;
  overflow-y: visible;
}

.tier:hover {
  background-color: #2e2e2e;
}

.tier.drag-over {
  background-color: #3a3a3a !important;
}

.tier.fixed-height {
  height: 130px;
  min-height: 130px;
  max-height: 130px;
}

.tier-label {
  width: 172px;
  min-width: 172px;
  text-align: center;
  font-size: 1.7em;
  font-weight: 900;
  color: white;
  text-shadow:
    -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000,
    0px -1px 0 #000, 0px 1px 0 #000, -1px 0px 0 #000, 1px 0px 0 #000;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  cursor: pointer;
  box-sizing: border-box;
  padding: 6px;
}

.tier-name {
  outline: none;
  display: block;
  font-weight: 900;
  line-height: 1.25;
  white-space: normal;
  overflow: visible;
  text-align: center;
}

.tier-name:focus {
  background: rgba(255, 255, 255, 0.2);
  border-radius: 4px;
  padding: 0 5px;
}

.tier-label-actions {
  position: absolute;
  right: 4px;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 2px;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.15s ease;
  z-index: 101;
}

.tier-label:hover .tier-label-actions,
.tier-label-actions:hover {
  opacity: 1;
  pointer-events: auto;
}

.color-picker {
  width: 24px;
  height: 24px;
  border: none;
  border-radius: 50%;
  cursor: pointer;
  background: none;
  padding: 0;
  flex-shrink: 0;
}

.color-picker:hover {
  transform: scale(1.15);
}

.delete-tier-btn {
  width: 24px;
  height: 24px;
  background: rgba(255, 255, 255, 0.9);
  border: 2px solid #ff3742;
  border-radius: 50%;
  color: #ff3742;
  cursor: pointer;
  transition: background-color 0.15s, color 0.15s, transform 0.15s;
  font-size: 18px;
  font-weight: bold;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  line-height: 1;
  flex-shrink: 0;
}

.delete-tier-btn:hover {
  background: #ff3742;
  color: #fff;
  transform: scale(1.1);
}

.tier-content {
  flex: 1;
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  padding: 5px;
  min-height: 100px;
  align-items: center;
  overflow-x: auto;
  overflow-y: hidden;
}

.tier-content::-webkit-scrollbar {
  height: 6px;
}

.tier-content::-webkit-scrollbar-track {
  background: transparent;
}

.tier-content::-webkit-scrollbar-thumb {
  background: #555;
  border-radius: 3px;
}

.tier-content::-webkit-scrollbar-thumb:hover {
  background: #777;
}

.tier.fixed-height .tier-content {
  height: 120px;
  min-height: 120px;
  max-height: 120px;
  overflow-x: auto;
  overflow-y: auto;
  flex-wrap: wrap;
  align-items: flex-start;
}

.gallery-row {
  display: flex;
  align-items: stretch;
  gap: 8px;
  padding: 8px 8px 8px 5px;
  background: #2d2d2d;
  flex-shrink: 0;
  box-sizing: border-box;
}

.image-gallery {
  flex: 1 1 0;
  min-width: 0;
  height: 100px;
  display: flex;
  flex-wrap: nowrap;
  gap: 5px;
  justify-content: flex-start;
  align-items: center;
  overflow-x: auto;
  overflow-y: hidden;
  padding: 5px 5px 15px 5px;
  box-sizing: border-box;
}

/* always show scrollbar */
.image-gallery::-webkit-scrollbar {
  height: 10px;
}

.image-gallery::-webkit-scrollbar-track {
  background: #2d2d2d;
  border-radius: 5px;
}

.image-gallery::-webkit-scrollbar-thumb {
  background: #666;
  border-radius: 5px;
}

.image-gallery::-webkit-scrollbar-thumb:hover {
  background: #888;
}

/* Firefox always-thin: also ensure thumb is always visible */
@supports (scrollbar-width: thin) {
  .image-gallery {
    scrollbar-color: #777 #2d2d2d;
  }
}

.image-gallery.drag-over {
  background: #3a4a3a !important;
  outline: 2px dashed #5a8f5a;
}

.upload-btn {
  width: 60px;
  height: 60px;
  border: 2px dashed #666;
  background: #404040;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 2em;
  color: #ccc;
  cursor: pointer;
  transition: all 0.3s ease;
  flex-shrink: 0;
}

.upload-btn:hover,
.upload-btn.drag-over {
  border-color: #007bff;
  background: #4a4a4a;
  color: #007bff;
}

.delete-zone {
  width: 60px;
  height: 60px;
  border: 2px dashed #dc3545;
  background: #4a3a3a;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 2em;
  color: #dc3545;
  transition: all 0.3s ease;
  flex-shrink: 0;
  cursor: default;
}

.delete-zone.drag-over {
  background: #dc3545;
  color: white;
}

.image-item {
  width: 100px;
  height: 100px;
  overflow: hidden;
  cursor: grab;
  transition: all 0.3s ease;
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
  position: relative;
  user-select: none;
  flex-shrink: 0;
}

.image-item:active {
  cursor: grabbing;
}

.image-item.selected {
  outline: 3px solid #007bff;
  outline-offset: -3px;
  transform: scale(0.95);
}

.tier.fixed-height .image-item.single-row {
  width: 100px;
  height: 100px;
}

.tier.fixed-height .image-item.multi-row {
  width: 70px;
  height: 70px;
}

.tier.fixed-height .image-item.adaptive {
  width: auto;
  height: auto;
  min-width: 70px;
  min-height: 70px;
  max-width: 100px;
  max-height: 100px;
}

.image-item:hover {
  transform: scale(1.05);
  box-shadow: 0 6px 12px rgba(0, 0, 0, 0.2);
}

.image-item.selected:hover {
  transform: scale(0.95);
  box-shadow: 0 6px 12px rgba(0, 0, 0, 0.2);
}

.image-item img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  pointer-events: none;
}

.image-name-overlay {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  background: rgba(0, 0, 0, 0.5);
  color: white;
  padding: 3px 5px;
  font-size: 11px;
  font-weight: 500;
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  z-index: 10;
}

.gallery-right-panel {
  flex: 0 0 auto;
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 6px;
}

.tier-actions {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: stretch;
  gap: 4px;
  flex-shrink: 0;
}

.add-tier-btn {
  background: #444;
  border: 2px dashed #666;
  color: #ccc;
  padding: 4px 10px;
  border-radius: 6px;
  cursor: pointer;
  text-align: center;
  font-size: 12px;
  transition: all 0.3s;
  white-space: nowrap;
  flex-shrink: 0;
}

.add-tier-btn:hover {
  background: #555;
  border-color: #888;
  color: #fff;
}

.reset-tier-btn {
  background: #dc3545;
  border: 2px solid #c82333;
  color: white;
  padding: 4px 10px;
  border-radius: 6px;
  cursor: pointer;
  text-align: center;
  font-size: 12px;
  transition: all 0.3s;
  white-space: nowrap;
  flex-shrink: 0;
}

.reset-tier-btn:hover {
  background: #c82333;
  border-color: #bd2130;
  color: #fff;
}

.help-close-actions {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.help-btn {
  width: 28px;
  height: 28px;
  background: #65a6bc;
  border: none;
  border-radius: 50%;
  color: white;
  font-size: 14px;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.3s ease;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  line-height: 1;
}

.help-btn:hover {
  background: #7dbece;
  transform: scale(1.1);
}

.close-btn {
  width: 28px;
  height: 28px;
  background: rgba(80, 80, 80, 0.8);
  border: 2px solid rgba(255, 255, 255, 0.2);
  border-radius: 50%;
  color: white;
  font-size: 16px;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.3s ease;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  line-height: 1;
}

.close-btn:hover {
  background: rgba(220, 53, 69, 0.9);
  border-color: #dc3545;
  transform: scale(1.1);
}

/* 帮助弹窗 */
.help-modal {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.8);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 2000;
}

.help-content {
  background: #2d2d2d;
  padding: 30px;
  border-radius: 10px;
  max-width: 500px;
  width: 90%;
  color: white;
  position: relative;
}

.help-content h2 {
  color: #7dbece;
  margin-bottom: 20px;
  text-align: center;
}

.help-content ul {
  list-style: none;
  padding: 0;
}

.help-content li {
  margin-bottom: 12px;
  padding-left: 18px;
  position: relative;
  font-size: 14px;
  line-height: 1.4;
}

.help-content li:before {
  content: "•";
  color: #7dbece;
  font-weight: bold;
  position: absolute;
  left: 0;
}

.close-help {
  position: absolute;
  top: 8px;
  right: 14px;
  background: none;
  border: none;
  color: #999;
  font-size: 22px;
  cursor: pointer;
}

.close-help:hover {
  color: white;
}

.toggle-container {
  display: flex;
  gap: 20px;
  justify-content: center;
  margin-top: 16px;
  flex-wrap: wrap;
}

.toggle-container label {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  font-size: 14px;
}

.toggle-container input[type="checkbox"] {
  cursor: pointer;
}

.save-image-container {
  margin-top: 16px;
  text-align: center;
}

.save-image-btn {
  background: #444;
  border: 2px solid #666;
  color: #ccc;
  padding: 10px 20px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.3s ease;
}

.save-image-btn:hover {
  background: #555;
  border-color: #007bff;
  color: #007bff;
}

/* 重置弹窗 */
.reset-modal {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.8);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 2000;
}

.reset-content {
  background: #2d2d2d;
  padding: 30px;
  border-radius: 10px;
  max-width: 380px;
  width: 90%;
  color: white;
  position: relative;
  text-align: center;
}

.reset-content h3 {
  color: #dc3545;
  margin-bottom: 16px;
}

.reset-content p {
  margin-bottom: 20px;
  line-height: 1.5;
  font-size: 14px;
}

.reset-buttons {
  display: flex;
  gap: 12px;
  justify-content: center;
}

.reset-confirm-btn {
  background: #dc3545;
  border: none;
  color: white;
  padding: 9px 20px;
  border-radius: 5px;
  cursor: pointer;
  font-size: 14px;
  transition: background 0.3s;
}

.reset-confirm-btn:hover {
  background: #c82333;
}

.reset-cancel-btn {
  background: #6c757d;
  border: none;
  color: white;
  padding: 9px 20px;
  border-radius: 5px;
  cursor: pointer;
  font-size: 14px;
  transition: background 0.3s;
}

.reset-cancel-btn:hover {
  background: #5a6268;
}

/* 图片放大弹窗 */
.image-modal {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.9);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 3000;
  cursor: pointer;
}

.image-modal img {
  min-width: 600px;
  min-height: 400px;
  max-width: 80vw;
  max-height: 80vh;
  object-fit: contain;
}
</style>
