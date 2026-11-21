<template>
  <div
    class='rune-card'
    :class='cardClasses'
    :style='cardStyle'
    :draggable='draggable'
    @click='onCardClick'
  >
    <div v-if='isBuiltin' class='rune-card-builtin-badge'>
      <q-icon name='verified' size='12px' />
      <span>{{ resolvedBuiltinBadgeLabel }}</span>
    </div>
    <div v-if='selectable && selectionMode' class='rune-card-select-indicator' @click.stop='$emit("toggle-select", rune.id)'>
      <q-icon :name='selected ? "check_circle" : "radio_button_unchecked"' size='14px' :color='selected ? "primary" : "grey-5"' />
    </div>
    <div class='rune-card-header' :style='headerStyle'>
      <div class='rune-card-icon' :style='iconBadgeStyle'>
        <q-icon v-if='hasIcon' :name='rune.icon' class='rune-card-icon-glyph' />
        <span v-else class='rune-card-icon-text'>{{ runeInitial }}</span>
      </div>
    </div>
    <div class='rune-card-body'>
      <div class='rune-card-name'>
        <span class='rune-name-prefix'>{{ namePrefix }}</span>
        <span class='rune-name-wrapper'>
          <span class='rune-name-text'>{{ rune.name }}</span>
          <span v-if='nameSuffix' class='rune-name-suffix'>{{ nameSuffix }}</span>
        </span>
      </div>
      <div class='rune-card-desc'>{{ resolvedDesc }}</div>
    </div>
    <div class='rune-card-footer'>
      <q-btn
        flat
        dense
        no-caps
        unelevated
        size='sm'
        :label="viewOnly ? resolvedViewLabel : resolvedEditLabel"
        :color='isBuiltin ? "white" : undefined'
        class='rune-card-footer-btn'
        @click.stop='$emit("edit", rune)'
      />
      <q-btn
        v-if='!disableDelete'
        flat dense size='sm'
        :label="resolvedDeleteLabel"
        color='red-3'
        class='rune-card-footer-btn-right'
        @click.stop='$emit("delete", rune)'
      />
      <span v-else class='rune-card-footer-spacer' />
    </div>
  </div>
</template>

<script>
const isChineseCharacter = char => /[\u3400-\u9FFF]/.test(char)
const isAlphabetCharacter = char => /[A-Za-z]/.test(char)

const getRuneInitial = rune => {
  const sourceText = String(rune?.name || rune?.text || rune?.label || '').trim()
  const firstChar = Array.from(sourceText)[0]

  if (!firstChar) return '符'
  if (isChineseCharacter(firstChar)) return firstChar
  if (isAlphabetCharacter(firstChar)) return firstChar.toUpperCase()
  return firstChar
}

export default {
  name: 'runeCard',
  props: {
    rune: {
      type: Object,
      required: true
    },
    nameLabel: {
      type: String,
      default: ''
    },
    descLabel: {
      type: String,
      default: ''
    },
    editLabel: {
      type: String,
      default: ''
    },
    deleteLabel: {
      type: String,
      default: ''
    },
    disableDelete: {
      type: Boolean,
      default: false
    },
    disableDrag: {
      type: Boolean,
      default: false
    },
    isBuiltin: {
      type: Boolean,
      default: false
    },
    viewOnly: {
      type: Boolean,
      default: false
    },
    builtinBadgeLabel: {
      type: String,
      default: ''
    },
    i18nDescKey: {
      type: String,
      default: ''
    },
    selectable: {
      type: Boolean,
      default: false
    },
    selectionMode: {
      type: Boolean,
      default: false
    },
    selected: {
      type: Boolean,
      default: false
    }
  },
  computed: {
    hasIcon () {
      return Boolean(this.rune.icon)
    },
    runeInitial () {
      return getRuneInitial(this.rune)
    },
    namePrefix () {
      if (this.nameLabel) {
        return '@'
      }
      return '<'
    },
    nameSuffix () {
      if (this.nameLabel) {
        return ''
      }
      return ' />'
    },
    iconBadgeStyle () {
      return {
        background: 'rgba(255, 255, 255, 0.16)',
        borderColor: `${this.rune.color || '#7E57C2'}66`
      }
    },
    cardStyle () {
      return {
        borderColor: this.rune.color + '66'
      }
    },
    cardClasses () {
      return {
        'rune-card--readonly': this.disableDrag,
        'rune-card--builtin': this.isBuiltin,
        'rune-card--selected': this.selected
      }
    },
    draggable () {
      return !this.disableDrag
    },
    headerStyle () {
      return {
        background: `linear-gradient(135deg, ${this.rune.color}dd 0%, ${this.rune.color}88 100%)`
      }
    },
    resolvedEditLabel () {
      return this.editLabel || this.$t('runeCardEdit')
    },
    resolvedViewLabel () {
      return this.$t('echoCardView') || this.$t('runeCardView') || '查看'
    },
    resolvedDeleteLabel () {
      return this.deleteLabel || this.$t('runeCardDelete')
    },
    resolvedBuiltinBadgeLabel () {
      return this.builtinBadgeLabel || this.$t('echoBuiltinBadge') || 'Built-in'
    },
    resolvedDesc () {
      if (this.i18nDescKey) {
        const translated = this.$t(this.i18nDescKey)
        if (translated && translated !== this.i18nDescKey) return translated
      }
      return this.rune.desc || ''
    }
  },
  methods: {
    onCardClick (event) {
      if (this.selectable && this.selectionMode) {
        event.stopPropagation()
        this.$emit('toggle-select', this.rune.id)
      }
    }
  }
}
</script>

<style scoped>
.rune-card {
  display: flex;
  flex-direction: column;
  width: 100%;
  min-width: 0;
  min-height: 120px;
  height: 100%;
  border-radius: 8px;
  border: 1.5px solid;
  overflow: hidden;
  background: #1a1a2e;
  color: #e0e0e0;
  cursor: grab;
  transition: transform 0.2s, box-shadow 0.2s;
  user-select: none;
  position: relative;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.05), 0 1px 2px rgba(0, 0, 0, 0.25);
}

.rune-card--readonly {
  cursor: default;
}

.rune-card--readonly:hover {
  transform: none;
  box-shadow: none;
}

.rune-card--builtin {
  border-style: solid;
}

.rune-card--selected {
  border-color: #7E57C2 !important;
  box-shadow: 0 0 0 2px rgba(126, 87, 194, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.05), 0 1px 2px rgba(0, 0, 0, 0.25);
}

.rune-card-builtin-badge {
  position: absolute;
  top: 4px;
  right: 4px;
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 1px 5px;
  font-size: 0.55rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: #fff;
  background: rgba(0, 0, 0, 0.45);
  border-radius: 999px;
  backdrop-filter: blur(4px);
  z-index: 2;
  text-transform: uppercase;
}

.rune-card-select-indicator {
  position: absolute;
  top: -6px;
  left: 0px;
  z-index: 2;
}

.rune-card-footer-spacer {
  width: 1px;
}

.rune-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.45);
  z-index: 1;
}

.rune-card:active {
  cursor: grabbing;
}

.rune-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 8px 4px;
  height: 46px;
  box-sizing: border-box;
}

.rune-card-icon {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  border: 1px solid transparent;
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.22);
  backdrop-filter: blur(6px);
  flex-shrink: 0;
}

.rune-card-icon-glyph {
  font-size: 0.95rem;
  color: #fff;
  filter: drop-shadow(0 1px 3px rgba(0, 0, 0, 0.35));
}

.rune-card-icon-text {
  font-size: 0.78rem;
  font-weight: 700;
  line-height: 1;
  letter-spacing: 0.02em;
  text-transform: uppercase;
}

.rune-card-body {
  flex: 1;
  padding: 4px 8px 2px;
  min-height: 0;
  box-sizing: border-box;
  overflow: hidden;
}

.rune-card-name {
  font-size: 0.74rem;
  font-weight: 600;
  color: #fff;
  margin-bottom: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  letter-spacing: 0.01em;
}

.rune-name-wrapper {
  display: inline;
}

.rune-name-prefix {
  color: rgba(255, 255, 255, 0.7);
}

.rune-name-text {
  color: #fff;
}

.rune-name-suffix {
  color: rgba(255, 255, 255, 0.7);
}

.rune-card-desc {
  font-size: 0.6rem;
  color: rgba(255, 255, 255, 0.75);
  line-height: 1.3;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.rune-card-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 2px 4px 4px;
  background: rgba(0, 0, 0, 0.28);
  height: 26px;
  box-sizing: border-box;
}

.rune-card-footer .q-btn {
  font-size: 0.55rem;
  min-height: 18px;
  padding: 0 2px;
  color: rgba(255, 255, 255, 0.85);
  line-height: 1.1;
}

.rune-card-footer-btn {
  margin-left: 0;
}

.rune-card-footer-btn-right {
  margin-left: auto;
}
</style>
