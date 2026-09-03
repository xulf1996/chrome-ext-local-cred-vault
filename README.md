# Local Cred Vault

A Chrome extension that manages local-dev account passwords by the dimensions of **login origin + project**.
Solves the pain point of Chrome's built-in password manager only being able to store one credential per origin (e.g. `localhost:80`).

## Features

- **Project-first organization**: project name is **required**, login origin is **optional**; the list is grouped by project by default.
- **Reusable project names**: pick an existing project from the dropdown, or type a brand-new one.
- **One-click copy**: copy password or username; the clipboard is auto-cleared 30 seconds later.
- **Local JSON file storage**: you choose a local `.json` file as the data file; the extension reads and writes it. Drop it into Git, copy it across machines, or open it in any text editor.
- **Strong password generator**: 20 characters, mixing upper / lower / digits / symbols.
- **Zero page permissions**: no content script injected, nothing read from the pages you browse.
- **Duplicate-submission protection**: every write path (add / delete / change grouping) has four layers of defense (see below).
- **Portable preview**: `preview/index.html` opens in a browser by double-click to see the UI.

## How data is stored

Data lives in a **single local JSON file you pick** (typical location: `cred-vault.json`).
The extension declares only one permission: `clipboardWrite`. The file handle is kept in the browser's IndexedDB.
**It does not read pages you browse, and does not write to `chrome.storage`.**

- You choose the file path — anywhere you want (inside a project, in a cloud-sync folder, in a Git repo, etc.).
- Writes are atomic: write to a temp file, then replace. A failed mid-write will not corrupt the original file.
- After a browser restart, the first time you open the extension you'll be prompted to re-authorize the file (standard File System Access API behavior).
- To switch data files: in the management page click "Switch file" or "Save copy".

**Credentials are stored in plaintext** (by your explicit choice — "I'm the only one using it locally").
Any program on your machine that can read the file can see the contents. Do not use this for bank, primary email, or other high-value passwords.
To migrate or back up, use "Save copy".

## Duplicate-submission protection (four layers)

| Layer | Mechanism | Where it lives |
|---|---|---|
| 1 | UI button disabled while `busy` | `src/options.js` `busy` flag + `btnSave.disabled` |
| 2 | Single-flight write queue: concurrent saves are coalesced, never interleaved | `src/js/store.js` `writing` / `pending` / `drain` |
| 3 | Atomic commit: write to a temp file, then replace | `src/js/store.js` `writeTo` |
| 4 | Stable entry IDs: pre-generate the id on add, making double-submit idempotent | `src/js/storage.js` `newId()` + `options.js` `editingId` |

Any single layer can block a duplicate click on its own, but each has an edge case where it can fail in isolation (e.g. button-disable fails on a slow network).
With all four stacked, **even if the first two layers fail, you will not get a duplicate entry**.

## Installation

1. Open Chrome and go to `chrome://extensions/`.
2. Turn on **Developer mode** in the top-right corner.
3. Click **Load unpacked**.
4. Select the root of this repository (the directory containing `manifest.json`).

After updating the code, go back to `chrome://extensions/` and click the refresh icon on the extension card.

## Usage

- **Click the toolbar icon** → popup opens: search / one-click copy
  - Default is **grouped by project**; use the top-right dropdown to switch to "by origin" or "no grouping".
  - Press Enter in the search box → copies the password of the first match.
  - Passwords are masked by default; click the masked text to toggle.
- **"Add" or "Manage" in the popup's bottom-right** → opens the full management page:
  - Add / edit / delete entries
  - "Generate" button produces a strong password
  - "Save copy" writes a backup to another JSON file
  - "Import from file" merges by ID (same ID is overwritten, others are appended)
  - "Switch file" changes the active data file

## File structure

```
manifest.json                # Manifest V3 config (permissions: clipboardWrite only)
src/
  popup.html / popup.js      # Toolbar popup
  options.html / options.js  # Full management page
  style.css                  # Shared styles (dark theme)
  js/
    storage.js               # Data model, normalization, search, grouping, merge, file format
    store.js                 # File System Access read/write + single-flight write queue
    idb.js                   # IndexedDB (stores the file handle)
    ui.js                    # HTML escaping, password masking, clipboard, toast, password generator
  icons/                     # 16 / 48 / 128 PNG icons
preview/
  index.html                 # Static UI preview (no functionality; open in browser directly)
tools/
  make_icons.py              # Regenerate icons
  selftest.mjs               # Core-logic self-tests (node tools/selftest.mjs)
```

## Self-tests

```bash
node tools/selftest.mjs
```

Coverage: origin normalization, grouping and search, project-required / origin-optional, file format serialization round-trip, invalid JSON rejection, merge strategy.

## Localization

- `README.md` — English (this file)
- `README_zh.md` — Simplified Chinese
