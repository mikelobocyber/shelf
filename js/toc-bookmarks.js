// ── toc-bookmarks.js — Table of contents + bookmarks panel logic ──

// ── TABLE OF CONTENTS ─────────────────────────────────────────────

function buildTOC(items, depth = 1) {
  const list = document.getElementById('toc-list');
  items.forEach(item => {
    const el        = document.createElement('div');
    el.className    = 'toc-row d' + Math.min(depth, 3);
    el.textContent  = item.label.trim();
    el.dataset.href = item.href || '';
    el.onclick = () => {
      if (curRend) curRend.display(item.href);
      document.querySelectorAll('.toc-row').forEach(x => x.classList.remove('on'));
      el.classList.add('on');
    };
    list.appendChild(el);
    if (item.subitems && item.subitems.length) buildTOC(item.subitems, depth + 1);
  });
}

// Called on every page turn to highlight the current chapter in the TOC
function updateTOCActive(loc) {
  if (!loc || !loc.start || !loc.start.href) return;
  const href = loc.start.href.split('#')[0];
  document.querySelectorAll('.toc-row').forEach(row => {
    const rHref = (row.dataset.href || '').split('#')[0];
    row.classList.toggle('on', !!rHref && href.endsWith(rHref));
  });
}

// ── BOOKMARKS ─────────────────────────────────────────────────────

async function getBms() {
  const rec = await dbGet('bookmarks', curId);
  return (rec && rec.list) ? rec.list : [];
}

async function checkBmStar() {
  if (!curId || !curCFI) return;
  const bms = await getBms();
  const hit = bms.some(b => b.cfi === curCFI);
  const btn = document.getElementById('bm-star');
  btn.textContent = hit ? '★' : '☆';
  btn.classList.toggle('on', hit);
}

async function toggleBm() {
  if (!curId || !curCFI) { toast('Open a book first'); return; }
  let bms      = await getBms();
  const idx    = bms.findIndex(b => b.cfi === curCFI);
  const pct    = parseInt(document.getElementById('prog-pct').textContent) || 0;

  if (idx >= 0) {
    bms.splice(idx, 1);
    toast('Bookmark removed');
  } else {
    bms.push({ cfi: curCFI, label: 'Page ~' + pct + '%', pct, addedAt: Date.now() });
    toast('Bookmarked ★');
  }
  await dbPut('bookmarks', { bookId: curId, list: bms });
  checkBmStar();
  renderBmList();
}

async function renderBmList() {
  const list = document.getElementById('bm-list');
  if (!curId) { list.innerHTML = ''; return; }

  const bms = await getBms();
  if (!bms.length) {
    list.innerHTML =
      '<div class="bm-empty">No bookmarks yet.<br>Press ☆ in the toolbar<br>to bookmark the current page.</div>';
    return;
  }

  bms.sort((a, b) => a.pct - b.pct);
  list.innerHTML = '';

  bms.forEach(bm => {
    const el = document.createElement('div');
    el.className = 'bm-row';
    el.innerHTML =
      `<button class="bm-row-del" data-cfi="${esc(bm.cfi)}">×</button>` +
      `<div class="bm-row-label">${esc(bm.label)}</div>` +
      `<div class="bm-row-sub">${bm.pct}% through book</div>`;
    el.querySelector('.bm-row-del').onclick = e => { e.stopPropagation(); deleteBm(bm.cfi); };
    el.onclick = () => { if (curRend) curRend.display(bm.cfi); };
    list.appendChild(el);
  });
}

async function deleteBm(cfi) {
  let bms = await getBms();
  bms = bms.filter(b => b.cfi !== cfi);
  await dbPut('bookmarks', { bookId: curId, list: bms });
  renderBmList();
  checkBmStar();
}

// ── SIDEBARS ──────────────────────────────────────────────────────

function toggleSb(which) {
  const tocSb  = document.getElementById('toc-sb');
  const bmSb   = document.getElementById('bm-sb');
  const tocBtn = document.getElementById('toc-tb-btn');
  const bmBtn  = document.getElementById('bm-tb-btn');

  if (which === 'toc') {
    const opening = !tocSb.classList.contains('on');
    tocSb.classList.toggle('on', opening);
    bmSb.classList.remove('on');
    if (tocBtn) tocBtn.classList.toggle('on', opening);
    if (bmBtn)  bmBtn.classList.remove('on');
  } else {
    const opening = !bmSb.classList.contains('on');
    bmSb.classList.toggle('on', opening);
    tocSb.classList.remove('on');
    if (bmBtn)  bmBtn.classList.toggle('on', opening);
    if (tocBtn) tocBtn.classList.remove('on');
    if (opening) renderBmList();
  }
}
