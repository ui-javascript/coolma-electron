/**
 * ee-bin configuration.
 * The app is a single frontend + Electron main process; Go/Python demos are
 * intentionally removed in P1.
 */
module.exports = {
  dev: {
    frontend: {
      directory: './frontend',
      cmd: 'pnpm',
      args: ['run', 'dev'],
      protocol: 'http://',
      hostname: '127.0.0.1',
      port: 8080,
    },
    electron: {
      directory: './',
      cmd: 'electron',
      args: ['.', '--env=local'],
      watch: true,
      delay: 1000,
    },
  },

  build: {
    frontend: {
      directory: './frontend',
      cmd: 'pnpm',
      args: ['run', 'build'],
    },
    electron: {
      type: 'typescript',
    },
    win64: {
      cmd: 'electron-builder',
      directory: './',
      args: ['--config=./cmd/builder.json', '-w=nsis', '--x64'],
    },
    win_e: {
      cmd: 'electron-builder',
      directory: './',
      args: ['--config=./cmd/builder.json', '-w=portable', '--x64'],
    },
    mac: {
      cmd: 'electron-builder',
      directory: './',
      args: ['--config=./cmd/builder-mac.json', '-m', '--x64'],
    },
    mac_arm64: {
      cmd: 'electron-builder',
      directory: './',
      args: ['--config=./cmd/builder-mac-arm64.json', '-m', '--arm64'],
    },
    linux: {
      cmd: 'electron-builder',
      directory: './',
      args: ['--config=./cmd/builder-linux.json', '-l=deb', '--x64'],
    },
  },

  move: {
    frontend_dist: {
      src: './frontend/dist',
      dest: './public/dist',
    },
  },

  start: {
    directory: './',
    cmd: 'electron',
    args: ['.', '--env=prod'],
  },

  encrypt: {
    frontend: {
      type: 'none',
      files: ['./public/dist/**/*.(js|json)'],
      cleanFiles: ['./public/dist'],
      confusionOptions: {
        compact: true,
        stringArray: true,
        stringArrayEncoding: ['none'],
        stringArrayCallsTransform: true,
        numbersToExpressions: true,
        target: 'browser',
      },
    },
    electron: {
      type: 'confusion',
      files: ['./public/electron/**/*.(js|json)'],
      cleanFiles: ['./public/electron'],
      specificFiles: ['./public/electron/main.js', './public/electron/preload/bridge.js'],
      confusionOptions: {
        compact: true,
        stringArray: true,
        stringArrayEncoding: ['none'],
        deadCodeInjection: false,
        stringArrayCallsTransform: true,
        numbersToExpressions: true,
        target: 'node',
      },
    },
  },
};
