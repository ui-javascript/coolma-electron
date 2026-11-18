import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const electronPath = require('electron');
const sqlitePkgPath = path.dirname(require.resolve('better-sqlite3/package.json'));
const sqlitePkg = JSON.parse(fs.readFileSync(path.join(sqlitePkgPath, 'package.json'), 'utf8'));

const abi = execFileSync(electronPath, ['-p', 'process.versions.modules'], {
  encoding: 'utf8',
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
}).trim();

const platform = process.platform;
const arch = process.arch;
const archName = arch === 'x64' ? 'x64' : arch === 'arm64' ? 'arm64' : arch;
const artifact = `better-sqlite3-v${sqlitePkg.version}-electron-v${abi}-${platform}-${archName}.tar.gz`;
const base = process.env.BETTER_SQLITE3_MIRROR || 'https://registry.npmmirror.com/-/binary/better-sqlite3';
const url = `${base}/v${sqlitePkg.version}/${artifact}`;
const temp = path.join(os.tmpdir(), artifact);

console.log(`[sqlite] electron=${electronPath}`);
console.log(`[sqlite] abi=${abi} platform=${platform} arch=${archName}`);
console.log(`[sqlite] downloading ${url}`);

const response = await fetch(url);
if (!response.ok) {
  throw new Error(`Download failed: HTTP ${response.status} ${url}`);
}
fs.writeFileSync(temp, Buffer.from(await response.arrayBuffer()));

try {
  fs.mkdirSync(path.join(sqlitePkgPath, 'build', 'Release'), { recursive: true });
  execFileSync('tar', ['-xzf', temp, '-C', sqlitePkgPath], { stdio: 'inherit' });
  const binding = path.join(sqlitePkgPath, 'build', 'Release', 'better_sqlite3.node');
  if (!fs.existsSync(binding)) {
    throw new Error(`Prebuild did not contain ${binding}`);
  }
  console.log(`[sqlite] installed ${binding}`);
} finally {
  fs.rmSync(temp, { force: true });
}
