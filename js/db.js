// ── db.js — IndexedDB wrapper ──
// All persistent storage goes through these helpers.
//
// Stores:
//   books     — full book binary + metadata (epub & pdf)
//   positions — last-read position per book (CFI for epub, page number for pdf)
//   bookmarks — list of bookmarks per book
//   settings  — key/value store for app preferences (e.g. the library folder handle)

let db;

function openDB() {
  return new Promise((res, rej) => {
    // Version 3: added 'settings' store for folder handle + other prefs
    const r = indexedDB.open('shelf_v5', 3);

    r.onupgradeneeded = e => {
      const d   = e.target.result;
      const old = e.oldVersion;

      // books store — keyed by generated id string
      if (!d.objectStoreNames.contains('books')) {
        const bs = d.createObjectStore('books', { keyPath: 'id' });
        bs.createIndex('by_author', 'author', { unique: false });
        bs.createIndex('by_genre',  'genre',  { unique: false });
        bs.createIndex('by_type',   'type',   { unique: false });
        bs.createIndex('by_title',  'title',  { unique: false });
      } else if (old < 2) {
        const bs = e.target.transaction.objectStore('books');
        if (!bs.indexNames.contains('by_author')) bs.createIndex('by_author', 'author', { unique: false });
        if (!bs.indexNames.contains('by_genre'))  bs.createIndex('by_genre',  'genre',  { unique: false });
        if (!bs.indexNames.contains('by_type'))   bs.createIndex('by_type',   'type',   { unique: false });
        if (!bs.indexNames.contains('by_title'))  bs.createIndex('by_title',  'title',  { unique: false });
      }

      // positions store — keyed by bookId
      if (!d.objectStoreNames.contains('positions'))
        d.createObjectStore('positions', { keyPath: 'bookId' });

      // bookmarks store — keyed by bookId
      if (!d.objectStoreNames.contains('bookmarks'))
        d.createObjectStore('bookmarks', { keyPath: 'bookId' });

      // settings store — generic key/value pairs (added in v3)
      // Stores things like the library folder FileSystemDirectoryHandle
      if (!d.objectStoreNames.contains('settings'))
        d.createObjectStore('settings', { keyPath: 'key' });
    };

    r.onsuccess = e => { db = e.target.result; res(); };
    r.onerror   = rej;
  });
}

// ── Low-level helpers ─────────────────────────────────────────────

const _store = (s, m = 'readonly') => db.transaction(s, m).objectStore(s);

function dbGet(s, k) {
  return new Promise((r, j) => {
    const q = _store(s).get(k);
    q.onsuccess = () => r(q.result);
    q.onerror   = j;
  });
}

function dbPut(s, v) {
  return new Promise((r, j) => {
    const q = _store(s, 'readwrite').put(v);
    q.onsuccess = () => r();
    q.onerror   = j;
  });
}

function dbDel(s, k) {
  return new Promise((r, j) => {
    const q = _store(s, 'readwrite').delete(k);
    q.onsuccess = () => r();
    q.onerror   = j;
  });
}

function dbAll(s) {
  return new Promise((r, j) => {
    const q = _store(s).getAll();
    q.onsuccess = () => r(q.result);
    q.onerror   = j;
  });
}

// ── Query helpers ─────────────────────────────────────────────────

// Returns all books matching a specific index value
// e.g. dbGetByIndex('books', 'by_genre', 'Fiction')
function dbGetByIndex(store, indexName, value) {
  return new Promise((r, j) => {
    const q = _store(store).index(indexName).getAll(value);
    q.onsuccess = () => r(q.result);
    q.onerror   = j;
  });
}

// Returns all unique values for a given field across all books
// Used to populate filter dropdowns dynamically
async function dbDistinct(field) {
  const all  = await dbAll('books');
  const seen = new Set();
  all.forEach(b => {
    const v = b[field];
    if (v && String(v).trim()) seen.add(String(v).trim());
  });
  return [...seen].sort((a, b) => a.localeCompare(b));
}
