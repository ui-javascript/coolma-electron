// ============================================================================
// tests/fixtures/i18n-stub.js
//
// Jest 下的 boot/i18n stub：避开 ClientFileStorage / enum-plus / src/i18n
// 的传递依赖，只暴露最简的 i18n.t() 接口。
//
// 配 jest.config.js 的 moduleNameMapper：
//   '^boot/i18n$': '<rootDir>/tests/fixtures/i18n-stub.js'
//
// 注意：key 用 '^boot/i18n$' 加 ^/$ 是必须的，否则会误匹配 'boot/i18nUtils' 之类。
// ============================================================================
module.exports = {
  i18n: {
    t: (key) => key, // 默认 stub：直接返回 key
    tc: (key) => key, // vue-i18n v8 的复数形式
    locale: 'en-us'
  }
}
