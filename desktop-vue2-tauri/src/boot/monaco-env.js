/**
 * Configures the JavaScript/TypeScript language service bundled by
 * monaco-editor-webpack-plugin. Worker URLs are owned by the plugin so they
 * remain aligned with webpack's public path in dev and packaged Electron builds.
 */
import * as monaco from 'monaco-editor'

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
