/**
 * Smoke test for the pure-logic modules. Run with Node 22+ (has global webcrypto).
 *   node tools/selftest.mjs
 *
 * store.js / idb.js are NOT covered here — they need the File System Access API
 * and IndexedDB, which only exist in the browser.
 */
import assert from 'node:assert/strict';
import {
  normalizeOrigin,
  makeEntry,
  groupEntries,
  filterEntries,
  collectProjects,
  mergeEntries,
  serializeVault,
  parseVault,
  normalizeVault
} from '../src/js/storage.js';

let passed = 0;
async function test(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log('  ok   ' + name);
  } catch (err) {
    console.error('  FAIL ' + name + '\n       ' + err.message);
    process.exitCode = 1;
  }
}

console.log('normalizeOrigin');
await test('补全协议并保留非默认端口', () => {
  assert.equal(normalizeOrigin('localhost:8080'), 'http://localhost:8080');
});
await test('默认端口 80 被归一化（与 Chrome realm 一致）', () => {
  assert.equal(normalizeOrigin('localhost:80'), 'http://localhost');
  assert.equal(normalizeOrigin('http://localhost'), 'http://localhost');
});
await test('丢弃 path 与 query', () => {
  assert.equal(normalizeOrigin('https://a.example.com/x/y?z=1'), 'https://a.example.com');
});
await test('保留 https 协议', () => {
  assert.equal(normalizeOrigin('https://a.example.com'), 'https://a.example.com');
});
await test('内网 IP', () => {
  assert.equal(normalizeOrigin('192.168.1.20:9000'), 'http://192.168.1.20:9000');
});
await test('空输入返回空串', () => {
  assert.equal(normalizeOrigin(''), '');
  assert.equal(normalizeOrigin(null), '');
});

console.log('entry / search / group');
// 样本口令必须足够长：短片段会在随机数据里偶然出现，让「不包含」类断言随机误报。
const PWD_A = 'Zx9#qW7!vT2@mLp5';
const PWD_B = 'Rk4$mN8^bH3*cYv6';
const PWD_C = 'Jd2&Pl5(sF7)gTr9';
const PWD_CHANGED = 'Kq3!wE8#rT5%yUi1';

const sample = [
  makeEntry({ project: '订单系统', origin: 'localhost:80', username: 'admin', password: PWD_A }),
  makeEntry({ project: '网关服务', origin: 'localhost:80', username: 'root', password: PWD_B }),
  makeEntry({ project: '后台管理', origin: 'localhost:9090', username: 'admin', password: PWD_C })
];

await test('同一地址可共存多条凭据', () => {
  const byOrigin = groupEntries(sample, 'origin');
  assert.equal(byOrigin.find((g) => g.key === 'http://localhost').items.length, 2);
});
await test('项目分组各自独立', () => {
  assert.equal(groupEntries(sample, 'project').length, 3);
});
await test('搜索命中项目名与账号', () => {
  assert.equal(filterEntries(sample, '网关').length, 1);
  assert.equal(filterEntries(sample, 'admin').length, 2);
});
await test('分组不会改动原数组顺序', () => {
  const before = sample.map((e) => e.id);
  groupEntries(sample, 'project');
  assert.deepEqual(sample.map((e) => e.id), before);
});

console.log('项目必填 / 地址选填');
await test('地址留空也能建条目', () => {
  const e = makeEntry({ project: '内部工具', username: 'ops', password: 'p' });
  assert.equal(e.origin, '');
  assert.equal(e.project, '内部工具');
});
await test('项目名两端空白被裁剪', () => {
  assert.equal(makeEntry({ project: '  订单系统  ' }).project, '订单系统');
});
await test('按项目分组：同名项目聚合，空地址条目也归入', () => {
  const list = [
    makeEntry({ project: '订单系统', origin: 'localhost:80', username: 'admin', password: PWD_A }),
    makeEntry({ project: '订单系统', username: 'guest', password: PWD_B })
  ];
  const groups = groupEntries(list, 'project');
  assert.equal(groups.length, 1);
  assert.equal(groups[0].items.length, 2);
});
await test('collectProjects 去重并排序', () => {
  const list = [
    makeEntry({ project: '网关服务' }),
    makeEntry({ project: '订单系统' }),
    makeEntry({ project: '网关服务' })
  ];
  assert.deepEqual(collectProjects(list), ['订单系统', '网关服务']);
});
await test('collectProjects 忽略空项目名', () => {
  assert.deepEqual(collectProjects([makeEntry({ project: '' }), makeEntry({ project: 'A' })]), ['A']);
});

console.log('数据文件格式（落盘 / 读回）');
const PREFS = { groupBy: 'project' };

await test('序列化带有格式标记与 prefs', () => {
  const v = serializeVault(sample, PREFS);
  assert.equal(v.format, 'lcv-vault');
  assert.equal(v.version, 2);
  assert.equal(v.prefs.groupBy, 'project');
  assert.equal(v.entries.length, 3);
  assert.ok(v.updatedAt);
});

await test('落盘再读回，条目逐字段一致', () => {
  const text = JSON.stringify(serializeVault(sample, PREFS), null, 2);
  const back = parseVault(text);
  assert.deepEqual(back.entries, sample);
  assert.deepEqual(back.prefs, PREFS);
});

await test('读回不会刷新 updatedAt（防反复写脏文件）', () => {
  const e = makeEntry({ project: 'P', username: 'u', password: 'pw' });
  const back = parseVault(JSON.stringify(serializeVault([e], PREFS)));
  assert.equal(back.entries[0].updatedAt, e.updatedAt);
  assert.equal(back.entries[0].createdAt, e.createdAt);
});

await test('用户编辑会刷新 updatedAt', () => {
  const e = makeEntry({ project: 'P', username: 'u', password: 'pw' });
  const edited = makeEntry(Object.assign({}, e, { password: 'new' }));
  assert.ok(edited.updatedAt >= e.updatedAt);
  assert.equal(edited.createdAt, e.createdAt);
});

await test('容忍裸数组（手工编辑过的文件）', () => {
  const back = parseVault(JSON.stringify(sample));
  assert.equal(back.entries.length, 3);
  assert.deepEqual(back.prefs, { groupBy: 'project' });
});

// parseVault 是同步抛错，必须用 assert.throws —— assert.rejects 只处理 Promise 拒绝，
// 同步异常会直接冒泡出去，导致断言莫名其妙地失败。
await test('非法 JSON 给出可读错误', () => {
  assert.throws(() => parseVault('{ not json'), /不是合法的 JSON/);
});

await test('缺少凭据列表时给出可读错误', () => {
  assert.throws(() => parseVault('{"format":"lcv-vault"}'), /没有找到凭据列表/);
});

await test('非法 groupBy 回退为 project', () => {
  assert.equal(normalizeVault({ entries: [], prefs: { groupBy: 'bogus' } }).prefs.groupBy, 'project');
});

await test('丢弃文件里的非对象条目', () => {
  const back = normalizeVault({ entries: [null, 42, { project: 'A', password: 'x' }] });
  assert.equal(back.entries.length, 1);
});

console.log('merge');
await test('同 id 覆盖、新 id 追加', () => {
  const existing = [sample[0]];
  const incoming = [Object.assign({}, sample[0], { password: PWD_CHANGED }), sample[1]];
  const { entries, added, updated } = mergeEntries(existing, incoming);
  assert.equal(added, 1);
  assert.equal(updated, 1);
  assert.equal(entries.length, 2);
  assert.equal(entries.find((e) => e.id === sample[0].id).password, PWD_CHANGED);
});
await test('导入保留原有 createdAt', () => {
  const existing = [sample[0]];
  const { entries } = mergeEntries(existing, [Object.assign({}, sample[0], { password: PWD_CHANGED })]);
  assert.equal(entries.find((e) => e.id === sample[0].id).createdAt, sample[0].createdAt);
});
await test('重复导入同一条目不会翻倍', () => {
  const first = mergeEntries([], sample).entries;
  const second = mergeEntries(first, sample).entries;
  assert.equal(second.length, 3);
});

console.log(`\n${passed} passed${process.exitCode ? ', with failures' : ''}`);
