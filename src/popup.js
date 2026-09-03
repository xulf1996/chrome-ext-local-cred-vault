import * as store from './js/store.js';
import { filterEntries, groupEntries } from './js/storage.js';
import { escapeHtml, maskPassword, copyAndAutoClear, toast } from './js/ui.js';

const bannerEl = document.getElementById('banner');
const bodyEl = document.getElementById('body');
const listEl = document.getElementById('list');
const searchEl = document.getElementById('search');
const groupEl = document.getElementById('groupBy');
const countEl = document.getElementById('count');

let entries = [];
let prefs = { groupBy: 'project' };
let fileState = 'no-file'; // 'no-file' | 'need-permission' | 'ok'

function rowHtml(e) {
  const origin = e.origin || '未填写地址';
  const user = e.username || '—';
  const remark = e.remark ? `<span class="entry-remark">${escapeHtml(e.remark)}</span>` : '';
  const head =
    prefs.groupBy === 'project'
      ? `<span class="entry-addr">${escapeHtml(origin)}</span>`
      : `<span class="entry-project">${escapeHtml(e.project || '未命名项目')}</span><span class="entry-origin">${escapeHtml(origin)}</span>`;

  return `
    <div class="entry" data-id="${escapeHtml(e.id)}">
      <div class="entry-main">
        <div class="entry-line1">${head}</div>
        <div class="entry-line2">
          <span class="entry-user">${escapeHtml(user)}</span>
          <span class="entry-pwd" data-act="reveal" title="点击显示或隐藏">${maskPassword(e.password)}</span>
          ${remark}
        </div>
      </div>
      <div class="entry-actions">
        <button class="btn btn-sm" data-act="copy-user" title="复制账号">账号</button>
        <button class="btn btn-primary btn-sm" data-act="copy-pwd" title="复制密码">复制</button>
      </div>
    </div>`;
}

function renderBanner() {
  if (fileState === 'ok') {
    bannerEl.hidden = true;
    return;
  }
  bannerEl.hidden = false;
  bannerEl.innerHTML =
    fileState === 'no-file'
      ? '还没有选择数据文件 <button id="btnFix" class="link-btn">去设置</button>'
      : '数据文件需要重新授权 <button id="btnFix" class="link-btn">去授权</button>';
}

function render() {
  renderBanner();

  const query = searchEl.value;
  const filtered = filterEntries(entries, query);

  if (!filtered.length) {
    listEl.innerHTML = `<div class="empty">${
      entries.length
        ? '没有匹配的凭据'
        : fileState === 'ok'
          ? '还没有任何凭据<br>点右下角「新增凭据」开始录入'
          : '还没有数据'
    }</div>`;
  } else {
    const groups = groupEntries(filtered, prefs.groupBy);
    listEl.innerHTML = groups
      .map((g) => {
        const rows = g.items.map(rowHtml).join('');
        if (!g.label) return rows;
        return `<div class="group-title">${escapeHtml(g.label)}<span class="count">${g.items.length}</span></div>${rows}`;
      })
      .join('');
  }

  const q = query.trim();
  countEl.textContent = q ? `${filtered.length} / ${entries.length} 条` : `${entries.length} 条`;
}

async function doCopy(entry, kind) {
  const value = kind === 'pwd' ? entry.password : entry.username;
  if (!value) {
    toast('这个字段是空的', true);
    return;
  }
  const ok = await copyAndAutoClear(value);
  toast(ok ? `${kind === 'pwd' ? '密码' : '账号'}已复制 · 30 秒后清空剪贴板` : '复制失败，请手动选中复制', !ok);
}

listEl.addEventListener('click', (ev) => {
  const target = ev.target.closest('[data-act]');
  if (!target) return;
  const row = target.closest('.entry');
  if (!row) return;
  const entry = entries.find((e) => e.id === row.dataset.id);
  if (!entry) return;

  const act = target.dataset.act;
  if (act === 'reveal') {
    const shown = target.dataset.show === '1';
    target.textContent = shown ? maskPassword(entry.password) : entry.password || '(空)';
    target.dataset.show = shown ? '0' : '1';
  } else if (act === 'copy-pwd') {
    doCopy(entry, 'pwd');
  } else if (act === 'copy-user') {
    doCopy(entry, 'user');
  }
});

bannerEl.addEventListener('click', (ev) => {
  if (ev.target.id !== 'btnFix') return;
  chrome.runtime.openOptionsPage();
});

searchEl.addEventListener('input', render);

searchEl.addEventListener('keydown', (ev) => {
  if (ev.key !== 'Enter') return;
  const first = filterEntries(entries, searchEl.value)[0];
  if (first) doCopy(first, 'pwd');
});

/**
 * Grouping is the only thing the popup writes. It re-reads the file first so a
 * stale in-memory snapshot can never clobber entries added elsewhere.
 */
groupEl.addEventListener('change', async () => {
  prefs = Object.assign({}, prefs, { groupBy: groupEl.value });
  render();
  try {
    await store.reload();
    const snap = store.getSnapshot();
    await store.save({ entries: snap.entries, prefs });
  } catch {
    // 没选文件、权限丢了或弹窗关得太快 —— 分组只在本次生效，不影响凭据数据
  }
});

document.getElementById('btnManage').addEventListener('click', () => {
  // 每次都用新 tab 打开（openOptionsPage 会复用已有 tab，不符合需求）。
  // URL 后挂 ?t= 时间戳，规避任何"同 URL 复用 tab"的浏览器逻辑。
  chrome.tabs.create({ url: chrome.runtime.getURL('src/options.html?t=' + Date.now()) });
});

document.getElementById('btnAdd').addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('src/options.html#new') });
});

(async function init() {
  if (!store.isSupported()) {
    listEl.innerHTML = '<div class="empty">当前浏览器不支持本地文件读写<br>请使用 Chrome / Edge 86 以上版本</div>';
    bodyEl.hidden = true;
    return;
  }

  fileState = await store.init();
  if (fileState === 'ok') {
    const snap = store.getSnapshot();
    entries = snap.entries;
    prefs = snap.prefs;
  }
  if (prefs.groupBy) groupEl.value = prefs.groupBy;

  searchEl.focus();
  render();
})();
