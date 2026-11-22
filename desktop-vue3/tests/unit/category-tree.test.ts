import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCategoryTree, buildTagTreemapData } from '../../frontend/src/utils/categoryTree';

test('分类树：单条多级路径自动补齐所有祖先', () => {
  const tree = buildCategoryTree([{ category: 'X/Y/Z', count: 3 }]);
  assert.equal(tree.length, 1);
  assert.equal(tree[0].key, '/X/');
  assert.equal(tree[0].children[0].key, '/X/Y/');
  assert.equal(tree[0].children[0].children[0].key, '/X/Y/Z/');
  assert.equal(tree[0].children[0].children[0].count, 3);
  // 计数只落在最深一级，父节点保持 0，避免侧栏数字被放大
  assert.equal(tree[0].count, 0);
});

test('分类树：重复路径累加计数，首尾空白与空段被忽略', () => {
  const tree = buildCategoryTree([
    { category: ' /A/B/ ', count: 2 },
    { category: 'A/B', count: 1 },
    { category: '  ', count: 9 },
  ]);
  assert.equal(tree.length, 1);
  assert.equal(tree[0].children[0].count, 3);
});

test('分类树：根级按 label 排序，有服务端 pos 时优先 pos', () => {
  const byLabel = buildCategoryTree([
    { category: 'B', count: 1 },
    { category: 'A', count: 1 },
  ]);
  assert.deepEqual(byLabel.map((node) => node.label), ['A', 'B']);

  const byPos = buildCategoryTree(
    [
      { category: 'A', count: 1 },
      { category: 'B', count: 1 },
    ],
    (_path, segment) => segment,
    { '/A/': 5, '/B/': 1 },
  );
  assert.deepEqual(byPos.map((node) => node.label), ['B', 'A']);
});

test('分类树：label 回调能拿到完整路径', () => {
  const tree = buildCategoryTree([{ category: 'A/B', count: 1 }], (path, segment) => `${segment}@${path}`);
  assert.equal(tree[0].label, 'A@/A/');
  assert.equal(tree[0].children[0].label, 'B@/A/B/');
});

test('标签树：空输入返回空数组', () => {
  assert.deepEqual(buildTagTreemapData([]), []);
});

test('标签树：按数量倒序，前 20% 放大、其余固定 100', () => {
  const data = buildTagTreemapData([
    { name: 'c', count: 1 },
    { name: 'a', count: 5 },
    { name: 'b', count: 2 },
  ]);
  // 3 个标签时 top20 = ceil(0.6) = 1，只有第一名放大
  assert.deepEqual(data.map((item) => item.name), ['a', 'b', 'c']);
  assert.equal(data[0].value, 330);
  assert.equal(data[1].value, 100);
  assert.equal(data[2].value, 100);
  assert.equal(data[0].tagGuid, 'a');
  assert.equal(data[0].noteCount, 5);
});

test('标签树：同数量按名称升序，value 至少为 1', () => {
  const data = buildTagTreemapData([
    { name: 'b', count: 0 },
    { name: 'a', count: 0 },
  ]);
  assert.deepEqual(data.map((item) => item.name), ['a', 'b']);
  assert.ok(data.every((item) => item.value >= 1));
});
