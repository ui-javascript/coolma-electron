<template>
  <el-drawer
    v-if="kind === 'drawer'"
    v-bind="containerProps"
    :visible="visible"
    @update:visible="updateVisible"
  >
    <slot></slot>
  </el-drawer>

  <el-dialog
    v-else
    v-bind="containerProps"
    :visible="visible"
    @update:visible="updateVisible"
  >
    <slot></slot>
  </el-dialog>
</template>

<script>
export default {
  name: 'BusLayerContainer',
  props: {
    visible: { type: Boolean, default: false },
    kind: { type: String, default: 'dialog' },
    busDialogProps: { type: Object, default: () => ({}) }
  },
  computed: {
    // Keep the registry-only discriminators out of Element UI while forwarding
    // every supported Dialog/Drawer prop without maintaining a second schema.
    containerProps () {
      const { container, kind, ...props } = this.busDialogProps
      return props
    }
  },
  methods: {
    updateVisible (visible) {
      this.$emit('update:visible', visible)
    }
  }
}
</script>
