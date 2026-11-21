/**
 * BspApp 原生云函数调用（client envelope 形态）
 * 与 src/utils/cloud-router.js 的 vk-router url 化形态不同：
 *   - endpoint 是固定的 https://api.bspapp.com/client
 *   - 请求体是 envelope：{ method, params, spaceId, timestamp, token }
 *     其中 params 本身是 JSON 字符串（functionTarget + functionArgs）
 *
 * 🔒 安全约定：所有凭据（spaceId / appToken / uniIdToken）一律由用户在
 *    demo 弹框里手动填入，经 setDemoConfig 保存在 localStorage 后由
 *    buildEnvelope 运行时读取。源码与构建产物中不得出现任何真实凭据，
 *    防止随仓库泄漏。凭据仅用于本地设置面板的"测试 demo"按钮，
 *    不要挂到任何会被远程面板/公共用户触发的入口上。
 */

import axios from 'axios'

export const DEMO_ENDPOINT = 'https://api.bspapp.com/client'

const DEMO_FUNCTION_TARGET = 'router'
const DEMO_FUNCTION_URL = 'admin/vkfiles/pub/listFiles'
const DEMO_CONFIG_KEY = 'cloudfn.bspapp.demo.config'

function emptyConfig () {
  return { spaceId: '', appToken: '', uniIdToken: '' }
}

/** 读取 demo 凭据配置（localStorage，运行时手动填入） */
export function getDemoConfig () {
  try {
    const raw = localStorage.getItem(DEMO_CONFIG_KEY)
    if (!raw) return emptyConfig()
    const parsed = JSON.parse(raw) || {}
    return {
      spaceId: parsed.spaceId || '',
      appToken: parsed.appToken || '',
      uniIdToken: parsed.uniIdToken || ''
    }
  } catch (e) {
    return emptyConfig()
  }
}

/** 保存 demo 凭据配置到 localStorage（不落库、不进源码、不进构建产物） */
export function setDemoConfig (config) {
  const next = {
    spaceId: (config && config.spaceId) || '',
    appToken: (config && config.appToken) || '',
    uniIdToken: (config && config.uniIdToken) || ''
  }
  localStorage.setItem(DEMO_CONFIG_KEY, JSON.stringify(next))
  return next
}

export function clearDemoConfig () {
  localStorage.removeItem(DEMO_CONFIG_KEY)
}

/**
 * 构造调用 envelope。timestamp / token 每次都重新生成（user-side 字段）。
 * spaceId / appToken / uniIdToken 从运行时配置读取，缺一则抛错提示。
 */
export function buildEnvelope () {
  const config = getDemoConfig()
  if (!config.spaceId || !config.appToken || !config.uniIdToken) {
    throw new Error('BspApp demo credentials not configured (spaceId / appToken / uniIdToken)')
  }
  const functionArgs = {
    $url: DEMO_FUNCTION_URL,
    data: { categoryNo: '', title: '' },
    clientInfo: {
      PLATFORM: 'web',
      OS: 'windows',
      APPID: '__UNI__F332BD5',
      DEVICEID: '17525906352352191791',
      SDKVersion: '',
      appId: '__UNI__F332BD5',
      appLanguage: 'zh-Hans',
      appName: 'Coolma',
      appVersion: '1.2.2',
      appVersionCode: '102',
      browserName: 'chrome',
      browserVersion: '150.0.0.0',
      deviceId: '17525906352352191791',
      deviceModel: 'PC',
      deviceOrientation: 'portrait',
      devicePixelRatio: 1.25,
      deviceType: 'pc',
      hostLanguage: 'zh-CN',
      hostName: 'chrome',
      hostVersion: '150.0.0.0',
      language: 'zh-CN',
      model: 'PC',
      osName: 'windows',
      osVersion: '10 x64',
      pixelRatio: 1.25,
      platform: 'windows',
      safeArea: { left: 0, right: 2048, top: 0, bottom: 983, width: 2048, height: 983 },
      safeAreaInsets: { top: 0, right: 0, bottom: 0, left: 0 },
      screenHeight: 1152,
      screenWidth: 2048,
      statusBarHeight: 0,
      system: 'Windows 10 x64',
      ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36',
      uniCompileVersion: '3.4.18',
      uniPlatform: 'web',
      uniRuntimeVersion: '3.4.18',
      version: '',
      windowBottom: 0,
      windowHeight: 939,
      windowTop: 44,
      windowWidth: 2048,
      locale: 'zh-Hans',
      LOCALE: 'zh-Hans'
    },
    uniIdToken: config.uniIdToken
  }
  return {
    method: 'serverless.function.runtime.invoke',
    params: JSON.stringify({
      functionTarget: DEMO_FUNCTION_TARGET,
      functionArgs
    }),
    spaceId: config.spaceId,
    timestamp: Date.now(),
    token: config.appToken
  }
}

/**
 * 直接发请求，返回 { status, data } 或抛错。
 * 不复用 cloud-router，因为它走的是 vk-router url 化形态。
 */
export async function invokeDemo () {
  const envelope = buildEnvelope()
  const response = await axios({
    method: 'POST',
    url: DEMO_ENDPOINT,
    data: envelope,
    headers: {
      'content-type': 'application/json;charset=utf-8'
    },
    timeout: 30000
  })
  return {
    status: response.status,
    data: response.data
  }
}

export default { invokeDemo, buildEnvelope, DEMO_ENDPOINT }
