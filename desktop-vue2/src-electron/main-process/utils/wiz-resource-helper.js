import fs from 'fs'
import axios from 'axios'
import { isBase64, saveBuffer, saveFileInTempPath } from './helper'
import path from 'path'

export async function uploadImagesByWiz (imagePaths, options) {
  const { kbGuid, docGuid, wizToken, baseUrl } = options
  const results = []
  try {
    for (const image of imagePaths) {
      let buffer, filePath

      if (image instanceof Object && isBase64(image.file)) {
        const base64Data = image.file.replace(/^data:image\/\w+;base64,/, '')
        buffer = Buffer.from(base64Data, 'base64')
        filePath = saveFileInTempPath(buffer, path.extname(image.ext))
      } else {
        filePath = image
      }

      const fileBuffer = fs.readFileSync(filePath)
      const fileBlob = new Blob([fileBuffer])
      const formData = new FormData()
      formData.append('kbGuid', kbGuid)
      formData.append('docGuid', docGuid)
      formData.append('data', fileBlob, path.basename(filePath))

      const result = await axios.post(
        `${baseUrl}/ks/resource/upload/${kbGuid}/${docGuid}`,
        formData,
        {
          headers: {
            'X-Wiz-Token': wizToken
          }
        }
      )

      const responseBody = result && result.data
      const data = responseBody && responseBody.result
      const returnCode = responseBody && responseBody.returnCode

      if (!data || !data.name) {
        const reason = responseBody && responseBody.externMessage
          ? `externMessage: ${responseBody.externMessage}`
          : `unexpected response: ${JSON.stringify(responseBody)}`
        console.error('[uploadImagesByWiz] invalid response', { returnCode, responseBody })
        return {
          success: false,
          result: { message: `WizNote 上传失败（${reason}）`, failedPath: filePath }
        }
      }

      saveBuffer(fileBuffer, kbGuid, docGuid, data.name)
      results.push({
        url: `coolma://coolma.app/${kbGuid}/${docGuid}/${data.name}`,
        name: data.name
      })
    }
    return {
      success: true,
      result: results
    }
  } catch (error) {
    console.error(error)
    return {
      success: false,
      result: error
    }
  }
}
