<template>
  <q-dialog
    :value="value"
    transition-show="jump-down"
    transition-hide="jump-up"
    @input="onInput"
    @hide="onHide"
  >
    <q-card class="nav-dialog-card">
      <q-toolbar class="nav-dialog-toolbar">
        <q-toolbar-title class="row items-center no-wrap text-white">
          <q-icon name="explore" size="1.4em" class="q-mr-sm" />
          <span class="text-weight-medium">{{ $t('navigationCenter') }}</span>
          <q-chip
            v-if="!loading && !loadError && cards.length > 0"
            dense
            color="white"
            text-color="cyan-7"
            :label="$t('navigationCenterCount', { count: cards.length })"
            class="q-ml-sm"
          />
        </q-toolbar-title>
        <q-btn
          flat
          round
          dense
          icon="refresh"
          color="white"
          :loading="loading"
          @click="load(true)"
        >
          <q-tooltip>{{ $t('navigationCenterRetry') }}</q-tooltip>
        </q-btn>
        <q-btn flat round dense icon="close" color="white" v-close-popup />
      </q-toolbar>

      <q-card-section class="nav-dialog-body">
        <q-banner
          v-if="loadError"
          class="bg-cyan-1 text-cyan-10 q-mb-md nav-error-banner"
          rounded
        >
          <template v-slot:avatar>
            <q-icon name="error_outline" color="cyan-7" />
          </template>
          <div class="text-body2">{{ loadError.message }}</div>
          <template v-slot:action>
            <q-btn
              flat
              dense
              color="cyan-9"
              :label="$t('navigationCenterRetry')"
              @click="load(true)"
            />
            <q-btn
              v-if="loadError.code === 'NO_BASE_URL'"
              flat
              dense
              color="cyan-9"
              :label="$t('navigationCenterGoConfig')"
              @click="emitGoConfig"
            />
          </template>
        </q-banner>

        <div v-if="loading && cards.length === 0" class="nav-loading">
          <q-spinner-puff color="cyan-6" size="3em" />
          <div class="text-body2 text-grey-7 q-mt-md">{{ $t('loading') }}</div>
        </div>

        <div
          v-else-if="!loadError && cards.length === 0"
          class="nav-empty"
        >
          <q-icon name="explore_off" size="3.5em" color="cyan-4" />
          <div class="text-subtitle1 text-grey-7 q-mt-md">
            {{ $t('navigationCenterEmpty') }}
          </div>
        </div>

        <div v-else class="nav-grid">
          <q-card
            v-for="item in cards"
            :key="item.id"
            flat
            bordered
            class="nav-card"
            @click="openTarget(item)"
          >
            <div class="nav-card__image-wrap">
              <img
                v-if="item.imageUrl"
                :src="item.imageUrl"
                :alt="item.title"
                class="nav-card__image"
                loading="lazy"
                referrerpolicy="no-referrer"
                @error="onImgError($event)"
              />
              <div v-else class="nav-card__placeholder">
                <q-icon name="image_not_supported" size="2.5em" color="cyan-3" />
              </div>
              <div class="nav-card__overlay">
                <q-icon name="open_in_new" color="white" size="1.2em" />
              </div>
            </div>
            <q-card-section class="q-pa-sm">
              <div class="text-body2 text-weight-medium nav-card__title">
                {{ item.title || item.targetUrl }}
              </div>
              <div v-if="item.desc" class="text-caption text-grey-7 nav-card__desc">
                {{ item.desc }}
              </div>
            </q-card-section>
          </q-card>
        </div>
      </q-card-section>
    </q-card>
  </q-dialog>
</template>

<script>
import vkfiles from 'src/services/cloud/VkFilesService'

export default {
  name: 'NavigationDialog',
  props: {
    value: { type: Boolean, default: false },
    categoryNo: { type: String, default: '' },
    title: { type: String, default: '' }
  },
  data () {
    return {
      cards: [],
      loading: false,
      loadError: null
    }
  },
  watch: {
    value (visible) {
      if (visible) {
        this.load(false)
      }
    }
  },
  methods: {
    onInput (visible) {
      this.$emit('input', visible)
    },
    onHide () {
      this.cards = []
      this.loadError = null
    },
    async load (forceReload) {
      this.loading = true
      this.loadError = null
      try {
        const result = await vkfiles.listFiles({
          categoryNo: this.categoryNo,
          title: this.title
        })
        this.cards = Array.isArray(result) ? result : []
        if (forceReload) {
          this.$q.notify({
            message: this.$t('navigationCenterCount', { count: this.cards.length }),
            color: 'cyan-6',
            icon: 'check',
            position: 'top',
            timeout: 1500
          })
        }
      } catch (e) {
        const code = (e && e.code) || 'UNKNOWN'
        let message = e && e.message ? e.message : String(e)
        if (code === 'NO_BASE_URL') {
          message = this.$t('navigationCenterNeedBaseUrl')
        } else if (code === 'TOKEN_REQUIRED' || code === 401 || code === 403) {
          message = this.$t('navigationCenterNeedToken')
        } else {
          message = this.$t('navigationCenterLoadFailed', { message })
        }
        this.loadError = { code, message }
      } finally {
        this.loading = false
      }
    },
    openTarget (item) {
      if (!item || !item.targetUrl) {
        this.$q.notify({
          message: this.$t('navigationCenterLoadFailed', { message: 'targetUrl missing' }),
          color: 'cyan-7',
          icon: 'error',
          position: 'top'
        })
        return
      }
      const url = String(item.targetUrl)
      if (this.$q && this.$q.electron && this.$q.electron.shell) {
        this.$q.electron.shell.openExternal(url)
      } else {
        window.open(url, '_blank', 'noopener')
      }
    },
    onImgError (event) {
      const img = event && event.target
      if (!img) return
      img.style.display = 'none'
      const wrap = img.parentElement
      if (wrap && !wrap.querySelector('.nav-card__placeholder')) {
        const ph = document.createElement('div')
        ph.className = 'nav-card__placeholder'
        ph.innerHTML = '<i class="material-icons" style="font-size:2.5em;color:#93c5fd">image_not_supported</i>'
        wrap.appendChild(ph)
      }
    },
    emitGoConfig () {
      this.$emit('go-config')
    }
  }
}
</script>

<style lang="scss" scoped>
.nav-dialog-card {
  width: 80vw;
  max-width: 1080px;
  min-width: 640px;
  max-height: 86vh;
  display: flex;
  flex-direction: column;
  border-radius: 12px;
  overflow: hidden;
}

.nav-dialog-toolbar {
  background: linear-gradient(135deg, #ec4899 0%, #8b5cf6 100%);
  min-height: 52px;
  padding: 0 8px;
}

.nav-dialog-body {
  padding: 14px;
  overflow: auto;
  flex: 1 1 auto;
  background: #fafafa;
}

.body--dark .nav-dialog-body {
  background: #1f1f23;
}

.nav-loading,
.nav-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 64px 16px;
  text-align: center;
}

.nav-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 14px;
}

.nav-card {
  border-radius: 12px;
  overflow: hidden;
  cursor: pointer;
  transition: transform 0.18s ease, box-shadow 0.18s ease;
  background: #ffffff;
}

.nav-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(139, 92, 246, 0.25);
}

.body--dark .nav-card {
  background: #2a2a30;
  border-color: rgba(139, 92, 246, 0.25);
}

.nav-card__image-wrap {
  position: relative;
  width: 100%;
  padding-top: 75%; /* 4:3 */
  background: linear-gradient(135deg, rgba(236, 72, 153, 0.08) 0%, rgba(139, 92, 246, 0.12) 100%);
  overflow: hidden;
}

.nav-card__image {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.nav-card__placeholder {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.nav-card__overlay {
  position: absolute;
  right: 8px;
  bottom: 8px;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: linear-gradient(135deg, #ec4899 0%, #8b5cf6 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.18s ease;
}

.nav-card:hover .nav-card__overlay {
  opacity: 1;
}

.nav-card__title {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.nav-card__desc {
  margin-top: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.nav-error-banner {
  border: 1px solid rgba(236, 72, 153, 0.3);
}

@media (max-width: 700px) {
  .nav-dialog-card {
    width: 96vw;
    min-width: 0;
  }
  .nav-grid {
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  }
}
</style>