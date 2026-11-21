import DatabaseClient from 'src/utils/DatabaseClient'

export const APP_STATE_KEYS = {
  currentCategory: 'workspace.currentCategory',
  sidebarTreeType: 'workspace.sidebarTreeType',
  categoryTreeExpandedKeys: 'workspace.categoryTreeExpandedKeys',
  syncStatus: 'workspace.syncStatus'
}

export async function loadWorkspaceState () {
  try {
    return await DatabaseClient.appState.getMany(Object.values(APP_STATE_KEYS))
  } catch (error) {
    console.warn('[workspaceState] Failed to load app state:', error)
    return {}
  }
}

export async function saveWorkspaceStateValue (key, value) {
  try {
    await DatabaseClient.appState.set(key, value)
  } catch (error) {
    console.warn(`[workspaceState] Failed to save ${key}:`, error)
  }
}
