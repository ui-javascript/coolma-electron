import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { BrowserWindow } from 'electron';

/**
 * vuepress 构建执行器（从 vue2 blog-deploy-handler.js 里挑核心那段）。
 *
 * 只做：校验目录 → 找 build 脚本 → 在博客目录里跑 `npm/pnpm/yarn run <script>` →
 * 把 stdout/stderr 逐行推给渲染层 → 结束猜 dist 目录。
 *
 * 没搬：Node.js 安装引导、node_modules 软链、自动改 .vuepress/config.js 的 base/theme、
 * 自动生成 package.json、npm install、GitHub workflow_dispatch、SFTP 上传。
 * 构建脚本来自博客目录的 package.json —— 这就是执行用户指定目录里的代码，只在用户点「构建」时触发。
 */
export type BlogProgress = {
  stage: 'build' | 'sftp' | 'done' | 'error' | 'cancelled';
  message: string;
  percent: number;
  stream?: 'stdout' | 'stderr';
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

const CANDIDATE_SCRIPTS = ['docs:build', 'blog:build', 'vuepress:build', 'build'];
const CANDIDATE_DISTS = ['.vuepress/dist', '_docs/.vuepress/dist', 'docs/.vuepress/dist'];

async function readBuildScript(blogDir: string): Promise<{ script: string; packageManager: string } | null> {
  const packagePath = path.join(blogDir, 'package.json');
  let scripts: Record<string, string> = {};
  try {
    const pkg = JSON.parse(await fs.readFile(packagePath, 'utf-8')) as { scripts?: Record<string, string> };
    scripts = pkg.scripts ?? {};
  } catch {
    return null;
  }
  const script = CANDIDATE_SCRIPTS.find((name) => typeof scripts[name] === 'string');
  return script ? { script, packageManager: 'npm' } : null;
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

function toShellCommand(packageManager: string, script: string): { command: string; args: string[] } {
  if (process.platform === 'win32') {
    return { command: 'cmd.exe', args: ['/c', `${packageManager} run ${script}`] };
  }
  return { command: '/bin/sh', args: ['-c', `${packageManager} run ${script}`] };
}

export async function runBlogBuild(input: {
  blogDir: string;
  packageManager?: string;
  script?: string;
}): Promise<{ ok: boolean; distDir?: string; error?: string; script?: string }> {
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

  const detected = await readBuildScript(blogDir);
  const script = input.script || detected?.script;
  if (!script) {
    return { ok: false, error: 'NO_BUILD_SCRIPT' };
  }
  const packageManager = input.packageManager || detected?.packageManager || 'npm';
  const { command, args } = toShellCommand(packageManager, script);

  cancelled = false;
  sendBlogProgress({ stage: 'build', message: `${packageManager} run ${script}`, percent: 10 });

  return new Promise((resolve) => {
    let stderr = '';
    let stdoutTail = '';
    const child = spawn(command, args, {
      cwd: blogDir,
      env: { ...process.env },
      windowsHide: true,
    });
    current = child;

    const push = (text: string, stream: 'stdout' | 'stderr') => {
      text.split(/\r?\n/).filter(Boolean).slice(-8).forEach((line) => {
        sendBlogProgress({ stage: 'build', message: line.slice(0, 500), percent: 50, stream });
      });
    };

    child.stdout?.on('data', (data: Buffer) => {
      const text = data.toString();
      stdoutTail = `${stdoutTail}${text}`.slice(-2000);
      push(text, 'stdout');
    });
    child.stderr?.on('data', (data: Buffer) => {
      const text = data.toString();
      stderr = `${stderr}${text}`.slice(-2000);
      push(text, 'stderr');
    });

    const finish = async (code: number | null, error?: Error): Promise<void> => {
      current = null;
      if (cancelled) {
        cancelled = false;
        sendBlogProgress({ stage: 'cancelled', message: 'cancelled', percent: 0 });
        resolve({ ok: false, error: 'BLOG_BUILD_CANCELLED', script });
        return;
      }
      if (error || code !== 0) {
        sendBlogProgress({ stage: 'error', message: stderr.trim() || error?.message || `exit ${code}`, percent: 0 });
        resolve({ ok: false, error: stderr.trim() || error?.message || `exit ${code}`, script });
        return;
      }
      const distDir = await findDist(blogDir);
      sendBlogProgress({ stage: 'done', message: distDir || 'built', percent: 100 });
      resolve({ ok: true, distDir, script });
    };

    child.on('error', (error) => void finish(null, error));
    child.on('close', (code) => void finish(code));
  });
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
