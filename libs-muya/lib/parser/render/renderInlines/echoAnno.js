import { CLASS_OR_ID } from '../../../config'

const createEchoNodeId = (token, echoId, definitionId, echoName) => {
  const start = token?.range?.start ?? ''
  const end = token?.range?.end ?? ''
  const raw = String(token?.raw || '')
  return `echo-${echoId || definitionId || echoName}-${start}-${end}-${raw.length}`
}

export default function echoAnno (h, cursor, block, token, outerClass) {
  const className = this.getClassName(outerClass, block, token, cursor)
  const echoName = String(token.echoName || '').trim() || '回响'
  const instProps = (token && token.propsParsed && typeof token.propsParsed === 'object')
    ? token.propsParsed
    : {}
  const value = String(
    typeof instProps.value === 'string'
      ? instProps.value
      : token.prompt || ''
  )
  const echoId = String(
    token.echoId ||
    instProps.echoId ||
    instProps.id ||
    (token.echoName ? echoName : '')
  ).trim()
  const definitionId = String(
    token.definitionId ||
    instProps.definitionId ||
    ''
  ).trim()
  const hasExplicitWidth = instProps.width !== undefined || instProps.W !== undefined
  const hasExplicitHeight = instProps.height !== undefined || instProps.H !== undefined
  const width = String(instProps.width || instProps.W || '').trim()
  const height = String(instProps.height || instProps.H || '').trim()
  const summary = String(value || '').replace(/\s+/g, ' ').trim()
  const title = summary ? `${echoName}: ${summary}` : echoName
  const echoNodeId = createEchoNodeId(token, echoId, definitionId, echoName)

  const hostStyle = {}
  if (hasExplicitWidth) hostStyle.width = width
  if (hasExplicitHeight) hostStyle.height = height

  const dataset = {
    start: token.range.start,
    end: token.range.end,
    raw: token.raw,
    echoName,
    echoId: echoId || '',
    echoDefinitionId: definitionId,
    echoNodeId,
    echoValue: value,
    // 永远为 "true"：echoAnno.js 渲染的是 inline placeholder，没有 block 级自定义 HTML
    echoInline: 'true'
  }
  if (hasExplicitWidth) dataset.echoWidth = width
  if (hasExplicitHeight) dataset.echoHeight = height
  // 把 token 的 propsParsed（@离析{density:'very-loose'} 这种）原样写到 host.dataset，
  // 让 EchoRuntime._readEchoProps() 在 afterRender() 时能拿到实例参数。
  let echoPropsJson = ''
  if (instProps) {
    try {
      // 把 value/width/height 这种已知字段合并到 props，让 _readEchoProps 的 dataset 回退分支能直接读到实例参数。
      const merged = { ...instProps, value, echoName, echoId, definitionId }
      echoPropsJson = JSON.stringify(merged)
      dataset.echoPropsJson = echoPropsJson
    } catch (error) { /* ignore */ }
  }

  const isHideSelf = instProps.isHideSelf === true || instProps.isHideSelf === 'true'

  // className 决定 cursor 状态（AG_GRAY / AG_HIDE）。但 AG_GRAY ↔ AG_HIDE 会让 vnode.sel 不同，
  // snabbdom patch 时 sameVnode = false，把 outer span 整个 removeVnode + createElm 替换——
  // 此时 vnode.children 重建的 marker 与 host.innerHTML 已经写入的 baseRender 标记会按 position diff
  // 拼接，残留 DOM 造成"失焦 / 聚焦切换时 marker 包裹突变"的视觉跳跃。
  //
  // v2026-07-29 起：
  //   - sel 只放静态 class（ag-echo-anno-token + AG_INLINE_RULE），让 snabbdom sameVnode 稳定，
  //     outer span patchVnode 复用同一个 DOM 节点；
  //   - cursor 决定的 className 走 snabbdom 的 class module（{ag-gray: bool, ag-hide: bool}），
  //     让 class module 动态增减 DOM 的 className —— 但不改变 vnode.sel。
  //   - 同时给 outer span 一个稳定 key（echoNodeId），snabbdom 同 sel vnode patch 时按 key 锁定 outer。
  const baseSel = `span.ag-echo-anno-token.${CLASS_OR_ID.AG_INLINE_RULE}`
  const classModuleMap = {
    // 两个 cursor state class 互斥：cursor 在 token 里 → ag-gray；不在 → ag-hide。
    [CLASS_OR_ID.AG_GRAY]: className === CLASS_OR_ID.AG_GRAY,
    [CLASS_OR_ID.AG_HIDE]: className === CLASS_OR_ID.AG_HIDE
  }

  return [
    h(baseSel, {
      // 用 echoNodeId 作 key，让 snabbdom 跨 patch 锁定同一 outer span DOM（同 sel + 同 key），
      // 避免 innerHTML 写入的标记结构被 vnode tree patch 错误地按 position diff 拼接残留。
      key: echoNodeId,
      dataset,
      attrs: Object.assign(
        {
          spellcheck: 'false',
          title,
          contenteditable: 'false'
        },
        echoPropsJson ? { 'data-echo-props-json': echoPropsJson } : {}
      ),
      // 动态 cursor state class 通过 snabbdom class module 管理
      class: classModuleMap,
      style: hostStyle
    }, isHideSelf ? [] : [
      h('span.ag-echo-placeholder-marker', {
        key: '__marker__',
        attrs: {
          contenteditable: 'false'
        }
      }, [
        h('span.ag-echo-anno-at', {
          attrs: {
            contenteditable: 'false'
          }
        }, '@'),
        h('span.ag-echo-anno-name', {
          attrs: {
            contenteditable: 'false'
          }
        }, echoName),
        summary ? h('span.ag-echo-anno-value', {
          attrs: {
            contenteditable: 'false'
          }
        }, `: ${summary}`) : null
      ].filter(Boolean))
    ])
  ]
}