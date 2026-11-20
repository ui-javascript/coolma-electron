/**
 * libs-muya-vue2 的 `boot/i18n` 别名 shim（引擎契约：消费方提供 i18n 单例）。
 *
 * 引擎只用 `i18n.t(key)`（全库 96 处，无 locale/插值依赖），
 * 这里给一份中文词典 + key 兜底，避免文档站 demo 里按钮全是原始 key。
 * 桌面端（desktop-vue2）的同名文件是完整 vue-i18n 实例，词库以它为准。
 */
const zh = {
  alignLeft: '左对齐', alignMiddle: '居中', alignRight: '右对齐',
  altText: '替代文字', bulletList: '无序列表', chooseImage: '插图',
  chooseImageFromComputer: '从本地选择', codeBlock: '代码块', copy: '复制',
  copyContent: '复制内容', delete: '删除', deleteTable: '删除表格',
  displayMath: '数学公式块', editImage: '编辑图片', eliminate: '清除',
  embedImage: '嵌入图片', embedLink: '嵌入链接', emphasize: '加粗',
  emptyDiagram: '空流程图', emptyHTML: '空 HTML', emptyMath: '空公式',
  emptyMermaid: '空 Mermaid', flowChart: '流程图', flowChartSubTitle: '流程图',
  frontMatter: 'Front Matter', fullMode: '完整模式', header1: '一级标题',
  header2: '二级标题', header3: '三级标题', header4: '四级标题',
  header5: '五级标题', header6: '六级标题', highlight: '高亮',
  horizontalLine: '分割线', HTMLBlock: 'HTML 块', image: '图片',
  imageBlockSubTitle: '图片块', imageLink: '图片链接', imagePath: '图片路径',
  inlineCode: '行内代码', inlineImage: '行内图片', inlineMath: '行内公式',
  insertColumnLeft: '左侧插入列', insertColumnRight: '右侧插入列',
  insertRowAbove: '上方插入行', insertRowBelow: '下方插入行',
  invalidFlowChart: '无效流程图', invalidMath: '无效公式', invalidMermaid: '无效 Mermaid',
  invalidSequence: '无效时序图', invalidVega: '无效 Vega 图', italic: '斜体',
  link: '链接', loading: '加载中…', mermaid: 'Mermaid 图',
  mermaidSubTitle: 'Mermaid 图', newParagraph: '新段落', orderList: '有序列表',
  paragraph: '段落', picTitle: '图片标题', quoteBlock: '引用块',
  removeColumn: '删除列', removeImage: '移除图片', removeRow: '删除行',
  resizeTable: '调整表格', select: '选择', shortSubTitle: '简图',
  simpleMode: '简洁模式', strikethrough: '删除线', subTitle: '图表',
  tableBlock: '表格', tableBlockSubTitle: '表格', toDoList: '待办列表',
  turnInto: '转换为', underline: '下划线', vegaChart: 'Vega 图',
  vegaChartSubTitle: 'Vega 图'
}

export const i18n = {
  locale: 'zh-cn',
  t (key) {
    return zh[key] || key
  }
}

export default i18n
