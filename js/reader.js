// ── reader.js — Core reader: open book, rendition, navigation, layout, progress ──

let curBook = null;
let curRend = null;
let curId   = null;
let curCFI  = null;
let layout  = 'single';   // 'single' | 'double'
let saveT   = null;

// ── Open a book by ID ──────────────────────────────────────────────
async function openBook(id) {
  const bdata = await dbGet('books', id);
  if (!bdata) return;

  curId  = id;
  curCFI = null;
  showView('reader');

  document.getElementById('r-title').textContent         = bdata.title || '';
  document.getElementById('loading').style.display       = 'flex';
  document.getElementById('bm-star').textContent         = '☆';
  document.getElementById('bm-star').classList.remove('on');

  // Tear down previous
  if (curRend) { try { curRend.destroy(); } catch (_) {} curRend = null; }
  if (curBook)  { try { curBook.destroy();  } catch (_) {} curBook = null;  }
  document.getElementById('toc-list').innerHTML    = '';
  document.getElementById('epub-viewer').innerHTML = '';

  try {
    curBook = ePub(bdata.data.buffer.slice(0));
    await curBook.ready;

    buildRend();

    const toc = curBook.navigation && curBook.navigation.toc;
    if (toc) buildTOC(toc);

    const pos = await dbGet('positions', id);
    if (pos && pos.cfi) await curRend.display(pos.cfi);
    else                 await curRend.display();

    document.getElementById('loading').style.display = 'none';

    curRend.on('relocated', loc => { updateFooter(loc); schedSave(loc); applyTheme(); });
    curRend.on('keyup',     e   => {
      if (e.key === 'ArrowLeft')  prevPage();
      if (e.key === 'ArrowRight') nextPage();
    });

    renderBmList();
  } catch (e) {
    console.error(e);
    document.getElementById('loading').style.display = 'none';
    toast('Failed to open book');
  }
}

// ── Build / rebuild the epub.js rendition ─────────────────────────
function buildRend() {
  const stage  = document.getElementById('epub-stage');
  const viewer = document.getElementById('epub-viewer');
  viewer.innerHTML = '';

  const sw = stage.clientWidth  || window.innerWidth  - 40;
  const sh = stage.clientHeight || window.innerHeight - 130;
  const vh = Math.max(300, sh - 8);

  // Single: one reading column capped at 720px
  // Double: two side-by-side columns (2 × singleW, capped to available width)
  const singleW = Math.min(sw - 100, 720);
  const vw      = layout === 'double'
    ? Math.min(singleW * 2, sw - 100)
    : singleW;

  viewer.style.width  = vw + 'px';
  viewer.style.height = vh + 'px';

  curRend = curBook.renderTo('epub-viewer', {
    width:          vw,
    height:         vh,
    spread:         layout === 'double' ? 'always' : 'none',
    minSpreadWidth: layout === 'double' ? Math.floor(vw / 2) - 1 : 99999,
    flow:           'paginated'
  });

  applyTheme();
}

// ── Navigation ────────────────────────────────────────────────────
function prevPage() { curRend && curRend.prev(); }
function nextPage() { curRend && curRend.next(); }

document.addEventListener('keyup', e => {
  if (!document.getElementById('view-reader').classList.contains('on')) return;
  if (['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;
  if (e.key === 'ArrowLeft')  prevPage();
  if (e.key === 'ArrowRight') nextPage();
});

// ── Footer / progress bar ─────────────────────────────────────────
function updateFooter(loc) {
  if (!loc) return;
  curCFI = loc.start.cfi;
  const pct = Math.round((loc.start.percentage || 0) * 100);
  document.getElementById('prog-fill').style.width = pct + '%';
  document.getElementById('prog-pct').textContent  = pct + '%';
  checkBmStar();
  updateTOCActive(loc);
}

function seekClick(e) {
  if (!curBook || !curRend) return;
  const bar  = document.getElementById('prog-wrap');
  const rect = bar.getBoundingClientRect();
  const pct  = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  const items = curBook.spine.items;
  if (!items || !items.length) return;
  const item = items[Math.min(Math.floor(pct * items.length), items.length - 1)];
  if (item && item.href) curRend.display(item.href);
}

function schedSave(loc) {
  clearTimeout(saveT);
  saveT = setTimeout(async () => {
    if (!curId || !loc) return;
    const cfi = loc.start.cfi;
    const pct = loc.start.percentage || 0;
    await dbPut('positions', { bookId: curId, cfi, percentage: pct });
    const bk = await dbGet('books', curId);
    if (bk) { bk.progress = pct; await dbPut('books', bk); }
  }, 1500);
}

// ── Layout toggle (single / double page) ─────────────────────────
async function toggleLayout() {
  layout = layout === 'single' ? 'double' : 'single';

  document.getElementById('layout-btn').textContent = layout === 'single' ? 'Single page' : 'Double page';
  document.getElementById('epub-stage').classList.toggle('double', layout === 'double');

  const tbBtn = document.getElementById('layout-tb-btn');
  if (tbBtn) {
    tbBtn.innerHTML = layout === 'double' ? '&#9633;&#9633;' : '&#9633; &#9633;';
    tbBtn.title     = layout === 'double' ? 'Switch to single page' : 'Switch to double page';
    tbBtn.classList.toggle('on', layout === 'double');
  }

  if (!curBook || !curRend) return;

  let cfi = null;
  try { const l = curRend.currentLocation(); if (l && l.start) cfi = l.start.cfi; } catch (_) {}

  try { curRend.destroy(); } catch (_) {}
  curRend = null;

  buildRend();

  if (cfi) await curRend.display(cfi);
  else      await curRend.display();

  curRend.on('relocated', loc => { updateFooter(loc); schedSave(loc); applyTheme(); });
  curRend.on('keyup',     e   => {
    if (e.key === 'ArrowLeft')  prevPage();
    if (e.key === 'ArrowRight') nextPage();
  });

  toast(layout === 'double' ? 'Double page view' : 'Single page view');
}

// ── View switching ────────────────────────────────────────────────
function showView(v) {
  document.getElementById('view-library').classList.toggle('on', v === 'library');
  document.getElementById('view-reader').classList.toggle('on',  v === 'reader');
  const inReader = v === 'reader';
  // topbar buttons (toc/bm/back/layout) are hidden — reader toolbar handles them
  ['toc-btn', 'bm-btn', 'back-btn', 'layout-btn'].forEach(id =>
    document.getElementById(id).style.display = 'none');
  document.getElementById('add-btn').style.display = inReader ? 'none' : '';
}

function goLibrary() {
  showView('library');
  loadLibrary();
  if (curRend) { try { curRend.destroy(); } catch (_) {} curRend = null; }
}
