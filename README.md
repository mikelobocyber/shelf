# Shelf — EPUB Reader

A fully local, browser-based EPUB reader. No server, no uploads, no accounts.
Open `index.html` in any modern browser and start reading.

---

## How to run

1. Unzip the folder
2. Open `index.html` in Chrome, Firefox, or Edge
3. Drop an `.epub` file onto the library page

Everything is stored in your browser's IndexedDB — books, reading positions, and bookmarks persist across sessions automatically.

---

## Project structure

```
shelf/
├── index.html
├── README.md
├── css/
│   ├── base.css
│   ├── library.css
│   └── reader.css
└── js/
    ├── db.js
    ├── library.js
    ├── reader.js
    ├── theme.js
    ├── toc-bookmarks.js
    └── app.js
```

---

## Files

### `index.html`

The only HTML file. Contains all the markup for both views (library and reader) but zero inline logic or styles — everything is delegated to the CSS and JS files.

**Key sections inside:**
- `#topbar` — the SHELF logo (clicks back to library) and the Add Book button
- `#view-library` — the library screen: drop zone + book grid
- `#view-reader` — the reader screen, which contains:
  - `#toc-sb` — table of contents sidebar (slides in from the left)
  - `#reader-main` — the main reading column:
    - `#rtb` — reader toolbar with nav arrows, TOC/Bookmarks toggles, font size, bookmark star, layout toggle, and display settings panel
    - `#epub-stage` — the container epub.js renders the book into
    - `#rfooter` — progress bar and percentage display
  - `#bm-sb` — bookmarks sidebar (slides in from the right)

**Script load order** (at the bottom of the file, order matters):
`db.js` → `library.js` → `reader.js` → `theme.js` → `toc-bookmarks.js` → `app.js`

---

### `css/base.css`

Foundation styles shared across the entire app.

**Contains:**
- CSS custom properties (design tokens): colors, accent, danger, sidebar width
- Box-sizing reset and body layout (`height: 100vh`, `overflow: hidden`, flex column)
- `#topbar` styles — the black header bar with the SHELF logo
- `.tbtn` — the small bordered button style used in the topbar
- `#view-library` / `#view-reader` — the two main view containers (`.on` class shows them)
- `#toast` — the small notification pop-up that appears at the bottom
- Scrollbar styling (thin, subtle, WebKit)

---

### `css/library.css`

Styles for the library screen only.

**Contains:**
- `#lib-inner` — the scrollable library page wrapper
- `#drop-zone` — the dashed drop target at the top of the library; highlights on hover and drag-over
- `.bcard` — book card grid items, including:
  - Cover image (or placeholder emoji)
  - `.bcard-prog` — the thin reading-progress bar at the base of the cover
  - `.bcard-info` — title and author text block
  - `.bcard-rm` — the × remove button that appears on hover
- `#book-grid` — CSS grid that auto-fills cards at 148px minimum width
- `#empty` — the "no books yet" message shown when the library is empty

---

### `css/reader.css`

Styles for everything inside the reader view.

**Contains:**
- `#reader-wrap` — flex row that holds both sidebars and the main reader
- `.sb` — shared sidebar style; starts at `width: 0` and expands to `--sidebar-w` when `.on` is added
  - `.sb-head` — sidebar title bar with close button
  - `.sb-body` — scrollable content area inside the sidebar
- `.toc-row` — individual chapter entry in the TOC sidebar; `.on` highlights the current chapter; `.d2` / `.d3` add indentation for nested chapters
- `.bm-row` — individual bookmark entry in the bookmarks sidebar with label, position, and delete button
- `#reader-main` — the main content column; class `dk` = dark theme, `sp` = sepia theme
- `#rtb` — the reader toolbar bar (42px tall, frosted glass effect)
  - `.rb` — base reader button style
  - `.rb.pill` — bordered pill-style button (used for TOC, bookmarks, bookmark star, layout, display)
  - `#r-title` — book title centered in the toolbar
  - `#bm-star` — the bookmark toggle star (gold when current page is bookmarked)
  - `#disp-panel` — the floating display settings panel (theme swatches, font picker, line-height slider)
- `#epub-stage` — the container epub.js renders into; `.double` class adds the center spine line
- `.nav-arr` — the `‹` `›` side arrows for page navigation
- `#loading` — the centered spinner shown while a book is opening
- `#rfooter` — the footer bar containing the progress bar and percentage
  - `#prog-wrap` — the clickable progress bar track (has an invisible 16px tall hit area)
  - `#prog-fill` — the filled portion of the progress bar

---

### `js/db.js`

All IndexedDB access goes through this file. Nothing else touches the database directly.

**Exports (globals):**
- `openDB()` — opens (or creates) the `shelf_v4` database with three object stores:
  - `books` — stores the full EPUB binary, cover image, title, author, and reading progress
  - `positions` — stores the last-read CFI location per book
  - `bookmarks` — stores the list of bookmarks per book
- `dbGet(store, key)` — returns one record by key
- `dbPut(store, value)` — inserts or updates a record
- `dbDel(store, key)` — deletes a record by key
- `dbAll(store)` — returns all records in a store

---

### `js/library.js`

Everything related to displaying and managing the book library.

**Functions:**
- `loadLibrary()` — reads all books from IndexedDB and re-renders the grid
- `renderBookCard(book)` — creates and appends one book card to `#book-grid`
- `addFiles(files)` — iterates a FileList and calls `ingestEpub` on each `.epub`
- `ingestEpub(file)` — the main ingestion pipeline:
  1. Reads the file as an ArrayBuffer
  2. Opens it with epub.js to extract title, author, and cover image
  3. Converts the cover to a base64 data URL for storage
  4. Saves everything (including the full binary) to IndexedDB
- `rmBook(event, id)` — confirms then deletes a book and its position/bookmark records
- `initDropZone()` — wires up all drag-and-drop and file-input event listeners; called once on startup
- `blobToB64(blob)` — helper that converts a Blob to a base64 data URL via FileReader
- `esc(str)` — HTML-escapes a string for safe insertion into innerHTML

---

### `js/reader.js`

The core reading engine. Manages the epub.js book and rendition lifecycle.

**State variables:**
- `curBook` — the active epub.js `Book` instance
- `curRend` — the active epub.js `Rendition` instance
- `curId` — IndexedDB key of the currently open book
- `curCFI` — CFI string of the current reading location (used for bookmarks)
- `layout` — `'single'` or `'double'` page mode
- `saveT` — debounce timer for auto-saving the reading position

**Functions:**
- `openBook(id)` — full open sequence: loads book data, destroys any previous rendition, creates a new one, restores saved position, wires events
- `buildRend()` — measures the available screen space and calls `curBook.renderTo()` with exact pixel dimensions; handles single vs double column math; calls `applyTheme()` afterward
- `prevPage()` / `nextPage()` — call `curRend.prev()` / `curRend.next()`
- Keyboard listener on `document` — arrow keys navigate pages when in reader view
- `updateFooter(loc)` — updates progress bar width, percentage text, bookmark star state, and TOC highlight on every page turn
- `seekClick(event)` — calculates click position on the progress bar using `getBoundingClientRect` and jumps to the corresponding spine item
- `schedSave(loc)` — debounces writing the current CFI and progress percentage to IndexedDB (fires 1.5s after the last page turn)
- `toggleLayout()` — switches between single and double page, destroys and rebuilds the rendition at the new size, restores the reading position
- `showView(v)` — swaps between `'library'` and `'reader'` views by toggling the `.on` class
- `goLibrary()` — calls `showView('library')`, reloads the library grid, and destroys the current rendition

---

### `js/theme.js`

Controls the visual appearance of the book content inside the epub.js iframe.

**Why iframe injection?** epub.js renders each book chapter inside a sandboxed `<iframe>`. The epub's own CSS runs inside that iframe, so normal page stylesheets can't reach it. This file registers a minimal theme via epub.js's API (to satisfy its internal checks), then injects a full `<style>` tag directly into the iframe's `<head>` 60ms after each page render.

**State variables:**
- `curTheme` — `''` (light), `'dk'` (dark), or `'sp'` (sepia)
- `fontSize` — current font size in percent (70–200)
- `dispOpen` — whether the display settings panel is visible

**Functions:**
- `setTheme(t, el)` — sets `curTheme`, updates swatch highlights, applies the class to `#reader-main`, and calls `applyTheme()`
- `adjFont(delta)` — increments/decrements `fontSize` by `delta` percent and re-applies the theme
- `toggleDisp()` — shows or hides `#disp-panel`; a document click listener closes it when clicking outside
- `applyTheme()` — the main workhorse:
  - Picks background, foreground, link, and border colors based on the current theme
  - Calculates `mix-blend-mode` and `filter` for images so decorative PNG borders with white backgrounds disappear into the page color
  - Builds a CSS string that targets specific text elements — **not** the `*` selector — to avoid overriding epub.js's internal column layout CSS which breaks double-page mode
  - Registers a dummy epub.js theme to trigger its internal selection logic
  - Injects the real CSS directly into the iframe via `document.querySelector('#epub-viewer iframe').contentDocument`

---

### `js/toc-bookmarks.js`

Manages the table of contents sidebar and the bookmarks system.

**TOC functions:**
- `buildTOC(items, depth)` — recursively builds `.toc-row` elements from epub.js's navigation tree; stores the chapter href as `data-href` on each row for active tracking; supports 3 levels of indentation
- `updateTOCActive(loc)` — called on every page turn; compares the current spine href against each TOC row's `data-href` and adds/removes the `.on` highlight

**Bookmark functions:**
- `getBms()` — retrieves the bookmark list for the current book from IndexedDB
- `checkBmStar()` — checks whether `curCFI` matches any saved bookmark and updates the toolbar star (☆ / ★)
- `toggleBm()` — adds or removes a bookmark at the current CFI; saves to IndexedDB; refreshes the star and the bookmark list
- `renderBmList()` — rebuilds the `#bm-list` sidebar content from stored bookmarks; each entry is clickable (jumps to that CFI) and has a × delete button
- `deleteBm(cfi)` — removes one bookmark by CFI and re-renders the list

**Sidebar functions:**
- `toggleSb(which)` — opens the TOC or bookmarks sidebar (closing the other if it's open); syncs the `.on` highlight on the toolbar pill buttons; triggers `renderBmList()` when opening bookmarks

---

### `js/app.js`

The entry point. Loaded last so all other modules are already defined.

**Contains:**
- `toast(msg)` — shows a small notification at the bottom of the screen for 2.8 seconds; uses a debounce timer so rapid toasts don't stack
- Startup sequence: `openDB()` → `loadLibrary()` → `initDropZone()`; if IndexedDB is unavailable (e.g. private browsing in some browsers), shows a toast warning

---

## Dependencies (loaded from CDN)

| Library | Version | Purpose |
|---|---|---|
| [JSZip](https://stuk.github.io/jszip/) | 3.10.1 | Required by epub.js to unpack the EPUB zip format |
| [epub.js](https://github.com/futurepress/epub.js) | 0.3.93 | Parses EPUBs, manages the reading iframe, handles CFI locations and navigation |

Both are loaded from public CDNs in `index.html`. An internet connection is required on first load; after that the browser caches them.

---

## Data stored in your browser

| Store | Key | What's in it |
|---|---|---|
| `books` | `id` (random string) | Title, author, cover (base64), full EPUB binary (Uint8Array), progress (0–1), date added |
| `positions` | `bookId` | Last-read CFI string + percentage for each book |
| `bookmarks` | `bookId` | Array of `{ cfi, label, pct, addedAt }` objects per book |

To clear all data: open DevTools → Application → IndexedDB → `shelf_v4` → Delete database.
