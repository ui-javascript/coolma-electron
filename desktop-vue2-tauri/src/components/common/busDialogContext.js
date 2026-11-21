// Keep this as a direct top-level call: webpack must statically see
// require.context() to emit one lazy chunk per *BusDialog.vue module.
const busDialogContext = require.context('src', true, /BusDialog\.vue$/, 'lazy')

export default busDialogContext
