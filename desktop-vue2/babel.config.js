module.exports = {
  presets: [
    '@quasar/babel-preset-app'
  ],
  plugins: [
    '@babel/plugin-transform-optional-chaining',
    '@babel/plugin-transform-nullish-coalescing-operator',
    '@babel/plugin-syntax-import-meta',
    '@babel/plugin-syntax-dynamic-import',
    '@babel/plugin-transform-logical-assignment-operators',
    '@babel/plugin-proposal-nullish-coalescing-operator'
  ],
  env: {
    main: {
      plugins: [
        '@babel/plugin-transform-optional-chaining',
        '@babel/plugin-transform-nullish-coalescing-operator'
      ]
    }
  }
}
