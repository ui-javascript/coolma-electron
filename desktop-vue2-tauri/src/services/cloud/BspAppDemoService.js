/**
 * BspApp 原生云函数调用（client envelope 形态）
 * 与 src/utils/cloud-router.js 的 vk-router url 化形态不同：
 *   - endpoint 是固定的 https://api.bspapp.com/client
 *   - 请求体是 envelope：{ method, params, spaceId, timestamp, token }
 *     其中 params 本身是 JSON 字符串（functionTarget + functionArgs）
 *
 * ⚠️ 此服务内嵌了真实的 uniIdToken 和 spaceId / app token，仅用于本地
 *    设置面板的"测试 demo"按钮。**不要**在打包构建里混淆掉这块代码，
 *    **不要**把它挂到任何会被远程面板/公共用户触发的入口上。
 *    TODO(security): 后续把 token 拆到运行时配置 / 用户手动填。
 */

import axios from 'axios'

export const DEMO_ENDPOINT = 'https://api.bspapp.com/client'
export const DEMO_SPACE_ID = '59728804-d890-4267-8e45-393e10b3c780'
export const DEMO_APP_TOKEN = 'c4c7902f-e4ef-4262-a036-0afba47b3841'

const DEMO_FUNCTION_TARGET = 'router'
const DEMO_FUNCTION_URL = 'admin/vkfiles/pub/listFiles'

/**
 * 构造调用 envelope。timestamp / token 每次都重新生成（user-side 字段）。
 * 其它 token (uniIdToken) 维持 source 里写的那个，便于本地压住版本。
 */
export function buildEnvelope () {
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
    uniIdToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1aWQiOiIwMDIiLCJyb2xlIjpbImFkbWluIl0sInBlcm1pc3Npb24iOltdLCJpYXQiOjE3NjM3NzAzODcsImV4cCI6MTc2NDM3NTE4N30.aWeY-Ao1NqV0O6jhUQRGEN8XchrOGod0W2bvgYiTnI8'
  }
  return {
    method: 'serverless.function.runtime.invoke',
    params: JSON.stringify({
      functionTarget: DEMO_FUNCTION_TARGET,
      functionArgs
    }),
    spaceId: DEMO_SPACE_ID,
    timestamp: Date.now(),
    token: DEMO_APP_TOKEN
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