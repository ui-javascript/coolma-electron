import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { BrowserWindow } from 'electron';
import {
  applyBaseToConfig,
  buildBlogPackageJson,
  buildManagerCommand,
  buildVuepressConfig,
  detectBuildScript,
  detectConfigTheme,
  normalizeBase,
  normalizeBlogTheme,
  normalizePackageManager,
  NAV_BUILDER_SOURCE,
  SIDEBAR_BUILDER_SOURCE,
  shouldRebuildPackage,
  validateBaseInput,
  withBuildScript,
} from './blogEnv';
import type { BlogPackageJson, BlogPackageManager, BlogTheme } from './blogEnv';

/**
 * vuepress 构建执行器（复刻 vue2 blog-deploy-handler.execBlogBuild 的环境准备段）。
 *
 * 顺序与 vue2 一致：Node 检测 → 校验目录 → 生成/修复 package.json、config.js 与
 * sidebar/nav builders → 缺 node_modules / vuepress 时安装 → 清缓存 → 跑 build 脚本。
 * 构建脚本仍来自博客目录的 package.json，只在用户点「构建」时执行。
 */
export type BlogProgress = {
  stage: 'config' | 'install' | 'build' | 'sftp' | 'done' | 'error' | 'cancelled';
  message: string;
  percent: number;
  stream?: 'stdout' | 'stderr';
};

export type BlogBuildEnv = {
  theme: BlogTheme;
  nodeVersion: string;
  packageStatus: 'created' | 'updated' | 'kept';
  configStatus: 'created' | 'updated' | 'base-updated' | 'kept';
  installed: boolean;
};

let current: ChildProcess | null = null;
let cancelled = false;

export function sendBlogProgress(payload: BlogProgress): void {
  BrowserWindow.getAllWindows().forEach((win) => {
    if (!win.isDestroyed()) {
      win.webContents.send('blog-deploy-progress', payload);
    }
  });
}

const CANDIDATE_DISTS = ['.vuepress/dist', '_docs/.vuepress/dist', 'docs/.vuepress/dist'];

async function pathExists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function checkNodeVersion(): Promise<string | null> {
  return new Promise((resolve) => {
    const child = spawn('node', ['--version'], { windowsHide: true });
    let output = '';
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        child.kill();
        resolve(null);
      }
    }, 5000);
    child.stdout?.on('data', (data: Buffer) => {
      output += data.toString();
    });
    child.on('error', () => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve(null);
      }
    });
    child.on('close', (code) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve(code === 0 ? output.trim() : null);
      }
    });
  });
}

async function readPackage(blogDir: string): Promise<BlogPackageJson | null> {
  try {
    return JSON.parse(await fs.readFile(path.join(blogDir, 'package.json'), 'utf-8')) as BlogPackageJson;
  } catch {
    return null;
  }
}

async function ensurePackage(
  blogDir: string,
  theme: BlogTheme,
): Promise<{ pkg: BlogPackageJson; status: BlogBuildEnv['packageStatus'] }> {
  const packagePath = path.join(blogDir, 'package.json');
  const existing = await readPackage(blogDir);
  if (!existing) {
    const pkg = buildBlogPackageJson(theme);
    await fs.writeFile(packagePath, JSON.stringify(pkg, null, 2), 'utf-8');
    return { pkg, status: 'created' };
  }
  if (shouldRebuildPackage(existing, theme)) {
    const pkg = buildBlogPackageJson(theme);
    await fs.writeFile(packagePath, JSON.stringify(pkg, null, 2), 'utf-8');
    return { pkg, status: 'updated' };
  }
  const pkg = withBuildScript(existing);
  if (!detectBuildScript(existing)) {
    await fs.writeFile(packagePath, JSON.stringify(pkg, null, 2), 'utf-8');
    return { pkg, status: 'updated' };
  }
  return { pkg, status: 'kept' };
}

async function ensureConfig(
  blogDir: string,
  theme: BlogTheme,
  baseInput?: string,
): Promise<BlogBuildEnv['configStatus']> {
  const vuepressDir = path.join(blogDir, '.vuepress');
  const configPath = path.join(vuepressDir, 'config.js');
  const configTsPath = path.join(vuepressDir, 'config.ts');
  const base = normalizeBase(baseInput);
  await fs.mkdir(vuepressDir, { recursive: true });
  if (await pathExists(configTsPath) && !(await pathExists(configPath))) {
    return 'kept';
  }
  if (!(await pathExists(configPath))) {
    await fs.writeFile(configPath, buildVuepressConfig(theme, base), 'utf-8');
    return 'created';
  }
  const source = await fs.readFile(configPath, 'utf-8');
  const currentTheme = detectConfigTheme(source);
  if (currentTheme && currentTheme !== theme) {
    await fs.writeFile(configPath, buildVuepressConfig(theme, base), 'utf-8');
    return 'updated';
  }
  if (base) {
    const result = applyBaseToConfig(source, base);
    if (result.mode !== 'unchanged') {
      await fs.writeFile(configPath, result.content, 'utf-8');
      return 'base-updated';
    }
  }
  return 'kept';
}

async function ensureBuilders(blogDir: string): Promise<void> {
  const utilsDir = path.join(blogDir, '.vuepress', 'utils');
  await fs.mkdir(utilsDir, { recursive: true });
  await Promise.all([
    fs.writeFile(path.join(utilsDir, 'sidebar-builder.js'), SIDEBAR_BUILDER_SOURCE, 'utf-8'),
    fs.writeFile(path.join(utilsDir, 'nav-builder.js'), NAV_BUILDER_SOURCE, 'utf-8'),
  ]);
}

async function hasVuepress(blogDir: string): Promise<boolean> {
  const npmCli = path.join(blogDir, 'node_modules', 'vuepress', 'cli.js');
  const bin = path.join(blogDir, 'node_modules', '.bin', process.platform === 'win32' ? 'vuepress.cmd' : 'vuepress');
  return (await pathExists(npmCli)) || (await pathExists(bin));
}

type TaskResult = {
  ok: boolean;
  cancelled: boolean;
  code: number | null;
  stdout: string;
  stderr: string;
  error?: string;
};

function spawnTask(input: {
  command: string;
  args: string[];
  cwd: string;
  onLine?: (line: string, stream: 'stdout' | 'stderr') => void;
}): Promise<TaskResult> {
  return new Promise((resolve) => {
    let settled = false;
    let stdout = '';
    let stderr = '';
    const child = spawn(input.command, input.args, {
      cwd: input.cwd,
      env: { ...process.env },
      windowsHide: true,
    });
    current = child;

    const finish = (result: TaskResult): void => {
      if (settled) {
        return;
      }
      settled = true;
      current = null;
      resolve(result);
    };

    const push = (text: string, stream: 'stdout' | 'stderr'): void => {
      text.split(/\r?\n/).filter(Boolean).slice(-8).forEach((line) => {
        input.onLine?.(line.slice(0, 500), stream);
      });
    };

    child.stdout?.on('data', (data: Buffer) => {
      const text = data.toString();
      stdout = `${stdout}${text}`.slice(-4000);
      push(text, 'stdout');
    });
    child.stderr?.on('data', (data: Buffer) => {
      const text = data.toString();
      stderr = `${stderr}${text}`.slice(-4000);
      push(text, 'stderr');
    });
    child.on('error', (error) => {
      finish({
        ok: false,
        cancelled,
        code: null,
        stdout,
        stderr,
        error: error.message,
      });
    });
    child.on('close', (code) => {
      finish({
        ok: !cancelled && code === 0,
        cancelled,
        code,
        stdout,
        stderr,
        error: !cancelled && code !== 0 ? (stderr.trim() || `exit ${code}`) : undefined,
      });
    });
  });
}

async function findDist(blogDir: string): Promise<string> {
  for (const candidate of CANDIDATE_DISTS) {
    const dir = path.join(blogDir, candidate);
    try {
      const info = await fs.stat(dir);
      if (info.isDirectory()) {
        return dir;
      }
    } catch {
      // 继续找
    }
  }
  return '';
}

async function cleanBuildCaches(blogDir: string): Promise<void> {
  const vuepressDir = path.join(blogDir, '.vuepress');
  const cachePaths = [
    path.join(vuepressDir, 'cache'),
    path.join(vuepressDir, '.cache'),
    path.join(vuepressDir, 'dist'),
    path.join(blogDir, 'node_modules', '.cache'),
    path.join(blogDir, '.cache'),
  ];
  for (const target of cachePaths) {
    await fs.rm(target, { recursive: true, force: true });
  }
}

export async function runBlogBuild(input: {
  blogDir: string;
  packageManager?: BlogPackageManager | string;
  script?: string;
  theme?: BlogTheme | string;
  base?: string;
}): Promise<{
  ok: boolean;
  distDir?: string;
  error?: string;
  details?: unknown;
  script?: string;
  env?: BlogBuildEnv;
}> {
  if (current) {
    return { ok: false, error: 'BLOG_BUILD_BUSY' };
  }
  const blogDir = path.resolve(input.blogDir);
  try {
    const info = await fs.stat(blogDir);
    if (!info.isDirectory()) {
      return { ok: false, error: 'BLOG_DIR_INVALID' };
    }
  } catch {
    return { ok: false, error: 'BLOG_DIR_INVALID' };
  }

  cancelled = false;
  sendBlogProgress({ stage: 'config', message: 'Checking Node.js...', percent: 1 });
  const nodeVersion = await checkNodeVersion();
  if (!nodeVersion) {
    sendBlogProgress({ stage: 'error', message: 'Node.js not found', percent: 0 });
    return {
      ok: false,
      error: 'NODE_NOT_FOUND',
      details: { platform: process.platform },
    };
  }
  sendBlogProgress({ stage: 'config', message: `Node.js ${nodeVersion}`, percent: 2 });

  const theme = normalizeBlogTheme(input.theme);
  const packageManager = normalizePackageManager(input.packageManager);
  const packageSetup = await ensurePackage(blogDir, theme);
  sendBlogProgress({
    stage: 'config',
    message: `package.json ${packageSetup.status}`,
    percent: 4,
  });
  const baseCheck = validateBaseInput(input.base);
  if (!baseCheck.ok) {
    throw Object.assign(new Error(baseCheck.error || 'invalid base'), { code: 'BLOG_BASE_INVALID' });
  }
  const configStatus = await ensureConfig(blogDir, theme, baseCheck.value);
  sendBlogProgress({
    stage: 'config',
    message: `config.js ${configStatus}`,
    percent: 5,
  });
  await ensureBuilders(blogDir);
  sendBlogProgress({ stage: 'config', message: 'sidebar/nav builders ready', percent: 6 });

  const needsInstall = packageSetup.status !== 'kept' || !(await hasVuepress(blogDir));
  let installed = false;
  if (needsInstall) {
    sendBlogProgress({
      stage: 'install',
      message: `Installing dependencies (${packageManager})...`,
      percent: 40,
    });
    const { command, args } = buildManagerCommand(packageManager, 'install');
    const install = await spawnTask({
      command,
      args,
      cwd: blogDir,
      onLine: (line, stream) => sendBlogProgress({
        stage: 'install',
        message: line,
        percent: 45,
        stream,
      }),
    });
    if (install.cancelled) {
      sendBlogProgress({ stage: 'cancelled', message: 'cancelled', percent: 0 });
      return { ok: false, error: 'BLOG_BUILD_CANCELLED' };
    }
    if (!install.ok) {
      const message = install.error || 'install failed';
      sendBlogProgress({ stage: 'error', message, percent: 0 });
      return { ok: false, error: `BLOG_DEPENDENCY_INSTALL_FAILED: ${message}` };
    }
    installed = true;
    if (!(await hasVuepress(blogDir))) {
      const message = 'vuepress not found after install';
      sendBlogProgress({ stage: 'error', message, percent: 0 });
      return { ok: false, error: message };
    }
    sendBlogProgress({ stage: 'install', message: 'dependencies installed', percent: 48 });
  } else {
    sendBlogProgress({ stage: 'install', message: 'dependencies ready', percent: 48 });
  }

  const script = input.script || detectBuildScript(packageSetup.pkg) || 'build';
  if (cancelled) {
    sendBlogProgress({ stage: 'cancelled', message: 'cancelled', percent: 0 });
    return { ok: false, error: 'BLOG_BUILD_CANCELLED', script };
  }

  sendBlogProgress({ stage: 'build', message: 'Cleaning build cache...', percent: 49 });
  await cleanBuildCaches(blogDir);

  const { command, args } = buildManagerCommand(packageManager, 'run', script);
  sendBlogProgress({ stage: 'build', message: `${packageManager} run ${script}`, percent: 50 });
  const build = await spawnTask({
    command,
    args,
    cwd: blogDir,
    onLine: (line, stream) => sendBlogProgress({
      stage: 'build',
      message: line,
      percent: 60,
      stream,
    }),
  });

  if (build.cancelled) {
    sendBlogProgress({ stage: 'cancelled', message: 'cancelled', percent: 0 });
    return { ok: false, error: 'BLOG_BUILD_CANCELLED', script };
  }
  if (!build.ok) {
    const message = build.error || 'build failed';
    sendBlogProgress({ stage: 'error', message, percent: 0 });
    return { ok: false, error: message, script };
  }

  const distDir = await findDist(blogDir);
  sendBlogProgress({ stage: 'done', message: distDir || 'built', percent: 100 });
  return {
    ok: true,
    distDir,
    script,
    env: {
      theme,
      nodeVersion,
      packageStatus: packageSetup.status,
      configStatus,
      installed,
    },
  };
}

export function cancelBlogBuild(): boolean {
  if (!current) {
    return false;
  }
  cancelled = true;
  try {
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', String(current.pid), '/T', '/F'], { windowsHide: true });
    } else {
      current.kill('SIGTERM');
    }
    return true;
  } catch {
    return false;
  }
}
