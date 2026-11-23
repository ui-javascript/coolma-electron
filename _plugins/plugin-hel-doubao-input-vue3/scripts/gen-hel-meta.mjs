/**
 * 生成 hel_dist/hel-meta.json。
 *
 * hel 的资源列表必须是可以直接注入 <script>/<link> 的绝对地址，
 * 所以部署前用 HEL_BASE 指定站点根（默认本地预览地址）。
 */
import fs from 'node:fs/promises';
import path from 'node:path';

const pkg = JSON.parse(await fs.readFile(new URL('../package.json', import.meta.url), 'utf8'));
const distDir = path.resolve(new URL('../hel_dist', import.meta.url).pathname);
const base = (process.env.HEL_BASE || 'http://127.0.0.1:8093/').replace(/\/+$/, '') + '/';
const now = new Date().toISOString();
const js = `${base}assets/index.js`;
const css = `${base}assets/style.css`;
const vueGlobal = 'https://unpkg.com/vue@3.5.45/dist/vue.global.prod.js';

const meta = {
  app: {
    name: pkg.name,
    app_group_name: pkg.name,
    git_repo_url: '',
    online_version: pkg.version,
    build_version: pkg.version,
    platform: 'unpkg',
    create_at: now,
  },
  version: {
    plugin_ver: '5.4.3',
    extract_mode: 'build',
    sub_app_name: pkg.name,
    sub_app_version: `${pkg.name}@${pkg.version}`,
    version_tag: pkg.version,
    src_map: {
      webDirPath: base,
      htmlIndexSrc: '',
      extractMode: 'all',
      iframeSrc: '',
      chunkCssSrcList: [css],
      chunkJsSrcList: [js],
      staticCssSrcList: [],
      // append:false —— 宿主负责先挂 window.Vue，这里只声明期望的版本
      staticJsSrcList: [vueGlobal],
      relativeCssSrcList: [],
      relativeJsSrcList: [],
      headAssetList: [
        { tag: 'staticScript', append: false, attrs: { src: vueGlobal } },
        { tag: 'script', append: true, attrs: { src: js, defer: 'defer' } },
        { tag: 'link', append: true, attrs: { href: css, rel: 'stylesheet' } },
      ],
      bodyAssetList: [],
    },
    html_content: '',
    create_at: now,
    desc: pkg.description,
  },
};

await fs.writeFile(path.join(distDir, 'hel-meta.json'), JSON.stringify(meta, null, 2) + '\n', 'utf8');
console.log(`[hel] meta → ${path.join(distDir, 'hel-meta.json')} (base: ${base})`);
