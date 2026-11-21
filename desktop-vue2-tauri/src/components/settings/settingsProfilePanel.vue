<template>
  <SettingsSectionContent :title='$t("cloudProfile")' accent-color='red-7'>
    <q-banner rounded dense class='bg-red-1 text-red-10 q-mb-md'>
      <template v-slot:avatar>
        <q-icon name='info_outline' color='red-7' />
      </template>
      {{ $t('cloudProfileHint') }}
    </q-banner>

    <div class='profile-row q-mb-md'>
      <div class='text-body2 text-weight-medium q-mb-xs profile-label'>
        {{ $t('cloudProfileCity') }}
      </div>
      <div class='text-caption text-grey-6 q-mb-sm'>
        {{ $t('cloudProfileCityHint') }}
      </div>
      <CityPickerField v-model='city' :placeholder='$t("cityPickerPlaceholder")' />
    </div>

    <q-separator class='q-my-sm' />

    <div class='profile-current'>
      <div class='text-caption text-grey-7 q-mb-xs'>
        {{ $t('cloudProfileCityCurrent') }}
      </div>
      <div v-if='hasCity' class='text-body1 profile-current__value'>
        <q-icon name='place' size='1em' color='red-7' class='q-mr-xs' />
        <span>{{ city.province }}</span>
        <span v-if='city.city'> / {{ city.city }}</span>
        <span v-if='city.district'> / {{ city.district }}</span>
      </div>
      <div v-else class='text-body2 text-grey-6 profile-current__empty'>
        <q-icon name='place' size='1em' color='grey-5' class='q-mr-xs' />
        {{ $t('cloudProfileCityEmpty') }}
      </div>
      <div v-if='lastSavedAt' class='text-caption text-grey-6 q-mt-xs profile-current__saved'>
        <q-icon name='check_circle' size='0.9em' color='red-7' class='q-mr-xs' />
        {{ $t('cloudProfileSavedAt', { time: lastSavedAt }) }}
      </div>
      <div v-else-if='saving' class='text-caption text-grey-6 q-mt-xs profile-current__saving'>
        <q-icon name='cloud_upload' size='0.9em' color='grey-6' class='q-mr-xs' />
        {{ $t('cloudProfileSaving') }}
      </div>
      <div v-if='saveError' class='text-caption text-negative q-mt-xs profile-current__error'>
        <q-icon name='error_outline' size='0.9em' color='negative' class='q-mr-xs' />
        {{ $t('cloudProfileSaveFailed', { error: saveError }) }}
      </div>
    </div>
  </SettingsSectionContent>
</template>

<script>
import SettingsSectionContent from 'components/settings/SettingsSectionContent'
import CityPickerField from 'components/common/cityPickerField'
import DatabaseClient from 'src/utils/DatabaseClient'

const STORAGE_KEY = 'setting/profile/city'
const EMPTY_CITY = Object.freeze({ province: '', city: '', district: '' })

function cloneEmpty () {
  return { province: '', city: '', district: '' }
}

export default {
  name: 'SettingsProfilePanel',
  components: {
    SettingsSectionContent,
    CityPickerField
  },
  data () {
    return {
      city: cloneEmpty(),
      loaded: false,
      saving: false,
      lastSavedAt: '',
      saveError: ''
    }
  },
  computed: {
    hasCity () {
      return Boolean(this.city.province || this.city.city || this.city.district)
    }
  },
  watch: {
    city: {
      deep: true,
      handler (val) {
        if (!this.loaded) return
        this._persist(val)
      }
    }
  },
  async mounted () {
    await this._load()
    this.$nextTick(() => {
      this.loaded = true
    })
  },
  methods: {
    async _load () {
      try {
        const stored = await DatabaseClient.appState.get(STORAGE_KEY)
        if (stored == null) {
          this.city = cloneEmpty()
          return
        }
        const parsed = typeof stored === 'string' ? JSON.parse(stored) : stored
        this.city = this._normalize(parsed)
      } catch (err) {
        console.warn('[SettingsProfilePanel] load city failed:', err && err.message)
        this.city = cloneEmpty()
      }
    },
    async _persist (val) {
      if (this.saving) return
      const normalized = this._normalize(val)
      this.saving = true
      this.saveError = ''
      try {
        const ok = await DatabaseClient.appState.set(STORAGE_KEY, normalized)
        if (ok === false) {
          this.saveError = 'save failed'
          console.warn('[SettingsProfilePanel] save city returned false')
          return
        }
        this.lastSavedAt = this._formatNow()
      } catch (err) {
        this.saveError = (err && err.message) || 'unknown'
        console.error('[SettingsProfilePanel] save city failed:', err && err.message)
      } finally {
        this.saving = false
      }
    },
    _normalize (val) {
      const base = val && typeof val === 'object' ? val : {}
      return {
        province: typeof base.province === 'string' ? base.province : '',
        city: typeof base.city === 'string' ? base.city : '',
        district: typeof base.district === 'string' ? base.district : ''
      }
    },
    _formatNow () {
      try {
        const d = new Date()
        const pad = (n) => String(n).padStart(2, '0')
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
      } catch (_) {
        return ''
      }
    }
  }
}
</script>

<style lang='scss' scoped>
.profile-row {
  max-width: 360px;
}

.profile-label {
  line-height: 1.4;
}

.profile-current {
  padding: 8px 0 4px;
}

.profile-current__value {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  color: rgba(0, 0, 0, 0.85);
}

.profile-current__empty {
  display: flex;
  align-items: center;
}

.profile-current__saved {
  display: flex;
  align-items: center;
}

.body--dark .profile-current__value {
  color: rgba(255, 255, 255, 0.85);
}
</style>
