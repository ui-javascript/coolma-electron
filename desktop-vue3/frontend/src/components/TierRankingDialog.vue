<template>
  <teleport to="body">
    <div v-if="visible" class="tier-dialog" @click.self="close">
      <div class="tier-board" ref="boardRef">
        <div class="tier-modebar">
          <span class="tier-mode">当前：{{ mode === 'note' ? t('ranking.noteMode') : t('ranking.categoryMode') }}</span>
          <span v-if="contextKey" class="tier-context">{{ contextKey }}</span>
          <span class="tier-spacer" />
          <button v-if="mode === 'note' && contextKey" type="button" class="tier-fill" @click="fillToNote">💾 {{ t('ranking.fillToNote') }}</button>
        </div>

        <div class="tier-list">
          <div
            v-for="(tier, tierIndex) in tiers"
            :key="tier.id"
            class="tier-row"
            :class="{ 'is-over': tierDragOver === tierIndex }"
            @dragover.prevent="tierDragOver = tierIndex"
            @dragleave="tierDragOver = tierDragOver === tierIndex ? -1 : tierDragOver"
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
              @dragover.prevent.stop
              @drop.prevent.stop="moveToTier(tierIndex)"
            >
              <div
                v-for="img in tier.images"
                :key="img.id"
                class="tier-image"
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
            @dragover.prevent="onGalleryOver"
            @dragleave="onGalleryLeave"
            @drop.prevent="onGalleryDrop"
          >
            <div
              v-for="img in unassignedImages"
              :key="img.id"
              class="tier-image"
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
                @dragover.prevent="uploadOver = true"
                @dragleave="uploadOver = false"
                @drop.prevent="onUploadDrop"
              >+</button>
              <button
                type="button"
                class="tier-tool tier-delete"
                :class="{ 'is-over': deleteOver }"
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

function normalizeState(raw: unknown): { tiers: Tier[]; unassignedImages: TierImage[]; showNames: boolean } {
  const data = (raw ?? {}) as { tiers?: Tier[]; unassignedImages?: TierImage[]; showImageNames?: boolean };
  const savedTiers = Array.isArray(data.tiers) && data.tiers.length > 0
    ? data.tiers.map((tier) => ({
      id: String(tier.id),
      name: String(tier.name),
      color: String(tier.color || '#747d8c'),
      images: Array.isArray(tier.images) ? tier.images.map((img) => ({ ...img, id: String(img.id) })) : [],
    }))
    : cloneDefaults();
  const images = Array.isArray(data.unassignedImages) ? data.unassignedImages : [];
  return { tiers: savedTiers, unassignedImages: images, showNames: Boolean(data.showImageNames) };
}

async function loadState(): Promise<void> {
  await appStore.loadPrefs();
  const stored = appStore.prefs[storageKey.value];
  const normalized = normalizeState(stored);
  tiers.value = normalized.tiers;
  unassignedImages.value = normalized.unassignedImages;
  showNames.value = normalized.showNames;
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
  });
}

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      void loadState();
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
  tierDragOver.value = -1;
  galleryOver.value = false;
  deleteOver.value = false;
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
  padding: 8px 10px 10px;
  gap: 8px;
  box-sizing: border-box;
}

.tier-modebar {
  display: flex;
  align-items: center;
  gap: 10px;
  color: #cfcfcf;
  font-size: 13px;
  padding: 2px 4px;
}

.tier-mode { color: #8fd3ff; }
.tier-context { color: #8a8a8a; font-size: 12px; max-width: 40vw; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tier-spacer { flex: 1; }

.tier-fill {
  border: 0;
  border-radius: 6px;
  padding: 4px 10px;
  background: #3a6ea5;
  color: #fff;
  cursor: pointer;
}

.tier-list {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  overflow-y: auto;
}

.tier-row {
  display: flex;
  min-height: 84px;
  background: #232323;
  border: 1px solid #2f2f2f;
  border-radius: 4px;
}

.tier-row.is-over { border-color: #5aa9e6; background: #262d33; }

.tier-label {
  width: 110px;
  flex: none;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  position: relative;
  color: #fff;
  font-weight: 600;
  border-radius: 3px 0 0 3px;
  padding: 6px 4px;
}

.tier-name { cursor: text; font-size: 15px; text-align: center; word-break: break-all; }
.tier-name-input {
  width: 92px;
  border: 1px solid #ffffff66;
  background: #00000033;
  color: #fff;
  border-radius: 4px;
  padding: 2px 4px;
  font-size: 14px;
  text-align: center;
}

.tier-label-actions { display: flex; align-items: center; gap: 4px; }
.tier-color { width: 18px; height: 18px; border: 0; padding: 0; background: transparent; cursor: pointer; }
.tier-del { border: 0; background: #00000044; color: #fff; border-radius: 3px; width: 18px; height: 18px; cursor: pointer; line-height: 1; }

.tier-content {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-wrap: wrap;
  align-content: flex-start;
  gap: 5px;
  padding: 6px;
  overflow-y: auto;
}

.tier-image {
  position: relative;
  width: 72px;
  height: 72px;
  border-radius: 4px;
  overflow: hidden;
  cursor: grab;
  flex: none;
}

.tier-image img { width: 100%; height: 100%; object-fit: cover; display: block; }
.tier-image-name {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  font-size: 10px;
  color: #fff;
  background: #000000aa;
  padding: 1px 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tier-bottom { display: flex; gap: 8px; height: 116px; flex: none; }

.tier-gallery {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-wrap: wrap;
  align-content: flex-start;
  gap: 5px;
  padding: 6px;
  background: #202020;
  border: 1px dashed #3a3a3a;
  border-radius: 4px;
  overflow-y: auto;
}

.tier-gallery.is-over { border-color: #5aa9e6; }
.tier-gallery-empty { color: #6f6f6f; font-size: 12px; align-self: center; margin: auto; }

.tier-tools {
  width: 132px;
  flex: none;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.tier-tool-row { display: flex; gap: 4px; }
.tier-tool {
  flex: 1;
  min-height: 30px;
  border: 1px solid #3a3a3a;
  background: #292929;
  color: #d8d8d8;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
}

.tier-tool.is-over { border-color: #e74d5a; color: #fff; background: #3a2222; }
.tier-upload.is-over { border-color: #5aa9e6; background: #22303a; }
.tier-save { border: 0; border-radius: 6px; padding: 6px 12px; background: #3a6ea5; color: #fff; cursor: pointer; }

.tier-modal {
  position: fixed;
  inset: 0;
  background: #000000aa;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9100;
}

.tier-modal-body {
  position: relative;
  width: 420px;
  max-width: 90vw;
  background: #242424;
  color: #e8e8e8;
  border-radius: 8px;
  padding: 18px 20px;
}

.tier-modal-close { position: absolute; right: 8px; top: 6px; border: 0; background: transparent; color: #aaa; font-size: 18px; cursor: pointer; }
.tier-modal-body h2, .tier-modal-body h3 { margin: 0 0 10px; font-size: 16px; }
.tier-modal-body ul { margin: 0 0 12px; padding-left: 18px; font-size: 12px; line-height: 1.8; color: #bdbdbd; }
.tier-check { display: flex; align-items: center; gap: 6px; font-size: 13px; margin-bottom: 12px; }
.tier-modal-actions { display: flex; gap: 8px; justify-content: flex-end; }

.tier-preview {
  position: fixed;
  inset: 0;
  background: #000000cc;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9200;
  cursor: zoom-out;
}

.tier-preview img { max-width: 92vw; max-height: 92vh; object-fit: contain; }

.tier-file { display: none; }
</style>
