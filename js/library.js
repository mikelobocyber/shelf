// ── library.js ──
// Handles: ingesting EPUB & PDF files, rendering the library grid,
// search across title/author/genre/tags, filter dropdowns,
// metadata editing modal, and drag-and-drop wiring.

// ── Utilities ────────────────────────────────────────────────────

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;');
}

function blobToB64(b) {
  return new Promise(r => {
    const fr = new FileReader();
    fr.onload  = () => r(fr.result);
    fr.readAsDataURL(b);
  });
}

// ── Library rendering ─────────────────────────────────────────────

// Master book list (kept in memory so search/filter don't re-hit IndexedDB)
let _allBooks = [];

async function loadLibrary() {
  _allBooks = await dbAll('books');
  _allBooks.sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
  await refreshFilterDropdowns();
  applyFilters();
}

// Re-renders the grid from _allBooks applying current search + filter state
function applyFilters() {
  const q      = (document.getElementById('search-input').value || '').trim().toLowerCase();
  const genre  = document.getElementById('filter-genre').value;
  const author = document.getElementById('filter-author').value;
  const type   = document.getElementById('filter-type').value;
  const sort   = document.getElementById('sort-select').value;

  let books = _allBooks.filter(b => {
    // Text search across title, author, genre, tags
    if (q) {
      const haystack = [b.title, b.author, b.genre, b.pubDate, ...(b.tags || [])]
        .join(' ').toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    if (genre  && b.genre  !== genre)  return false;
    if (author && b.author !== author) return false;
    if (type   && b.type   !== type)   return false;
    return true;
  });

  // Sorting
  if (sort === 'title')    books.sort((a, b) => (a.title  || '').localeCompare(b.title  || ''));
  if (sort === 'author')   books.sort((a, b) => (a.author || '').localeCompare(b.author || ''));
  if (sort === 'genre')    books.sort((a, b) => (a.genre  || '').localeCompare(b.genre  || ''));
  if (sort === 'recent')   books.sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
  if (sort === 'progress') books.sort((a, b) => (b.progress || 0) - (a.progress || 0));

  renderGrid(books);
}

function renderGrid(books) {
  const grid  = document.getElementById('book-grid');
  const empty = document.getElementById('empty');
  const count = document.getElementById('lib-count');
  grid.innerHTML = '';

  if (count) {
    const total = _allBooks.length;
    const shown = books.length;
    count.textContent = shown === total
      ? `${total} book${total !== 1 ? 's' : ''}`
      : `${shown} of ${total}`;
  }

  if (!books.length) {
    empty.classList.add('on');
    empty.textContent = _allBooks.length
      ? 'No books match your search or filters.'
      : 'No books yet. Drop an EPUB or PDF above to get started.';
    return;
  }
  empty.classList.remove('on');
  books.forEach(renderBookCard);
}

function renderBookCard(b) {
  const grid  = document.getElementById('book-grid');
  const pct   = Math.round((b.progress || 0) * 100);
  const isPdf = b.type === 'pdf';

  const card = document.createElement('div');
  card.className = 'bcard';

  const coverHtml = b.cover
    ? `<img src="${b.cover}" alt="">`
    : `<div class="bcard-ph">${isPdf ? '📄' : '📖'}</div>`;

  const typeBadge  = `<span class="bcard-type ${isPdf ? 'pdf' : 'epub'}">${isPdf ? 'PDF' : 'EPUB'}</span>`;
  const genreHtml  = b.genre   ? `<div class="bcard-genre">${esc(b.genre)}</div>`   : '';
  const pubHtml    = b.pubDate ? `<div class="bcard-pub">${esc(b.pubDate)}</div>`   : '';
  const tagsHtml   = (b.tags && b.tags.length)
    ? `<div class="bcard-tags">${b.tags.map(t => `<span class="tag">${esc(t)}</span>`).join('')}</div>`
    : '';

  // Build card HTML — action buttons have NO onclick here; we wire them below
  // with addEventListener so stopPropagation works reliably.
  card.innerHTML =
    `<div class="bcard-cover-wrap">${coverHtml}${typeBadge}</div>` +
    `<div class="bcard-prog"><div style="width:${pct}%"></div></div>` +
    `<div class="bcard-info">
       <div class="bcard-title">${esc(b.title  || 'Untitled')}</div>
       <div class="bcard-author">${esc(b.author || '')}</div>
       ${genreHtml}${pubHtml}${tagsHtml}
     </div>` +
    `<div class="bcard-actions">
       <button class="bcard-edit" title="Edit metadata">✎</button>
       <button class="bcard-rm"   title="Remove book">×</button>
     </div>`;

  // Wire the whole card to open the book — but only if the click did NOT
  // originate on the action buttons.
  card.addEventListener('click', e => {
    if (!e.target.closest('.bcard-actions')) openBook(b.id);
  });

  // Edit button — stop propagation so the card click above doesn't also fire
  card.querySelector('.bcard-edit').addEventListener('click', e => {
    e.stopPropagation();
    openMetaModal(b.id);
  });

  // Remove button — stop propagation, then confirm via our custom dialog
  card.querySelector('.bcard-rm').addEventListener('click', e => {
    e.stopPropagation();
    confirmRemove(b.id, b.title || 'this book');
  });

  grid.appendChild(card);
}

// ── Filter dropdowns ──────────────────────────────────────────────

async function refreshFilterDropdowns() {
  await populateSelect('filter-genre',  await dbDistinct('genre'),  'All genres');
  await populateSelect('filter-author', await dbDistinct('author'), 'All authors');
}

function populateSelect(id, values, placeholder) {
  const sel = document.getElementById(id);
  const cur = sel.value; // preserve current selection
  sel.innerHTML = `<option value="">${placeholder}</option>`;
  values.forEach(v => {
    const o = document.createElement('option');
    o.value = v; o.textContent = v;
    if (v === cur) o.selected = true;
    sel.appendChild(o);
  });
}

// ── File ingestion ────────────────────────────────────────────────

async function addFiles(files) {
  let added = 0;
  for (const f of files) {
    const name = f.name.toLowerCase();
    if (name.endsWith('.epub')) { await ingestEpub(f); added++; }
    else if (name.endsWith('.pdf')) { await ingestPdf(f);  added++; }
  }
  if (added) await loadLibrary();
}

// Ingest an EPUB: extract metadata + cover via epub.js, store binary
async function ingestEpub(file, providedId) {
  try {
    const buf = await file.arrayBuffer();
    const id  = providedId || genId();
    const bk  = ePub(buf.slice(0));
    await bk.ready;

    const m      = bk.package.metadata;
    const title  = m.title          || file.name.replace(/\.epub$/i, '');
    const author = m.creator        || '';
    const pubDate= m.pubdate        || m.date || '';
    const genre  = m.subject        || '';
    const tags   = genre ? genre.split(/[,;]/).map(s => s.trim()).filter(Boolean) : [];

    let cover = null;
    try {
      const cu = await bk.coverUrl();
      if (cu) cover = await blobToB64(await (await fetch(cu)).blob());
    } catch (_) {}

    bk.destroy();
    await dbPut('books', {
      id, type: 'epub', title, author, genre, pubDate, tags, cover,
      data: new Uint8Array(buf),
      addedAt: Date.now(), progress: 0
    });

    // Copy into the library folder if one is set (skipped if file came FROM the folder)
    if (!providedId) await writeToFolder(file, id);

    toast('Added: ' + title);
    return id;
  } catch (e) {
    console.error(e);
    toast('Could not read EPUB: ' + file.name);
  }
}

// Ingest a PDF: extract metadata via PDF.js, generate cover from page 1
async function ingestPdf(file, providedId) {
  try {
    const buf  = await file.arrayBuffer();
    const id   = providedId || genId();

    // Load with PDF.js to read metadata and render cover thumbnail
    const pdfjsLib = window['pdfjs-dist/build/pdf'];
    const pdf      = await pdfjsLib.getDocument({ data: buf.slice(0) }).promise;

    // Metadata
    let title   = file.name.replace(/\.pdf$/i, '');
    let author  = '';
    let pubDate = '';
    let genre   = '';
    try {
      const meta = await pdf.getMetadata();
      const info = meta.info || {};
      if (info.Title)    title   = info.Title;
      if (info.Author)   author  = info.Author;
      if (info.Subject)  genre   = info.Subject;
      if (info.CreationDate) {
        const raw = info.CreationDate.replace(/^D:/, '');
        const yr  = raw.slice(0, 4);
        const mo  = raw.slice(4, 6);
        const dy  = raw.slice(6, 8);
        if (yr) pubDate = [yr, mo, dy].filter(Boolean).join('-');
      }
    } catch (_) {}

    const tags = genre ? genre.split(/[,;]/).map(s => s.trim()).filter(Boolean) : [];

    // Render page 1 as cover thumbnail (300px wide)
    let cover = null;
    try {
      const page     = await pdf.getPage(1);
      const viewport = page.getViewport({ scale: 1 });
      const scale    = 300 / viewport.width;
      const vp       = page.getViewport({ scale });
      const canvas   = document.createElement('canvas');
      canvas.width   = Math.floor(vp.width);
      canvas.height  = Math.floor(vp.height);
      await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
      cover = canvas.toDataURL('image/jpeg', 0.85);
    } catch (_) {}

    await dbPut('books', {
      id, type: 'pdf', title, author, genre, pubDate, tags, cover,
      data: new Uint8Array(buf),
      addedAt: Date.now(), progress: 0
    });

    // Copy into the library folder if one is set (skipped if file came FROM the folder)
    if (!providedId) await writeToFolder(file, id);

    toast('Added: ' + title);
    return id;
  } catch (e) {
    console.error(e);
    toast('Could not read PDF: ' + file.name);
  }
}

function genId() {
  return 'b_' + Date.now() + '_' + Math.random().toString(36).slice(2);
}

// ── Remove ────────────────────────────────────────────────────────

// Shows the custom remove confirmation dialog.
// Called by the card's × button listener in renderBookCard.
function confirmRemove(id, title) {
  const modal  = document.getElementById('confirm-modal');
  const msg    = document.getElementById('confirm-msg');
  const yesBtn = document.getElementById('confirm-yes');
  const noBtn  = document.getElementById('confirm-no');

  msg.textContent = `Remove "${title}" from your library?`;
  modal.classList.add('on');

  // Clone buttons to clear any old listeners
  const newYes = yesBtn.cloneNode(true);
  const newNo  = noBtn.cloneNode(true);
  yesBtn.replaceWith(newYes);
  noBtn.replaceWith(newNo);

  newNo.addEventListener('click',  () => modal.classList.remove('on'));
  newYes.addEventListener('click', async () => {
    modal.classList.remove('on');
    await rmBook(id);
  });
}

async function rmBook(id) {
  await deleteFromFolder(id);
  await dbDel('books',     id);
  await dbDel('positions', id);
  await dbDel('bookmarks', id);
  await loadLibrary();
  toast('Book removed');
}

// ── Metadata modal ────────────────────────────────────────────────

let _editingId = null;

// id passed directly (no event object needed — caller handles stopPropagation)
async function openMetaModal(id) {
  const bk = await dbGet('books', id);
  if (!bk) return;
  _editingId = id;

  document.getElementById('meta-title').value   = bk.title   || '';
  document.getElementById('meta-author').value  = bk.author  || '';
  document.getElementById('meta-genre').value   = bk.genre   || '';
  document.getElementById('meta-pubdate').value = bk.pubDate || '';
  document.getElementById('meta-tags').value    = (bk.tags || []).join(', ');
  document.getElementById('meta-modal').classList.add('on');
}

function closeMetaModal() {
  document.getElementById('meta-modal').classList.remove('on');
  _editingId = null;
}

async function saveMetaModal() {
  if (!_editingId) return;
  const bk = await dbGet('books', _editingId);
  if (!bk) return;

  bk.title   = document.getElementById('meta-title').value.trim()  || bk.title;
  bk.author  = document.getElementById('meta-author').value.trim();
  bk.genre   = document.getElementById('meta-genre').value.trim();
  bk.pubDate = document.getElementById('meta-pubdate').value.trim();
  bk.tags    = document.getElementById('meta-tags').value
    .split(',').map(s => s.trim()).filter(Boolean);

  await dbPut('books', bk);
  closeMetaModal();
  await loadLibrary();
  toast('Metadata saved');
}

// Close modal on backdrop click
document.addEventListener('click', e => {
  if (e.target.id === 'meta-modal') closeMetaModal();
});

// ── Drag & drop + file input wiring ──────────────────────────────

function initDropZone() {
  const dz = document.getElementById('drop-zone');

  dz.addEventListener('dragover',  e => { e.preventDefault(); dz.classList.add('over'); });
  dz.addEventListener('dragleave', ()  => dz.classList.remove('over'));
  dz.addEventListener('drop', async e => {
    e.preventDefault();
    dz.classList.remove('over');
    // Use getFilesFromDrop to handle both individual files AND dragged folders
    const files = await _getFilesFromDrop(e.dataTransfer);
    if (files.length) addFiles(files);
  });

  // Body-level drop fallback
  document.body.addEventListener('dragover', e => e.preventDefault());
  document.body.addEventListener('drop', async e => {
    if (e.target !== dz && !dz.contains(e.target)) {
      e.preventDefault();
      const files = await _getFilesFromDrop(e.dataTransfer);
      if (files.length) addFiles(files);
    }
  });

  // Standard file picker (individual files)
  document.getElementById('file-input').addEventListener('change', function () {
    addFiles([...this.files]);
    this.value = '';
  });

  // Folder picker input (webkitdirectory) — triggered by "Add whole folder" if we add that button
  const fi = document.getElementById('folder-input');
  if (fi) {
    fi.addEventListener('change', function () {
      addFiles([...this.files]);
      this.value = '';
    });
  }

  // Live search & filter
  ['search-input', 'filter-genre', 'filter-author', 'filter-type', 'sort-select']
    .forEach(id => document.getElementById(id).addEventListener('input', applyFilters));

  document.getElementById('search-input').addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.target.value = ''; applyFilters(); }
  });
}

// Recursively extract all files from a DataTransfer event.
// Handles both plain files and dragged folders (via FileSystemEntry API).
async function _getFilesFromDrop(dataTransfer) {
  const files = [];

  // Modern API: use getAsEntry() / webkitGetAsEntry() to handle folders
  const items = dataTransfer.items
    ? [...dataTransfer.items].filter(i => i.kind === 'file')
    : [];

  if (items.length > 0 && items[0].webkitGetAsEntry) {
    const entries = items.map(i => i.webkitGetAsEntry()).filter(Boolean);
    for (const entry of entries) {
      await _readEntry(entry, files);
    }
  } else {
    // Fallback: plain DataTransfer.files (no folder support)
    files.push(...dataTransfer.files);
  }

  return files.filter(f => {
    const n = f.name.toLowerCase();
    return n.endsWith('.epub') || n.endsWith('.pdf');
  });
}

// Recursively reads a FileSystemEntry into a flat array of File objects
function _readEntry(entry, out) {
  return new Promise(resolve => {
    if (entry.isFile) {
      entry.file(f => { out.push(f); resolve(); }, resolve);
    } else if (entry.isDirectory) {
      const reader = entry.createReader();
      // readEntries may need to be called multiple times for large dirs
      const readAll = (cb) => {
        reader.readEntries(async entries => {
          if (!entries.length) { cb(); return; }
          for (const e of entries) await _readEntry(e, out);
          readAll(cb); // read again in case there are more
        }, cb);
      };
      readAll(resolve);
    } else {
      resolve();
    }
  });
}
