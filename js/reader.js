// ── reader.js ──
// Opens EPUB books via epub.js and PDF files via PDF.js.
// Routes to the correct viewer based on book.type.
// Handles navigation, progress tracking, layout toggle, and view switching.

// ── Shared state ──────────────────────────────────────────────────
let curBook = null;   // epub.js Book instance (null for PDFs)
let curRend = null;   // epub.js Rendition instance (null for PDFs)
let curId   = null;   // ID of the currently open book
let curCFI  = null;   // current CFI string (epub only)
let layout  = 'single';
let saveT   = null;

// PDF-specific state
let pdfDoc      = null;   // PDF.js PDFDocumentProxy
let pdfPage     = 1;      // current page number (1-indexed)
let pdfTotal    = 0;      // total pages
let pdfScale    = 1.0;    // current zoom scale
let pdfRendering= false;  // guard against concurrent renders

// ── Entry point ───────────────────────────────────────────────────

async function openBook(id) {
  const bdata = await dbGet('books', id);
  if (!bdata) return;

  curId = id;
  showView('reader');

  document.getElementById('r-title').textContent   = bdata.title || '';
  document.getElementById('loading').style.display = 'flex';
  document.getElementById('bm-star').textContent   = '☆';
  document.getElementById('bm-star').classList.remove('on');

  // Tear down any previous session
  _teardown();

  if (bdata.type === 'pdf') {
    await _openPdf(bdata);
  } else {
    await _openEpub(bdata);
  }
}

function _teardown() {
  if (curRend) { try { curRend.destroy(); } catch (_) {} curRend = null; }
  if (curBook)  { try { curBook.destroy();  } catch (_) {} curBook = null;  }
  if (pdfDoc)   { try { pdfDoc.destroy();   } catch (_) {} pdfDoc  = null;  }
  pdfPage = 1; pdfTotal = 0; pdfRendering = false;
  document.getElementById('toc-list').innerHTML    = '';
  document.getElementById('epub-viewer').innerHTML = '';
  document.getElementById('pdf-viewer').innerHTML  = '';
  document.getElementById('epub-stage').style.display = 'none';
  document.getElementById('pdf-stage').style.display  = 'none';
  curCFI = null;
}

// ── EPUB viewer ───────────────────────────────────────────────────

async function _openEpub(bdata) {
  document.getElementById('epub-stage').style.display = '';

  // Show/hide controls relevant to epub
  document.getElementById('layout-tb-btn').style.display = '';
  document.getElementById('pdf-controls').style.display  = 'none';
  document.getElementById('fs-wrap').style.display       = '';

  try {
    curBook = ePub(bdata.data.buffer.slice(0));
    await curBook.ready;

    buildRend();

    const toc = curBook.navigation && curBook.navigation.toc;
    if (toc) buildTOC(toc);

    const pos = await dbGet('positions', curId);
    if (pos && pos.cfi) await curRend.display(pos.cfi);
    else                 await curRend.display();

    document.getElementById('loading').style.display = 'none';

    // Generate CFI locations in the background so seekClick and percentage
    // tracking are accurate. This is async and doesn't block the reader opening.
    curBook.locations.generate(1024);

    curRend.on('relocated', loc => { updateFooter(loc); schedSave(loc); applyTheme(); });
    curRend.on('keyup',     e   => {
      if (e.key === 'ArrowLeft')  prevPage();
      if (e.key === 'ArrowRight') nextPage();
    });

    renderBmList();
  } catch (e) {
    console.error(e);
    document.getElementById('loading').style.display = 'none';
    toast('Failed to open EPUB');
  }
}

function buildRend() {
  const stage  = document.getElementById('epub-stage');
  const viewer = document.getElementById('epub-viewer');
  viewer.innerHTML = '';

  const sw = stage.clientWidth  || window.innerWidth  - 40;
  const sh = stage.clientHeight || window.innerHeight - 130;
  const vh = Math.max(300, sh - 8);

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

// ── PDF viewer ────────────────────────────────────────────────────

async function _openPdf(bdata) {
  document.getElementById('pdf-stage').style.display = '';

  // Show/hide controls relevant to pdf
  document.getElementById('layout-tb-btn').style.display = 'none';
  document.getElementById('pdf-controls').style.display  = 'flex'; // MUST be flex — it's a row with align-items:center
  document.getElementById('fs-wrap').style.display       = 'none';

  try {
    const pdfjsLib = window['pdfjs-dist/build/pdf'];
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

    pdfDoc   = await pdfjsLib.getDocument({ data: bdata.data.buffer.slice(0) }).promise;
    pdfTotal = pdfDoc.numPages;

    _updatePdfCounters();

    // Build a simple page-list TOC for PDFs
    _buildPdfTOC();

    // Restore position
    const pos = await dbGet('positions', curId);
    pdfPage = (pos && pos.page) ? Math.min(pos.page, pdfTotal) : 1;

    await _renderPdfPage(pdfPage);
    document.getElementById('loading').style.display = 'none';
    renderBmList();
  } catch (e) {
    console.error(e);
    document.getElementById('loading').style.display = 'none';
    toast('Failed to open PDF');
  }
}

async function _renderPdfPage(num) {
  if (!pdfDoc || pdfRendering) return;
  pdfRendering = true;
  pdfPage = Math.max(1, Math.min(num, pdfTotal));

  const stage     = document.getElementById('pdf-stage');
  const container = document.getElementById('pdf-viewer');
  container.innerHTML = '';

  const page     = await pdfDoc.getPage(pdfPage);
  const stageW   = stage.clientWidth  - 80 || 800;
  const stageH   = stage.clientHeight - 20 || 600;
  const baseVP   = page.getViewport({ scale: 1 });

  // Auto-fit: scale so the page fills the available width
  const autoScale = stageW / baseVP.width;
  const scale     = autoScale * pdfScale;
  const viewport  = page.getViewport({ scale });

  const canvas    = document.createElement('canvas');
  const ctx       = canvas.getContext('2d');
  canvas.width    = Math.floor(viewport.width);
  canvas.height   = Math.floor(viewport.height);
  canvas.style.display = 'block';
  canvas.style.margin  = '0 auto';
  canvas.style.maxWidth= '100%';
  container.appendChild(canvas);

  await page.render({ canvasContext: ctx, viewport }).promise;

  _updatePdfCounters();
  schedSavePdf();

  pdfRendering = false;
}

function _updatePdfCounters() {
  const inp = document.getElementById('pdf-page-input');
  const tot = document.getElementById('pdf-total');
  if (inp) inp.value       = pdfPage;
  if (tot) tot.textContent = '/ ' + pdfTotal;

  const pct = pdfTotal ? Math.round((pdfPage / pdfTotal) * 100) : 0;
  _setProgressBar(pct);
}

async function _buildPdfTOC() {
  const list = document.getElementById('toc-list');
  list.innerHTML = '';

  let outline = [];
  try { outline = await pdfDoc.getOutline() || []; } catch (_) {}

  if (!outline.length) {
    // Fallback: list every page
    for (let i = 1; i <= Math.min(pdfTotal, 200); i++) {
      const el = document.createElement('div');
      el.className   = 'toc-row';
      el.textContent = 'Page ' + i;
      el.onclick     = () => _renderPdfPage(i);
      list.appendChild(el);
    }
    return;
  }

  function renderOutline(items, depth) {
    items.forEach(item => {
      const el = document.createElement('div');
      el.className   = 'toc-row d' + Math.min(depth, 3);
      el.textContent = item.title || '—';
      el.onclick     = async () => {
        if (item.dest) {
          try {
            const dest    = typeof item.dest === 'string'
              ? await pdfDoc.getDestination(item.dest)
              : item.dest;
            const pageRef = dest[0];
            const pageNum = await pdfDoc.getPageIndex(pageRef) + 1;
            _renderPdfPage(pageNum);
          } catch (_) {}
        }
      };
      list.appendChild(el);
      if (item.items && item.items.length) renderOutline(item.items, depth + 1);
    });
  }
  renderOutline(outline, 1);
}

// PDF zoom
function pdfZoomIn()  { pdfScale = Math.min(pdfScale + 0.2, 4.0); _renderPdfPage(pdfPage); }
function pdfZoomOut() { pdfScale = Math.max(pdfScale - 0.2, 0.4); _renderPdfPage(pdfPage); }
function pdfZoomReset() { pdfScale = 1.0; _renderPdfPage(pdfPage); }

function pdfGoToPage(n) {
  const num = parseInt(n);
  if (!isNaN(num)) _renderPdfPage(num);
}

// ── Navigation (shared) ───────────────────────────────────────────

function prevPage() {
  if (pdfDoc) _renderPdfPage(pdfPage - 1);
  else if (curRend) curRend.prev();
}

function nextPage() {
  if (pdfDoc) _renderPdfPage(pdfPage + 1);
  else if (curRend) curRend.next();
}

document.addEventListener('keyup', e => {
  if (!document.getElementById('view-reader').classList.contains('on')) return;
  if (['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;
  if (e.key === 'ArrowLeft')  prevPage();
  if (e.key === 'ArrowRight') nextPage();
  if (e.key === 'ArrowUp' && pdfDoc)   pdfZoomIn();
  if (e.key === 'ArrowDown' && pdfDoc) pdfZoomOut();
});

// ── Footer / progress bar ─────────────────────────────────────────

function _setProgressBar(pct) {
  document.getElementById('prog-fill').style.width = pct + '%';
  document.getElementById('prog-pct').textContent  = pct + '%';
}

function updateFooter(loc) {
  if (!loc) return;
  curCFI = loc.start.cfi;

  // Use percentageFromCfi if locations have been generated (most accurate).
  // Fall back to loc.start.percentage (0–1 range from epub.js, unreliable on
  // many books) or loc.start.displayed.page / total as a last resort.
  let pct = 0;
  if (curBook && curBook.locations && curBook.locations.length()) {
    const raw = curBook.locations.percentageFromCfi(curCFI);
    if (raw != null && !isNaN(raw)) pct = Math.round(raw * 100);
  } else if (loc.start.percentage != null && !isNaN(loc.start.percentage)) {
    pct = Math.round(loc.start.percentage * 100);
  } else if (loc.start.displayed && loc.start.displayed.total > 0) {
    pct = Math.round((loc.start.displayed.page / loc.start.displayed.total) * 100);
  }

  _setProgressBar(pct);
  checkBmStar();
  updateTOCActive(loc);
}

function seekClick(e) {
  const bar  = document.getElementById('prog-wrap');
  const rect = bar.getBoundingClientRect();
  const pct  = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));

  if (pdfDoc) {
    _renderPdfPage(Math.max(1, Math.round(pct * pdfTotal)));
    return;
  }
  if (!curBook || !curRend) return;

  // If locations are generated, jump to the CFI at that percentage
  if (curBook.locations && curBook.locations.length()) {
    const cfi = curBook.locations.cfiFromPercentage(pct);
    if (cfi) { curRend.display(cfi); return; }
  }

  // Fallback: jump to spine item
  const items = curBook.spine.items;
  if (!items || !items.length) return;
  const item = items[Math.min(Math.floor(pct * items.length), items.length - 1)];
  if (item && item.href) curRend.display(item.href);
}

// ── Saving position ───────────────────────────────────────────────

function schedSave(loc) {
  clearTimeout(saveT);
  saveT = setTimeout(async () => {
    if (!curId || !loc) return;
    const cfi = loc.start.cfi;
    // Use locations percentage if available, otherwise fall back
    let pct = 0;
    if (curBook && curBook.locations && curBook.locations.length()) {
      const raw = curBook.locations.percentageFromCfi(cfi);
      if (raw != null && !isNaN(raw)) pct = raw;
    } else {
      pct = loc.start.percentage || 0;
    }
    await dbPut('positions', { bookId: curId, cfi, percentage: pct });
    const bk = await dbGet('books', curId);
    if (bk) { bk.progress = pct; await dbPut('books', bk); }
  }, 1500);
}

function schedSavePdf() {
  clearTimeout(saveT);
  saveT = setTimeout(async () => {
    if (!curId || !pdfDoc) return;
    const pct = pdfTotal ? pdfPage / pdfTotal : 0;
    await dbPut('positions', { bookId: curId, page: pdfPage, percentage: pct });
    const bk = await dbGet('books', curId);
    if (bk) { bk.progress = pct; await dbPut('books', bk); }
  }, 1500);
}

// ── Layout toggle (EPUB only) ─────────────────────────────────────

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
  ['toc-btn', 'bm-btn', 'back-btn', 'layout-btn'].forEach(id =>
    document.getElementById(id).style.display = 'none');
  document.getElementById('add-btn').style.display = v === 'reader' ? 'none' : '';
}

function goLibrary() {
  showView('library');
  loadLibrary();
  _teardown();
}

// ── Bookmark support for PDF ──────────────────────────────────────
// PDF bookmarks use page number as the "location" instead of a CFI.
// toggleBm and checkBmStar in toc-bookmarks.js check curCFI;
// for PDFs we synthesize a pseudo-CFI from the page number.

function getPdfPseudoCFI() {
  return pdfDoc ? 'pdf-page-' + pdfPage : null;
}
