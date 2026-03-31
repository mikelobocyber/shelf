// ── library.js — Library view: load, ingest, render, remove books ──

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function blobToB64(b) {
  return new Promise(r => {
    const fr = new FileReader();
    fr.onload = () => r(fr.result);
    fr.readAsDataURL(b);
  });
}

async function loadLibrary() {
  const books = await dbAll('books');
  const grid  = document.getElementById('book-grid');
  const empty = document.getElementById('empty');
  grid.innerHTML = '';

  if (!books.length) { empty.classList.add('on'); return; }
  empty.classList.remove('on');

  books.sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
  books.forEach(renderBookCard);
}

function renderBookCard(b) {
  const grid = document.getElementById('book-grid');
  const pct  = Math.round((b.progress || 0) * 100);
  const card = document.createElement('div');
  card.className = 'bcard';
  card.onclick   = () => openBook(b.id);
  card.innerHTML =
    (b.cover
      ? `<img src="${b.cover}" alt="">`
      : `<div class="bcard-ph">📖</div>`) +
    `<div class="bcard-prog"><div style="width:${pct}%"></div></div>` +
    `<div class="bcard-info">
       <div class="bcard-title">${esc(b.title  || 'Untitled')}</div>
       <div class="bcard-author">${esc(b.author || '')}</div>
     </div>` +
    `<button class="bcard-rm" onclick="rmBook(event,'${b.id}')">×</button>`;
  grid.appendChild(card);
}

async function addFiles(files) {
  for (const f of files) {
    if (!f.name.toLowerCase().endsWith('.epub')) continue;
    await ingestEpub(f);
  }
  loadLibrary();
}

async function ingestEpub(file) {
  try {
    const buf    = await file.arrayBuffer();
    const id     = 'b_' + Date.now() + '_' + Math.random().toString(36).slice(2);
    const bk     = ePub(buf.slice(0));
    await bk.ready;

    const m      = bk.package.metadata;
    const title  = m.title   || file.name.replace(/\.epub$/i, '');
    const author = m.creator || '';

    let cover = null;
    try {
      const cu = await bk.coverUrl();
      if (cu) cover = await blobToB64(await (await fetch(cu)).blob());
    } catch (_) {}

    bk.destroy();
    await dbPut('books', {
      id, title, author, cover,
      data: new Uint8Array(buf),
      addedAt: Date.now(),
      progress: 0
    });
    toast('Added: ' + title);
  } catch (e) {
    console.error(e);
    toast('Could not read this EPUB');
  }
}

async function rmBook(e, id) {
  e.stopPropagation();
  if (!confirm('Remove this book from your library?')) return;
  await dbDel('books',     id);
  await dbDel('positions', id);
  await dbDel('bookmarks', id);
  loadLibrary();
}

// ── Drag & drop wiring ──
function initDropZone() {
  const dz = document.getElementById('drop-zone');

  dz.addEventListener('dragover',  e => { e.preventDefault(); dz.classList.add('over'); });
  dz.addEventListener('dragleave', ()  => dz.classList.remove('over'));
  dz.addEventListener('drop', e => {
    e.preventDefault();
    dz.classList.remove('over');
    addFiles([...e.dataTransfer.files]);
  });

  document.body.addEventListener('dragover', e => e.preventDefault());
  document.body.addEventListener('drop', e => {
    if (e.target !== dz && !dz.contains(e.target)) {
      e.preventDefault();
      addFiles([...e.dataTransfer.files]);
    }
  });

  document.getElementById('file-input').addEventListener('change', function () {
    addFiles([...this.files]);
    this.value = '';
  });
}
