/**
 * SFTP 部署服务
 * 用于将打包后的静态文件上传到用户自己的服务器
 */
const { Client } = require('ssh2')
const fs = require('fs-extra')
const path = require('path')

let currentClient = null

// 诊断 ssh2 模块是否正确加载
function diagnoseSsh2 () {
  const issues = []
  if (typeof Client !== 'function') {
    issues.push(`Client is not a function, type: ${typeof Client}`)
  }
  return issues
}

/**
 * 测试 SFTP 连接
 * @param {Object} config - SFTP 配置
 * @param {string} config.host - 服务器地址
 * @param {number} config.port - 端口，默认 22
 * @param {string} config.username - 用户名
 * @param {string} config.authType - 'password' | 'key'
 * @param {string} config.password - 密码（authType='password'时）
 * @param {string} config.privateKeyPath - SSH Key 路径（authType='key'时）
 * @param {string} config.passphrase - SSH Key 密码短语（可选）
 * @param {string} config.remotePath - 远程目录
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function testConnection (config) {
  // 诊断 ssh2 模块
  const diag = diagnoseSsh2()
  if (diag.length > 0) {
    const errMsg = `SSH2 module error: ${diag.join('; ')}`
    console.error('[SFTP] Diagnosis failed:', errMsg)
    throw new Error(errMsg)
  }

  return new Promise((resolve, reject) => {
    let client
    try {
      client = new Client()
    } catch (ctorErr) {
      console.error('[SFTP] Failed to create Client:', ctorErr)
      reject(new Error(`Failed to initialize SSH client: ${ctorErr.message}`))
      return
    }

    const timeout = setTimeout(() => {
      client.end()
      reject(new Error('Connection timeout (30s)'))
    }, 30000)

    client.on('ready', () => {
      clearTimeout(timeout)
      client.sftp((err, sftp) => {
        if (err) {
          client.end()
          reject(err)
          return
        }

        // 测试写入权限
        const testFile = path.posix.join(config.remotePath || '/', '.sftp_test')
        sftp.writeFile(testFile, 'test', (writeErr) => {
          if (writeErr) {
            client.end()
            reject(new Error('No write permission to remote directory'))
            return
          }

          // 删除测试文件
          sftp.unlink(testFile, () => {
            client.end()
            resolve({ success: true })
          })
        })
      })
    })

    client.on('error', (err) => {
      clearTimeout(timeout)
      console.error('[SFTP] Connection error:', err.message)
      reject(err)
    })

    // 连接配置
    const connConfig = {
      host: config.host,
      port: config.port || 22,
      username: config.username,
      readyTimeout: 30000
    }

    if (config.authType === 'password') {
      connConfig.password = config.password
    } else if (config.authType === 'key' && config.privateKeyPath) {
      try {
        connConfig.privateKey = fs.readFileSync(config.privateKeyPath)
        if (config.passphrase) {
          connConfig.passphrase = config.passphrase
        }
      } catch (readErr) {
        reject(new Error(`Failed to read private key: ${readErr.message}`))
        return
      }
    }

    try {
      client.connect(connConfig)
    } catch (connectErr) {
      clearTimeout(timeout)
      console.error('[SFTP] Connect call failed:', connectErr)
      reject(new Error(`SSH connection failed: ${connectErr.message}`))
    }
  })
}

/**
 * 上传目录到远程服务器
 * @param {Object} config - SFTP 配置（同上）
 * @param {string} localDir - 本地目录路径
 * @param {Function} onProgress - 进度回调 (filename: string) => void
 * @returns {Promise<{success: boolean, uploaded: number, error?: string}>}
 */
async function uploadDirectory (config, localDir, onProgress) {
  return new Promise((resolve, reject) => {
    const client = new Client()
    currentClient = client

    const timeout = setTimeout(() => {
      client.end()
      reject(new Error('Connection timeout (30s)'))
    }, 30000)

    client.on('ready', () => {
      clearTimeout(timeout)
      client.sftp(async (err, sftp) => {
        if (err) {
          client.end()
          reject(err)
          return
        }

        try {
          // 确保远程目录存在
          await ensureRemoteDir(sftp, config.remotePath)

          // 统计文件数量用于进度计算
          const files = collectFiles(localDir)
          let uploaded = 0

          // 递归上传
          await uploadRecursive(sftp, localDir, config.remotePath, (filename) => {
            uploaded++
            onProgress?.(filename, uploaded, files.length)
          })

          client.end()
          resolve({ success: true, uploaded })
        } catch (uploadErr) {
          client.end()
          reject(uploadErr)
        }
      })
    })

    client.on('error', reject)

    // 连接配置
    const connConfig = {
      host: config.host,
      port: config.port || 22,
      username: config.username,
      readyTimeout: 30000
    }

    if (config.authType === 'password') {
      connConfig.password = config.password
    } else if (config.authType === 'key' && config.privateKeyPath) {
      connConfig.privateKey = fs.readFileSync(config.privateKeyPath)
      if (config.passphrase) {
        connConfig.passphrase = config.passphrase
      }
    }

    client.connect(connConfig)
  })
}

/**
 * 递归收集所有文件
 */
function collectFiles (localPath) {
  const files = []
  const entries = fs.readdirSync(localPath)

  for (const entry of entries) {
    const fullPath = path.join(localPath, entry)
    const stat = fs.statSync(fullPath)

    if (stat.isDirectory()) {
      files.push(...collectFiles(fullPath))
    } else {
      files.push(entry)
    }
  }

  return files
}

/**
 * 递归上传文件
 */
async function uploadRecursive (sftp, localPath, remotePath, onProgress) {
  const entries = fs.readdirSync(localPath)

  for (const entry of entries) {
    const localFullPath = path.join(localPath, entry)
    const remoteFullPath = `${remotePath}/${entry}`
    const stat = fs.statSync(localFullPath)

    if (stat.isDirectory()) {
      await ensureRemoteDir(sftp, remoteFullPath)
      await uploadRecursive(sftp, localFullPath, remoteFullPath, onProgress)
    } else {
      await uploadFile(sftp, localFullPath, remoteFullPath)
      onProgress?.(entry)
    }
  }
}

/**
 * 上传单个文件（使用 fastPut 提高速度）
 */
function uploadFile (sftp, localPath, remotePath) {
  return new Promise((resolve, reject) => {
    sftp.fastPut(localPath, remotePath, (err) => {
      if (err) reject(err)
      else resolve()
    })
  })
}

/**
 * 确保远程目录存在
 */
function ensureRemoteDir (sftp, remotePath) {
  return new Promise((resolve, reject) => {
    sftp.mkdir(remotePath, (err) => {
      // 忽略已存在的错误（错误码 4 或 "Failure"）
      if (err && !err.message.includes('already exists') && err.code !== 4) {
        // 其他错误才 reject
        reject(err)
        return
      }
      resolve()
    })
  })
}

/**
 * 备份远程目录（将现有目录重命名为 backup）
 */
async function backupRemoteDir (config) {
  return new Promise((resolve, reject) => {
    const client = new Client()

    const timeout = setTimeout(() => {
      client.end()
      reject(new Error('Connection timeout'))
    }, 30000)

    client.on('ready', () => {
      clearTimeout(timeout)
      client.sftp(async (err, sftp) => {
        if (err) {
          client.end()
          reject(err)
          return
        }

        const backupPath = `${config.remotePath}_backup_${Date.now()}`
        const renamePath = config.remotePath

        // 检查目录是否存在
        sftp.stat(renamePath, (statErr) => {
          if (statErr) {
            // 目录不存在，无需备份
            client.end()
            resolve({ backedUp: false })
            return
          }

          // 重命名目录
          sftp.rename(renamePath, backupPath, (renameErr) => {
            client.end()
            if (renameErr) {
              reject(renameErr)
            } else {
              resolve({ backedUp: true, backupPath })
            }
          })
        })
      })
    })

    client.on('error', reject)

    const connConfig = {
      host: config.host,
      port: config.port || 22,
      username: config.username
    }

    if (config.authType === 'password') {
      connConfig.password = config.password
    } else {
      connConfig.privateKey = fs.readFileSync(config.privateKeyPath)
    }

    client.connect(connConfig)
  })
}

/**
 * 取消上传
 */
function cancelUpload () {
  if (currentClient) {
    currentClient.end()
    currentClient = null
  }
}

module.exports = {
  testConnection,
  uploadDirectory,
  cancelUpload,
  backupRemoteDir
}
