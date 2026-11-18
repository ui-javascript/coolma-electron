/**
 * 皮肤系统 Mixin
 * 管理皮肤切换、主题色应用
 */
import bus from 'components/common/bus'
import { EVENTS as events } from 'src/utils/const/eventsConst'

const SKIN_COLORS = {
  baiyang: null,
  nezha: { main: '#b5817d', rgb: '181, 129, 125' },
  infp: { main: '#21b56f', rgb: '33, 181, 111' }
}

const SKIN_NOTIFY_COLORS = {
  baiyang: { bg: 'rgba(64, 158, 255, 0.9)', text: '#fff' },
  nezha: { bg: 'rgba(181, 129, 125, 0.95)', text: '#fff' },
  infp: { bg: 'rgba(33, 181, 111, 0.9)', text: '#fff' }
}

export const skinEffectEvents = {
  baiyang: events.UI_EVENTS.playHeartEffect,
  nezha: events.UI_EVENTS.playFireEffect,
  infp: events.UI_EVENTS.playButterflyEffect
}

export const skinMixin = {
  data () {
    return {
      _skinEffectHandler: null
    }
  },
  computed: {
    skinNotifyColors () {
      return SKIN_NOTIFY_COLORS
    }
  },
  methods: {
    /**
     * 应用皮肤主题色到 CSS 变量
     * @param {string} skin - 皮肤名称
     */
    applySkinThemeColor (skin) {
      const colors = SKIN_COLORS[skin]
      const root = document.documentElement
      if (colors === null) {
        root.style.removeProperty('--themeColor')
        root.style.removeProperty('--themeColor90')
        root.style.removeProperty('--themeColor80')
        root.style.removeProperty('--themeColor70')
        root.style.removeProperty('--themeColor60')
        root.style.removeProperty('--themeColor50')
        root.style.removeProperty('--themeColor40')
        root.style.removeProperty('--themeColor30')
        root.style.removeProperty('--themeColor20')
        root.style.removeProperty('--themeColor10')
      } else {
        root.style.setProperty('--themeColor', `rgba(${colors.rgb}, 1)`)
        root.style.setProperty('--themeColor90', `rgba(${colors.rgb}, .9)`)
        root.style.setProperty('--themeColor80', `rgba(${colors.rgb}, .8)`)
        root.style.setProperty('--themeColor70', `rgba(${colors.rgb}, .7)`)
        root.style.setProperty('--themeColor60', `rgba(${colors.rgb}, .6)`)
        root.style.setProperty('--themeColor50', `rgba(${colors.rgb}, .5)`)
        root.style.setProperty('--themeColor40', `rgba(${colors.rgb}, .4)`)
        root.style.setProperty('--themeColor30', `rgba(${colors.rgb}, .3)`)
        root.style.setProperty('--themeColor20', `rgba(${colors.rgb}, .2)`)
        root.style.setProperty('--themeColor10', `rgba(${colors.rgb}, .1)`)
      }
    },

    /**
     * 触发皮肤特效动画
     * @param {string} skin - 皮肤名称
     */
    triggerSkinEffect (skin) {
      const effectEvent = skinEffectEvents[skin]
      if (effectEvent) {
        bus.$emit(effectEvent)
      }
    },

    /**
     * 显示皮肤切换通知
     * @param {string} skin - 皮肤名称
     */
    notifySkinSwitched (skin) {
      const skinColor = SKIN_NOTIFY_COLORS[skin] || { bg: 'rgba(64, 158, 255, 0.9)', text: '#fff' }
      this.$q.notify({
        message: this.$t('skinSwitched', { name: this.$t(`skin_${skin}`) }),
        type: 'positive',
        position: 'top',
        icon: 'check',
        color: skinColor.bg,
        textColor: skinColor.text
      })
    }
  },
  beforeDestroy () {
    if (this._skinEffectHandler) {
      bus.$off(events.UI_EVENTS.playHeartEffect, this._skinEffectHandler)
      bus.$off(events.UI_EVENTS.playFireEffect, this._skinEffectHandler)
      bus.$off(events.UI_EVENTS.playButterflyEffect, this._skinEffectHandler)
    }
  }
}

export default skinMixin
