const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const pty = require('node-pty');
const XLSX = require('xlsx');
const mammoth = require('mammoth');
const Papa = require('papaparse');
const { execSync, spawn } = require('child_process');

let mainWindow;
let ptyProcess = null;
let installProcess = null;
let currentWorkingDir = process.env.HOME;

// Get proper PATH including common Node.js locations
function getEnvWithPath() {
  const env = { ...process.env };
  const additionalPaths = [
    '/opt/homebrew/bin',
    '/usr/local/bin',
    '/usr/local/nodejs/bin',
    path.join(process.env.HOME, '.nvm/versions/node'),
    path.join(process.env.HOME, '.npm-global/bin'),
    '/usr/bin'
  ];
  env.PATH = additionalPaths.join(':') + ':' + (env.PATH || '');
  return env;
}

// Check if Claude Code CLI is installed
function checkClaudeInstalled() {
  const env = getEnvWithPath();
  try {
    execSync('which claude', { env, stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

// Check if npm is installed
function checkNpmInstalled() {
  const env = getEnvWithPath();
  try {
    execSync('which npm', { env, stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true
    },
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 15, y: 15 }
  });

  mainWindow.loadFile('index.html');
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (ptyProcess) {
    ptyProcess.kill();
  }
  app.quit();
});

// Handle folder selection
ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory', 'createDirectory'],
    defaultPath: currentWorkingDir
  });

  if (!result.canceled && result.filePaths.length > 0) {
    currentWorkingDir = result.filePaths[0];
    return currentWorkingDir;
  }
  return null;
});

// Handle file selection
ipcMain.handle('select-files', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'multiSelections'],
    defaultPath: currentWorkingDir
  });

  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths;
  }
  return null;
});

// Get current working directory
ipcMain.handle('get-cwd', () => currentWorkingDir);

// Set working directory
ipcMain.handle('set-cwd', (event, folderPath) => {
  currentWorkingDir = folderPath;
  return currentWorkingDir;
});

// Start Claude terminal session
ipcMain.handle('start-terminal', (event, cols, rows) => {
  if (ptyProcess) {
    ptyProcess.kill();
  }

  console.log('Starting Claude in:', currentWorkingDir);
  console.log('Terminal size:', cols, 'x', rows);

  // Ensure PATH includes common locations for CLI tools
  const env = { ...process.env, TERM: 'xterm-256color' };
  if (!env.PATH.includes('/opt/homebrew/bin')) {
    env.PATH = `/opt/homebrew/bin:/usr/local/bin:${env.PATH}`;
  }

  // Spawn claude as an interactive PTY
  ptyProcess = pty.spawn('claude', [], {
    name: 'xterm-256color',
    cols: cols || 80,
    rows: rows || 24,
    cwd: currentWorkingDir,
    env
  });

  // Forward PTY output to renderer
  ptyProcess.onData((data) => {
    mainWindow.webContents.send('terminal-data', data);
  });

  ptyProcess.onExit(({ exitCode }) => {
    console.log('Claude exited with code:', exitCode);
    mainWindow.webContents.send('terminal-exit', exitCode);
    ptyProcess = null;
  });

  return true;
});

// Send input to terminal
ipcMain.handle('terminal-input', (event, data) => {
  if (ptyProcess) {
    ptyProcess.write(data);
    return true;
  }
  return false;
});

// Resize terminal
ipcMain.handle('terminal-resize', (event, cols, rows) => {
  if (ptyProcess) {
    ptyProcess.resize(cols, rows);
    return true;
  }
  return false;
});

// Stop terminal
ipcMain.handle('stop-terminal', () => {
  if (ptyProcess) {
    ptyProcess.kill();
    ptyProcess = null;
    return true;
  }
  return false;
});

// List files in current directory
ipcMain.handle('list-files', async () => {
  try {
    const entries = await fs.promises.readdir(currentWorkingDir, { withFileTypes: true });
    const files = entries
      .filter(entry => !entry.name.startsWith('.'))
      .map(entry => ({
        name: entry.name,
        isDirectory: entry.isDirectory(),
        path: path.join(currentWorkingDir, entry.name)
      }))
      .sort((a, b) => {
        if (a.isDirectory && !b.isDirectory) return -1;
        if (!a.isDirectory && b.isDirectory) return 1;
        return a.name.localeCompare(b.name);
      });
    return files;
  } catch (err) {
    console.error('Error listing files:', err);
    return [];
  }
});

// List files in a specific directory (for expanding subdirectories)
ipcMain.handle('list-directory', async (event, dirPath) => {
  try {
    const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
    const files = entries
      .filter(entry => !entry.name.startsWith('.'))
      .map(entry => ({
        name: entry.name,
        isDirectory: entry.isDirectory(),
        path: path.join(dirPath, entry.name)
      }))
      .sort((a, b) => {
        if (a.isDirectory && !b.isDirectory) return -1;
        if (!a.isDirectory && b.isDirectory) return 1;
        return a.name.localeCompare(b.name);
      });
    return files;
  } catch (err) {
    console.error('Error listing directory:', err);
    return [];
  }
});

// Copy files to current directory
ipcMain.handle('copy-files', async (event, sourcePaths) => {
  const results = [];
  for (const sourcePath of sourcePaths) {
    try {
      const fileName = path.basename(sourcePath);
      const destPath = path.join(currentWorkingDir, fileName);

      const stats = await fs.promises.stat(sourcePath);
      if (stats.isDirectory()) {
        await copyDir(sourcePath, destPath);
      } else {
        await fs.promises.copyFile(sourcePath, destPath);
      }
      results.push({ success: true, name: fileName });
    } catch (err) {
      results.push({ success: false, name: path.basename(sourcePath), error: err.message });
    }
  }
  return results;
});

// Helper to copy directory recursively
async function copyDir(src, dest) {
  await fs.promises.mkdir(dest, { recursive: true });
  const entries = await fs.promises.readdir(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath);
    } else {
      await fs.promises.copyFile(srcPath, destPath);
    }
  }
}

// Open file externally
ipcMain.handle('open-file-external', (event, filePath) => {
  shell.openPath(filePath);
});

// Show in Finder
ipcMain.handle('show-in-finder', (event, filePath) => {
  shell.showItemInFolder(filePath);
});

// Read file contents (text)
ipcMain.handle('read-file', async (event, filePath) => {
  try {
    const content = await fs.promises.readFile(filePath, 'utf-8');
    const stats = await fs.promises.stat(filePath);
    return {
      success: true,
      content,
      size: stats.size,
      name: path.basename(filePath),
      path: filePath
    };
  } catch (err) {
    return {
      success: false,
      error: err.message
    };
  }
});

// Read file as binary (for PDFs, Office docs, etc.)
ipcMain.handle('read-file-binary', async (event, filePath) => {
  try {
    const buffer = await fs.promises.readFile(filePath);
    const stats = await fs.promises.stat(filePath);
    return {
      success: true,
      data: buffer.toString('base64'),
      size: stats.size,
      name: path.basename(filePath),
      path: filePath
    };
  } catch (err) {
    return {
      success: false,
      error: err.message
    };
  }
});

// Open URL externally
ipcMain.handle('open-url-external', (event, url) => {
  shell.openExternal(url);
});

// Process Excel file
ipcMain.handle('process-excel', async (event, filePath) => {
  try {
    const workbook = XLSX.readFile(filePath);
    const sheets = {};

    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });
      sheets[sheetName] = data;
    }

    return {
      success: true,
      sheets,
      sheetNames: workbook.SheetNames,
      name: path.basename(filePath)
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Process Word document
ipcMain.handle('process-word', async (event, filePath) => {
  try {
    const result = await mammoth.convertToHtml({ path: filePath });
    return {
      success: true,
      html: result.value,
      messages: result.messages,
      name: path.basename(filePath)
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Process CSV file
ipcMain.handle('process-csv', async (event, filePath) => {
  try {
    const content = await fs.promises.readFile(filePath, 'utf-8');
    const result = Papa.parse(content, { header: false });
    return {
      success: true,
      data: result.data,
      name: path.basename(filePath)
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Get file path for PDF (we'll render in browser with pdf.js)
ipcMain.handle('get-file-url', (event, filePath) => {
  return `file://${filePath}`;
});

// Check if Claude Code CLI is installed
ipcMain.handle('check-claude-installed', () => {
  return checkClaudeInstalled();
});

// Check if npm is available
ipcMain.handle('check-npm-installed', () => {
  return checkNpmInstalled();
});

// Install Claude Code CLI
ipcMain.handle('install-claude', () => {
  return new Promise((resolve) => {
    if (installProcess) {
      resolve({ success: false, error: 'Installation already in progress' });
      return;
    }

    const env = getEnvWithPath();
    env.TERM = 'xterm-256color';

    // Use npm to install globally
    installProcess = spawn('npm', ['install', '-g', '@anthropic-ai/claude-code'], {
      env,
      shell: true
    });

    let output = '';
    let errorOutput = '';

    installProcess.stdout.on('data', (data) => {
      output += data.toString();
      mainWindow.webContents.send('install-progress', data.toString());
    });

    installProcess.stderr.on('data', (data) => {
      errorOutput += data.toString();
      mainWindow.webContents.send('install-progress', data.toString());
    });

    installProcess.on('close', (code) => {
      installProcess = null;
      if (code === 0) {
        resolve({ success: true, output });
      } else {
        resolve({ success: false, error: errorOutput || 'Installation failed', code });
      }
    });

    installProcess.on('error', (err) => {
      installProcess = null;
      resolve({ success: false, error: err.message });
    });
  });
});

// Open URL for manual install instructions
ipcMain.handle('open-install-guide', () => {
  shell.openExternal('https://github.com/anthropics/claude-code#installation');
});
