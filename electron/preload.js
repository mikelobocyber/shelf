// ── electron/preload.js ──
// Runs in a privileged context between main.js (Node) and the renderer (index.html).
// contextBridge.exposeInMainWorld makes a safe, limited API available as
// window.electronAPI inside index.html — the renderer cannot access Node or IPC
// directly, which keeps the app secure.
//
// shelf-folder.js checks for window.electronAPI at runtime:
//   - If present  → use these native Node-backed calls (Electron desktop)
//   - If absent   → use the browser File System Access API (Chrome/Edge browser)

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {

  // Returns true so shelf-folder.js knows it's running inside Electron
  isElectron: true,

  // Opens a native folder picker dialog; returns the chosen path string or null
  pickFolder: () => ipcRenderer.invoke('pick-folder'),

  // Lists files in a folder; returns [{ name, isFile }]
  readDir: (folderPath) => ipcRenderer.invoke('read-dir', folderPath),

  // Reads a file as a Uint8Array (via Array round-trip across IPC)
  readFile: async (filePath) => {
    const arr = await ipcRenderer.invoke('read-file', filePath);
    return arr ? new Uint8Array(arr) : null;
  },

  // Writes a Uint8Array to a file path
  writeFile: (filePath, data) =>
    ipcRenderer.invoke('write-file', filePath, Array.from(data)),

  // Deletes a file at the given path
  deleteFile: (filePath) => ipcRenderer.invoke('delete-file', filePath),

  // path.join equivalent (needed because path separators differ on Windows vs Mac)
  pathJoin: (...parts) => ipcRenderer.invoke('path-join', ...parts),

  // Listen for menu-triggered actions sent from main.js
  onMenuAction: (channel, callback) => {
    const allowed = ['menu-add-book', 'menu-pick-folder'];
    if (allowed.includes(channel)) {
      ipcRenderer.on(channel, (_event, ...args) => callback(...args));
    }
  },
});
