import { CLASS_OR_ID } from '../../../config'
import { getImageInfo } from '../../../utils'

// reference_image
export default function referenceImage (h, cursor, block, token, outerClass) {
  const className = this.getClassName(outerClass, block, token, cursor)
  const imageClass = CLASS_OR_ID.AG_IMAGE_MARKED_TEXT
  const { start, end } = token.range
  const tag = this.highlight(h, block, start, end, token)
  const { label, backlash, alt } = token
  const rawSrc = label + backlash.second
  let href = ''
  let title = ''
  if (this.labels.has((rawSrc).toLowerCase())) {
    ({ href, title } = this.labels.get(rawSrc.toLowerCase()))
  }
  const imageInfo = getImageInfo(href)
  const { src } = imageInfo
  let id
  let isSuccess
  let selector
  if (src) {
    ({ id, isSuccess } = this.loadImageAsync(imageInfo, { alt }, className, CLASS_OR_ID.AG_COPY_REMOVE))
  }
  selector = id ? `span#${id}.${imageClass}` : `span.${imageClass}`
  selector += `.${CLASS_OR_ID.AG_OUTPUT_REMOVE}`
  if (isSuccess) {
    selector += `.${className}`
  } else {
    selector += `.${CLASS_OR_ID.AG_IMAGE_FAIL}`
  }

  // 引用式图片失败时没有 <img> 可点，失败态本身要能携带重试所需的地址。
  // 这三个 data 属性只服务于本地点按重试，不写进 Markdown。
  const attrs = {
    'data-ref-src': href,
    'data-ref-alt': alt
  }
  if (className) {
    attrs['data-ref-class'] = className
  }
  if (title) {
    attrs['data-ref-title'] = title
  }

  return isSuccess
    ? [
      h(selector, { attrs }, tag),
      h(`img.${CLASS_OR_ID.AG_COPY_REMOVE}`, { props: { alt, src, title } })
    ]
    : [h(selector, { attrs }, tag)]
}
