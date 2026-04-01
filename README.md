# Shelf — EPUB & PDF Reader

A fully local reader for EPUB and PDF files that runs in your browser or as a
desktop app. No server required, no uploads, no accounts. Your books and reading
data stay on your device.

---

## Quick start

1. Unzip the folder
2. Double-click `index.html` (or run `launch.bat` on Windows / `launch.command` on Mac)
3. Drop `.epub` or `.pdf` files onto the library page, or drag an entire folder of books

> **Note on the Library Folder feature:** Chrome blocks folder-picker access
> when a file is opened directly via `file://`. See the
> [Library Folder](#library-folder) section below for how to enable it.

---

## Features

| Feature | Details |
|---|---|
| EPUB reading | epub.js rendering, paginated, single & double page, light / dark / sepia themes |
| PDF reading | PDF.js rendering, auto-fit zoom, page navigation, outline-based TOC |
| Library | Grid view with cover art, reading progress bar, file-type badge (EPUB / PDF) |
| Search | Live full-text search across title, author, genre, and tags |
| Filters | Dropdowns for genre, author, file type; sort by title / author / genre / date / progress |
| Metadata editing | Edit title, author, genre, publication date, and tags per book |
| Bookmarks | Star any page; bookmarks panel with jump-to and delete |
| Reading position | Auto-saved (CFI string for EPUB, page number for PDF) |
| Themes | Light, dark, sepia with font family and line-height controls |
| TOC | Chapter sidebar with active-chapter highlight (EPUB) and outline/page list (PDF) |
| Library folder | Sync books to/from a real folder on disk (see below) |
| PWA / offline | Service worker caches app shell; installable on iPad via Safari |
| Desktop app | Electron wrapper produces `.exe` (Windows) and `.app` (Mac) |

---

## Library Folder

The library folder feature lets you point Shelf at a folder on your computer.
When connected:
- Every book you add is **copied into that folder** automatically
- On startup, the folder is **scanned** and any new `.epub`/`.pdf` files found
  there are imported into your library
- Removing a book from Shelf also **deletes it from the folder**

This means you can manage your books in Finder / File Explorer like normal files
and Shelf stays in sync.

### How it works by environment

#### Opening as `file://` (double-clicking `index.html`)

Chrome intentionally blocks the folder picker on `file://` URLs for security.
The folder status bar will show:

> ⚠️ *Folder sync unavailable on file:// — drag a folder of books onto the
> drop zone, or serve via localhost*

**Workaround A — drag a folder:** You can still drag an entire folder of books
from Finder/Explorer onto the drop zone. All `.epub` and `.pdf` files inside
(including subfolders) will be imported. This works even on `file://`.

**Workaround B — run a local server** (enables the full "Set Library Folder"
button):

```bash
# Option 1: Node.js
npx serve .

# Option 2: Python
python3 -m http.server 8080
```

Then open `http://localhost:3000` (or `http://localhost:8080`) in Chrome or Edge.
The "Set Library Folder" button will appear and work normally.

#### Chrome or Edge served via `http://` or `https://`

Click **Set Library Folder**, pick any folder on your computer, and grant
permission. The folder will be scanned immediately. The browser remembers the
folder between sessions; if permission lapses, a **Reconnect** button appears.

#### Electron desktop app

Full native file system access — no permission prompts after the first pick.
See [Building the desktop app](#building-the-desktop-app--exe--app) below.

### Folder bar states

| Icon | Label | What it means |
|---|---|---|
| 📂 | No library folder set | No folder connected; "Set Library Folder" button shown |
| 📁 | 📂 FolderName | Connected and working; "Scan Now" and "Disconnect" shown |
| ⚠️ | FolderName — permission expired | Handle saved but browser needs re-permission; "Reconnect" shown |
| 🔄 | Scanning FolderName… | Currently scanning; buttons hidden to prevent double-clicks |
| ℹ️ | Folder sync unavailable on file://… | Running as `file://`; shows "How to enable →" help link |

---

## Project structure

```
shelf/
├── index.html              ← all markup; no inline logic or styles
├── README.md               ← this file
├── BUILD.md                ← how to build the Electron .exe / .app
├── manifest.json           ← PWA manifest (enables iPad install)
├── sw.js                   ← service worker (offline caching)
├── launch.bat              ← Windows: open in default browser
├── launch.command          ← macOS: open in default browser
├── package.json            ← Electron + electron-builder config
├── css/
│   ├── base.css            ← design tokens, reset, body, topbar, toast
│   ├── library.css         ← library view: drop zone, folder bar, search,
│   │                          filters, book cards, metadata modal
│   └── reader.css          ← reader view: sidebars, toolbar, epub stage,
│                              pdf stage, nav arrows, loading, footer
├── js/
│   ├── db.js               ← IndexedDB wrapper (all DB access lives here)
│   ├── library.js          ← library rendering, file ingestion, search,
│   │                          filters, metadata modal, drag-drop wiring
│   ├── reader.js           ← EPUB + PDF viewer, navigation, layout toggle,
│   │                          progress tracking, view switching
│   ├── theme.js            ← reader themes (light/dark/sepia), font,
│   │                          line-height, iframe CSS injection
│   ├── toc-bookmarks.js    ← table of contents, bookmarks CRUD,
│   │                          sidebar panel toggles
│   ├── shelf-folder.js     ← library folder sync (Electron + browser modes)
│   └── app.js              ← entry point: toast, PWA registration,
│                              Electron menu wiring, startup sequence
├── electron/
│   ├── main.js             ← Electron main process: window, menus, IPC handlers
│   └── preload.js          ← secure IPC bridge (exposes window.electronAPI)
└── icons/                  ← app icons (add before building)
    ├── icon.ico            ← Windows
    ├── icon.icns           ← macOS
    ├── icon.png            ← Linux / fallback (512×512)
    ├── icon-192.png        ← PWA (192×192)
    └── icon-512.png        ← PWA (512×512)
```

**Script load order** (enforced in `index.html` — each file can only call
functions defined in files loaded before it):

```
db.js → library.js → reader.js → theme.js → toc-bookmarks.js → shelf-folder.js → app.js
```

---

## File reference

### `index.html`

The only HTML file. Pure markup — no inline scripts or styles.

**Key sections:**

| Element | Purpose |
|---|---|
| `#topbar` | SHELF logo (click = go to library) + Add Book button |
| `#folder-bar` | Library folder status bar (always visible; adapts to environment) |
| `#drop-zone` | Drag-and-drop target for files and entire folders |
| `#lib-controls` | Search input + genre / author / type / sort dropdowns |
| `#book-grid` | Book card grid, populated dynamically by `library.js` |
| `#meta-modal` | Edit-metadata dialog (title, author, genre, pubdate, tags) |
| `#toc-sb` | TOC sidebar, slides in from the left while reading |
| `#rtb` | Reader toolbar (nav arrows, TOC/bookmarks toggles, font/zoom controls, bookmark star, layout, display settings) |
| `#epub-stage` | Container epub.js renders the EPUB iframe into |
| `#pdf-stage` | Container PDF.js renders canvases into |
| `#loading` | Spinner overlay, shared between EPUB and PDF |
| `#rfooter` | Footer progress bar + percentage |
| `#bm-sb` | Bookmarks sidebar, slides in from the right |

---

### `css/base.css`

Foundation layer — loaded first, used everywhere.

**Contains:**
- **CSS custom properties (design tokens)** — all colours, sidebar width, etc.
  Every other CSS file inherits these. Changing `--accent` here updates
  every gold highlight in the app.
- **Universal reset** — `box-sizing: border-box`, zeroed margin/padding
- **Body layout** — `height: 100vh`, `overflow: hidden`, flex column so the
  topbar stays fixed and views fill the rest
- **`#topbar`** and **`.tbtn`** — the dark header bar and its buttons
- **View switching** — `#view-library` and `#view-reader` are both `display:none`
  by default; adding `.on` makes one visible
- **`#toast`** — bottom-centre notification; slides up on `.on`, invisible otherwise
- **Scrollbar styling** — thin 5px scrollbar for WebKit browsers

---

### `css/library.css`

Everything visible on the library screen.

**Contains:**
- **`#folder-bar`** — the folder status strip above the drop zone.
  Always visible. Contains icon + label (flex: 1, truncates long paths) +
  action buttons that show/hide per state. `.folder-label.connected` = gold,
  `.folder-label.warn` = amber, default = muted.
- **`#drop-zone`** — dashed border drag target; highlights on `:hover` and
  `.over` (added by JS during dragover). Also clickable to open file browser.
- **`#lib-controls`** — flex row: search input (grows) + filter selects.
  `flex-wrap: wrap` so selects move to a new row on narrow screens.
- **`#search-wrap`** — the `::before` pseudo-element injects the magnifier icon
  without adding an HTML element. `pointer-events: none` so it doesn't block clicks.
- **`.lib-select`** — shared style for all four filter/sort `<select>` elements
- **`#book-grid`** — `repeat(auto-fill, minmax(154px, 1fr))` creates as many
  columns as fit, minimum 154px each
- **`.bcard`** — flex column: cover image → progress bar → info → action buttons.
  `position: relative` anchors the type badge and action buttons.
- **`.bcard-type`** — EPUB (gold) / PDF (red) badge, `position: absolute`
  bottom-right of the cover. `pointer-events: none` never blocks clicks.
- **`.bcard-actions`** — `display: none` by default; revealed by
  `.bcard:hover .bcard-actions { display: flex }` — pure CSS, no JS needed
- **`#meta-modal`** — full-viewport overlay (`position: fixed, inset: 0`).
  Clicking the dark backdrop (not the white card inside) closes it via a JS
  click listener. `display: none → flex` toggled by `.on`.
- **`.folder-hint-link`** — the "How to enable →" anchor shown on `file://`

---

### `css/reader.css`

Everything visible while reading.

**Contains:**
- **`.sb`** — both sidebars share this class. Start at `width: 0`
  (`overflow: hidden` clips their content). Animate to `--sidebar-w` (268px)
  when `.on` is added. `flex-shrink: 0` prevents the sidebar from being
  compressed by the main reading area.
- **`.toc-row`** — `border-left: 2px solid transparent` reserves space so
  text doesn't shift when the active gold border appears. `.d2` / `.d3` add
  left padding for nested chapters.
- **`#reader-main`** — the central reading column. Class `""` = light,
  `"dk"` = dark, `"sp"` = sepia. Dozens of descendant selectors like
  `#reader-main.dk #rtb { ... }` adjust child colours per theme.
- **`#rtb`** — 42px toolbar. `backdrop-filter: blur(6px)` creates the frosted
  glass effect. `z-index: 10` keeps it above the epub iframe.
- **`.rb` / `.rb.pill`** — reader buttons. Plain `.rb` = borderless icon button.
  `.rb.pill` adds a border for toggleable buttons. `.rb.pill.on` = active state.
- **`#prog-wrap`** — the progress bar track uses a padding/negative-margin trick:
  `padding: 8px 0; margin: -8px 0` creates a 20px invisible click area while
  keeping the visual bar at 4px. Much easier to click, especially on touch.
- **`#epub-stage.double::after`** — the center spine line in double-page mode,
  drawn as a CSS pseudo-element, adapts colour per theme.
- **`#pdf-stage`** — dark grey background; PDF pages are white canvases that
  sit on top. `#pdf-viewer` is the scrollable inner area.
- **`.spin`** — the loading spinner uses a CSS border trick: one side of a
  full circle gets the accent colour, then the element rotates.

---

### `js/db.js`

The only file that touches IndexedDB. All other files call its helpers.

**Database name:** `shelf_v5` — **version 3**

**Object stores:**

| Store | Key | What's stored |
|---|---|---|
| `books` | `id` (string) | Full book binary (`Uint8Array`), title, author, genre, pubDate, tags, cover (base64), type (`'epub'`/`'pdf'`), progress (0–1), addedAt, folderFile |
| `positions` | `bookId` | EPUB: `{ cfi, percentage }` — PDF: `{ page, percentage }` |
| `bookmarks` | `bookId` | `{ list: [{ cfi, label, pct, addedAt }] }` — real CFI for EPUB, `'pdf-page-N'` string for PDF |
| `settings` | `key` | Arbitrary key/value pairs — currently stores `folderHandle` (browser FileSystemDirectoryHandle) and `folderPath` (Electron absolute path string) |

**Indexes on `books`:** `by_author`, `by_genre`, `by_type`, `by_title`

**Functions:**
- `openDB()` — opens or creates the database; `onupgradeneeded` handles
  migration from any previous version (adds missing stores and indexes)
- `dbGet(store, key)` — returns one record by key, or `undefined` if not found
- `dbPut(store, value)` — inserts or replaces a record (upsert)
- `dbDel(store, key)` — deletes a record
- `dbAll(store)` — returns all records as an array
- `dbGetByIndex(store, indexName, value)` — returns all records where the
  indexed field equals `value`
- `dbDistinct(field)` — returns a sorted array of unique non-empty string
  values for a field across all books; used to populate genre/author dropdowns

---

### `js/library.js`

All library-related logic: displaying books, ingesting files, searching,
filtering, editing metadata, and wiring the drop zone.

**Module state:**
- `_allBooks` — in-memory cache of all book records. Loaded once per
  `loadLibrary()` call and reused by `applyFilters()` so filtering/searching
  never hits IndexedDB.
- `_editingId` — the book ID currently open in the metadata modal

**Functions:**
- `loadLibrary()` — reads all books from DB into `_allBooks`, sorts by date
  added, refreshes filter dropdowns, calls `applyFilters()`
- `applyFilters()` — reads search text and all dropdown values, filters
  `_allBooks` in memory, sorts, calls `renderGrid()`
- `renderGrid(books)` — clears `#book-grid`, renders cards, updates book count.
  Shows the empty-state message if no books match.
- `renderBookCard(book)` — builds one `.bcard` element. Includes cover image
  or emoji placeholder, type badge, progress bar, title/author/genre/date/tags,
  and hover action buttons.
- `refreshFilterDropdowns()` — calls `dbDistinct()` for genre and author fields,
  repopulates those `<select>` elements while preserving the current selection
- `populateSelect(id, values, placeholder)` — helper that replaces a select's
  options from an array
- `addFiles(files)` — filters for `.epub`/`.pdf` files, calls the appropriate
  ingest function for each, then reloads the library
- `ingestEpub(file, providedId?)` — reads the file as `ArrayBuffer`, opens with
  epub.js, extracts title/author/pubDate/genre/tags from `package.metadata`,
  fetches and base64-encodes the cover, saves to IndexedDB. If `providedId` is
  not given, it generates a new ID and also calls `writeToFolder()` to copy
  the file into the library folder if one is set.
- `ingestPdf(file, providedId?)` — same pipeline using PDF.js: reads metadata
  via `getMetadata()`, renders page 1 to a canvas for the cover thumbnail.
  Same `writeToFolder()` logic.
- `genId()` — generates a collision-resistant book ID (`b_<timestamp>_<random>`)
- `rmBook(e, id)` — confirms, then calls `deleteFromFolder(id)`, then deletes
  the book from all three DB stores (`books`, `positions`, `bookmarks`)
- `openMetaModal(e, id)` — loads the book from DB, populates modal fields, shows modal
- `closeMetaModal()` — hides modal, clears `_editingId`
- `saveMetaModal()` — reads form fields, updates book in DB, reloads library
- `initDropZone()` — wires all input/drag events:
  - Drop zone dragover / dragleave / drop (calls `_getFilesFromDrop`)
  - Body-level drop fallback
  - `#file-input` change (individual files)
  - `#folder-input` change (folder picker via `webkitdirectory`)
  - Live search and filter input listeners
  - Escape key clears the search box
- `_getFilesFromDrop(dataTransfer)` — handles both plain file drops and
  **folder drops** using the `FileSystemEntry` API. Recursively walks the
  directory tree to find all `.epub` and `.pdf` files.
- `_readEntry(entry, out)` — recursively reads a `FileSystemEntry` (file or
  directory) into a flat array. Calls `reader.readEntries()` in a loop because
  Chrome only returns up to 100 entries per call.
- `esc(s)` — HTML-escapes a string for safe insertion into `innerHTML`
- `blobToB64(blob)` — converts a `Blob` to a base64 data URL via `FileReader`

---

### `js/reader.js`

Opens books and drives both the epub.js EPUB viewer and the PDF.js PDF viewer.

**Module state:**

| Variable | Type | Purpose |
|---|---|---|
| `curBook` | epub.js `Book` | Active epub.js instance; `null` for PDFs |
| `curRend` | epub.js `Rendition` | Active rendition; `null` for PDFs |
| `curId` | string | IndexedDB key of the currently open book |
| `curCFI` | string | Current EPUB CFI location string |
| `layout` | `'single'`/`'double'` | Current EPUB page layout mode |
| `saveT` | timer | Debounce handle for auto-save (1.5s after last page turn) |
| `pdfDoc` | `PDFDocumentProxy` | Active PDF.js document; `null` for EPUBs |
| `pdfPage` | number | Current PDF page (1-indexed) |
| `pdfTotal` | number | Total pages in the PDF |
| `pdfScale` | number | User zoom multiplier (default 1.0) |
| `pdfRendering` | boolean | Guard flag preventing concurrent canvas renders |

**Functions:**
- `openBook(id)` — entry point for both types: loads book from DB, calls
  `_teardown()`, routes to `_openEpub` or `_openPdf` based on `book.type`
- `_teardown()` — destroys previous epub.js/PDF.js instances, clears viewer
  containers, hides both stages, resets all state variables
- `_openEpub(bdata)` — shows `#epub-stage`, hides PDF controls, calls
  `buildRend()`, builds the TOC, restores saved CFI position, fires
  `locations.generate()` in the background for accurate seek, wires events
- `buildRend()` — measures `#epub-stage` in pixels, computes the viewer width
  for single vs double layout, calls `curBook.renderTo()` with exact dimensions,
  calls `applyTheme()`
- `_openPdf(bdata)` — shows `#pdf-stage`, hides EPUB controls, loads PDF with
  PDF.js, sets `GlobalWorkerOptions.workerSrc`, calls `_buildPdfTOC()`,
  restores saved page number, renders first page
- `_renderPdfPage(num)` — renders one PDF page to a canvas: auto-fits to the
  stage width × `pdfScale`, appends canvas to `#pdf-viewer`, updates counters,
  schedules a save
- `_updatePdfCounters()` — syncs page input, total label, and progress bar
- `_buildPdfTOC()` — fetches PDF outline via `getOutline()`; falls back to a
  numbered page list if the outline is empty; each entry resolves destination
  objects to page numbers
- `pdfZoomIn() / pdfZoomOut() / pdfZoomReset()` — adjust `pdfScale` and re-render
- `pdfGoToPage(n)` — validates input and calls `_renderPdfPage`
- `prevPage() / nextPage()` — unified navigation that routes to epub.js or PDF.js
- `_setProgressBar(pct)` — sets both the fill width and percentage label
- `updateFooter(loc)` — EPUB only: extracts progress from CFI using
  `locations.percentageFromCfi()` (most accurate), falls back to
  `loc.start.percentage`, then to `displayed.page / displayed.total`
- `seekClick(e)` — click on progress bar: for PDF maps to a page number; for
  EPUB uses `locations.cfiFromPercentage()` if available, else jumps to a spine
  item
- `schedSave(loc)` / `schedSavePdf()` — debounced (1.5s) writes of position
  and progress to IndexedDB
- `toggleLayout()` — EPUB only: flips between single/double, destroys and
  rebuilds the rendition at the new width, restores the CFI position
- `showView(v)` — swaps between `'library'` and `'reader'` views via `.on`
- `goLibrary()` — calls `showView('library')`, reloads the library, tears down
  the current reader
- `getPdfPseudoCFI()` — returns `'pdf-page-N'` as a bookmark key for PDF pages

---

### `js/theme.js`

Controls the appearance of book content inside the epub.js iframe.

**Why direct iframe injection?** epub.js renders each chapter in a sandboxed
`<iframe>`. Normal page CSS cannot reach inside it. This file registers a minimal
theme via epub.js's API (to satisfy internal bookkeeping), then directly injects
a `<style id="__shelf_theme__">` tag into the iframe's `<head>` 60ms after each
page render. The 60ms delay gives epub.js time to finish its own layout.

**Why not `* {}` selectors?** Using `*` overrides epub.js's internal
column-layout CSS that makes double-page mode work, breaking it completely.
Instead, only specific text-bearing HTML elements are targeted.

**State:**
- `curTheme` — `''` (light), `'dk'` (dark), or `'sp'` (sepia)
- `fontSize` — integer percentage (70–200) applied to `body` and `p`
- `dispOpen` — boolean, whether `#disp-panel` is visible

**Functions:**
- `setTheme(t, el)` — sets `curTheme`, updates swatch `.on` class, sets class
  on `#reader-main`, calls `applyTheme()`
- `adjFont(delta)` — clamps `fontSize` to `[70, 200]`, updates display, calls `applyTheme()`
- `toggleDisp()` — toggles `#disp-panel`. A `document` click listener in the
  same file closes it when clicking outside.
- `applyTheme()` — builds and injects the CSS string into the iframe. Covers:
  - `html` / `body` background, text colour, font, size, line-height
  - All text-bearing elements: `color` + transparent background
  - Images: `mix-blend-mode: multiply` (light/sepia) or
    `invert(1) + mix-blend-mode: screen` (dark) to make white-background
    decorative PNGs invisible against the page colour
  - `*::before` / `*::after`: toned-down to match border colour

---

### `js/toc-bookmarks.js`

Table of contents rendering and bookmark CRUD for both EPUB and PDF.

**TOC functions:**
- `buildTOC(items, depth)` — recursively builds `.toc-row` divs from epub.js's
  navigation tree. Stores the chapter `href` as `data-href` on each row so
  `updateTOCActive` can match it without re-parsing.
- `updateTOCActive(loc)` — called on every EPUB page turn. Strips the URL
  fragment (`#...`) from both the current location's href and each row's
  `data-href`, then toggles `.on` on the matching row.

**Bookmark functions:**
- `getBms()` — loads the bookmark list for `curId` from the `bookmarks` store
- `_curLocKey()` — returns the current location as a string key:
  real CFI for EPUB (`curCFI`), pseudo-CFI `'pdf-page-N'` for PDF
- `checkBmStar()` — checks if any saved bookmark matches the current location
  key and updates the toolbar star (☆ = not bookmarked, ★ = bookmarked)
- `toggleBm()` — adds or removes a bookmark at the current location. Label is
  `"Page N of M"` for PDF, `"Page ~N%"` for EPUB.
- `renderBmList()` — rebuilds `#bm-list`. Each row is clickable (jumps to the
  location) and has a × delete button. PDF bookmarks parse `'pdf-page-N'` to
  extract the page number.
- `deleteBm(cfi)` — filters the list, saves, re-renders, updates star

**Sidebar functions:**
- `toggleSb(which)` — opens either `'toc'` or `'bm'` sidebar, closing the other.
  Syncs the `.on` active state on the corresponding toolbar pill buttons.

---

### `js/shelf-folder.js`

Manages an optional library folder on disk so books exist as real files you can
see in Finder or File Explorer, not just binary blobs in IndexedDB.

**Runtime modes:**

| Mode | When | How |
|---|---|---|
| **Electron** | Running as desktop app | `window.electronAPI` (injected by `preload.js`); uses Node.js `fs` over IPC. Full access, no permission prompts. |
| **Browser http/https** | Served via localhost or a web server in Chrome/Edge | `showDirectoryPicker()` (File System Access API). Browser asks once; `FileSystemDirectoryHandle` stored in IndexedDB `settings` store. |
| **Browser file://** | Opened by double-clicking | `showDirectoryPicker()` blocked by Chrome. Bar shows help text. Folder drag-drop still works for batch import. |
| **Firefox / Safari** | Any | Neither API available. Bar shows informational text. Everything else works normally. |

**Module state:**
- `IS_ELECTRON` — `true` if `window.electronAPI.isElectron` is set by preload
- `IS_FILE_PROTOCOL` — `true` if `location.protocol === 'file:'`
- `CAN_PICK_FOLDER` — `true` if the folder picker can actually be used
- `_dirHandle` — `FileSystemDirectoryHandle` (browser mode, from IndexedDB)
- `_folderPath` — absolute path string (Electron mode, from IndexedDB)
- `_folderName` — short display name shown in the UI (last path segment)

**Public functions:**
- `initFolder()` — called on startup. Always calls `updateFolderUI('none')` first
  so the bar appears immediately. Then tries to restore a saved folder handle/path
  and scan for new books.
- `pickFolder()` — routes to `_electronPick()` or `_browserPick()` depending on
  environment. On `file://`, shows a toast and does nothing.
- `disconnectFolder()` — clears state, removes both `folderHandle` and `folderPath`
  from IndexedDB settings, resets UI.
- `reconnectFolder()` — browser only: re-loads the saved handle and calls
  `requestPermission()`. If denied, clears and resets.
- `writeToFolder(file, bookId)` — called by `ingestEpub`/`ingestPdf` after saving
  to IndexedDB (only when the file was not itself scanned FROM the folder). Writes
  the file to disk and saves the filename back on the book record (`folderFile`
  field) so it can be deleted later.
- `deleteFromFolder(bookId)` — looks up `book.folderFile`, deletes the file from
  disk. Called by `rmBook()` before deleting the DB record.
- `scanFolderForNewBooks()` — lists the folder contents, skips files already tracked
  in `knownFiles` (built from `book.folderFile` across all DB records), ingests
  new ones via `_importFiles()`.

**Internal functions:**
- `_electronInit/Pick/Write/Delete/Scan()` — Electron-specific implementations
  using `window.electronAPI.readDir / readFile / writeFile / deleteFile / pathJoin`
- `_browserInit/Pick/Write/Delete/Scan()` — Browser File System Access API
  implementations
- `_importFiles(entries, readFn)` — shared scan logic used by both modes.
  Builds a set of already-known filenames, then for each new `.epub`/`.pdf`
  entry reads the binary, wraps it in a `File` object, calls `ingestEpub` or
  `ingestPdf` with a pre-generated ID, then tags the resulting DB record with
  the folder filename.
- `updateFolderUI(state)` — updates the folder bar for states: `'connected'`,
  `'reconnect'`, `'scanning'`, `'none'`. Always makes the bar visible. Shows
  context-appropriate text and buttons depending on the platform.
- `_showFolderHelp()` — called by "How to enable →" link on `file://`. Displays
  an `alert` with copy-paste commands for running a local server.
- `_safeName(bookId, name)` — generates a safe filename: short book ID prefix +
  sanitised original name (strips filesystem-invalid characters)
- `_checkPermission(h)` — queries permission state without prompting
- `_requestPermission(h)` — requests permission, may show browser prompt
- `_saveHandle / _loadHandle / _clearSaved` — persist and restore the
  `FileSystemDirectoryHandle` (browser) or path (Electron) in IndexedDB settings

---

### `js/app.js`

Entry point — loaded last so all other modules are defined.

**Contains:**
- `toast(msg)` — shows a bottom notification for 2.8 seconds. Uses a debounce
  timer so rapid calls replace the current message rather than stacking.
- **Service worker registration** — registers `sw.js` on `window.load` if
  `navigator.serviceWorker` exists. Makes the app installable and cacheable for
  offline use (PWA / iPad).
- **Electron menu wiring** — if `window.electronAPI` is present, listens for
  `'menu-add-book'` and `'menu-pick-folder'` IPC messages sent by
  `electron/main.js` when the user uses the native application menu.
- **Startup sequence**: `openDB()` → `loadLibrary()` → `initDropZone()` →
  `initFolder()`. If `openDB()` fails (private browsing in some browsers),
  shows a toast warning.

---

### `electron/main.js`

The Electron main process — runs in Node.js, not in the browser.

**Responsibilities:**
- Creates the `BrowserWindow` that loads `index.html`
- Sets `backgroundColor` to match `--bg` so there's no white flash on load
- Uses `titleBarStyle: 'hiddenInset'` on macOS for native traffic-light buttons
- Registers IPC handlers that the renderer calls via `window.electronAPI`:
  - `pick-folder` — shows a native `dialog.showOpenDialog` folder picker
  - `read-dir` — lists files in a directory via `fs.readdirSync`
  - `read-file` — reads a file as a `Buffer`, returns as a plain Array (IPC-serialisable)
  - `write-file` — writes a `Buffer.from(dataArray)` to a path
  - `delete-file` — unlinks a file
  - `path-join` — runs `path.join(...parts)` and returns the result
- Sends `'menu-add-book'` and `'menu-pick-folder'` to the renderer when the
  user uses the application menu (`File → Add Book…` / `File → Set Library Folder…`)
- `buildMenu()` — constructs the native application menu for Windows/Mac/Linux

### `electron/preload.js`

The security bridge between Node.js (main) and the HTML page (renderer).
Runs in a privileged context but exposes only a narrow, safe API.

`contextBridge.exposeInMainWorld('electronAPI', { ... })` makes the following
available as `window.electronAPI` inside `index.html`:
- `isElectron: true` — feature flag checked by `shelf-folder.js`
- `pickFolder()` → IPC `pick-folder`
- `readDir(path)` → IPC `read-dir`
- `readFile(path)` → IPC `read-file` (returns `Uint8Array`)
- `writeFile(path, data)` → IPC `write-file`
- `deleteFile(path)` → IPC `delete-file`
- `pathJoin(...parts)` → IPC `path-join`
- `onMenuAction(channel, callback)` — listens for menu IPC events

The renderer cannot call `require()` or access Node APIs directly —
`contextIsolation: true` and `nodeIntegration: false` enforce this.

---

### `sw.js`

The service worker for PWA / offline support.

**Caches:**
- All local app files (HTML, CSS, JS) on install
- CDN scripts (JSZip, epub.js, PDF.js, PDF.js worker) on first fetch

**Strategy:** Cache-first. If a resource is in the cache, it's served from
there. If not, it's fetched from the network and cached for next time. If
offline and uncached, HTML requests get a minimal offline page.

**Cache name:** `shelf-v1` — bump this string to force all clients to
re-fetch assets after an update.

### `manifest.json`

The PWA web app manifest. Tells browsers:
- App name, short name, description
- Start URL (`./index.html`)
- `"display": "standalone"` — opens without browser chrome (like a native app)
- Theme and background colours
- Icon paths (192px and 512px)

On iPad: open in Safari → Share → Add to Home Screen → the app icon appears on
your home screen and opens fullscreen like a native app.

---

## Data stored in your browser

| Store | Key | Contents |
|---|---|---|
| `books` | `id` | `type`, `title`, `author`, `genre`, `pubDate`, `tags[]`, `cover` (base64), `data` (Uint8Array), `progress`, `addedAt`, `folderFile` |
| `positions` | `bookId` | EPUB: `{ cfi, percentage }` — PDF: `{ page, percentage }` |
| `bookmarks` | `bookId` | `{ list: [{ cfi, label, pct, addedAt }] }` |
| `settings` | `key` | `folderHandle` (browser handle) or `folderPath` (Electron path) |

To clear everything: browser DevTools → Application → IndexedDB → `shelf_v5` → Delete database.

---

## Dependencies

| Library | Version | Purpose |
|---|---|---|
| [JSZip](https://stuk.github.io/jszip/) | 3.10.1 | epub.js dependency — unpacks EPUB zip containers |
| [epub.js](https://github.com/futurepress/epub.js) | 0.3.93 | Parses EPUBs, manages the reading iframe, CFI locations, pagination |
| [PDF.js](https://mozilla.github.io/pdf.js/) | 3.11.174 | Renders PDF pages to `<canvas>`, reads document metadata and outline |

All three load from public CDNs. An internet connection is required the first
time; after that they're cached by the service worker.

---

## Building the desktop app (.exe / .app)

See **`BUILD.md`** for complete step-by-step instructions covering:
- Running in development (`npm start`)
- Building a Windows installer (`npm run build:win`)
- Building a macOS `.dmg` (`npm run build:mac`)
- Icon requirements
- Code signing notes
- iPad PWA hosting options
