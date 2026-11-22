import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BUILT_IN_CDN_DEPS,
  mergeCdnDeps,
  normalizeCdnDeps,
  getResourceType,
  isJQueryCoreDep,
} from '../../frontend/src/utils/cdn-rules';

test('CDN：非数组输入归零', () => {
  assert.deepEqual(normalizeCdnDeps(null), []);
  assert.deepEqual(normalizeCdnDeps({ name: 'x' }), []);
});

test('CDN：空对象条目被丢弃，缺省字段补默认值', () => {
  const deps = normalizeCdnDeps([{}, { name: 'x', url: 'https://a.test/x.js' }, null]);
  assert.equal(deps.length, 1);
  assert.equal(deps[0].enabled, true);
  assert.equal(deps[0].applyToBlog, false);
  assert.equal(deps[0].isBuiltIn, false);
  assert.ok(deps[0].id);
});

test('CDN：未保存任何配置时返回全部内置项并标记 isBuiltIn', () => {
  const merged = mergeCdnDeps([]);
  assert.equal(merged.length, BUILT_IN_CDN_DEPS.length);
  assert.ok(merged.every((dep) => dep.isBuiltIn && dep.id));
});

test('CDN：保存项覆盖同名内置项，自定义项追加在后', () => {
  const merged = mergeCdnDeps([
    { name: 'jQuery', url: 'https://mirror.test/jquery.min.js', enabled: false },
    { name: 'my-lib', url: 'https://a.test/my.js' },
  ]);
  const jquery = merged.find((dep) => dep.name === 'jQuery');
  assert.equal(jquery?.url, 'https://mirror.test/jquery.min.js');
  assert.equal(jquery?.enabled, false);
  assert.equal(jquery?.isBuiltIn, true);
  // 内置项永远保留，自定义项唯一位于末尾
  assert.equal(merged.length, BUILT_IN_CDN_DEPS.length + 1);
  assert.equal(merged[merged.length - 1].name, 'my-lib');
  assert.equal(merged[merged.length - 1].isBuiltIn, false);
});

test('CDN：资源类型按后缀判断，未知后缀退回样式表', () => {
  assert.equal(getResourceType('https://a.test/x.js'), 'script');
  assert.equal(getResourceType('https://a.test/x.css'), 'stylesheet');
  assert.equal(getResourceType('https://a.test/f.woff2'), 'font');
  assert.equal(getResourceType('https://a.test/f.svg?v=1'), 'font');
  assert.equal(getResourceType('https://a.test/x.txt'), 'stylesheet');
});

test('CDN：jQuery 核心识别，migrate 不算核心', () => {
  assert.equal(isJQueryCoreDep({ name: 'jQuery', url: '' }), true);
  assert.equal(isJQueryCoreDep({ name: 'x', url: 'https://cdn/jquery.min.js' }), true);
  assert.equal(isJQueryCoreDep({ name: 'x', url: 'https://cdn/jquery-migrate.min.js' }), false);
  assert.equal(isJQueryCoreDep(null), false);
});
