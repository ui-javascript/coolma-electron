// import channels from 'app/share/channels'
// import i18n from 'boot/i18n'
import fs from 'fs-extra'
import path from 'path'
import { sendNotification, triggerRendererContextMenu } from './api-invoker'
import { BrowserWindow, shell, Menu, MenuItem } from 'electron'
import { checkUpdates, needUpdate, quitAndInstall } from './menu/actions/memocast'
import { cacheNoteImage, saveTempImage, saveBuffer, exportImageOfMarkdown, injectClickFunction } from './utils/helper'
import { uploadImagesByWiz } from './utils/wiz-resource-helper'
import { execRequest } from './service/request'
import i18n from './i18n'
import log from 'electron-log'

const { uploadImagesByPicGo } = require('./utils/PicGoUtils')
const { parseVueSfc } = require('./service/vueSfcCompilerService')

const {
  ipcMain,
  app,
  dialog
} = require('electron')
const sanitize = require('sanitize-filename')

/**
 * 把 IPC 边界传入的 base 字符串规范化成 vuepress 期望的形态。
 *
 * 约定（与 vuepress 1.x base 文档一致：绝对 base 必须以 / 开头和结尾）：
 *   ''         → ''
 *   './'       → './'
 *   './foo'    → './foo/'
 *   '/foo'     → '/foo/'
 *   '/foo/'    → '/foo/'
 *   '/'        → '/'
 *   '/foo///'  → '/foo/'
 *
 * 与 blog-deploy-handler 的 normalizeBase 同形态；这里在 IPC 边界先做一次,
 * 是为了让"用户实际写入文件的值"和"日志里看到的值"一致。
 */
function normalizeBase (raw) {
  if (!raw || typeof raw !== 'string') return ''
  const trimmed = raw.trim()
  if (!trimmed) return ''
  if (trimmed === './') return './'
  const quoted = trimmed.match(/^(['"`])(.*)\1$/)
  const v = quoted ? quoted[2] : trimmed
  if (v.startsWith('/')) {
    const collapsed = '/' + v.replace(/^\/+/, '').replace(/\/+$/, '')
    if (collapsed === '/') return '/'
    return collapsed + '/'
  }
  if (v.startsWith('./') || v.startsWith('../')) {
    return v.endsWith('/') ? v : v + '/'
  }
  return v
}

/**
 * 在本地注册对应的事件句柄，用于解决对应的事件
 * @param {string} channel 频道名称
 * @param {Function} api 操作函数
 * @returns {Promise<void>}
 */
export async function handleApi (channel, api) {
  ipcMain.handle(channel, async (event, ...args) => {
    try {
      const ret = await api(event, ...args)
      return ret
    } catch (err) {
      console.error(err)
      return {
        error: {
          code: err.code,
          message: err.message,
          externCode: err.externCode,
          sourceStack: err.stack,
          isNetworkError: err.isAxiosError,
          networkStatus: err.response?.status
        }
      }
    }
  })
}

export default {
  registerApiHandler () {
    handleApi('vue-sfc:parse', (event, payload = {}) => {
      const source = typeof payload === 'string' ? payload : payload.source
      const options = typeof payload === 'object' && payload !== null ? payload.options : {}
      return parseVueSfc(source, options)
    }).catch(err => { throw err })

    /**
     *  export single note
     */
    handleApi('export-markdown-file', (event, { content, kbGuid, docGuid, resources, title }) => {
      return dialog.showSaveDialog({
        title: i18n.t('export'),
        defaultPath: path.join(app.getPath('documents'), `${title}`),
        filters: [
          {
            name: 'Markdown File',
            extensions: ['md', 'markdown']
          }
        ]
      }).then((result) => {
        if (result.canceled) return
        content = exportImageOfMarkdown(content, kbGuid, docGuid, resources, result.filePath)
        fs.writeFile(result.filePath, content).then(() => {
          sendNotification({
            msg: 'ExportSuccessfully',
            type: 'positive',
            icon: 'check',
            filePath: result.filePath
          }, event).catch(err => throw err)
        })
          .catch(err => {
            sendNotification({
              msg: err.msg,
              type: 'negative',
              icon: 'delete'
            }, event).catch(err => throw err)
          })
      }).catch(err => throw err)
    }).catch(err => throw err)

    handleApi('export-png', (event, { content, title }) => {
      return dialog.showSaveDialog({
        title: i18n.t('export'),
        defaultPath: path.join(app.getPath('pictures'), `${title}`),
        filters: [
          {
            name: 'Portable Network Graphics',
            extensions: ['png']
          }
        ]
      }).then((result) => {
        if (result.canceled) return
        const base64 = content.replace(/^data:image\/\w+;base64,/, '')
        const baseUrl = Buffer.from(base64, 'base64')
        fs.writeFile(result.filePath, baseUrl).then(() => {
          sendNotification({
            msg: 'ExportSuccessfully',
            type: 'positive',
            icon: 'check',
            filePath: result.filePath
          }, event).catch(err => throw err)
        })
          .catch(err => {
            sendNotification({
              msg: err.msg,
              type: 'negative',
              icon: 'delete'
            }, event).catch(err => throw err)
          })
      }).catch(err => throw err)
    }).catch(err => throw err)

    handleApi('export-file', (event, { content, fileName, fileType }) => {
      console.log({ fileName, fileType })
      return dialog.showSaveDialog({
        title: i18n.t('export'),
        defaultPath: path.join(app.getPath('documents'), `${fileName}`),
        filters: [
          {
            name: 'Export File',
            extensions: [fileType]
          }
        ]
      }).then((result) => {
        if (result.canceled) return
        fs.writeFile(result.filePath, content).then(() => {
          sendNotification({
            msg: 'ExportSuccessfully',
            type: 'positive',
            icon: 'check',
            filePath: result.filePath
          }, event).catch(err => throw err)
        })
          .catch(err => {
            sendNotification({
              msg: err.msg,
              type: 'negative',
              icon: 'delete'
            }, event).catch(err => throw err)
          })
      }).catch(err => throw err)
    }).catch(err => throw err)

    /**
     * batch export notes
     */
    handleApi('export-markdown-files', (event, { contents, category }) => {
      return dialog.showOpenDialog({
        title: i18n.t('export'),
        defaultPath: app.getPath('documents'),
        properties: [
          'openDirectory',
          'createDirectory'
        ],
        buttonLabel: 'Confirm'
      }).then((result) => {
        const directoryPath = path.join(result.filePaths[0], category)
        if (result.canceled) return
        if (!fs.existsSync(directoryPath)) {
          fs.mkdirSync(directoryPath)
        }
        const promises = contents.map(({
          content,
          title
        }) => {
          title = sanitize(title)
          return fs.writeFile(path.join(directoryPath, `${title}.md`), content).catch(err => throw err)
        })
        return Promise.all(promises).then(() => {
          sendNotification({
            msg: 'ExportSuccessfully',
            type: 'positive',
            icon: 'check',
            filePath: directoryPath
          }, event).catch(err => throw err)
        })
          .catch(err => {
            sendNotification({
              msg: err.msg,
              type: 'negative',
              icon: 'delete'
            }, event).catch(err => throw err)
          })
      }).catch(err => throw err)
    }).catch(err => throw err)
    /**
     * batch import images
     */
    handleApi('import-image', async (event) => {
      const result = await dialog.showOpenDialog({
        title: i18n.t('importImage'),
        defaultPath: app.getPath('pictures'),
        properties: ['openFile']
      })
      if (result.canceled) return
      return result.filePaths
    }).catch(err => throw err)
    /**
     *  Upload Images
     */
    handleApi('upload-images', async (event, { imagePaths, type, options }) => {
      if (type === 'picgoServer') {
        const uploadResult = await uploadImagesByPicGo(imagePaths).catch(err => {
          if (err.errno === 'ECONNREFUSED') {
            sendNotification({
              msg: i18n.t('picgoServerNoteFound'),
              type: 'negative',
              icon: 'delete'
            }, event).catch(err => throw err)
          }
        })
        return uploadResult
      } else if (type === 'wizOfficialImageUploadService') {
        const uploadResult = await uploadImagesByWiz(imagePaths, options).then()
        return uploadResult
      }
    }).catch(err => throw err)

    handleApi('get-cache-image', async (e, {
      imageUrl,
      kbGuid,
      docGuid
    }) => {
      return await cacheNoteImage(imageUrl, kbGuid, docGuid)
    }).catch(err => throw err)

    handleApi('save-temp-image', async (e, {
      file,
      kbGuid,
      docGuid
    }) => {
      return saveTempImage(file, kbGuid, docGuid)
    }).catch(err => throw err)

    handleApi('get-local-file-data', async (e, filePath) => {
      if (!fs.existsSync(filePath)) return null
      return fs.readFileSync(filePath)
    }).catch(err => throw err)

    handleApi('save-uploaded-image', async (e, { buffer, name, kbGuid, docGuid }) => {
      return saveBuffer(buffer, kbGuid, docGuid, name)
    }).catch(err => throw err)

    handleApi('check-update', async (e) => {
      const win = BrowserWindow.fromWebContents(e.sender)
      checkUpdates(win)
    }).catch(err => throw err)

    handleApi('need-update', async (e, need) => {
      needUpdate(need)
    }).catch(err => throw err)

    handleApi('quit-and-install', async (e) => {
      quitAndInstall()
    }).catch(err => throw err)

    handleApi('remote-request', async (e, config) => {
      return execRequest(config)
    }).catch(err => throw err)

    handleApi('pop-context-menu', async (e, menuOptions) => {
      const win = BrowserWindow.fromWebContents(e.sender)
      const menu = new Menu()
      let { menuItems, x, y, contextData } = menuOptions
      // 把 contextData 注入到每个 menuItem.click，让 injectClickFunction -> triggerRendererContextMenu
      // 能拿到当前右键触发的最新 category（之前只有 actions.js 写死的 eventData，category 透不出来）。
      menuItems = menuItems.map(mi => injectClickFunction(mi, e, triggerRendererContextMenu, contextData))
      menuItems.forEach(item => {
        menu.append(new MenuItem(item))
      })
      menu.popup({
        window: win,
        x: x,
        y: y
      })
    }).catch(err => throw err)

    handleApi('open-log-files', async (e, config) => {
      console.log(log.transports.file.resolvePath())
      shell.showItemInFolder(log.transports.file.resolvePath())
    }).catch(err => throw err)

    handleApi('open-sqlite-file', async (e) => {
      shell.showItemInFolder(path.join(app.getPath('userData'), 'memocast.db'))
    }).catch(err => throw err)

    handleApi('get-app-path', async (e) => {
      return app.getAppPath()
    }).catch(err => throw err)

    /**
     * Blog Deploy: get config
     */
    handleApi('get-blog-deploy-config', async (e) => {
      const Store = require('electron-store')
      const store = new Store({ name: 'blog-deploy-config' })
      return store.get('config', null)
    }).catch(err => throw err)

    /**
     * Blog Deploy: save config
     */
    handleApi('save-blog-deploy-config', async (e, config) => {
      const Store = require('electron-store')
      const store = new Store({ name: 'blog-deploy-config' })
      store.set('config', config)
      return { success: true }
    }).catch(err => throw err)

    /**
     * Blog Deploy: start build + GitHub trigger
     */
    handleApi('start-blog-deploy', async (e, { blogDir, githubConfig, theme, sftpConfig, customBuildCommand, base, packageManager, cdnDeps }) => {
      const normalizedBase = normalizeBase(base)
      const { execBlogBuild } = require('./service/blog-deploy-handler')
      return execBlogBuild(blogDir, githubConfig, e, theme, sftpConfig, customBuildCommand, normalizedBase, packageManager, cdnDeps)
    }).catch(err => throw err)

    /**
     * Blog Deploy: cancel build
     */
    handleApi('cancel-blog-deploy', async (e) => {
      const { cancelBlogBuild } = require('./service/blog-deploy-handler')
      cancelBlogBuild()
      return { success: true }
    }).catch(err => throw err)

    /**
     * Blog Deploy: 导出 GitHub Actions CI 配置
     *
     * 把内置的 3 个 blog-*.yml 写到 targetDir/.github/workflows/
     * 已存在的文件跳过（不覆盖），由用户决定是否替换。
     *
     * 入参：
     *   { targetDir: string } - 目标目录（一般是 blogDir）
     * 出参：
     *   { written: string[], skipped: string[], targetDir: string }
     */
    handleApi('export-blog-ci', async (e, { targetDir } = {}) => {
      if (!targetDir) {
        return { error: 'targetDirRequired', message: '需要指定目标目录' }
      }
      const BlogDeployService = require('../../src/services/BlogDeployService').default
      try {
        const result = await BlogDeployService.exportCIWorkflows(targetDir)
        return { success: true, ...result }
      } catch (err) {
        console.error('[export-blog-ci] 失败:', err)
        return { error: 'exportFailed', message: err.message || String(err) }
      }
    }).catch(err => { throw err })

    /**
     * Select directory dialog
     */
    handleApi('select-directory', async (e, { title }) => {
      const result = await dialog.showOpenDialog({
        title: title || 'Select Directory',
        properties: ['openDirectory', 'createDirectory']
      })
      if (result.canceled) return { canceled: true }
      return { canceled: false, filePath: result.filePaths[0] }
    }).catch(err => throw err)

    /**
     * SFTP: test connection
     */
    handleApi('sftp-test-connection', async (e, config) => {
      const { testConnection } = require('./service/sftp-service')
      return await testConnection(config)
    }).catch(err => throw err)

    /**
     * SFTP: upload directory
     */
    handleApi('sftp-upload', async (e, { config, localDir }) => {
      const { uploadDirectory } = require('./service/sftp-service')
      return await uploadDirectory(config, localDir, (filename, uploaded, total) => {
        e.sender.send('sftp-upload-progress', { filename, uploaded, total })
      })
    }).catch(err => throw err)
  }
}
