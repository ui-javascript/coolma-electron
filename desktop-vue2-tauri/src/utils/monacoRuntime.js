/**
 * monaco 运行时装载器。
 *
 * 背景：原版在启动阶段就同步 import('monaco-editor')，冷启动时主线程要先解析并执行
 * 几 MB 的编辑器代码，再建一个用户根本看不见的编辑器实例（源码模式默认是关的）。
 * 这里改成按需动态加载：首屏渲染之后空闲时再拉 chunk、装语言默认项、建实例。
 *
 * 语言默认项沿用原 boot/monaco-env.js 的配置，保证 JS/TS 补全行为不变。
 */
let instance = null
let loading = null

function configureLanguages (monaco) {
  const configureLanguageDefaults = defaults => {
    defaults.setDiagnosticsOptions({
      noSemanticValidation: true,
      noSyntaxValidation: false
    })
    defaults.setCompilerOptions({
      target: monaco.languages.typescript.ScriptTarget.ES2020,
      allowNonTsExtensions: true,
      moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
      module: monaco.languages.typescript.ModuleKind.CommonJS,
      noEmit: true,
      lib: ['es2020']
    })
  }

  configureLanguageDefaults(monaco.languages.typescript.javascriptDefaults)
  configureLanguageDefaults(monaco.languages.typescript.typescriptDefaults)
}

export function loadMonaco () {
  if (instance) return Promise.resolve(instance)
  if (!loading) {
    loading = import('monaco-editor').then(monaco => {
      configureLanguages(monaco)
      instance = monaco
      return monaco
    }).catch(error => {
      loading = null
      throw error
    })
  }
  return loading
}

export function getMonaco () {
  return instance
}
