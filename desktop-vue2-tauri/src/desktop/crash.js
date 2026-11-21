import { Notify } from 'quasar'
import { invoke, isTauri } from '@tauri-apps/api/core'
import { logWarn } from './logger'

/**
 * 上次异常退出的提示。
 *
 * 原版由 electron-unhandled 弹窗并给一键提 issue 的入口；这里由 Rust 侧的
 * 运行标记检测出来（见 src-tauri/src/crash.rs），渲染层启动时读一次并提示。
 * 报告读完即被 Rust 删除，同一次崩溃不会反复弹。
 */
export async function reportLastCrash () {
  if (!isTauri()) return
  let report
  try {
    report = await invoke('last_crash_report')
  } catch (error) {
    logWarn('[崩溃检测] 读取报告失败：' + (error?.message || error))
    return
  }
  if (!report) return
  Notify.create({
    message: '上次运行意外退出',
    caption: report.started_at ? `发生于 ${report.started_at} 启动的那次运行，可查看日志排查` : '可查看日志排查',
    type: 'negative',
    timeout: 0,
    actions: [{
      label: '查看日志',
      color: 'white',
      handler: () => {
        invoke('open_log_file').catch(error => logWarn('[崩溃检测] 打开日志失败：' + (error?.message || error)))
      }
    }]
  })
}
