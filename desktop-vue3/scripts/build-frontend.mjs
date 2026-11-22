#!/usr/bin/env node
/**
 * 前端构建入口：三套 UI 库全局注册后 Rollup 峰值超过默认 2GB 堆。
 * 这里统一把 NODE_OPTIONS 提到 4GB，避免 build-frontend 偶发 OOM。
 */
import { spawnSync } from 'node:child_process';

const heapFlag = '--max-old-space-size=4096';
const current = String(process.env.NODE_OPTIONS ?? '').trim();
const env = {
  ...process.env,
  NODE_OPTIONS: current.includes('max-old-space-size')
    ? current
    : [current, heapFlag].filter(Boolean).join(' '),
};

function run(args) {
  const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
  const result = spawnSync(pnpm, ['exec', 'ee-bin', ...args], {
    env,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

run(['build', '--cmds=frontend']);
run(['move', '--flag=frontend_dist']);
