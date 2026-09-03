import * as store from './js/store.js';
import {
  newId,
  makeEntry,
  normalizeOrigin,
  filterEntries,
  groupEntries,
  collectProjects,
  mergeEntries
} from './js/storage.js';
import { escapeHtml, maskPassword, generatePassword, copyAndAutoClear, toast } from './js/ui.js';

const filebarEl = document.getElementById('filebar');
const listEl = document.getElementById('list');
const searchEl = document.getElementById('search');
const groupEl = document.getElementById('groupBy');
const countEl = document.getElementById('count');

const dlgEdit = document.getElementById('dlgEdit');
const dlgEditTitle = document.getElementById('dlgEditTitle');
const formEdit = document.getElementById('formEdit');
const btnSave = document.getElementById('btnSave');
const projectInput = document.getElementById('f-project');
const projectListEl = document.getElementById('projectList');
const originInput = document.getElementById('f-origin');
const originHint = document.getElementById('originHint');
const pwdInput = document.getElementById('f-password');

const dlgConfirm = document.getElementById('dlgConfirm');

let entries = [];
let prefs = { groupBy: 'project' };
let fileState = 'no-file'; // 'no-file' | 'need-permission' | 'ok'
let unsaved = false;
let editingId = null;
let busy = false; // 防重提交：任何写操作进行中
let confirmAction = null;

/* ---------- 数据文件状态栏 ---------- */

function renderFilebar() {
  const name = store.fileName();
  if (fileState === 'no-file') {
    filebarEl.className = 'filebar warn';
    filebarEl.innerHTML = `
      <div class="fb-text"><strong>尚未选择数据文件</strong>现在的所有改动只存在于内存中，关掉页面就会丢失。</div>
      <div class="fb-actions">
        <button class="btn btn-primary btn-sm" data-act="create-file">新建数据文件</button>
        <button class="btn btn-sm" data-act="switch-file">打开已有文件</button>
      </div>`;
    return;
  }

  if (fileState === 'need-permission') {
    filebarEl.className = 'filebar warn';
    filebarEl.innerHTML = `
      <div class="fb-text"><strong>${escapeHtml(name)}</strong>浏览器重启后需要重新授权才能读写这个文件。</div>
      <div class="fb-actions">
        <button class="btn btn-primary btn-sm" data-act="reauthorize">重新授权</button>
        <button class="btn btn-sm" data-act="switch-file">切换文件</button>
      </div>`;
    return;
  }

  filebarEl.className = 'filebar' + (unsaved ? ' warn' : '');
  filebarEl.innerHTML = `
    <div class="fb-text">
      数据文件 <strong>${escapeHtml(name)}</strong>
      ${unsaved ? '<span class="fb-dirty">有未保存的改动</span>' : '<span class="fb-ok">已同步</span>'}
    </div>
    <div class="fb-actions">
      <button class="btn btn-sm" data-act="save-copy">另存为副本</button>
      <button class="btn btn-sm" data-act="import-file">从文件导入</button>
      <button class="btn btn-sm" data-act="switch-file">切换文件</button>
    </div>`;
}

/* ---------- 列表 ---------- */

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
        <button class="btn btn-sm" data-act="copy-user">复制账号</button>
        <button class="btn btn-sm btn-primary" data-act="copy-pwd">复制密码</button>
        <button class="btn btn-sm" data-act="edit">编辑</button>
        <button class="btn btn-sm btn-danger" data-act="delete">删除</button>
      </div>
    </div>`;
}

function renderList() {
  const query = searchEl.value;
  const filtered = filterEntries(entries, query);

  if (!filtered.length) {
    listEl.innerHTML = `<div class="empty">${
      entries.length ? '没有匹配的凭据' : '还没有任何凭据，点右上角「新增凭据」开始'
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

function render() {
  renderFilebar();
  renderList();
  if (groupEl.value !== prefs.groupBy) groupEl.value = prefs.groupBy;
}

/* ---------- 写入（单飞 + 合并，见 store.js） ---------- */

async function commit(nextEntries, nextPrefs) {
  const nextEntriesRef = nextEntries || entries;
  const nextPrefsRef = nextPrefs || prefs;

  if (fileState !== 'ok') {
    entries = nextEntriesRef;
    prefs = nextPrefsRef;
    unsaved = true;
    render();
    toast('还没选择数据文件，改动暂存在内存中', true);
    return false;
  }

  try {
    await store.save({ entries: nextEntriesRef, prefs: nextPrefsRef });
    entries = nextEntriesRef;
    prefs = nextPrefsRef;
    unsaved = false;
    render();
    return true;
  } catch (err) {
    // 保留内存中的改动，不让用户白干
    entries = nextEntriesRef;
    prefs = nextPrefsRef;
    unsaved = true;
    if (err && err.code === 'NO_PERMISSION') {
      fileState = 'need-permission';
      toast('写入被拒绝，请点「重新授权」', true);
    } else {
      toast('保存失败：' + (err && err.message ? err.message : err), true);
    }
    render();
    return false;
  }
}

async function doCopy(entry, kind) {
  const value = kind === 'pwd' ? entry.password : entry.username;
  if (!value) {
    toast('这个字段是空的', true);
    return;
  }
  const ok = await copyAndAutoClear(value);
  toast(ok ? `${kind === 'pwd' ? '密码' : '账号'}已复制 · 30 秒后清空剪贴板` : '复制失败', !ok);
}

/* ---------- 列表交互（防重提交：busy 期间禁止写操作） ---------- */

listEl.addEventListener('click', (ev) => {
  const target = ev.target.closest('[data-act]');
  if (!target) return;
  const row = target.closest('.entry');
  if (!row) return;
  const entry = entries.find((e) => e.id === row.dataset.id);
  if (!entry) return;

  switch (target.dataset.act) {
    case 'reveal': {
      const shown = target.dataset.show === '1';
      target.textContent = shown ? maskPassword(entry.password) : entry.password || '(空)';
      target.dataset.show = shown ? '0' : '1';
      break;
    }
    case 'copy-pwd':
      doCopy(entry, 'pwd');
      break;
    case 'copy-user':
      doCopy(entry, 'user');
      break;
    case 'edit':
      if (busy) return;
      openEdit(entry);
      break;
    case 'delete':
      if (busy) return;
      askConfirm(
        `确定删除「${entry.project} / ${entry.username || '—'}」吗？此操作不可撤销。`,
        async () => {
          busy = true;
          try {
            await commit(entries.filter((x) => x.id !== entry.id));
            toast('已删除');
          } finally {
            busy = false;
          }
        }
      );
      break;
  }
});

searchEl.addEventListener('input', renderList);

groupEl.addEventListener('change', () => {
  prefs = Object.assign({}, prefs, { groupBy: groupEl.value });
  renderList();
  commit(entries, prefs);
});

/* ---------- 数据文件操作 ---------- */

filebarEl.addEventListener('click', async (ev) => {
  const btn = ev.target.closest('[data-act]');
  if (!btn || busy) return;
  const act = btn.dataset.act;

  busy = true;
  try {
    if (act === 'create-file') {
      await store.createFile();
      fileState = 'ok';
      unsaved = false;
      toast('已创建并切换到数据文件 ' + store.fileName());
      render();
    } else if (act === 'switch-file') {
      await store.switchFile();
      const snap = store.getSnapshot();
      entries = snap.entries;
      prefs = snap.prefs;
      fileState = 'ok';
      unsaved = false;
      toast('已切换到 ' + store.fileName());
      render();
    } else if (act === 'reauthorize') {
      const ok = await store.reauthorize();
      if (ok) {
        const snap = store.getSnapshot();
        entries = snap.entries;
        prefs = snap.prefs;
        fileState = 'ok';
        toast('授权成功');
        if (unsaved) await commit(entries, prefs);
      } else {
        toast('授权被拒绝', true);
      }
      render();
    } else if (act === 'save-copy') {
      const name = await store.saveCopy();
      toast('副本已保存到 ' + name);
    } else if (act === 'import-file') {
      const incoming = await store.readFileForImport();
      const merged = mergeEntries(entries, incoming.entries);
      await commit(merged.entries, prefs);
      toast(`导入完成 · 新增 ${merged.added} 条，更新 ${merged.updated} 条`);
    }
  } catch (err) {
    if (err && err.name === 'AbortError') return; // 用户取消选择文件
    toast((err && err.message) || '操作失败', true);
  } finally {
    busy = false;
  }
});

/* ---------- 新增 / 编辑 ---------- */

function hydrateProjectList() {
  projectListEl.innerHTML = collectProjects(entries)
    .map((name) => `<option value="${escapeHtml(name)}"></option>`)
    .join('');
}

function openEdit(entry) {
  // 预生成 id：即使提交逻辑被重复触发，同一条目也只会产生一条记录
  editingId = entry ? entry.id : newId();
  dlgEditTitle.textContent = entry ? '编辑凭据' : '新增凭据';
  formEdit.reset();
  originHint.textContent = '';
  hydrateProjectList();

  if (entry) {
    formEdit.project.value = entry.project || '';
    formEdit.origin.value = entry.origin || '';
    formEdit.username.value = entry.username || '';
    formEdit.password.value = entry.password || '';
    formEdit.remark.value = entry.remark || '';
    originHint.textContent = entry.origin ? '当前存储为 ' + entry.origin : '未填写地址';
  }

  dlgEdit.showModal();
  projectInput.focus();
  projectInput.select();
}

originInput.addEventListener('input', () => {
  const value = originInput.value.trim();
  originHint.textContent = value ? '将保存为 ' + normalizeOrigin(value) : '';
});

document.getElementById('btnGen').addEventListener('click', () => {
  pwdInput.value = generatePassword(20);
  pwdInput.focus();
});

formEdit.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  if (busy) return; // 防重提交第一道闸

  const data = Object.fromEntries(new FormData(formEdit).entries());

  if (!data.project || !data.project.trim()) {
    toast('项目名必填', true);
    projectInput.focus();
    return;
  }
  if (!data.password) {
    toast('密码不能为空', true);
    pwdInput.focus();
    return;
  }

  busy = true;
  btnSave.disabled = true;
  btnSave.textContent = '保存中…';

  try {
    const payload = Object.assign({}, data, { id: editingId });
    const exists = entries.some((e) => e.id === editingId);
    const next = exists
      ? entries.map((e) =>
          e.id === editingId ? makeEntry(Object.assign({}, e, payload)) : e
        )
      : [makeEntry(payload)].concat(entries);

    const ok = await commit(next);
    if (ok) {
      toast(exists ? '已保存' : '已新增');
      dlgEdit.close();
    }
  } finally {
    busy = false;
    btnSave.disabled = false;
    btnSave.textContent = '保存';
  }
});

document.getElementById('btnNew').addEventListener('click', () => {
  if (busy) return;
  openEdit(null);
});

/* ---------- 确认弹窗 ---------- */

function askConfirm(text, onOk) {
  document.getElementById('dlgConfirmText').textContent = text;
  confirmAction = onOk;
  dlgConfirm.showModal();
}

document.getElementById('btnConfirmGo').addEventListener('click', async () => {
  const action = confirmAction;
  confirmAction = null;
  dlgConfirm.close();
  if (action) await action();
});

document.querySelectorAll('[data-close]').forEach((btn) => {
  btn.addEventListener('click', () => btn.closest('dialog').close());
});

/* ---------- 启动 ---------- */

(async function boot() {
  if (!store.isSupported()) {
    filebarEl.className = 'filebar warn';
    filebarEl.innerHTML =
      '<div class="fb-text"><strong>当前浏览器不支持 File System Access API</strong>无法保存为本地文件，请使用 Chrome / Edge 86 以上版本。</div>';
    listEl.innerHTML = '<div class="empty">无法读写数据文件</div>';
    return;
  }

  fileState = await store.init();
  if (fileState === 'ok') {
    const snap = store.getSnapshot();
    entries = snap.entries;
    prefs = snap.prefs;
  }
  render();

  if (location.hash === '#new') {
    history.replaceState(null, '', location.pathname);
    openEdit(null);
  }
})();
