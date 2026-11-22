<template>
  <teleport to="body">
    <div v-if="visible" class="tier-dialog" @click.self="close">
      <div class="tier-board" ref="boardRef">
        <div class="tier-modebar">
          <span class="tier-mode">当前: {{ mode === 'note' ? t('ranking.noteMode') : t('ranking.categoryMode') }}</span>
          <span v-if="contextKey" class="tier-context">{{ contextKey }}</span>
          <span class="tier-spacer" />
          <button v-if="mode === 'note' && contextKey" type="button" class="tier-fill" @click="fillToNote">💾 {{ t('ranking.fillToNote') }}</button>
        </div>

        <div class="tier-list">
          <div
            v-for="(tier, tierIndex) in tiers"
            :key="tier.id"
            class="tier-row"
            :data-tier="tier.id"
            :class="{ 'is-over': tierDragOver === tierIndex, 'is-fixed': fixedHeight }"
            @dragenter.prevent="tierDragOver = tierIndex"
            @dragover.prevent="tierDragOver = tierIndex"
            @dragleave="onRowDragLeave(tierIndex, $event)"
            @drop.prevent="onTierAreaDrop(tierIndex)"
          >
            <div class="tier-label" :style="{ backgroundColor: tier.color }">
              <span
                v-if="editingTier !== tierIndex"
                class="tier-name"
                @click="startEditTier(tierIndex)"
              >{{ tier.name }}</span>
              <input
                v-else
                ref="tierNameInput"
                class="tier-name-input"
                :value="tier.name"
                @blur="finishEditTier(tierIndex, $event)"
                @keydown.enter.prevent="finishEditTier(tierIndex, $event)"
              />
              <div class="tier-label-actions">
                <input type="color" class="tier-color" :value="tier.color" @input="changeTierColor(tierIndex, $event)" />
                <button type="button" class="tier-del" :title="t('ranking.deleteTier')" @click.stop="deleteTier(tierIndex)">×</button>
              </div>
            </div>
            <div
              class="tier-content"
              :style="{ overflowY: imageClass(tier) === 'multi-row' ? 'auto' : 'hidden' }"
              @dragenter.prevent.stop="onTierContentDragOver(tierIndex, $event)"
              @dragover.prevent.stop="onTierContentDragOver(tierIndex, $event)"
              @dragleave.stop="onTierContentDragLeave(tierIndex, $event)"
              @drop.prevent.stop="onTierContentDrop(tierIndex)"
            >
              <div
                v-for="img in tier.images"
                :key="img.id"
                class="tier-image"
                :class="[imageClass(tier), { 'is-selected': dragging?.image.id === img.id }]"
                :style="imageStyle(tier)"
                :data-image-id="img.id"
                draggable="true"
                @dragstart="onImageDragStart($event, img, tierIndex)"
                @dragend="onImageDragEnd"
                @click.stop="previewImage = img.src"
              >
                <img :src="img.src" :alt="img.name" />
                <div v-if="showNames" class="tier-image-name">{{ img.name }}</div>
              </div>
            </div>
          </div>
        </div>

        <div class="tier-bottom">
          <div
            class="tier-gallery"
            :class="{ 'is-over': galleryOver }"
            @dragenter.prevent="onGalleryOver"
            @dragover.prevent="onGalleryOver"
            @dragleave="onGalleryLeave"
            @drop.prevent="onGalleryDrop"
          >
            <div
              v-for="img in unassignedImages"
              :key="img.id"
              class="tier-image"
              :class="{ 'is-selected': dragging?.image.id === img.id }"
              draggable="true"
              @dragstart="onImageDragStart($event, img, -1)"
              @dragend="onImageDragEnd"
              @click.stop="previewImage = img.src"
            >
              <img :src="img.src" :alt="img.name" />
              <div v-if="showNames" class="tier-image-name">{{ img.name }}</div>
            </div>
            <span v-if="unassignedImages.length === 0" class="tier-gallery-empty">{{ t('ranking.galleryEmpty') }}</span>
          </div>

          <div class="tier-tools">
            <div class="tier-tool-row">
              <button type="button" class="tier-tool" @click="addTier">+ {{ t('ranking.addTier') }}</button>
              <button type="button" class="tier-tool" @click="resetVisible = true">↻ {{ t('ranking.reset') }}</button>
            </div>
            <div class="tier-tool-row">
              <button
                type="button"
                class="tier-tool tier-upload"
                :class="{ 'is-over': uploadOver }"
                @click="fileInput?.click()"
                @dragenter.prevent="uploadOver = true"
                @dragover.prevent="uploadOver = true"
                @dragleave="uploadOver = false"
                @drop.prevent="onUploadDrop"
              >+</button>
              <button
                type="button"
                class="tier-tool tier-delete"
                :class="{ 'is-over': deleteOver }"
                @dragenter.prevent="deleteOver = true"
                @dragover.prevent="deleteOver = true"
                @dragleave="deleteOver = false"
                @drop.prevent="onDeleteDrop"
              >-</button>
            </div>
            <div class="tier-tool-row">
              <button type="button" class="tier-tool" @click="helpVisible = true">?</button>
              <button type="button" class="tier-tool" @click="close">×</button>
            </div>
          </div>
        </div>
      </div>

      <div v-if="helpVisible" class="tier-modal" @click.self="helpVisible = false">
        <div class="tier-modal-body">
          <button type="button" class="tier-modal-close" @click="helpVisible = false">×</button>
          <h2>{{ t('ranking.helpTitle') }}</h2>
          <ul>
            <li>{{ t('ranking.helpAdd') }}</li>
            <li>{{ t('ranking.helpDelete') }}</li>
            <li>{{ t('ranking.helpPreview') }}</li>
            <li>{{ t('ranking.helpMove') }}</li>
            <li>{{ t('ranking.helpTier') }}</li>
          </ul>
          <label class="tier-check"><input type="checkbox" v-model="showNames" @change="saveState" /> {{ t('ranking.showNames') }}</label>
          <label class="tier-check"><input type="checkbox" v-model="fixedHeight" @change="onFixedHeightChange" /> {{ t('ranking.fixedHeight') }}</label>
          <button type="button" class="tier-save" @click="saveAsImage">💾 {{ t('ranking.saveImage') }}</button>
        </div>
      </div>

      <div v-if="resetVisible" class="tier-modal" @click.self="resetVisible = false">
        <div class="tier-modal-body">
          <h3>{{ t('ranking.resetTitle') }}</h3>
          <p>{{ t('ranking.resetMessage') }}</p>
          <div class="tier-modal-actions">
            <button type="button" class="tier-save" @click="confirmReset">{{ t('ranking.resetConfirm') }}</button>
            <button type="button" class="tier-tool" @click="resetVisible = false">{{ t('ranking.resetCancel') }}</button>
          </div>
        </div>
      </div>

      <div v-if="previewImage" class="tier-preview" @click="previewImage = ''">
        <img :src="previewImage" alt="preview" />
      </div>

      <input ref="fileInput" type="file" accept="image/*" multiple class="tier-file" @change="onFileChange" />
    </div>
  </teleport>
</template>

<script setup lang="ts">
/**
 * 从夯到拉排行榜（移植 vue2 components/ranking/rankingTierDialog.vue，1673 行大件）。
 *
 * 保留：评级增删改名换色、图片上传（压缩到 800px / jpeg 0.7）、四向拖拽
 * （评级↔评级 / 图库↔评级 / 拖到删除区删除）、点击预览、帮助与重置、导出 PNG、
 * 笔记模式把结果回填成 Markdown、按 contextKey 落本地设置库。
 *
 * 差异（如实报备）：
 *  - vue2 是 q-dialog maximized 全屏，vue3 用 `teleport` 自绘全屏层（Element 的 dialog 撑满会多一层 padding）。
 *  - vue2 的「固定评级高度」是读 DOM 再算像素；vue3 先不做（开关保留在帮助里但默认关闭，不影响拖拽）。
 *  - 导出 PNG 沿用 vue2 的 `<a download>`；真机没验证过 Electron 下载行为。
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage } from 'element-plus';
import { useAppStore } from '@/stores/app';

interface TierImage {
  id: string;
  src: string;
  name: string;
}

interface Tier {
  id: string;
  name: string;
  color: string;
  images: TierImage[];
}

const DEFAULT_TIERS: Array<Omit<Tier, 'images'>> = [
  { id: 's', name: '夯', color: '#e74d5a' },
  { id: 'a', name: '顶级', color: '#ff9f43' },
  { id: 'b', name: '人上人', color: '#5a61e7' },
  { id: 'c', name: 'NPC', color: '#2ed573' },
  { id: 'd', name: '拉完了', color: '#747d8c' },
];

const props = defineProps<{
  modelValue: boolean;
  mode?: 'note' | 'category';
  contextKey?: string;
  noteContent?: string;
}>();

const emit = defineEmits<{
  (event: 'update:modelValue', value: boolean): void;
  (event: 'fill', markdown: string): void;
}>();

const { t } = useI18n();
const appStore = useAppStore();

const tiers = ref<Tier[]>([]);
const unassignedImages = ref<TierImage[]>([]);
const editingTier = ref(-1);
const tierNameInput = ref<HTMLInputElement[] | null>(null);
const tierDragOver = ref(-1);
const galleryOver = ref(false);
const uploadOver = ref(false);
const deleteOver = ref(false);
const helpVisible = ref(false);
const resetVisible = ref(false);
const previewImage = ref('');
const showNames = ref(false);
const fixedHeight = ref(false);
const dragOverImageId = ref('');
const imageClassMap = ref<Record<string, string>>({});
const imageStyleMap = ref<Record<string, Record<string, string>>>({});
const boardRef = ref<HTMLElement | null>(null);
const fileInput = ref<HTMLInputElement | null>(null);

const dragging = ref<{ image: TierImage; tierIndex: number } | null>(null);
let imageCounter = 0;

const visible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value),
});
const storageKey = computed(() => `setting/tierRanking/${props.contextKey || 'default'}`);

function newImageId(): string {
  imageCounter += 1;
  return `img-${imageCounter}`;
}

function cloneDefaults(): Tier[] {
  return DEFAULT_TIERS.map((tier) => ({ ...tier, images: [] }));
}

function resetState(): void {
  tiers.value = cloneDefaults();
  unassignedImages.value = [];
  imageCounter = 0;
  showNames.value = false;
}

/** 从 Markdown 提取本地/相对/base64 图片（同 vue2 extractImageUrls）。 */
function extractImageUrls(markdown: string): TierImage[] {
  const result: TierImage[] = [];
  const regex = /!\[([^\]]*)\]\(([^)]+)\)/g;
  let match: RegExpExecArray | null = null;
  while ((match = regex.exec(markdown)) !== null) {
    const url = match[2];
    if (url && (url.startsWith('./') || url.startsWith('../') || url.startsWith('/') || url.startsWith('file://') || url.startsWith('data:'))) {
      result.push({ id: newImageId(), src: url, name: match[1] || t('ranking.untitledImage') });
    }
  }
  return result;
}

function normalizeState(raw: unknown): { tiers: Tier[]; unassignedImages: TierImage[]; showNames: boolean; fixedHeight: boolean } {
  const data = (raw ?? {}) as { tiers?: Tier[]; unassignedImages?: TierImage[]; showImageNames?: boolean; fixedHeightSetting?: boolean };
  const savedTiers = Array.isArray(data.tiers) && data.tiers.length > 0
    ? data.tiers.map((tier) => ({
      id: String(tier.id),
      name: String(tier.name),
      color: String(tier.color || '#747d8c'),
      images: Array.isArray(tier.images) ? tier.images.map((img) => ({ ...img, id: String(img.id) })) : [],
    }))
    : cloneDefaults();
  const images = Array.isArray(data.unassignedImages) ? data.unassignedImages : [];
  return {
    tiers: savedTiers,
    unassignedImages: images,
    showNames: Boolean(data.showImageNames),
    fixedHeight: Boolean(data.fixedHeightSetting),
  };
}

async function loadState(): Promise<void> {
  await appStore.loadPrefs();
  const stored = appStore.prefs[storageKey.value];
  const normalized = normalizeState(stored);
  tiers.value = normalized.tiers;
  unassignedImages.value = normalized.unassignedImages;
  showNames.value = normalized.showNames;
  fixedHeight.value = normalized.fixedHeight;
  // 没有历史状态且是笔记模式时，把笔记里的图片当候选
  if (!stored && props.mode === 'note' && props.noteContent) {
    unassignedImages.value = extractImageUrls(props.noteContent);
  }
  imageCounter = Math.max(
    imageCounter,
    ...tiers.value.flatMap((tier) => tier.images.length),
    unassignedImages.value.length,
  );
}

async function saveState(): Promise<void> {
  await appStore.setPref(storageKey.value, {
    tiers: tiers.value,
    unassignedImages: unassignedImages.value,
    showImageNames: showNames.value,
    fixedHeightSetting: fixedHeight.value,
  });
}

watch(
  () => tiers.value.map((tier) => tier.images.length).join(','),
  () => {
    if (fixedHeight.value) {
      void nextTick(recalcAll);
    }
  },
);

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      void loadState().then(() => nextTick(recalcAll));
    }
  },
);

function close(): void {
  dragging.value = null;
  visible.value = false;
}

function addTier(): void {
  const colors = ['#e74d5a', '#ff9f43', '#5a61e7', '#2ed573', '#747d8c', '#e91e63', '#9c27b0', '#3f51b5'];
  const index = tiers.value.length + 1;
  tiers.value.push({ id: `new${index}${Date.now().toString(36)}`, name: `${t('ranking.newTier')}${index}`, color: colors[index % colors.length], images: [] });
  void saveState();
}

function deleteTier(index: number): void {
  const tier = tiers.value[index];
  tier.images.forEach((img) => unassignedImages.value.push(img));
  tiers.value.splice(index, 1);
  void saveState();
}

function startEditTier(index: number): void {
  editingTier.value = index;
  void nextTick(() => tierNameInput.value?.[0]?.focus());
}

function finishEditTier(index: number, event: Event): void {
  const target = event.target as HTMLInputElement;
  const value = target.value.trim();
  if (value) {
    tiers.value[index].name = value;
  }
  editingTier.value = -1;
  void saveState();
}

function changeTierColor(index: number, event: Event): void {
  tiers.value[index].color = (event.target as HTMLInputElement).value;
  void saveState();
}

function removeImage(image: TierImage): void {
  tiers.value.forEach((tier) => {
    tier.images = tier.images.filter((item) => item.id !== image.id);
  });
  unassignedImages.value = unassignedImages.value.filter((item) => item.id !== image.id);
}

function onImageDragStart(event: DragEvent, image: TierImage, tierIndex: number): void {
  dragging.value = { image, tierIndex };
  event.dataTransfer?.setData('text/plain', image.id);
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move';
  }
}

function onImageDragEnd(): void {
  dragging.value = null;
  dragOverImageId.value = '';
  tierDragOver.value = -1;
  galleryOver.value = false;
  deleteOver.value = false;
}

/**
 * 固定高度：对齐 vue2 recalculateTierSizes。
 * 基准 120px 图 + 5px gap：本档能一行放下 → single-row；
 * 放不下但均分后每张 ≥70px → adaptive（按等宽算）；
 * 再小 → multi-row（70px 固定宽、内容区滚动）。
 */
function measureTier(tier: Tier): { cls: string; style: Record<string, string> } {
  if (!fixedHeight.value || tier.images.length === 0) {
    return { cls: fixedHeight.value ? 'single-row' : '', style: {} };
  }
  const content = document.querySelector(`.tier-row[data-tier="${tier.id}"] .tier-content`) as HTMLElement | null;
  if (!content || content.clientWidth === 0) {
    return { cls: 'single-row', style: {} };
  }
  const containerWidth = content.clientWidth - 10;
  const gap = 5;
  const maxPerRow = Math.floor(containerWidth / (120 + gap));
  if (tier.images.length <= maxPerRow) {
    return { cls: 'single-row', style: {} };
  }
  const available = containerWidth - (tier.images.length - 1) * gap;
  const calcWidth = Math.floor(available / tier.images.length);
  if (calcWidth >= 70) {
    return { cls: 'adaptive', style: { width: `${calcWidth}px`, height: `${calcWidth}px` } };
  }
  return { cls: 'multi-row', style: { width: '70px', height: '70px' } };
}

function recalcAll(): void {
  const classes: Record<string, string> = {};
  const styles: Record<string, Record<string, string>> = {};
  tiers.value.forEach((tier) => {
    const result = measureTier(tier);
    classes[tier.id] = result.cls;
    styles[tier.id] = result.style;
  });
  imageClassMap.value = classes;
  imageStyleMap.value = styles;
}

function imageClass(tier: Tier): string {
  if (!fixedHeight.value) {
    return '';
  }
  return imageClassMap.value[tier.id] || 'single-row';
}

function imageStyle(tier: Tier): Record<string, string> {
  if (!fixedHeight.value) {
    return {};
  }
  return imageStyleMap.value[tier.id] || {};
}

function onFixedHeightChange(): void {
  void nextTick(recalcAll);
  void saveState();
}

/**
 * 整档 dragleave：光标只是从行移到行内的子元素（label / content）时不算离开，
 * 否则每跨一次子元素都把高亮清掉，界面会闪成「没反应」。
 */
function onRowDragLeave(index: number, event: DragEvent): void {
  const current = event.currentTarget as HTMLElement | null;
  const related = event.relatedTarget as Node | null;
  if (current && related && current.contains(related)) {
    return;
  }
  if (tierDragOver.value === index) {
    tierDragOver.value = -1;
  }
}

function onTierContentDragOver(index: number, event: DragEvent): void {
  tierDragOver.value = index;
  const target = (event.target as HTMLElement | null)?.closest('.tier-image') as HTMLElement | null;
  dragOverImageId.value = target?.dataset.imageId || '';
}

function onTierContentDragLeave(index: number, event: DragEvent): void {
  const current = event.currentTarget as HTMLElement;
  const rect = current.getBoundingClientRect();
  if (event.clientX < rect.left || event.clientX >= rect.right || event.clientY < rect.top || event.clientY >= rect.bottom) {
    if (tierDragOver.value === index) {
      tierDragOver.value = -1;
    }
    dragOverImageId.value = '';
  }
}

function onTierContentDrop(index: number): void {
  const current = dragging.value;
  if (!current) {
    return;
  }
  if (current.tierIndex !== index) {
    moveToTier(index);
    dragOverImageId.value = '';
    return;
  }
  const images = tiers.value[index].images;
  const from = images.findIndex((item) => item.id === current.image.id);
  if (from === -1) {
    return;
  }
  const targetIndex = dragOverImageId.value ? images.findIndex((item) => item.id === dragOverImageId.value) : images.length - 1;
  const to = targetIndex === -1 ? images.length - 1 : targetIndex;
  if (from !== to) {
    images.splice(from, 1);
    images.splice(to, 0, current.image);
    void saveState();
  }
  dragging.value = null;
  dragOverImageId.value = '';
  tierDragOver.value = -1;
}

function moveToTier(index: number): void {
  const current = dragging.value;
  if (!current) {
    return;
  }
  if (current.tierIndex === index) {
    return;
  }
  removeImage(current.image);
  tiers.value[index].images.push(current.image);
  dragging.value = null;
  void saveState();
}

function onTierAreaDrop(index: number): void {
  moveToTier(index);
  tierDragOver.value = -1;
}

function onGalleryOver(): void {
  if (dragging.value) {
    galleryOver.value = true;
  }
}

function onGalleryLeave(): void {
  galleryOver.value = false;
}

function onGalleryDrop(): void {
  const current = dragging.value;
  galleryOver.value = false;
  if (!current) {
    return;
  }
  if (current.tierIndex === -1) {
    return;
  }
  removeImage(current.image);
  unassignedImages.value.push(current.image);
  dragging.value = null;
  void saveState();
}

function onDeleteDrop(): void {
  const current = dragging.value;
  deleteOver.value = false;
  if (!current) {
    return;
  }
  removeImage(current.image);
  dragging.value = null;
  void saveState();
}

function compressImage(file: File): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        const maxSize = 800;
        let width = img.width;
        let height = img.height;
        if (width > maxSize || height > maxSize) {
          if (width > height) {
            height = (height / width) * maxSize;
            width = maxSize;
          } else {
            width = (width / height) * maxSize;
            height = maxSize;
          }
        }
        canvas.width = width;
        canvas.height = height;
        context?.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.7));
      };
      img.src = String(event.target?.result ?? '');
    };
    reader.readAsDataURL(file);
  });
}

async function addFiles(files: File[]): Promise<void> {
  for (const file of files) {
    if (!file.type.startsWith('image/')) {
      continue;
    }
    const src = await compressImage(file);
    const name = file.name.replace(/\.\w+$/, '') || t('ranking.untitledImage');
    unassignedImages.value.push({ id: newImageId(), src, name });
  }
  await saveState();
}

async function onFileChange(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  await addFiles(Array.from(input.files ?? []));
  input.value = '';
}

async function onUploadDrop(event: DragEvent): Promise<void> {
  uploadOver.value = false;
  await addFiles(Array.from(event.dataTransfer?.files ?? []));
}

function confirmReset(): void {
  resetState();
  resetVisible.value = false;
  void saveState();
}

async function saveAsImage(): Promise<void> {
  helpVisible.value = false;
  if (!boardRef.value) {
    return;
  }
  try {
    const { default: html2canvas } = await import('html2canvas');
    const canvas = await html2canvas(boardRef.value, { scale: 2, useCORS: true, allowTaint: true, backgroundColor: '#1a1a1a' });
    const link = document.createElement('a');
    link.download = t('ranking.imageName');
    link.href = canvas.toDataURL('image/png');
    link.click();
    ElMessage.success(t('ranking.saved'));
  } catch (error) {
    ElMessage.error(`${t('ranking.saveFailed')}: ${(error as Error).message}`);
  }
}

/** 排行榜 → Markdown（同 vue2 exportTierRankingToMarkdown）。 */
function toMarkdown(): string {
  const lines: string[] = ['\n\n---\n', `## ${t('ranking.markdownTitle')}\n`];
  tiers.value.forEach((tier) => {
    if (tier.images.length > 0) {
      lines.push(`\n### ${tier.name}\n`);
      tier.images.forEach((img) => lines.push(`![${img.name}](${img.src})\n`));
    }
  });
  if (unassignedImages.value.length > 0) {
    lines.push(`\n### ${t('ranking.unassigned')}\n`);
    unassignedImages.value.forEach((img) => lines.push(`![${img.name}](${img.src})\n`));
  }
  return lines.join('');
}

function fillToNote(): void {
  emit('fill', toMarkdown());
  ElMessage.success(t('ranking.filled'));
  close();
}

function onKeyDown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    helpVisible.value = false;
    resetVisible.value = false;
    previewImage.value = '';
    dragging.value = null;
    return;
  }
  if ((event.key === 'Delete' || event.key === 'Backspace') && dragging.value) {
    removeImage(dragging.value.image);
    dragging.value = null;
    void saveState();
  }
}

onMounted(() => document.addEventListener('keydown', onKeyDown));
onBeforeUnmount(() => document.removeEventListener('keydown', onKeyDown));
</script>

<style scoped>
.tier-dialog {
  position: fixed;
  inset: 0;
  z-index: 9000;
  background: #1a1a1a;
  display: flex;
  align-items: stretch;
  justify-content: center;
  overflow: hidden;
  user-select: none;
}

.tier-board {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #1a1a1a;
  min-height: 0;
}

.tier-modebar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  background: #2d2d2d;
  border-bottom: 1px solid #404040;
  flex: none;
  color: #cfcfcf;
  font-size: 14px;
}

.tier-mode {
  color: #7dbece;
  font-size: 14px;
  font-weight: 600;
}

.tier-context {
  max-width: 300px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #999;
  font-size: 12px;
}

.tier-spacer { flex: 1; }

.tier-fill {
  border: 0;
  border-radius: 4px;
  padding: 6px 12px;
  background: #4090f0;
  color: #fff;
  font-size: 12px;
  cursor: pointer;
  transition: background .2s;
}

.tier-fill:hover { background: #5090ff; }

.tier-list {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 0;
  overflow-x: hidden;
  overflow-y: auto;
}

.tier-row {
  display: flex;
  align-items: stretch;
  min-height: 100px;
  flex: none;
  background: #1a1a1a;
  border-bottom: 2px solid #404040;
  transition: background-color .2s ease;
  overflow-x: hidden;
  overflow-y: visible;
}

.tier-row:hover { background: #2e2e2e; }
.tier-row.is-over {
  background: #24384c;
  box-shadow: inset 0 0 0 2px #5aa9e6;
}

.tier-row.is-fixed {
  height: 130px;
  min-height: 130px;
  max-height: 130px;
}

.tier-label {
  width: 172px;
  min-width: 172px;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  padding: 6px;
  color: #fff;
  font-size: 1.7em;
  font-weight: 900;
  text-align: center;
  text-shadow:
    -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000,
    0 -1px 0 #000, 0 1px 0 #000, -1px 0 0 #000, 1px 0 0 #000;
  cursor: pointer;
}

.tier-name {
  display: block;
  font-weight: 900;
  line-height: 1.25;
  white-space: normal;
  overflow: visible;
  text-align: center;
  outline: none;
}

.tier-name-input {
  width: 130px;
  padding: 2px 5px;
  border: 0;
  border-radius: 4px;
  background: rgb(255 255 255 / 20%);
  color: #fff;
  font-size: 16px;
  font-weight: 900;
  text-align: center;
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
  transition: opacity .15s ease;
  z-index: 101;
}

.tier-label:hover .tier-label-actions,
.tier-label-actions:hover {
  opacity: 1;
  pointer-events: auto;
}

.tier-color {
  width: 24px;
  height: 24px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: none;
  cursor: pointer;
  flex-shrink: 0;
}

.tier-color:hover { transform: scale(1.15); }

.tier-del {
  width: 24px;
  height: 24px;
  padding: 0;
  border: 2px solid #ff3742;
  border-radius: 50%;
  background: rgb(255 255 255 / 90%);
  color: #ff3742;
  font-size: 18px;
  font-weight: 700;
  line-height: 1;
  cursor: pointer;
  transition: background-color .15s, color .15s, transform .15s;
}

.tier-del:hover {
  background: #ff3742;
  color: #fff;
  transform: scale(1.1);
}

.tier-content {
  flex: 1;
  min-width: 0;
  min-height: 100px;
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  gap: 5px;
  padding: 5px;
  overflow-x: auto;
  overflow-y: hidden;
}

.tier-row.is-fixed .tier-content {
  height: 120px;
  min-height: 120px;
  max-height: 120px;
  flex-wrap: wrap;
  align-items: flex-start;
  overflow-x: auto;
  overflow-y: auto;
}

.tier-image {
  position: relative;
  width: 100px;
  height: 100px;
  flex-shrink: 0;
  overflow: hidden;
  cursor: grab;
  box-shadow: 0 4px 8px rgb(0 0 0 / 10%);
  transition: all .3s ease;
  user-select: none;
}

.tier-image:active { cursor: grabbing; }

.tier-image.is-selected {
  outline: 3px solid #007bff;
  outline-offset: -3px;
  transform: scale(.95);
}

.tier-image:hover {
  transform: scale(1.05);
  box-shadow: 0 6px 12px rgb(0 0 0 / 20%);
}

.tier-image.is-selected:hover { transform: scale(.95); }

.tier-image.single-row { width: 100px; height: 100px; }
.tier-image.multi-row { width: 70px; height: 70px; }
.tier-image.adaptive { min-width: 70px; min-height: 70px; max-width: 100px; max-height: 100px; }

.tier-image img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  pointer-events: none;
}

.tier-image-name {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 10;
  padding: 3px 5px;
  background: rgb(0 0 0 / 50%);
  color: #fff;
  font-size: 11px;
  font-weight: 500;
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tier-list::-webkit-scrollbar,
.tier-content::-webkit-scrollbar,
.tier-gallery::-webkit-scrollbar { width: 8px; height: 8px; }

.tier-list::-webkit-scrollbar-track { background: #2d2d2d; }
.tier-list::-webkit-scrollbar-thumb { background: #555; border-radius: 4px; }
.tier-list::-webkit-scrollbar-thumb:hover { background: #777; }

.tier-content::-webkit-scrollbar { height: 6px; }
.tier-content::-webkit-scrollbar-track { background: transparent; }
.tier-content::-webkit-scrollbar-thumb { background: #555; border-radius: 3px; }
.tier-content::-webkit-scrollbar-thumb:hover { background: #777; }

.tier-bottom {
  display: flex;
  align-items: stretch;
  gap: 8px;
  flex: none;
  padding: 8px 8px 8px 5px;
  background: #2d2d2d;
}

.tier-gallery {
  flex: 1 1 0;
  min-width: 0;
  height: 100px;
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  justify-content: flex-start;
  gap: 5px;
  padding: 5px 5px 15px;
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-color: #777 #2d2d2d;
}

.tier-gallery.is-over {
  background: #3a4a3a;
  outline: 2px dashed #5a8f5a;
}

.tier-gallery::-webkit-scrollbar { height: 10px; }
.tier-gallery::-webkit-scrollbar-track { background: #2d2d2d; border-radius: 5px; }
.tier-gallery::-webkit-scrollbar-thumb { background: #666; border-radius: 5px; }
.tier-gallery::-webkit-scrollbar-thumb:hover { background: #888; }
.tier-gallery-empty { color: #6f6f6f; font-size: 12px; margin: auto; }

.tier-tools {
  flex: 0 0 auto;
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 6px;
}

.tier-tool-row { display: flex; gap: 4px; }
.tier-tool-row:nth-child(1) { flex-direction: column; justify-content: center; }
.tier-tool-row:nth-child(2) { flex-direction: row; gap: 6px; }
.tier-tool-row:nth-child(3) { flex-direction: column; justify-content: center; gap: 4px; }

.tier-tool-row:nth-child(1) .tier-tool {
  flex: none;
  padding: 4px 10px;
  border: 2px dashed #666;
  border-radius: 6px;
  background: #444;
  color: #ccc;
  font-size: 12px;
  white-space: nowrap;
  transition: all .3s;
}

.tier-tool-row:nth-child(1) .tier-tool:hover {
  background: #555;
  border-color: #888;
  color: #fff;
}

.tier-tool-row:nth-child(1) .tier-tool:nth-child(2) {
  border: 2px solid #c82333;
  background: #dc3545;
  color: #fff;
}

.tier-tool-row:nth-child(1) .tier-tool:nth-child(2):hover {
  background: #c82333;
  border-color: #bd2130;
}

.tier-upload,
.tier-delete {
  flex: none;
  width: 60px;
  height: 60px;
  min-height: 60px;
  padding: 0;
  border: 2px dashed #666;
  border-radius: 0;
  background: #404040;
  color: #ccc;
  font-size: 2em;
  line-height: 1;
  transition: all .3s;
}

.tier-upload:hover,
.tier-upload.is-over {
  border-color: #007bff;
  background: #4a4a4a;
  color: #007bff;
}

.tier-delete {
  border-color: #dc3545;
  background: #4a3a3a;
  color: #dc3545;
  cursor: default;
}

.tier-delete.is-over {
  background: #dc3545;
  color: #fff;
}

.tier-tool-row:nth-child(3) .tier-tool {
  width: 28px;
  height: 28px;
  min-height: 28px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: #65a6bc;
  color: #fff;
  font-size: 14px;
  font-weight: 700;
  line-height: 1;
  transition: all .3s ease;
}

.tier-tool-row:nth-child(3) .tier-tool:hover {
  background: #7dbece;
  transform: scale(1.1);
}

.tier-tool-row:nth-child(3) .tier-tool:nth-child(2) {
  border: 2px solid rgb(255 255 255 / 20%);
  background: rgb(80 80 80 / 80%);
  color: #fff;
  font-size: 16px;
}

.tier-tool-row:nth-child(3) .tier-tool:nth-child(2):hover {
  background: rgb(220 53 69 / 90%);
  border-color: #dc3545;
}

.tier-modal {
  position: fixed;
  inset: 0;
  background: rgb(0 0 0 / 80%);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9100;
}

.tier-modal-body {
  position: relative;
  width: 500px;
  max-width: 90vw;
  max-height: 90vh;
  overflow-y: auto;
  padding: 30px;
  border-radius: 10px;
  background: #2d2d2d;
  color: #fff;
}

.tier-modal-close {
  position: absolute;
  top: 8px;
  right: 14px;
  border: 0;
  background: none;
  color: #999;
  font-size: 22px;
  cursor: pointer;
}

.tier-modal-close:hover { color: #fff; }

.tier-modal-body h2,
.tier-modal-body h3 {
  margin: 0 0 20px;
  color: #7dbece;
  font-size: 20px;
  text-align: center;
}

.tier-modal-body ul {
  margin: 0 0 16px;
  padding: 0;
  list-style: none;
}

.tier-modal-body li {
  position: relative;
  margin-bottom: 12px;
  padding-left: 18px;
  font-size: 14px;
  line-height: 1.4;
}

.tier-modal-body li::before {
  content: "•";
  position: absolute;
  left: 0;
  color: #7dbece;
  font-weight: 700;
}

.tier-check {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  margin-top: 16px;
  font-size: 14px;
  cursor: pointer;
}

.tier-save {
  display: block;
  margin: 16px auto 0;
  padding: 10px 20px;
  border: 2px solid #666;
  border-radius: 8px;
  background: #444;
  color: #ccc;
  font-size: 14px;
  cursor: pointer;
  transition: all .3s ease;
}

.tier-save:hover {
  border-color: #007bff;
  background: #555;
  color: #007bff;
}

.tier-modal-body h3 { color: #dc3545; }

.tier-modal-body p {
  margin: 0 0 20px;
  font-size: 14px;
  line-height: 1.5;
  text-align: center;
}

.tier-modal-actions {
  display: flex;
  justify-content: center;
  gap: 12px;
}

.tier-modal-actions .tier-save {
  display: inline-block;
  margin: 0;
  padding: 9px 20px;
  border: 0;
  border-radius: 5px;
  background: #dc3545;
  color: #fff;
  font-size: 14px;
}

.tier-modal-actions .tier-save:hover { background: #c82333; color: #fff; }

.tier-modal-actions .tier-tool {
  padding: 9px 20px;
  border: 0;
  border-radius: 5px;
  background: #6c757d;
  color: #fff;
  font-size: 14px;
}

.tier-modal-actions .tier-tool:hover { background: #5a6268; }

.tier-preview {
  position: fixed;
  inset: 0;
  background: rgb(0 0 0 / 90%);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9200;
  cursor: zoom-out;
}

.tier-preview img {
  min-width: 600px;
  min-height: 400px;
  max-width: 80vw;
  max-height: 80vh;
  object-fit: contain;
}

.tier-file { display: none; }
</style>
