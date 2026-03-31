// ── db.js — IndexedDB wrapper ──
// All persistent storage goes through these helpers.
// Stores: 'books', 'positions', 'bookmarks'

let db;

function openDB() {
  return new Promise((res, rej) => {
    const r = indexedDB.open('shelf_v4', 1);
    r.onupgradeneeded = e => {
      const d = e.target.result;
      ['books', 'positions', 'bookmarks'].forEach(s => {
        if (!d.objectStoreNames.contains(s))
          d.createObjectStore(s, { keyPath: s === 'books' ? 'id' : 'bookId' });
      });
    };
    r.onsuccess = e => { db = e.target.result; res(); };
    r.onerror   = rej;
  });
}

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
