import Vue from 'vue'

// Dedicated event channel for globally registered BusDialog layers. Keeping it
// separate from the application bus prevents dialog events from colliding with
// shortcuts, network errors and other cross-feature events.
const busDialog = new Vue()

export default busDialog
