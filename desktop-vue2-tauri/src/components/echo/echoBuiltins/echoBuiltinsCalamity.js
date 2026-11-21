// echoBuiltinsCalamity —— 招灾（在作用域内随机给文字片段染上哥特渐变彩）
// 类别：showy ｜ type：echo-chant
import { buildEchoCard } from './echoBuiltinsBase.js'

const META = {
  id: 'calamity', name: '招灾', icon: 'thunderstorm', color: '#5E35B1', category: 'showy', type: 'echo-chant',
  desc: '在作用域内随机给文字片段染上哥特渐变彩',
  banner: ['【招灾 / calamity】 —— "随机哥德"：作用域内随机给文字片段染上哥特渐变彩',
    '回响种类：echo-chant',
    '参数：intensity = 0.1-0.8 的小数（默认 0.3，最大 0.8）',
    'CSS 钩子：.ag-rune-calamity-gothic',
    '示例：@招灾{intensity: 0.5}(周围一半文字染彩)'],
  handlerDesc: 'cleanup：取消染彩 class',
  handlerBody: `
    const scope = props.scope || 'siblings'
    const $scope = scope === 'block'
      ? $(node).closest('[data-block-type], .mu-block, p, pre, li, h1, h2, h3, h4, h5, h6, blockquote')
      : $(node).parent()
    if (!$scope.length) return () => {}
    const intensity = Math.max(0.05, Math.min(0.8, Number(props.intensity) || 0.3))
    const textHosts = $scope.find('p, h1, h2, h3, h4, h5, h6, li, blockquote, td, th, dd, dt')
      .filter((_i, el) => el && el !== node && $(el).text().trim().length >= 2)
      .get()
    if (!textHosts.length) return () => {}
    const targetCount = Math.max(1, Math.floor(textHosts.length * intensity))
    const pool = textHosts.slice()
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      const tmp = pool[i]; pool[i] = pool[j]; pool[j] = tmp
    }
    const picked = pool.slice(0, Math.min(targetCount, pool.length))
    $(picked).addClass('ag-rune-calamity-gothic')
    return () => { $(picked).removeClass('ag-rune-calamity-gothic') }`
}

export default buildEchoCard(META)
