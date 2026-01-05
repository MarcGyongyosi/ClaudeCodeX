const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('claude', {
  // Folder management
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  selectFiles: () => ipcRenderer.invoke('select-files'),
  getCwd: () => ipcRenderer.invoke('get-cwd'),
  setCwd: (path) => ipcRenderer.invoke('set-cwd', path),

  // Terminal management
  startTerminal: (cols, rows) => ipcRenderer.invoke('start-terminal', cols, rows),
  stopTerminal: () => ipcRenderer.invoke('stop-terminal'),
  terminalInput: (data) => ipcRenderer.invoke('terminal-input', data),
  terminalResize: (cols, rows) => ipcRenderer.invoke('terminal-resize', cols, rows),

  // Terminal events
  onTerminalData: (callback) => ipcRenderer.on('terminal-data', (event, data) => callback(data)),
  onTerminalExit: (callback) => ipcRenderer.on('terminal-exit', (event, code) => callback(code)),

  // File operations
  listFiles: () => ipcRenderer.invoke('list-files'),
  listDirectory: (path) => ipcRenderer.invoke('list-directory', path),
  copyFiles: (paths) => ipcRenderer.invoke('copy-files', paths),
  readFile: (path) => ipcRenderer.invoke('read-file', path),
  readFileBinary: (path) => ipcRenderer.invoke('read-file-binary', path),
  openFileExternal: (path) => ipcRenderer.invoke('open-file-external', path),
  showInFinder: (path) => ipcRenderer.invoke('show-in-finder', path),
  openUrlExternal: (url) => ipcRenderer.invoke('open-url-external', url),

  // Document processing
  processExcel: (path) => ipcRenderer.invoke('process-excel', path),
  processWord: (path) => ipcRenderer.invoke('process-word', path),
  processCsv: (path) => ipcRenderer.invoke('process-csv', path),
  getFileUrl: (path) => ipcRenderer.invoke('get-file-url', path),

  // Claude Code CLI management
  checkClaudeInstalled: () => ipcRenderer.invoke('check-claude-installed'),
  checkNpmInstalled: () => ipcRenderer.invoke('check-npm-installed'),
  installClaude: () => ipcRenderer.invoke('install-claude'),
  openInstallGuide: () => ipcRenderer.invoke('open-install-guide'),
  onInstallProgress: (callback) => ipcRenderer.on('install-progress', (event, data) => callback(data))
});
