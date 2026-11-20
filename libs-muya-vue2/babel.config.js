'use strict'

module.exports = {
  env: {
    renderer: {
      presets: [
        ['@babel/preset-env', {
          targets: {
            electron: '11',
            chrome: '87',
            firefox: '78',
            safari: '13'
          },
          useBuiltIns: false,
          modules: false
        }]
      ],
      plugins: [
        '@babel/plugin-proposal-nullish-coalescing-operator',
        '@babel/plugin-transform-optional-chaining',
        '@babel/plugin-syntax-dynamic-import',
        '@babel/plugin-syntax-import-meta'
      ]
    },
    test: {
      presets: [
        ['@babel/preset-env', {
          targets: {
            node: 'current'
          },
          useBuiltIns: false
        }]
      ]
    }
  }
}
