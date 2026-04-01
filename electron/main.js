// ── electron/main.js ──
// Entry point for the Electron desktop app.
// Electron runs this file in Node.js. It creates a BrowserWindow that loads
// shelf/index.html — exactly like a browser tab, but in a standalone app window.
//
// Key responsibilities:
//   - Create and configure the app window
//   - Handle macOS app lifecycle (stay open when all windows closed, etc.)
//   - Expose a safe IPC bridge so the renderer (index.html) can ask Node.js
//     to open the system folder picker (replaces the browser File System Access API
//     with a more reliable native dialog on desktop)
//   - Set up the application menu (File, View, etc.)

const { app, BrowserWindow, ipcMain, dialog, Menu, shell } = require('electron');
const path  = require('path');
const fs    = require('fs');

// ── Window management ─────────────────────────────────────────────

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width:  1280,
    height: 840,
    minWidth:  800,
    minHeight: 600,
    title: 'Shelf',
    // Use platform-native titlebar on Windows; on Mac use a hidden titlebar
    // so the window controls (traffic lights) sit inside the chrome area.
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    backgroundColor: '#111010', // matches --bg in base.css so there's no white flash on load
    webPreferences: {
      preload:          path.join(__dirname, 'preload.js'),
      contextIsolation: true,   // security: renderer can't access Node APIs directly
      nodeIntegration:  false,  // security: no require() in renderer
    },
    icon: _iconPath(),
  });

  // Load the app — the HTML file is one level up from the electron/ folder
  mainWindow.loadFile(path.join(__dirname, '..', 'index.html'));

  // Open DevTools in development; comment out for production builds
  // mainWindow.webContents.openDevTools();

  mainWindow.on('closed', () => { mainWindow = null; });
}

// Pick the right icon file for each platform
function _iconPath() {
  const base = path.join(__dirname, '..', 'icons');
  if (process.platform === 'win32')  return path.join(base, 'icon.ico');
  if (process.platform === 'darwin') return path.join(base, 'icon.icns');
  return path.join(base, 'icon.png');
}

// ── App lifecycle ─────────────────────────────────────────────────

app.whenReady().then(() => {
  createWindow();
  buildMenu();

  // macOS: re-create window when dock icon is clicked and no windows are open
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Windows / Linux: quit when all windows are closed
// macOS: stay running (standard Mac behaviour — user quits via Cmd+Q)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ── IPC: Native folder picker ─────────────────────────────────────
// The renderer calls window.electronAPI.pickFolder() which sends an IPC message
// here. We open a native dialog and return the chosen folder path.
// Then the renderer reads/writes files directly using the path via
// window.electronAPI.readDir / readFile / writeFile / deleteFile.

ipcMain.handle('pick-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title:      'Choose your Shelf library folder',
    properties: ['openDirectory', 'createDirectory'],
  });
  if (result.canceled || !result.filePaths.length) return null;
  return result.filePaths[0];
});

ipcMain.handle('read-dir', async (_e, folderPath) => {
  try {
    return fs.readdirSync(folderPath).map(name => ({
      name,
      isFile: fs.statSync(path.join(folderPath, name)).isFile(),
    }));
  } catch (e) { return []; }
});

ipcMain.handle('read-file', async (_e, filePath) => {
  try {
    const buf = fs.readFileSync(filePath);
    // Return as a plain array so it can cross the IPC boundary (Buffer isn't serialisable)
    return Array.from(buf);
  } catch (e) { return null; }
});

ipcMain.handle('write-file', async (_e, filePath, dataArray) => {
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, Buffer.from(dataArray));
    return true;
  } catch (e) { console.error('write-file error:', e); return false; }
});

ipcMain.handle('delete-file', async (_e, filePath) => {
  try { fs.unlinkSync(filePath); return true; }
  catch (e) { return false; }
});

ipcMain.handle('path-join', async (_e, ...parts) => path.join(...parts));

// ── Application menu ──────────────────────────────────────────────

function buildMenu() {
  const isMac = process.platform === 'darwin';

  const template = [
    // macOS: app menu (first menu is always the app name on Mac)
    ...(isMac ? [{
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    }] : []),

    // File menu
    {
      label: 'File',
      submenu: [
        {
          label: 'Add Book…',
          accelerator: 'CmdOrCtrl+O',
          click: () => mainWindow?.webContents.send('menu-add-book'),
        },
        {
          label: 'Set Library Folder…',
          click: () => mainWindow?.webContents.send('menu-pick-folder'),
        },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },

    // View menu
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        { type: 'separator' },
        {
          label: 'Toggle Developer Tools',
          accelerator: isMac ? 'Alt+Cmd+I' : 'Ctrl+Shift+I',
          click: () => mainWindow?.webContents.toggleDevTools(),
        },
      ],
    },

    // Window menu
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        ...(isMac ? [{ type: 'separator' }, { role: 'front' }] : [{ role: 'close' }]),
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
