// echoBuiltinsMindsteal —— 夺心魄（使附近符合条件的咏唱叠加或篡改某种制定的效果）
// 类别：showy ｜ type：echo-chant
import { buildEchoCard } from './echoBuiltinsBase.js'

const META = {
  id: 'mindsteal', name: '夺心魄', icon: 'psychology', color: '#F4511E', category: 'showy', type: 'echo-chant',
  desc: '使附近符合条件的咏唱叠加或篡改某种制定的效果',
  banner: ['【夺心魄 / mindsteal】 —— 篡改附近符合条件的符文效果',
    '参数：mode=override|stack|disable；targets=其它 id（逗号分隔）',
    '示例：@夺心魄{mode: "disable", targets: "growth,skywalk"}(覆盖附近的生长与主题)'],
  handlerDesc: 'mode=disable 直接停掉动画；targets 为空时作用于所有 echo-chant',
  handlerBody: `
    const mergedProps = Object.assign({ mode: 'override', targets: '' }, props || {})
    const targetsCsv = String(mergedProps.targets || '').trim()
    const targets = targetsCsv ? targetsCsv.split(',').map(s => s.trim()).filter(Boolean) : null
    const $scope = $(node).parent()
    if (!$scope.length) return () => {}
    const $candidates = $scope.find('[data-echo-chant-id]')
      .filter((_i, n) => n !== node)
      .filter((_i, n) => !targets || targets.indexOf($(n).attr('data-echo-chant-id')) !== -1)
    $candidates.each((_i, n) => {
      $(n).attr('data-mindsteal-mode', mergedProps.mode)
      if (mergedProps.mode === 'disable') $(n).css('animation', 'none', 'important')
    })
    $(node).addClass('ag-rune-mindsteal-active')
    return () => {
      $candidates.removeAttr('data-mindsteal-mode').css('animation', '')
      $(node).removeClass('ag-rune-mindsteal-active')
    }`
}

export default buildEchoCard(META)
