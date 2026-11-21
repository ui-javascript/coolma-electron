import api from 'src/utils/api'
import debugLogger from './utils/debugLogger'
import ServerFileStorage from './utils/storage/ServerFileStorage'
const refreshWizToken = (app) => {
  const interval = 5 * 60 * 1000
  let disposed = false
  let timer
  const scheduleNext = () => {
    if (disposed) return
    const elapsed = (Date.now() - 30000) % interval
    timer = setTimeout(async () => {
      try {
        if (ServerFileStorage.isKeyExistsInLocalStorage('token') && app.isLogin) {
          try {
            await api.AccountServerApi.keepTokenAlive()
          } catch (error) {
            await app.reLogin()
          }
        }
      } catch (error) {
        console.warn('[ScheduleHandler] Token refresh failed:', error)
      } finally {
        scheduleNext()
      }
    }, interval - elapsed)
  }
  scheduleNext()
  return () => {
    disposed = true
    clearTimeout(timer)
  }
}

export default {
  RegisterScheduleJobs (app) {
    debugLogger.Info('[API Handler] Render Process registers schedule handler successfully!')
    return refreshWizToken(app)
  }
}
