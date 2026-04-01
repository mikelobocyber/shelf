# Building Shelf as a Desktop App

This guide covers three ways to run Shelf, from simplest to most polished.

---

## Option 1 — Browser launcher (no installation)

Just double-click a file. No Node.js, no build step.

| Platform | File to double-click |
|---|---|
| Windows | `launch.bat` |
| macOS   | `launch.command` (right-click → Open the first time) |
| iPad    | See [iPad / PWA](#option-3--ipad--pwa) below |

**Limitations:** Opens in your browser, not a standalone window. The library folder
feature requires Chrome or Edge (not Firefox or Safari).

---

## Option 2 — Electron desktop app (proper .exe / .app)

Produces a real installable application with its own window, taskbar icon, and
native menus. Uses the same HTML/CSS/JS files — Electron just wraps them.

### Prerequisites

- [Node.js](https://nodejs.org) 18 or later (includes npm)
- About 500 MB of disk space for node_modules + Electron

### Steps

#### 1. Install dependencies

Open a terminal in the `shelf/` folder (the one containing `package.json`):

```bash
npm install
```

This downloads Electron and electron-builder into `node_modules/`. It only
needs to run once (or again if you update `package.json`).

#### 2. Run in development (optional — test before building)

```bash
npm start
```

Opens Shelf in an Electron window immediately. No installer, just a dev preview.
Useful for testing changes before building a distributable.

#### 3. Build the installer

```bash
# Windows installer (.exe) — run this on a Windows machine
npm run build:win

# macOS .app + .dmg — run this on a Mac
npm run build:mac

# Both platforms at once (requires macOS with Wine for cross-compiling Windows)
npm run build:all
```

Output appears in the `dist/` folder:

| Platform | Output files |
|---|---|
| Windows | `dist/Shelf Setup 1.0.0.exe` (installer) and `dist/Shelf 1.0.0.exe` (portable) |
| macOS   | `dist/Shelf-1.0.0.dmg` (drag-to-Applications installer) and `dist/Shelf-1.0.0-mac.zip` |

#### 4. Install

- **Windows:** Run `Shelf Setup 1.0.0.exe`. It creates a Start Menu entry and
  optionally a desktop shortcut. The portable `.exe` runs without installing.
- **macOS:** Open the `.dmg`, drag Shelf into Applications. First launch: right-click
  → Open (macOS Gatekeeper blocks unsigned apps on first run).

### Icons

Electron-builder needs icon files in the `icons/` folder:

| File | Platform | Size |
|---|---|---|
| `icons/icon.ico` | Windows | 256×256 (multi-resolution .ico) |
| `icons/icon.icns` | macOS | Multi-resolution .icns |
| `icons/icon.png` | Linux / fallback | 512×512 PNG |
| `icons/icon-192.png` | PWA | 192×192 PNG |
| `icons/icon-512.png` | PWA | 512×512 PNG |

**Quick way to make these:** Design a 1024×1024 PNG, then use
[icoconvert.com](https://icoconvert.com) for `.ico` and
[cloudconvert.com](https://cloudconvert.com/png-to-icns) for `.icns`.
For the PWA icons, just resize the PNG.

Until you add real icon files, Electron will use its default icon and the
build will still succeed — so you can skip this step initially.

### Code signing (optional but recommended)

Without code signing, Windows shows a "Windows protected your PC" SmartScreen
warning and macOS shows "unidentified developer" on first launch. Both can be
bypassed with right-click → Run/Open, but for distribution you'll want to sign.

- **Windows:** Buy a code signing certificate from DigiCert or Sectigo (~$200/yr),
  then add `"certificateFile"` and `"certificatePassword"` to the `win` section of
  `package.json`.
- **macOS:** Requires an Apple Developer account ($99/yr). Add `"identity"` to the
  `mac` section of `package.json` with your certificate name.

For personal use, code signing is unnecessary.

---

## Option 3 — iPad / PWA

iPadOS does not support the File System Access API or Electron, but it fully
supports **Progressive Web Apps (PWAs)** — websites that install to the home
screen and run like native apps.

### How to install on iPad

1. Open Safari on your iPad
2. Navigate to the Shelf URL (you need to host it — see below)
3. Tap the **Share** button (box with arrow)
4. Tap **Add to Home Screen**
5. Tap **Add**

Shelf now appears on your home screen with its own icon and opens in a
standalone window (no browser chrome).

### Hosting options

Shelf needs to be served over HTTPS for the PWA install prompt to appear.
Three easy options:

**A. GitHub Pages (free, permanent)**
1. Create a GitHub account
2. Create a new repository
3. Upload all Shelf files
4. Go to Settings → Pages → Source → main branch
5. Your URL: `https://yourusername.github.io/shelf/`

**B. Netlify (free, drag and drop)**
1. Go to [netlify.com](https://netlify.com)
2. Drag the entire `shelf/` folder onto the deploy area
3. Done — you get a URL immediately

**C. Local network (no internet required)**
Run a simple local server on your computer and access it from your iPad on the
same Wi-Fi network:

```bash
# With Node.js
npx serve .

# With Python
python3 -m http.server 8080
```

Then open `http://YOUR_COMPUTER_IP:8080` in Safari on the iPad.

### What works on iPad

| Feature | Works? |
|---|---|
| Reading EPUB files | ✅ |
| Reading PDF files | ✅ |
| Bookmarks | ✅ |
| Reading position saved | ✅ |
| Search and filters | ✅ |
| Metadata editing | ✅ |
| Offline reading (after first load) | ✅ via service worker |
| Library folder on disk | ❌ iOS does not allow web apps to access the file system |
| Double-page layout | ✅ (landscape mode looks great) |

### What works offline

After loading Shelf once while online, the service worker (`sw.js`) caches all
app files. You can then open Shelf with no internet connection and read any book
already in your library. New books must be added while online (the CDN libraries
for epub.js and PDF.js need to be available at least once).

---

## Summary

| Method | Effort | Result | Folder feature | Works offline |
|---|---|---|---|---|
| `launch.bat` / `launch.command` | None | Opens in browser | Chrome/Edge only | No |
| `npm start` | Install Node | Dev window | Yes | No |
| `npm run build:win/mac` | Install Node + build | Installable .exe / .app | Yes | No |
| PWA on iPad | Host the files | Home screen app | No | Yes |
