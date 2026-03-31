// ── theme.js — Reader theming: light / dark / sepia, font, line-height ──
// Injects a <style> tag directly into the epub iframe on every page turn
// so that epub's own CSS is fully overridden without breaking epub.js
// internal column layout (which breaks when we use * { } selectors).

let curTheme  = '';      // '' | 'dk' | 'sp'
let fontSize  = 100;     // percent
let dispOpen  = false;

// ── Public API ────────────────────────────────────────────────────

function setTheme(t, el) {
  curTheme = t;
  document.querySelectorAll('.tsw').forEach(s => s.classList.remove('on'));
  if (el) el.classList.add('on');
  document.getElementById('reader-main').className = t; // '' | 'dk' | 'sp'
  applyTheme();
}

function adjFont(d) {
  fontSize = Math.max(70, Math.min(200, fontSize + d));
  document.getElementById('fs-num').textContent = fontSize + '%';
  applyTheme();
}

function toggleDisp() {
  dispOpen = !dispOpen;
  document.getElementById('disp-panel').classList.toggle('on', dispOpen);
}

// Close display panel when clicking outside
document.addEventListener('click', e => {
  if (dispOpen &&
      !e.target.closest('#disp-panel') &&
      !e.target.closest('#disp-btn')) {
    dispOpen = false;
    document.getElementById('disp-panel').classList.remove('on');
  }
});

// ── Core injection ─────────────────────────────────────────────────

function applyTheme() {
  if (!curRend) return;

  const bgs    = { '': '#f6f1e9', dk: '#18140f', sp: '#f0e6cf' };
  const fgs    = { '': '#28200f', dk: '#cfc9bc', sp: '#3b2c14' };
  const links  = { '': '#6b3a10', dk: '#c9aa70', sp: '#7a4218' };
  const bords  = { '': 'rgba(0,0,0,.12)', dk: 'rgba(255,255,255,.08)', sp: 'rgba(80,50,10,.15)' };

  const bg   = bgs[curTheme];
  const fg   = fgs[curTheme];
  const link = links[curTheme];
  const bord = bords[curTheme];
  const font = document.getElementById('font-sel').value;
  const lh   = document.getElementById('lh-sl').value;

  const isDark  = curTheme === 'dk';
  const isSepia = curTheme === 'sp';

  // mix-blend-mode: multiply makes white px transparent on light bg;
  // invert + screen does the same on dark bg.
  const imgBlend  = isDark ? 'screen'   : 'multiply';
  const imgFilter = isDark  ? 'invert(1) brightness(0.75) contrast(0.9)'
                  : isSepia ? 'sepia(0.35) contrast(0.9)'
                  :           'contrast(0.88) brightness(1.02)';

  // We target specific text elements rather than * to avoid stomping
  // epub.js's internal column layout CSS.
  const css = `
    html { background: ${bg} !important; }
    body {
      background:   ${bg}   !important;
      color:        ${fg}   !important;
      font-family:  ${font} !important;
      font-size:    ${fontSize}% !important;
      line-height:  ${lh}   !important;
      padding:      28px 44px !important;
      margin:       0 !important;
    }
    p, li, td, th, dt, dd, blockquote, figcaption,
    h1, h2, h3, h4, h5, h6,
    span, em, strong, i, b, small, sub, sup,
    div, section, article, aside, header, footer, nav, main {
      color: ${fg} !important;
      background-color: transparent !important;
      background-image: none !important;
    }
    p {
      font-family:   ${font} !important;
      font-size:     ${fontSize}% !important;
      line-height:   ${lh}   !important;
      margin-bottom: 1em     !important;
      text-align:    justify !important;
    }
    h1, h2, h3, h4, h5, h6 {
      font-family:   ${font} !important;
      color:         ${fg}   !important;
      margin-bottom: .5em    !important;
      line-height:   1.3     !important;
    }
    a, a * { color: ${link} !important; }
    hr      { border-color: ${bord} !important; }
    table, th, td { border-color: ${bord} !important; }
    img {
      mix-blend-mode: ${imgBlend}  !important;
      filter:         ${imgFilter};
      max-width:      100%         !important;
      height:         auto         !important;
    }
    svg {
      mix-blend-mode: ${imgBlend}  !important;
      filter:         ${imgFilter};
    }
    *::before, *::after {
      color:        ${bord} !important;
      border-color: ${bord} !important;
    }
  `;

  // Register a minimal shelf theme so epub.js doesn't reject the call,
  // then inject full CSS directly into the iframe.
  curRend.themes.register('shelf', { body: {} });
  curRend.themes.select('shelf');

  setTimeout(() => {
    try {
      const iframe = document.querySelector('#epub-viewer iframe');
      if (!iframe || !iframe.contentDocument) return;
      const doc = iframe.contentDocument;
      let el = doc.getElementById('__shelf_theme__');
      if (!el) {
        el = doc.createElement('style');
        el.id = '__shelf_theme__';
        (doc.head || doc.body).appendChild(el);
      }
      el.textContent = css;
    } catch (_) { /* cross-origin guard */ }
  }, 60);
}
