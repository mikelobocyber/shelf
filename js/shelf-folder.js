// ── shelf-folder.js ──
// Manages an optional "library folder" on disk.
//
// ┌────────────────────────────────────────────────────────────────┐
// │  THE PROBLEM WITH file:// URLs                                 │
// │                                                                │
// │  When you open index.html directly by double-clicking it,     │
// │  Chrome loads it as a file:// URL. Chrome intentionally        │
// │  blocks showDirectoryPicker() on file:// for security reasons. │
// │                                                                │
// │  So the folder feature works in THREE ways:                    │
// │                                                                │
// │  1. ELECTRON (.exe / .app)                                     │
// │     Full native file system access via Node.js IPC.           │
// │     Works always. This is the recommended desktop experience.  │
// │                                                                │
// │  2. SERVED BROWSER (http:// or https://)                      │
// │     Chrome/Edge 86+ support showDirectoryPicker.               │
// │     Run: npx serve . in the shelf/ folder, then open          │
// │     http://localhost:3000 — the "Set Folder" button appears.   │
// │                                                                │
// │  3. file:// fallback — MANUAL FOLDER MODE                     │
// │     The bar is always shown. User can drag a whole folder      │
// │     of EPUBs/PDFs onto the drop zone to batch-import them.    │
// │     The app remembers which files came from where via          │
// │     IndexedDB, but cannot write back to disk automatically.    │
// └────────────────────────────────────────────────────────────────┘

// ── Environment + capability detection ───────────────────────────

const IS_ELECTRON = !!(window.electronAPI && window.electronAPI.isElectron);

// showDirectoryPicker is blocked on file:// even if window has the property.
// We detect the actual protocol to show an honest message.
const IS_FILE_PROTOCOL = (location.protocol === 'file:');

// True only when we can actually use the picker
const CAN_PICK_FOLDER  = IS_ELECTRON
  || (!IS_FILE_PROTOCOL && 'showDirectoryPicker' in window);

// The bar should always show — even on file:// we show a helpful message
const SHOW_FOLDER_BAR  = true;

// ── Module state ──────────────────────────────────────────────────

let _dirHandle  = null;   // FileSystemDirectoryHandle (browser http mode)
let _folderPath = null;   // Absolute path string (Electron mode)
let _folderName = null;   // Short display name for the UI


// ═══════════════════════════════════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════════════════════════════════

async function initFolder() {
  // Always render the bar first — even on unsupported platforms we show info
  updateFolderUI('none');

  if (IS_ELECTRON) {
    await _electronInit();
  } else if (!IS_FILE_PROTOCOL && 'showDirectoryPicker' in window) {
    await _browserInit();
  }
  // On file:// the bar stays in 'none' state with explanatory text + drag hint
}

async function pickFolder() {
  if (IS_ELECTRON) {
    await _electronPick();
    return;
  }
  if (IS_FILE_PROTOCOL) {
    toast('Open Shelf via a local server to use folder sync. See the folder bar for instructions.');
    return;
  }
  if (!('showDirectoryPicker' in window)) {
    toast('Folder access requires Chrome or Edge 86+.');
    return;
  }
  await _browserPick();
}

async function disconnectFolder() {
  _dirHandle  = null;
  _folderPath = null;
  _folderName = null;
  await _clearSaved();
  updateFolderUI('none');
  toast('Library folder disconnected');
}

async function reconnectFolder() {
  if (!_dirHandle) _dirHandle = await _loadHandle();
  if (!_dirHandle) { await _browserPick(); return; }
  const ok = await _requestPermission(_dirHandle);
  if (ok) {
    _folderName = _dirHandle.name;
    updateFolderUI('connected');
    toast('Reconnected — scanning…');
    await scanFolderForNewBooks();
  } else {
    toast('Permission denied. Try setting the folder again.');
    _dirHandle = null;
    updateFolderUI('none');
  }
}

async function writeToFolder(file, bookId) {
  if (IS_ELECTRON)    await _electronWrite(file, bookId);
  else if (_dirHandle) await _browserWrite(file, bookId);
  // file:// mode: no write-back, books live in IndexedDB only
}

async function deleteFromFolder(bookId) {
  if (IS_ELECTRON)    await _electronDelete(bookId);
  else if (_dirHandle) await _browserDelete(bookId);
}

async function scanFolderForNewBooks() {
  if (IS_ELECTRON)    await _electronScan();
  else if (_dirHandle) await _browserScan();
  else toast('No folder connected. Set a library folder first.');
}


// ═══════════════════════════════════════════════════════════════════
// ELECTRON  (window.electronAPI from preload.js)
// ═══════════════════════════════════════════════════════════════════

async function _electronInit() {
  const rec = await dbGet('settings', 'folderPath');
  if (!rec || !rec.value) { updateFolderUI('none'); return; }
  _folderPath = rec.value;
  _folderName = _folderPath.split(/[/\\]/).filter(Boolean).pop() || _folderPath;
  updateFolderUI('connected');
  await _electronScan();
}

async function _electronPick() {
  const p = await window.electronAPI.pickFolder();
  if (!p) return;
  _folderPath = p;
  _folderName = p.split(/[/\\]/).filter(Boolean).pop() || p;
  await dbPut('settings', { key: 'folderPath', value: p });
  updateFolderUI('connected');
  toast('Folder set: ' + _folderName + ' — scanning…');
  await _electronScan();
}

async function _electronWrite(file, bookId) {
  if (!_folderPath) return;
  try {
    const name = _safeName(bookId, file.name);
    const path = await window.electronAPI.pathJoin(_folderPath, name);
    const ok   = await window.electronAPI.writeFile(path, new Uint8Array(await file.arrayBuffer()));
    if (ok) {
      const bk = await dbGet('books', bookId);
      if (bk) { bk.folderFile = name; await dbPut('books', bk); }
    }
  } catch (e) { console.warn('[folder] electron write:', e); }
}

async function _electronDelete(bookId) {
  if (!_folderPath) return;
  try {
    const bk = await dbGet('books', bookId);
    if (!bk || !bk.folderFile) return;
    await window.electronAPI.deleteFile(
      await window.electronAPI.pathJoin(_folderPath, bk.folderFile)
    );
  } catch (e) { console.warn('[folder] electron delete:', e); }
}

async function _electronScan() {
  if (!_folderPath) return;
  updateFolderUI('scanning');
  let entries = [];
  try { entries = await window.electronAPI.readDir(_folderPath); }
  catch (e) {
    updateFolderUI('connected');
    toast('Could not read folder — does it still exist?');
    return;
  }
  const n = await _importFiles(entries,
    name => window.electronAPI.pathJoin(_folderPath, name)
      .then(p => window.electronAPI.readFile(p))
      .then(arr => arr ? new Uint8Array(arr) : null)
  );
  updateFolderUI('connected');
  if (n > 0) { await loadLibrary(); toast('Found ' + n + ' new book' + (n > 1 ? 's' : '') + ' in ' + _folderName); }
  else toast('Folder scanned — no new books');
}


// ═══════════════════════════════════════════════════════════════════
// BROWSER  (File System Access API, http:// / https:// only)
// ═══════════════════════════════════════════════════════════════════

async function _browserInit() {
  _dirHandle = await _loadHandle();
  if (!_dirHandle) { updateFolderUI('none'); return; }
  const ok = await _checkPermission(_dirHandle);
  if (!ok) { _folderName = _dirHandle.name; updateFolderUI('reconnect'); return; }
  _folderName = _dirHandle.name;
  updateFolderUI('connected');
  await _browserScan();
}

async function _browserPick() {
  try {
    const h = await window.showDirectoryPicker({ mode: 'readwrite' });
    _dirHandle  = h;
    _folderName = h.name;
    await _saveHandle(h);
    updateFolderUI('connected');
    toast('Folder set: ' + _folderName + ' — scanning…');
    await _browserScan();
  } catch (e) {
    if (e.name !== 'AbortError') { console.error(e); toast('Could not open folder'); }
  }
}

async function _browserWrite(file, bookId) {
  try {
    await _requestPermission(_dirHandle);
    const name     = _safeName(bookId, file.name);
    const fh       = await _dirHandle.getFileHandle(name, { create: true });
    const writable = await fh.createWritable();
    await writable.write(await file.arrayBuffer());
    await writable.close();
    const bk = await dbGet('books', bookId);
    if (bk) { bk.folderFile = name; await dbPut('books', bk); }
  } catch (e) { console.warn('[folder] browser write:', e); }
}

async function _browserDelete(bookId) {
  try {
    const bk = await dbGet('books', bookId);
    if (!bk || !bk.folderFile) return;
    await _requestPermission(_dirHandle);
    await _dirHandle.removeEntry(bk.folderFile);
  } catch (e) { console.warn('[folder] browser delete:', e); }
}

async function _browserScan() {
  if (!_dirHandle) return;
  updateFolderUI('scanning');
  try { await _requestPermission(_dirHandle); }
  catch (_) { updateFolderUI('reconnect'); return; }

  const entries = [];
  try {
    for await (const [name, h] of _dirHandle.entries())
      if (h.kind === 'file') entries.push({ name, isFile: true });
  } catch (e) { updateFolderUI('connected'); return; }

  const n = await _importFiles(entries, async name => {
    const fh = await _dirHandle.getFileHandle(name);
    return new Uint8Array(await (await fh.getFile()).arrayBuffer());
  });

  updateFolderUI('connected');
  if (n > 0) { await loadLibrary(); toast('Found ' + n + ' new book' + (n > 1 ? 's' : '') + ' in ' + _folderName); }
  else toast('Folder scanned — no new books');
}


// ═══════════════════════════════════════════════════════════════════
// SHARED IMPORT LOGIC
// ═══════════════════════════════════════════════════════════════════

async function _importFiles(entries, readFn) {
  const existing   = await dbAll('books');
  const knownFiles = new Set(existing.map(b => b.folderFile).filter(Boolean));
  let   count      = 0;

  for (const entry of entries) {
    if (!entry.isFile) continue;
    const low = entry.name.toLowerCase();
    if (!low.endsWith('.epub') && !low.endsWith('.pdf')) continue;
    if (knownFiles.has(entry.name)) continue;

    try {
      const uint8 = await readFn(entry.name);
      if (!uint8) continue;
      const id   = genId();
      const file = new File([new Blob([uint8])], entry.name);
      if (low.endsWith('.epub')) await ingestEpub(file, id);
      else                        await ingestPdf(file, id);
      const bk = await dbGet('books', id);
      if (bk) { bk.folderFile = entry.name; await dbPut('books', bk); }
      count++;
    } catch (e) { console.warn('[folder] import error:', entry.name, e); }
  }
  return count;
}


// ═══════════════════════════════════════════════════════════════════
// UI
// ═══════════════════════════════════════════════════════════════════

function updateFolderUI(state) {
  const bar      = document.getElementById('folder-bar');
  const icon     = document.getElementById('folder-icon');
  const label    = document.getElementById('folder-label');
  const pickBtn  = document.getElementById('folder-pick-btn');
  const scanBtn  = document.getElementById('folder-scan-btn');
  const discBtn  = document.getElementById('folder-disc-btn');
  const reconBtn = document.getElementById('folder-recon-btn');
  const hintBox  = document.getElementById('folder-hint');

  // Always show the bar
  bar.style.display = '';

  // Hide everything first, then show what's needed for this state
  [pickBtn, scanBtn, discBtn, reconBtn].forEach(b => { if (b) b.style.display = 'none'; });
  if (hintBox) hintBox.style.display = 'none';

  if (state === 'connected') {
    icon.textContent  = '📁';
    label.textContent = _folderName ? '📂 ' + _folderName : 'Library folder connected';
    label.className   = 'folder-label connected';
    if (scanBtn) scanBtn.style.display = '';
    if (discBtn) discBtn.style.display = '';

  } else if (state === 'reconnect') {
    icon.textContent  = '⚠️';
    label.textContent = (_folderName || 'Folder') + ' — permission expired';
    label.className   = 'folder-label warn';
    if (reconBtn) reconBtn.style.display = '';
    if (discBtn)  discBtn.style.display  = '';

  } else if (state === 'scanning') {
    icon.textContent  = '🔄';
    label.textContent = 'Scanning ' + (_folderName || 'folder') + '…';
    label.className   = 'folder-label connected';

  } else {
    // 'none' state — varies by platform
    if (IS_ELECTRON) {
      icon.textContent  = '📂';
      label.textContent = 'No library folder set';
      label.className   = 'folder-label';
      if (pickBtn) pickBtn.style.display = '';

    } else if (IS_FILE_PROTOCOL) {
      // file:// — picker not available, explain why and show drag hint
      icon.textContent  = 'ℹ️';
      label.textContent = 'Folder sync unavailable on file:// — drag a folder of books onto the drop zone, or serve via localhost';
      label.className   = 'folder-label warn';
      if (hintBox) hintBox.style.display = '';

    } else {
      // http/https — picker available
      icon.textContent  = '📂';
      label.textContent = 'No library folder set — books stored in browser';
      label.className   = 'folder-label';
      if (pickBtn) pickBtn.style.display = '';
    }
  }
}


// ═══════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════

function _safeName(bookId, name) {
  return bookId.slice(0, 12) + '_' + name.replace(/[^a-zA-Z0-9._\-() ]/g, '_');
}

// Shows a modal explaining how to enable folder sync on file://
function _showFolderHelp() {
  const msg = [
    'FOLDER SYNC ON file:// URLS',
    '',
    'Chrome blocks folder access when opening Shelf directly as a file.',
    '',
    'To enable it, run a local server in the shelf/ folder:',
    '',
    '  Option 1 — Node.js (if installed):',
    '  > npx serve .',
    '  Then open: http://localhost:3000',
    '',
    '  Option 2 — Python (if installed):',
    '  > python3 -m http.server 8080',
    '  Then open: http://localhost:8080',
    '',
    '  Option 3 — Build the desktop app (.exe / .app):',
    '  > npm install',
    '  > npm start',
    '  See BUILD.md for full instructions.',
    '',
    'Until then, you can still drag an entire folder of EPUBs/PDFs',
    'onto the drop zone to batch-import them.',
  ].join('\n');
  alert(msg);
}

async function _checkPermission(h) {
  try { return (await h.queryPermission({ mode: 'readwrite' })) === 'granted'; }
  catch (_) { return false; }
}

async function _requestPermission(h) {
  try { return (await h.requestPermission({ mode: 'readwrite' })) === 'granted'; }
  catch (_) { return false; }
}

async function _saveHandle(h) {
  await dbPut('settings', { key: 'folderHandle', value: h });
}

async function _loadHandle() {
  try { const r = await dbGet('settings', 'folderHandle'); return r ? r.value : null; }
  catch (_) { return null; }
}

async function _clearSaved() {
  try { await dbDel('settings', 'folderHandle'); } catch (_) {}
  try { await dbDel('settings', 'folderPath');   } catch (_) {}
}
