<template>
  <div class="bus-dialog-layer-host">
    <busLayerContainer
      v-for="session in sessions"
      :key="session.id"
      :visible="true"
      :kind="session.busDialogProps.kind"
      :bus-dialog-props="session.busDialogProps"
      @update:visible="onVisibleChange(session, $event)"
    >
      <component
        :is="session.component"
        :key="session.id"
        v-bind="session.contentProps"
        @close="closeSession(session)"
      />
    </busLayerContainer>
  </div>
</template>

<script>
import BusLayerContainer from './BusLayerContainer.vue'

// One vue-layerx portal can host many independent Element UI dialog shells.
// Every session owns its component, payload and close lifecycle.
export default {
  name: 'BusDialogLayerHost',
  components: {
    busLayerContainer: BusLayerContainer
  },
  props: {
    sessions: { type: Array, required: true }
  },
  methods: {
    closeSession (session) {
      if (typeof session.close === 'function') {
        session.close()
      }
    },
    onVisibleChange (session, visible) {
      if (!visible) this.closeSession(session)
    }
  }
}
</script>
