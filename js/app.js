// ── app.js — Entry point: toast helper, init ──

// ── TOAST ────────────────────────────────────────────────────────
let toastTimer;
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('on'), 2800);
}

// ── INIT ─────────────────────────────────────────────────────────
openDB()
  .then(() => {
    loadLibrary();
    initDropZone();
  })
  .catch(() => toast('Storage unavailable'));
