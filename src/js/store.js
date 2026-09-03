/**
 * File-backed persistence.
 *
 * The user's JSON file is the single source of truth. The FileSystemFileHandle
 * is kept in IndexedDB (see idb.js for why it cannot go in chrome.storage).
 *
 * 防重提交 (duplicate-submission safety) is handled at four levels:
 *   1. single-flight write queue — concurrent saves are coalesced, never interleaved
 *   2. atomic commit         — createWritable() writes to a temp file, close() swaps it in
 *   3. stable entry ids      — the same submit twice cannot create two entries
 *   4. caller-side guards    — submit buttons are disabled while an op is in flight
 */

import { saveHandle, loadHandle, clearHandle } from './idb.js';
import { serializeVault, parseVault } from './storage.js';

const PICKER_TYPES = [
  { description: 'JSON 数据文件', accept: { 'application/json': ['.json'] } }
];

let handle = null;
let snapshot = { entries: [], prefs: { groupBy: 'project' } };

export function isSupported() {
  return typeof window !== 'undefined' && typeof window.showSaveFilePicker === 'function';
}

export function fileName() {
  return handle ? handle.name : null;
}

export function getSnapshot() {
  return snapshot;
}

/* ---------- lifecycle ---------- */

/** @returns {'no-file'|'need-permission'|'ok'} */
export async function init() {
  handle = await loadHandle();
  if (!handle) return 'no-file';
  const granted = await handle.queryPermission({ mode: 'readwrite' });
  if (granted !== 'granted') return 'need-permission';
  await reload();
  return 'ok';
}

/** Must be called from a user gesture — requestPermission requires transient activation. */
export async function reauthorize() {
  if (!handle) return false;
  const granted = await handle.requestPermission({ mode: 'readwrite' });
  if (granted !== 'granted') return false;
  await reload();
  return true;
}

export async function reload() {
  const file = await handle.getFile();
  snapshot = parseVault(await file.text());
  return snapshot;
}

/** Create a brand new data file and switch to it. */
export async function createFile() {
  handle = await window.showSaveFilePicker({
    id: 'lcv-data',
    suggestedName: 'cred-vault.json',
    types: PICKER_TYPES
  });
  await saveHandle(handle);
  await writeTo(handle, snapshot);
  return handle.name;
}

/** Switch to an existing data file. */
export async function switchFile() {
  const [picked] = await window.showOpenFilePicker({ id: 'lcv-data', types: PICKER_TYPES });
  handle = picked;
  await saveHandle(handle);
  await reload();
  return handle.name;
}

export async function forgetFile() {
  handle = null;
  snapshot = { entries: [], prefs: { groupBy: 'project' } };
  await clearHandle();
}

/* ---------- writing ---------- */

function serialize(data) {
  return JSON.stringify(serializeVault(data.entries, data.prefs), null, 2);
}

async function writeTo(target, data) {
  const writable = await target.createWritable({ keepExistingData: false });
  try {
    await writable.write(serialize(data));
    // Nothing hits the real file until close() — it swaps in the temp file atomically.
    await writable.close();
  } catch (err) {
    await writable.abort().catch(() => {});
    throw err;
  }
}

async function ensureWritable() {
  const opts = { mode: 'readwrite' };
  if ((await handle.queryPermission(opts)) === 'granted') return;
  const granted = await handle.requestPermission(opts);
  if (granted !== 'granted') {
    const err = new Error('没有该文件的写入权限，请重新授权');
    err.code = 'NO_PERMISSION';
    throw err;
  }
}

let writing = false;
let pending = false;
let flushPromise = null;

async function drain() {
  writing = true;
  try {
    while (pending) {
      // Clear before awaiting so requests that arrive mid-write get queued
      // instead of being swallowed.
      pending = false;
      await ensureWritable();
      await writeTo(handle, snapshot);
    }
  } finally {
    writing = false;
    flushPromise = null;
  }
}

/**
 * Persist `next` (defaults to the current snapshot).
 * Coalesces rapid calls: at most one write is in flight, plus one final catch-up.
 * @returns {Promise<void>} resolves once the data is on disk
 */
export function save(next) {
  if (next) snapshot = next;
  pending = true;
  if (writing) return flushPromise;
  flushPromise = drain();
  return flushPromise;
}

export function isDirty() {
  return pending || writing;
}

/* ---------- backup / import (separate files, never touch the active one) ---------- */

export async function saveCopy() {
  const target = await window.showSaveFilePicker({
    id: 'lcv-backup',
    suggestedName: 'cred-vault-backup.json',
    types: PICKER_TYPES
  });
  await writeTo(target, snapshot);
  return target.name;
}

export async function readFileForImport() {
  const [picked] = await window.showOpenFilePicker({ id: 'lcv-import', types: PICKER_TYPES });
  const file = await picked.getFile();
  return parseVault(await file.text());
}
