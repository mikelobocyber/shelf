// ── app.js — Entry point: toast helper, PWA registration, Electron wiring, init ──

// ── TOAST ────────────────────────────────────────────────────────
let toastTimer;
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('on'), 2800);
}

// ── SERVICE WORKER (PWA) ─────────────────────────────────────────
// Registers the service worker so the app caches itself and works offline.
// This enables "Add to Home Screen" on iPad and "Install app" on Chrome/Edge.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .catch(err => console.warn('SW registration failed:', err));
  });
}

// ── ELECTRON MENU WIRING ─────────────────────────────────────────
// When running inside Electron, main.js sends IPC messages for menu actions.
// We listen here and call the same functions the UI buttons call.
if (window.electronAPI) {
  window.electronAPI.onMenuAction('menu-add-book', () => {
    document.getElementById('file-input').click();
  });
  window.electronAPI.onMenuAction('menu-pick-folder', () => {
    pickFolder();
  });
}

// ── INIT ─────────────────────────────────────────────────────────
openDB()
  .then(() => {
    loadLibrary();
    initDropZone();
    initFolder();
  })
  .catch(() => toast('Storage unavailable'));
