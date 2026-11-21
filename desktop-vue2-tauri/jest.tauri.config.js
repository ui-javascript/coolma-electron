module.exports = {
  testEnvironment: 'node',
  testMatch: ['<rootDir>/tests/**/*.test.js'],
  transform: { '^.+\\.js$': ['babel-jest', { configFile: './babel.config.test.js' }] }
}
