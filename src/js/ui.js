export function escapeHtml(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[c]);
}

export function maskPassword(value) {
  const len = String(value == null ? '' : value).length;
  return len ? '•'.repeat(Math.min(len, 12)) : '';
}

export function formatTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function generatePassword(length = 20) {
  const lower = 'abcdefghijkmnopqrstuvwxyz';
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const digits = '23456789';
  const symbols = '!@#$%^&*-_=+';
  const pools = [lower, upper, digits, symbols];

  const pick = (pool) => pool[crypto.getRandomValues(new Uint32Array(1))[0] % pool.length];
  const chars = pools.map(pick);

  const all = pools.join('');
  while (chars.length < length) chars.push(pick(all));

  // Fisher-Yates shuffle so the guaranteed characters are not in fixed positions
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

export async function writeClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '-1000px';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    ta.remove();
    return ok;
  }
}

const CLEAR_DELAY_MS = 30000;
let clearTimer = null;

/** Copy text, then wipe the clipboard after 30s. Timer lives as long as the page stays open. */
export async function copyAndAutoClear(text) {
  const ok = await writeClipboard(text);
  if (!ok) return false;

  if (clearTimer) clearTimeout(clearTimer);
  clearTimer = setTimeout(() => {
    clearTimer = null;
    writeClipboard('').catch(() => {});
  }, CLEAR_DELAY_MS);

  return true;
}

export function toast(message, isError = false) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = message;
  el.classList.toggle('is-error', !!isError);
  el.hidden = false;
  clearTimeout(el._timer);
  el._timer = setTimeout(() => {
    el.hidden = true;
  }, 2200);
}

export function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
