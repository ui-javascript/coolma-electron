<template>
  <q-dialog
    ref="dialog"
    @hide="onDialogHide"
    :seamless="true"
    position="top"
    class="offline-sync-dialog"
  >
    <q-card class="offline-sync-card">
      <!-- Header -->
      <q-card-section class="offline-sync-header">
        <div class="row items-center no-wrap">
          <q-icon name="cloud_sync" color="primary" size="28px" class="q-mr-sm" />
          <div>
            <div class="text-subtitle1 text-weight-bold">{{ $t('offlineNotesFound') }}</div>
            <div class="text-caption text-grey">{{ $t('offlineNotesFoundHint', { count: noteCount }) }}</div>
          </div>
        </div>
      </q-card-section>

      <!-- Note List Preview -->
      <q-card-section v-if="noteCount > 0" class="offline-sync-preview">
        <div class="preview-list">
          <div
            v-for="note in previewNotes"
            :key="note.id"
            class="preview-item"
          >
            <q-icon name="description" size="16px" class="q-mr-xs text-grey" />
            <span class="preview-title">{{ note.title }}</span>
            <q-icon
              :name="note.category === OFFLINE_ROOT_CATEGORY ? 'folder_special' : 'folder'"
              size="14px"
              class="q-ml-sm text-grey"
            />
            <span class="preview-category">{{ formatCategory(note.category) }}</span>
          </div>
          <div v-if="noteCount > PREVIEW_LIMIT" class="preview-more">
            {{ $t('offlineNotesMore', { count: noteCount - PREVIEW_LIMIT }) }}
          </div>
        </div>
      </q-card-section>

      <!-- Merge Rule Info -->
      <q-card-section class="offline-sync-rule">
        <div class="rule-header">
          <q-icon name="info" size="16px" class="q-mr-xs text-info" />
          <span class="text-caption text-grey-7">{{ $t('mergeRuleTitle') }}</span>
        </div>
        <div class="rule-content text-caption text-grey-7">
          {{ $t('mergeRuleLocalOverride') }}
        </div>
      </q-card-section>

      <!-- Actions -->
      <q-card-actions align="right" class="offline-sync-actions">
        <q-btn
          flat
          :label="$t('skipSync')"
          color="grey"
          @click="skipSync"
        />
        <q-btn
          unelevated
          :label="$t('syncNow')"
          color="primary"
          icon="cloud_upload"
          @click="syncNow"
          :loading="isSyncing"
        />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script>
const PREVIEW_LIMIT = 5
const OFFLINE_ROOT_CATEGORY = '/My Notes/'  // 统一使用英文，排除国际化影响

export default {
  name: 'syncOfflinePromptDialog',

  data() {
    return {
      PREVIEW_LIMIT,
      OFFLINE_ROOT_CATEGORY,
      noteCount: 0,
      previewNotes: [],
      isSyncing: false
    }
  },

  methods: {
    async show(notes = []) {
      this.noteCount = notes.length
      this.previewNotes = notes.slice(0, PREVIEW_LIMIT)
      this.isSyncing = false
      this.$refs.dialog.show()
    },

    hide() {
      this.$refs.dialog.hide()
    },

    onDialogHide() {
      this.$emit('hide')
    },

    formatCategory(category) {
      if (!category || category === '/' || category === OFFLINE_ROOT_CATEGORY) {
        return this.$t('myNotes')
      }
      try {
        const parts = category.split('/').filter(c => c)
        return parts[parts.length - 1] || this.$t('myNotes')
      } catch (e) {
        return this.$t('myNotes')
      }
    },

    async syncNow() {
      this.isSyncing = true
      try {
        await this.$emit('sync')
      } finally {
        this.isSyncing = false
        this.hide()
      }
    },

    skipSync() {
      this.hide()
      this.$emit('skip')
    }
  }
}
</script>

<style lang="scss" scoped>
.offline-sync-card {
  min-width: 480px;
  max-width: 560px;
  max-height: 70vh;
  overflow-y: auto;
}

.offline-sync-header {
  background: linear-gradient(135deg, #e3f2fd 0%, #bbdefb 100%);
  border-bottom: 1px solid #90caf9;
}

.offline-sync-preview {
  padding-top: 12px;
  padding-bottom: 12px;
}

.preview-list {
  max-height: 200px;
  overflow-y: auto;
}

.preview-item {
  display: flex;
  align-items: center;
  padding: 6px 8px;
  border-radius: 4px;
  transition: background-color 0.15s;

  &:hover {
    background-color: var(--floatHoverColor);
  }
}

.preview-title {
  flex: 1;
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.preview-category {
  font-size: 11px;
  color: #999;
  max-width: 80px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.preview-more {
  padding: 6px 8px;
  font-size: 12px;
  color: #999;
  text-align: center;
}

.offline-sync-rule {
  background: #fafafa;
  border-top: 1px solid #eee;
  border-bottom: 1px solid #eee;
  padding-top: 10px;
  padding-bottom: 10px;
}

.rule-header {
  display: flex;
  align-items: center;
  margin-bottom: 4px;
}

.rule-content {
  padding-left: 20px;
  line-height: 1.5;
}

.offline-sync-actions {
  padding: 12px 16px;
}
</style>
