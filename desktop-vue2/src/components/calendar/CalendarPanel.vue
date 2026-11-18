<template>
  <div class="calendar-panel full-height column">
    <q-scroll-area
      :thumb-style="thumbStyle"
      :bar-style="barStyle"
      :class="`exclude-header note-list${$q.dark.isActive ? '-dark' : ''}`"
      class="col"
    >
      <!-- fullscreen=false 为卡片模式（非全屏日历）；headerRender 用月份选择器替代年/月下拉 -->
      <a-calendar
        :value="pickDate"
        :fullscreen="false"
        @select="onSelect"
        @panelChange="onPanelChange"
      >
        <template slot="dateCellRender" slot-scope="val">
          <span
            v-if="hasNote(val)"
            class="calendar-note-dot"
          />
        </template>
        <template slot="headerRender" slot-scope="{ value, type, onChange, onTypeChange }">
          <div class="calendar-panel-header">
            <div class="calendar-header-group">
              <span class="calendar-header-label">{{ $t('calendarFilterLabel') }}</span>
              <a-select
                :value="calendarDateBasis"
                size="small"
                class="calendar-date-basis-select"
                :get-popup-container="getMonthPickerPopupContainer"
                @change="onDateBasisChange"
              >
                <a-select-option
                  v-for="opt in calendarDateBasisOptions"
                  :key="opt.value"
                  :value="opt.value"
                >
                  {{ opt.label }}
                </a-select-option>
              </a-select>
            </div>
            <a-month-picker
              :value="value"
              size="small"
              format="YYYY年M月"
              class="calendar-month-picker"
              :get-calendar-container="getMonthPickerPopupContainer"
              @change="(m) => onMonthPickerChange(m, onChange, onTypeChange, type)"
            />
          </div>
        </template>
      </a-calendar>
    </q-scroll-area>
  </div>
</template>

<script>
import moment from 'moment'
import { createNamespacedHelpers } from 'vuex'
import { CalendarDateBasisEnum } from 'src/utils/enum'

const { mapState: mapClientState, mapActions: mapClientActions } = createNamespacedHelpers('client')
const { mapActions: mapServerActions } = createNamespacedHelpers('server')
const { mapState: mapServerState } = createNamespacedHelpers('server')

export default {
  name: 'CalendarPanel',
  data () {
    return {
      pickDate: moment()
    }
  },
  computed: {
    calendarDateBasisOptions () {
      return CalendarDateBasisEnum.items.map(c => ({ value: c.value, label: c.label }))
    },
    thumbStyle () {
      return { display: 'none' }
    },
    barStyle () {
      return { display: 'none' }
    },
    ...mapClientState(['calendarSelectedDate', 'calendarDateBasis']),
    ...mapServerState(['calendarNoteDates'])
  },
  watch: {
    calendarSelectedDate (s) {
      if (!s) return
      const ymd = this.toYmd(this.pickDate)
      if (ymd === s) return
      const d = this.parseYmd(s)
      if (d) this.pickDate = moment(d)
    }
  },
  mounted () {
    if (this.calendarSelectedDate) {
      const d = this.parseYmd(this.calendarSelectedDate)
      if (d) this.pickDate = moment(d)
    }
    this.fetchMonthNoteDates()
  },
  methods: {
    parseYmd (s) {
      const parts = s.split('-').map(p => parseInt(p, 10))
      if (parts.length !== 3 || parts.some(n => Number.isNaN(n))) return null
      return new Date(parts[0], parts[1] - 1, parts[2])
    },
    toYmd (m) {
      return m.format('YYYY-MM-DD')
    },
    hasNote (val) {
      if (!val || !this.calendarNoteDates) return false
      const ymd = val.format('YYYY-MM-DD')
      return this.calendarNoteDates.includes(ymd)
    },
    onSelect (val) {
      const ymd = val.format('YYYY-MM-DD')
      if (ymd === this.calendarSelectedDate) return
      this.toggleChanged({ key: 'calendarSelectedDate', value: ymd })
      this.getCategoryNotes()
    },
    onDateBasisChange (val) {
      if (val === this.calendarDateBasis) return
      this.toggleChanged({ key: 'calendarDateBasis', value: val })
      this.getCategoryNotes()
      this.fetchMonthNoteDates()
    },
    getMonthPickerPopupContainer (trigger) {
      return trigger?.parentElement || document.body
    },
    onMonthPickerChange (m, headerOnChange, onTypeChange, type) {
      if (!m || !m.isValid()) return
      if (type === 'year') onTypeChange('month')
      const dim = m.daysInMonth()
      const d = Math.min(this.pickDate.date(), dim)
      const next = m.clone().date(d)
      headerOnChange(next)
    },
    onPanelChange (val) {
      const m = moment.isMoment(val) ? val.clone() : moment(val)
      if (!m.isValid()) return
      this.pickDate = m
      const ymd = m.format('YYYY-MM-DD')
      if (ymd !== this.calendarSelectedDate) {
        this.toggleChanged({ key: 'calendarSelectedDate', value: ymd })
      }
      this.getCategoryNotes()
      this.fetchMonthNoteDates()
    },
    fetchMonthNoteDates () {
      const y = this.pickDate.year()
      const m = this.pickDate.month() + 1
      this.fetchCalendarNoteDates({ year: y, month: m })
    },
    ...mapClientActions(['toggleChanged']),
    ...mapServerActions(['getCategoryNotes', 'fetchCalendarNoteDates'])
  }
}
</script>

<style lang="scss">
.calendar-panel {
  min-width: 0;
  min-height: 0;
}

.calendar-panel-header {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 12px;
  padding: 8px 14px 8px 0;
}

.calendar-header-group {
  display: flex;
  align-items: center;
  gap: 6px;
}

.calendar-header-label {
  font-size: 12px;
  color: #888;
  white-space: nowrap;
}

.calendar-date-basis-select {
  min-width: 104px;
  max-width: 120px;
}

.calendar-month-picker {
  max-width: 100px;
}

.calendar-note-dot {
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background-color: #1890ff;
  font-weight: bold;
}
</style>
