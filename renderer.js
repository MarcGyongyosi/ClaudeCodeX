// xterm is loaded via script tags - Terminal and FitAddon are globals

// DOM elements
const folderBtn = document.getElementById('folder-btn');
const filesBtn = document.getElementById('files-btn');
const folderPath = document.getElementById('folder-path');
const startBtn = document.getElementById('start-btn');
const stopBtn = document.getElementById('stop-btn');
const dropZone = document.getElementById('drop-zone');
const fileTree = document.getElementById('file-tree');
const refreshFilesBtn = document.getElementById('refresh-files-btn');
const setupScreen = document.getElementById('setup-screen');
const welcomeScreen = document.getElementById('welcome-screen');
const terminalContainer = document.getElementById('terminal-container');
const sessionStatus = document.getElementById('session-status');
const terminalSize = document.getElementById('terminal-size');
const primaryPanel = document.getElementById('primary-panel');
const secondaryPanel = document.getElementById('secondary-panel');
const resizeHandle = document.getElementById('resize-handle');
const splitViewBtn = document.getElementById('split-view-btn');
const contextMenu = document.getElementById('context-menu');
const dirContextMenu = document.getElementById('dir-context-menu');
const tabContextMenu = document.getElementById('tab-context-menu');

// Setup screen elements
const installClaudeBtn = document.getElementById('install-claude-btn');
const manualInstallBtn = document.getElementById('manual-install-btn');
const installStatus = document.getElementById('install-status');
const installOutput = document.getElementById('install-output');
const npmMissing = document.getElementById('npm-missing');
const nodejsLink = document.getElementById('nodejs-link');

let terminal = null;
let fitAddon = null;
let sessionActive = false;
let splitViewActive = false;
let claudeInstalled = false;

// Tab management - now per panel
const tabs = new Map(); // id -> { type, title, tabElement, contentElement, data, panel }
let tabIdCounter = 0;

// Track active tab per panel
const panelState = {
  primary: { activeTabId: 'terminal' },
  secondary: { activeTabId: null }
};

// Get panel elements
function getPanelElements(panelName) {
  const panelEl = panelName === 'secondary' ? secondaryPanel : primaryPanel;
  return {
    panel: panelEl,
    tabBar: panelEl.querySelector('.panel-tabs'),
    content: panelEl.querySelector('.panel-content')
  };
}

// Context menu state
let contextMenuTarget = null;
let tabContextMenuTarget = null; // For tab context menu

// Initialize
async function init() {
  // Check if Claude Code CLI is installed
  claudeInstalled = await window.claude.checkClaudeInstalled();

  if (!claudeInstalled) {
    // Show setup screen
    showSetupScreen();
  } else {
    // Show welcome screen
    showWelcomeScreen();
  }

  const cwd = await window.claude.getCwd();
  updateFolderPath(cwd);
  setupEventListeners();
  setupInstallHandlers();
  await refreshFileTree();

  // Initialize terminal tab in the map
  const primaryElements = getPanelElements('primary');
  const terminalTabEl = primaryElements.tabBar.querySelector('[data-tab-id="terminal"]');

  // Make terminal tab draggable
  terminalTabEl.draggable = true;
  terminalTabEl.addEventListener('dragstart', (e) => {
    e.dataTransfer.setData('text/plain', 'terminal');
    terminalTabEl.classList.add('dragging');
  });
  terminalTabEl.addEventListener('dragend', () => {
    terminalTabEl.classList.remove('dragging');
    document.querySelectorAll('.panel-tabs').forEach(tb => tb.classList.remove('drag-over'));
  });

  tabs.set('terminal', {
    type: 'terminal',
    title: 'Terminal',
    tabElement: terminalTabEl,
    contentElement: document.getElementById('tab-terminal'),
    closeable: false,
    panel: 'primary'
  });

  // Setup tab click handlers for both panels
  setupPanelTabHandlers('primary');
  setupPanelTabHandlers('secondary');

  // Load recent sessions
  updateRecentSessionsUI();
}

// Show setup screen for installing Claude
function showSetupScreen() {
  setupScreen.classList.remove('hidden');
  welcomeScreen.classList.add('hidden');
  terminalContainer.classList.add('hidden');
  startBtn.disabled = true;
}

// Show welcome screen (Claude is installed)
function showWelcomeScreen() {
  setupScreen.classList.add('hidden');
  welcomeScreen.classList.remove('hidden');
  terminalContainer.classList.add('hidden');
  startBtn.disabled = false;
}

// Setup install button handlers
function setupInstallHandlers() {
  if (installClaudeBtn) {
    installClaudeBtn.addEventListener('click', async () => {
      // Check if npm is available
      const npmInstalled = await window.claude.checkNpmInstalled();

      if (!npmInstalled) {
        npmMissing.classList.remove('hidden');
        return;
      }

      // Start installation
      installClaudeBtn.disabled = true;
      installClaudeBtn.innerHTML = '<span class="btn-icon">◌</span> Installing...';
      installStatus.classList.remove('hidden');
      installOutput.textContent = 'Starting installation...\n';

      // Listen for progress
      window.claude.onInstallProgress((data) => {
        installOutput.textContent += data;
        installOutput.scrollTop = installOutput.scrollHeight;
      });

      const result = await window.claude.installClaude();

      if (result.success) {
        installOutput.textContent += '\n✓ Installation complete!\n';
        claudeInstalled = true;

        // Show success and transition to welcome screen
        setTimeout(() => {
          showWelcomeScreen();
        }, 1500);
      } else {
        installOutput.textContent += `\n✗ Installation failed: ${result.error}\n`;
        installClaudeBtn.disabled = false;
        installClaudeBtn.innerHTML = '<span class="btn-icon">▶</span> Retry Installation';
      }
    });
  }

  if (manualInstallBtn) {
    manualInstallBtn.addEventListener('click', () => {
      window.claude.openInstallGuide();
    });
  }

  if (nodejsLink) {
    nodejsLink.addEventListener('click', (e) => {
      e.preventDefault();
      window.claude.openUrlExternal('https://nodejs.org');
    });
  }
}

function updateFolderPath(path) {
  if (path) {
    folderPath.textContent = path;
    folderPath.title = path;
  }
}

// Setup click handlers for a panel's tab bar
function setupPanelTabHandlers(panelName) {
  const { tabBar } = getPanelElements(panelName);

  tabBar.addEventListener('click', (e) => {
    const tabEl = e.target.closest('.tab');
    if (!tabEl) return;

    const tabId = tabEl.dataset.tabId;

    // Check if close button was clicked
    if (e.target.classList.contains('tab-close')) {
      closeTab(tabId);
      return;
    }

    activateTabInPanel(tabId, panelName);
  });

  // Drag and drop for tabs
  tabBar.addEventListener('dragover', (e) => {
    e.preventDefault();
    tabBar.classList.add('drag-over');
  });

  tabBar.addEventListener('dragleave', (e) => {
    if (!tabBar.contains(e.relatedTarget)) {
      tabBar.classList.remove('drag-over');
    }
  });

  tabBar.addEventListener('drop', (e) => {
    e.preventDefault();
    tabBar.classList.remove('drag-over');

    const tabId = e.dataTransfer.getData('text/plain');
    if (tabId && splitViewActive) {
      const tab = tabs.get(tabId);
      if (tab && tab.panel !== panelName) {
        moveTabToPanel(tabId, panelName, true);
      }
    }
  });

  tabBar.addEventListener('contextmenu', (e) => {
    const tabEl = e.target.closest('.tab');
    if (!tabEl) return;

    e.preventDefault();
    const tabId = tabEl.dataset.tabId;

    // Only show context menu if split view is active
    if (!splitViewActive) return;

    tabContextMenuTarget = tabId;

    // Update menu items based on current panel
    const tab = tabs.get(tabId);
    const moveLeftItem = tabContextMenu.querySelector('[data-action="move-left"]');
    const moveRightItem = tabContextMenu.querySelector('[data-action="move-right"]');

    if (tab.panel === 'primary') {
      moveLeftItem.style.display = 'none';
      moveRightItem.style.display = 'block';
    } else {
      moveLeftItem.style.display = 'block';
      moveRightItem.style.display = 'none';
    }

    // Show close option only for closeable tabs
    const closeItem = tabContextMenu.querySelector('[data-action="close-tab"]');
    closeItem.style.display = tab.closeable !== false ? 'block' : 'none';

    tabContextMenu.style.left = e.clientX + 'px';
    tabContextMenu.style.top = e.clientY + 'px';
    tabContextMenu.classList.remove('hidden');

    // Adjust if menu goes off screen
    const rect = tabContextMenu.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
      tabContextMenu.style.left = (e.clientX - rect.width) + 'px';
    }
    if (rect.bottom > window.innerHeight) {
      tabContextMenu.style.top = (e.clientY - rect.height) + 'px';
    }
  });
}

// Event listeners
function setupEventListeners() {
  // Folder selection
  folderBtn.addEventListener('click', async () => {
    const path = await window.claude.selectFolder();
    if (path) {
      updateFolderPath(path);
      await refreshFileTree();
    }
  });

  // File selection (copy to directory)
  filesBtn.addEventListener('click', async () => {
    const files = await window.claude.selectFiles();
    if (files && files.length > 0) {
      await copyFilesToDirectory(files);
    }
  });

  // Refresh file tree
  refreshFilesBtn.addEventListener('click', refreshFileTree);

  // Session controls
  startBtn.addEventListener('click', startSession);
  stopBtn.addEventListener('click', stopSession);

  // Split view toggle
  splitViewBtn.addEventListener('click', toggleSplitView);

  // Drag and drop
  setupDragDrop();

  // Context menu
  setupContextMenu();

  // Resize handle for split view
  setupResizeHandle();

  // Handle window resize
  window.addEventListener('resize', () => {
    if (fitAddon && terminal) {
      fitAddon.fit();
    }
  });

  // Close context menu on click outside
  document.addEventListener('click', (e) => {
    if (!contextMenu.contains(e.target) && !dirContextMenu.contains(e.target) && !tabContextMenu.contains(e.target)) {
      hideContextMenu();
    }
  });
}

// Tab management functions - now panel-aware

// Create a tab in a specific panel
function createTab(type, title, data = {}, panelName = 'primary') {
  const id = `tab-${++tabIdCounter}`;
  const { tabBar, content } = getPanelElements(panelName);

  // Create tab element
  const tabEl = document.createElement('div');
  tabEl.className = 'tab';
  tabEl.dataset.tabId = id;
  tabEl.draggable = true;

  const iconClass = type === 'file' ? 'file' : type === 'browser' ? 'browser' : '';
  const icon = type === 'file' ? '◇' : type === 'browser' ? '◎' : '◆';

  tabEl.innerHTML = `
    <span class="tab-icon ${iconClass}">${icon}</span>
    <span class="tab-title">${escapeHtml(title)}</span>
    <span class="tab-close">×</span>
  `;

  // Drag handlers
  tabEl.addEventListener('dragstart', (e) => {
    e.dataTransfer.setData('text/plain', id);
    tabEl.classList.add('dragging');
  });

  tabEl.addEventListener('dragend', () => {
    tabEl.classList.remove('dragging');
    // Remove drag-over from all tab bars
    document.querySelectorAll('.panel-tabs').forEach(tb => tb.classList.remove('drag-over'));
  });

  tabBar.appendChild(tabEl);

  // Create content element
  const contentEl = document.createElement('div');
  contentEl.className = 'tab-content';
  contentEl.dataset.tabId = id;
  content.appendChild(contentEl);

  // Store tab data
  tabs.set(id, {
    type,
    title,
    tabElement: tabEl,
    contentElement: contentEl,
    closeable: true,
    data,
    panel: panelName
  });

  return id;
}

// Activate a tab within its panel
function activateTabInPanel(tabId, panelName) {
  const tab = tabs.get(tabId);
  if (!tab) return;

  // Deactivate current active tab in this panel
  const currentActiveId = panelState[panelName].activeTabId;
  if (currentActiveId && currentActiveId !== tabId) {
    const currentTab = tabs.get(currentActiveId);
    if (currentTab && currentTab.panel === panelName) {
      currentTab.tabElement.classList.remove('active');
      currentTab.contentElement.classList.remove('active');
    }
  }

  // Activate new tab
  tab.tabElement.classList.add('active');
  tab.contentElement.classList.add('active');
  panelState[panelName].activeTabId = tabId;

  // Refit terminal if activating terminal tab
  if (tabId === 'terminal' && fitAddon && terminal) {
    setTimeout(() => fitAddon.fit(), 10);
  }
}

// Close a tab
function closeTab(tabId) {
  const tab = tabs.get(tabId);
  if (!tab || tab.closeable === false) return;

  const panelName = tab.panel;

  // Remove elements
  tab.tabElement.remove();
  tab.contentElement.remove();
  tabs.delete(tabId);

  // If closing active tab in panel, activate another tab
  if (panelState[panelName].activeTabId === tabId) {
    // Find another tab in the same panel
    let newActiveId = null;
    tabs.forEach((t, id) => {
      if (t.panel === panelName && !newActiveId) {
        newActiveId = id;
      }
    });

    if (newActiveId) {
      activateTabInPanel(newActiveId, panelName);
    } else {
      panelState[panelName].activeTabId = null;
    }
  }
}

// Legacy function for compatibility
function activateTab(tabId) {
  const tab = tabs.get(tabId);
  if (tab) {
    activateTabInPanel(tabId, tab.panel);
  }
}

function findExistingTab(type, identifier) {
  for (const [id, tab] of tabs) {
    if (tab.type === type && tab.data.path === identifier) {
      return id;
    }
  }
  return null;
}

// Get file extension
function getFileExtension(filePath) {
  return filePath.split('.').pop().toLowerCase();
}

// Determine file type category
function getFileType(filePath) {
  const ext = getFileExtension(filePath);
  const typeMap = {
    // Documents
    pdf: 'pdf',
    // Word
    doc: 'word', docx: 'word',
    // Excel
    xls: 'excel', xlsx: 'excel',
    // PowerPoint (will open externally for now)
    ppt: 'powerpoint', pptx: 'powerpoint',
    // CSV
    csv: 'csv',
    // Images
    png: 'image', jpg: 'image', jpeg: 'image', gif: 'image', svg: 'image', webp: 'image',
    // HTML
    html: 'html', htm: 'html',
    // Text/code (default)
  };
  return typeMap[ext] || 'text';
}

// File viewer - handles multiple document types
async function openFileInTab(filePath, inSidePanel = false) {
  // Check if already open
  const existingTabId = findExistingTab('file', filePath);
  if (existingTabId) {
    if (inSidePanel && splitViewActive) {
      moveTabToPanel(existingTabId, 'secondary');
    } else {
      activateTab(existingTabId);
    }
    return;
  }

  const fileType = getFileType(filePath);
  const fileName = filePath.split('/').pop();

  // Create tab first
  const tabId = createTab('file', fileName, { path: filePath });
  const tab = tabs.get(tabId);

  // Show loading state
  tab.contentElement.innerHTML = `
    <div class="file-viewer">
      <div class="file-viewer-header">
        <span>${escapeHtml(filePath)}</span>
      </div>
      <div class="file-viewer-loading">Loading...</div>
    </div>
  `;

  try {
    switch (fileType) {
      case 'pdf':
        await renderPdf(tab, filePath);
        break;
      case 'excel':
        await renderExcel(tab, filePath);
        break;
      case 'word':
        await renderWord(tab, filePath);
        break;
      case 'csv':
        await renderCsv(tab, filePath);
        break;
      case 'image':
        await renderImage(tab, filePath);
        break;
      case 'html':
        await renderHtml(tab, filePath);
        break;
      case 'powerpoint':
        // PowerPoint is complex - offer to open externally
        renderPowerPoint(tab, filePath);
        break;
      default:
        await renderText(tab, filePath);
    }
  } catch (err) {
    tab.contentElement.innerHTML = `
      <div class="file-viewer">
        <div class="file-viewer-header">
          <span>${escapeHtml(filePath)}</span>
        </div>
        <div class="file-viewer-error">Error: ${escapeHtml(err.message)}</div>
      </div>
    `;
  }

  if (inSidePanel && splitViewActive) {
    moveTabToPanel(tabId, 'secondary');
  } else {
    activateTab(tabId);
  }
}

// Render PDF using embed
async function renderPdf(tab, filePath) {
  const fileUrl = await window.claude.getFileUrl(filePath);
  tab.contentElement.innerHTML = `
    <div class="file-viewer pdf-viewer">
      <div class="file-viewer-header">
        <span>${escapeHtml(filePath)}</span>
        <button class="icon-btn open-external-btn" title="Open in Preview">↗</button>
      </div>
      <embed src="${fileUrl}" type="application/pdf" class="pdf-embed" />
    </div>
  `;
  tab.contentElement.querySelector('.open-external-btn')?.addEventListener('click', () => {
    window.claude.openFileExternal(filePath);
  });
}

// Render Excel spreadsheet
async function renderExcel(tab, filePath) {
  const result = await window.claude.processExcel(filePath);
  if (!result.success) throw new Error(result.error);

  // Calculate stats for each sheet
  const sheetStats = {};
  result.sheetNames.forEach(name => {
    const data = result.sheets[name];
    sheetStats[name] = {
      rows: data.length,
      cols: data[0] ? data[0].length : 0
    };
  });

  let sheetsHtml = '';
  if (result.sheetNames.length > 1) {
    sheetsHtml = `
      <div class="sheet-tabs">
        ${result.sheetNames.map((name, i) => `
          <button class="sheet-tab ${i === 0 ? 'active' : ''}" data-sheet="${escapeHtml(name)}">
            ${escapeHtml(name)}
            <span class="sheet-count">${sheetStats[name].rows}×${sheetStats[name].cols}</span>
          </button>
        `).join('')}
      </div>
    `;
  }

  const firstSheet = result.sheetNames[0];
  const statsText = result.sheetNames.length > 1
    ? `${result.sheetNames.length} sheets`
    : `${sheetStats[firstSheet].rows} rows × ${sheetStats[firstSheet].cols} columns`;

  const sheetsContent = result.sheetNames.map((name, i) => {
    const data = result.sheets[name];
    return `
      <div class="sheet-content ${i === 0 ? 'active' : ''}" data-sheet="${escapeHtml(name)}">
        ${renderExcelTable(data)}
      </div>
    `;
  }).join('');

  tab.contentElement.innerHTML = `
    <div class="file-viewer excel-viewer">
      <div class="file-viewer-header">
        <span>${escapeHtml(filePath)}</span>
        <span class="file-stats">${statsText}</span>
        <button class="icon-btn add-to-context-btn" title="Add to Claude context">+</button>
      </div>
      ${sheetsHtml}
      <div class="file-viewer-content table-container excel-table-container">
        ${sheetsContent}
      </div>
    </div>
  `;

  // Sheet tab switching
  tab.contentElement.querySelectorAll('.sheet-tab').forEach(tabBtn => {
    tabBtn.addEventListener('click', () => {
      const sheetName = tabBtn.dataset.sheet;
      tab.contentElement.querySelectorAll('.sheet-tab').forEach(t => t.classList.remove('active'));
      tab.contentElement.querySelectorAll('.sheet-content').forEach(c => c.classList.remove('active'));
      tabBtn.classList.add('active');
      tab.contentElement.querySelector(`.sheet-content[data-sheet="${sheetName}"]`).classList.add('active');
    });
  });

  tab.contentElement.querySelector('.add-to-context-btn')?.addEventListener('click', () => {
    addFileToContext(filePath);
  });
}

// Get Excel-style column letter (A, B, C, ... Z, AA, AB, ...)
function getColumnLetter(index) {
  let letter = '';
  while (index >= 0) {
    letter = String.fromCharCode((index % 26) + 65) + letter;
    index = Math.floor(index / 26) - 1;
  }
  return letter;
}

// Render Excel-style table with row numbers and column letters
function renderExcelTable(data) {
  if (!data || data.length === 0) return '<p class="empty-state">No data</p>';

  const maxRows = 1000;
  const displayData = data.slice(0, maxRows);
  const colCount = displayData[0] ? displayData[0].length : 0;

  let html = '<table class="data-table excel-table"><thead>';

  // Column header row (A, B, C, ...)
  html += '<tr class="column-header-row"><th class="row-number-header"></th>';
  for (let c = 0; c < colCount; c++) {
    html += `<th class="column-letter">${getColumnLetter(c)}</th>`;
  }
  html += '</tr>';

  // Data header row (first row of data)
  if (displayData[0]) {
    html += '<tr class="data-header-row"><th class="row-number">1</th>';
    displayData[0].forEach((cell) => {
      html += `<th>${escapeHtml(String(cell ?? ''))}</th>`;
    });
    html += '</tr>';
  }
  html += '</thead><tbody>';

  // Data rows
  for (let i = 1; i < displayData.length; i++) {
    const row = displayData[i];
    html += `<tr><td class="row-number">${i + 1}</td>`;
    for (let c = 0; c < colCount; c++) {
      const cell = row[c];
      const cellValue = cell ?? '';
      const isNumber = typeof cell === 'number' || (typeof cell === 'string' && !isNaN(parseFloat(cell)) && cell.trim() !== '');
      const cellClass = isNumber ? 'cell-number' : '';
      html += `<td class="${cellClass}">${escapeHtml(String(cellValue))}</td>`;
    }
    html += '</tr>';
  }

  html += '</tbody></table>';

  if (data.length > maxRows) {
    html += `<p class="table-truncated">Showing ${maxRows} of ${data.length} rows</p>`;
  }

  return html;
}

// Render Word document
async function renderWord(tab, filePath) {
  const result = await window.claude.processWord(filePath);
  if (!result.success) throw new Error(result.error);

  tab.contentElement.innerHTML = `
    <div class="file-viewer word-viewer">
      <div class="file-viewer-header">
        <span>${escapeHtml(filePath)}</span>
        <button class="icon-btn add-to-context-btn" title="Add to Claude context">+</button>
      </div>
      <div class="file-viewer-content word-content">${result.html}</div>
    </div>
  `;

  tab.contentElement.querySelector('.add-to-context-btn')?.addEventListener('click', () => {
    addFileToContext(filePath);
  });
}

// Render CSV as table
async function renderCsv(tab, filePath) {
  const result = await window.claude.processCsv(filePath);
  if (!result.success) throw new Error(result.error);

  tab.contentElement.innerHTML = `
    <div class="file-viewer csv-viewer">
      <div class="file-viewer-header">
        <span>${escapeHtml(filePath)}</span>
        <button class="icon-btn add-to-context-btn" title="Add to Claude context">+</button>
      </div>
      <div class="file-viewer-content table-container">
        ${renderTable(result.data)}
      </div>
    </div>
  `;

  tab.contentElement.querySelector('.add-to-context-btn')?.addEventListener('click', () => {
    addFileToContext(filePath);
  });
}

// Render image
async function renderImage(tab, filePath) {
  const fileUrl = await window.claude.getFileUrl(filePath);
  tab.contentElement.innerHTML = `
    <div class="file-viewer image-viewer">
      <div class="file-viewer-header">
        <span>${escapeHtml(filePath)}</span>
        <button class="icon-btn add-to-context-btn" title="Add to Claude context">+</button>
      </div>
      <div class="file-viewer-content image-container">
        <img src="${fileUrl}" alt="${escapeHtml(filePath)}" />
      </div>
    </div>
  `;

  tab.contentElement.querySelector('.add-to-context-btn')?.addEventListener('click', () => {
    addFileToContext(filePath);
  });
}

// Render HTML with preview toggle
async function renderHtml(tab, filePath) {
  const result = await window.claude.readFile(filePath);
  if (!result.success) throw new Error(result.error);

  const fileUrl = await window.claude.getFileUrl(filePath);

  // Create viewer with toggle
  tab.contentElement.innerHTML = `
    <div class="file-viewer html-viewer">
      <div class="file-viewer-header">
        <span>${escapeHtml(filePath)}</span>
        <div class="view-toggle">
          <button class="toggle-btn active" data-view="preview" title="Preview">◉ Preview</button>
          <button class="toggle-btn" data-view="source" title="Source">◇ Source</button>
        </div>
        <button class="icon-btn add-to-context-btn" title="Add to Claude context">+</button>
      </div>
      <div class="html-preview-container active" data-view="preview">
        <webview class="html-preview" src="${fileUrl}" allowpopups></webview>
      </div>
      <div class="html-source-container" data-view="source">
        <pre class="html-source">${escapeHtml(result.content)}</pre>
      </div>
    </div>
  `;

  // Toggle handlers
  const toggleBtns = tab.contentElement.querySelectorAll('.toggle-btn');
  const previewContainer = tab.contentElement.querySelector('.html-preview-container');
  const sourceContainer = tab.contentElement.querySelector('.html-source-container');

  toggleBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const view = btn.dataset.view;
      toggleBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      if (view === 'preview') {
        previewContainer.classList.add('active');
        sourceContainer.classList.remove('active');
      } else {
        previewContainer.classList.remove('active');
        sourceContainer.classList.add('active');
      }
    });
  });

  tab.contentElement.querySelector('.add-to-context-btn')?.addEventListener('click', () => {
    addFileToContext(filePath);
  });
}

// Render PowerPoint - offer to open externally
function renderPowerPoint(tab, filePath) {
  tab.contentElement.innerHTML = `
    <div class="file-viewer pptx-viewer">
      <div class="file-viewer-header">
        <span>${escapeHtml(filePath)}</span>
      </div>
      <div class="file-viewer-content pptx-placeholder">
        <div class="pptx-icon">📊</div>
        <p>PowerPoint files are best viewed in their native application.</p>
        <button class="btn btn-primary open-pptx-btn">Open in PowerPoint</button>
      </div>
    </div>
  `;

  tab.contentElement.querySelector('.open-pptx-btn')?.addEventListener('click', () => {
    window.claude.openFileExternal(filePath);
  });
}

// Render plain text/code
async function renderText(tab, filePath) {
  const result = await window.claude.readFile(filePath);
  if (!result.success) throw new Error(result.error);

  const lines = result.content.split('\n');
  const lineNumberedContent = lines.map((line, i) =>
    `<span class="line-number">${i + 1}</span>${escapeHtml(line)}`
  ).join('\n');

  tab.contentElement.innerHTML = `
    <div class="file-viewer">
      <div class="file-viewer-header">
        <span>${escapeHtml(filePath)}</span>
        <button class="icon-btn add-to-context-btn" title="Add to Claude context">+</button>
      </div>
      <div class="file-viewer-content">${lineNumberedContent}</div>
    </div>
  `;

  tab.contentElement.querySelector('.add-to-context-btn')?.addEventListener('click', () => {
    addFileToContext(filePath);
  });
}

// Helper to render table from 2D array
function renderTable(data) {
  if (!data || data.length === 0) return '<p class="empty-state">No data</p>';

  const maxRows = 1000; // Limit for performance
  const displayData = data.slice(0, maxRows);

  let html = '<table class="data-table"><thead><tr>';

  // First row as header
  if (displayData[0]) {
    displayData[0].forEach((cell, i) => {
      html += `<th>${escapeHtml(String(cell ?? ''))}</th>`;
    });
  }
  html += '</tr></thead><tbody>';

  // Rest as data rows
  for (let i = 1; i < displayData.length; i++) {
    html += '<tr>';
    displayData[i].forEach(cell => {
      html += `<td>${escapeHtml(String(cell ?? ''))}</td>`;
    });
    html += '</tr>';
  }

  html += '</tbody></table>';

  if (data.length > maxRows) {
    html += `<p class="table-truncated">Showing ${maxRows} of ${data.length} rows</p>`;
  }

  return html;
}

// Browser tab
function openUrlInTab(url, inSidePanel = false) {
  // Check if already open
  const existingTabId = findExistingTab('browser', url);
  if (existingTabId) {
    if (inSidePanel && splitViewActive) {
      moveTabToPanel(existingTabId, 'secondary');
    } else {
      activateTab(existingTabId);
    }
    return;
  }

  // Extract domain for title
  let title;
  try {
    title = new URL(url).hostname;
  } catch {
    title = 'Browser';
  }

  // Create tab
  const tabId = createTab('browser', title, { path: url });
  const tab = tabs.get(tabId);

  // Create browser content with webview
  tab.contentElement.innerHTML = `
    <div class="browser-container">
      <div class="browser-toolbar">
        <button class="icon-btn browser-back" title="Back">←</button>
        <button class="icon-btn browser-forward" title="Forward">→</button>
        <button class="icon-btn browser-refresh" title="Refresh">↻</button>
        <div class="browser-url">${escapeHtml(url)}</div>
        <button class="icon-btn browser-external" title="Open in browser">↗</button>
      </div>
      <webview class="browser-webview" src="${escapeHtml(url)}" allowpopups></webview>
    </div>
  `;

  const webview = tab.contentElement.querySelector('webview');
  const urlDisplay = tab.contentElement.querySelector('.browser-url');

  // Navigation handlers
  tab.contentElement.querySelector('.browser-back').addEventListener('click', () => {
    if (webview.canGoBack()) webview.goBack();
  });

  tab.contentElement.querySelector('.browser-forward').addEventListener('click', () => {
    if (webview.canGoForward()) webview.goForward();
  });

  tab.contentElement.querySelector('.browser-refresh').addEventListener('click', () => {
    webview.reload();
  });

  tab.contentElement.querySelector('.browser-external').addEventListener('click', () => {
    window.claude.openUrlExternal(webview.getURL());
  });

  // Update URL display on navigation
  webview.addEventListener('did-navigate', (e) => {
    urlDisplay.textContent = e.url;
  });

  webview.addEventListener('did-navigate-in-page', (e) => {
    urlDisplay.textContent = e.url;
  });

  if (inSidePanel && splitViewActive) {
    moveTabToPanel(tabId, 'secondary');
  } else {
    activateTab(tabId);
  }
}

// Split view
function toggleSplitView() {
  splitViewActive = !splitViewActive;

  if (splitViewActive) {
    secondaryPanel.classList.remove('hidden');
    resizeHandle.classList.remove('hidden');
    splitViewBtn.classList.add('active');

    // Ensure proper flex layout
    primaryPanel.style.flex = '1';
    secondaryPanel.style.flex = '1';

    // If current active tab in primary is not terminal, move it to secondary
    const primaryActiveId = panelState.primary.activeTabId;
    if (primaryActiveId && primaryActiveId !== 'terminal') {
      moveTabToPanel(primaryActiveId, 'secondary');
      // Make sure terminal is active in primary
      activateTabInPanel('terminal', 'primary');
    }

    // Refit terminal
    if (fitAddon && terminal) {
      setTimeout(() => fitAddon.fit(), 50);
    }
  } else {
    // Move all tabs from secondary back to primary
    const tabsToMove = [];
    tabs.forEach((tab, id) => {
      if (tab.panel === 'secondary') {
        tabsToMove.push(id);
      }
    });

    tabsToMove.forEach(tabId => {
      moveTabToPanel(tabId, 'primary', false); // Don't activate, just move
    });

    secondaryPanel.classList.add('hidden');
    resizeHandle.classList.add('hidden');
    splitViewBtn.classList.remove('active');

    // Reset panel widths
    primaryPanel.style.flex = '1';
    primaryPanel.style.width = '';
    secondaryPanel.style.flex = '';

    // Clear secondary panel state
    panelState.secondary.activeTabId = null;

    // Make sure primary has an active tab
    if (panelState.primary.activeTabId) {
      const activeTab = tabs.get(panelState.primary.activeTabId);
      if (activeTab) {
        activeTab.tabElement.classList.add('active');
        activeTab.contentElement.classList.add('active');
      }
    }

    // Refit terminal
    if (fitAddon && terminal) {
      setTimeout(() => fitAddon.fit(), 10);
    }
  }
}

// Move a tab to a different panel
function moveTabToPanel(tabId, targetPanelName, activate = true) {
  const tab = tabs.get(tabId);
  if (!tab) return;

  const sourcePanelName = tab.panel;
  if (sourcePanelName === targetPanelName) return;

  const { tabBar: sourceTabBar, content: sourceContent } = getPanelElements(sourcePanelName);
  const { tabBar: targetTabBar, content: targetContent } = getPanelElements(targetPanelName);

  // Remove active state from tab
  tab.tabElement.classList.remove('active');
  tab.contentElement.classList.remove('active');

  // Move tab element to target tab bar
  targetTabBar.appendChild(tab.tabElement);

  // Move content element to target content area
  targetContent.appendChild(tab.contentElement);

  // Update tab's panel
  tab.panel = targetPanelName;

  // Update source panel: if this was the active tab, activate another
  if (panelState[sourcePanelName].activeTabId === tabId) {
    let newActiveId = null;
    // Prefer terminal
    if (sourcePanelName === 'primary') {
      const terminalTab = tabs.get('terminal');
      if (terminalTab && terminalTab.panel === 'primary') {
        newActiveId = 'terminal';
      }
    }
    // Otherwise find any tab in source panel
    if (!newActiveId) {
      tabs.forEach((t, id) => {
        if (t.panel === sourcePanelName && !newActiveId) {
          newActiveId = id;
        }
      });
    }

    if (newActiveId) {
      activateTabInPanel(newActiveId, sourcePanelName);
    } else {
      panelState[sourcePanelName].activeTabId = null;
    }
  }

  // Activate in target panel if requested
  if (activate) {
    activateTabInPanel(tabId, targetPanelName);
  }

  // Refit terminal if it was involved
  if (tabId === 'terminal' && fitAddon && terminal) {
    setTimeout(() => fitAddon.fit(), 50);
  }
}

function setupResizeHandle() {
  let startX, startWidth;

  resizeHandle.addEventListener('mousedown', (e) => {
    startX = e.clientX;
    startWidth = primaryPanel.offsetWidth;
    resizeHandle.classList.add('dragging');

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  });

  function onMouseMove(e) {
    const diff = e.clientX - startX;
    const newWidth = startWidth + diff;
    const containerWidth = primaryPanel.parentElement.offsetWidth;

    // Limit to reasonable bounds
    if (newWidth > 200 && newWidth < containerWidth - 200) {
      primaryPanel.style.flex = 'none';
      primaryPanel.style.width = newWidth + 'px';
    }
  }

  function onMouseUp() {
    resizeHandle.classList.remove('dragging');
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);

    // Refit terminal if visible
    if (fitAddon && terminal) {
      fitAddon.fit();
    }
  }
}

// Context menu
function setupContextMenu() {
  contextMenu.addEventListener('click', handleContextMenuAction);
  dirContextMenu.addEventListener('click', handleDirContextMenuAction);
  tabContextMenu.addEventListener('click', handleTabContextMenuAction);
}

function showContextMenu(x, y, target) {
  const isDirectory = target.classList.contains('directory');
  const menu = isDirectory ? dirContextMenu : contextMenu;
  const otherMenu = isDirectory ? contextMenu : dirContextMenu;

  // Hide other menu
  otherMenu.classList.add('hidden');

  contextMenuTarget = target;
  menu.style.left = x + 'px';
  menu.style.top = y + 'px';
  menu.classList.remove('hidden');

  // Adjust if menu goes off screen
  const rect = menu.getBoundingClientRect();
  if (rect.right > window.innerWidth) {
    menu.style.left = (x - rect.width) + 'px';
  }
  if (rect.bottom > window.innerHeight) {
    menu.style.top = (y - rect.height) + 'px';
  }
}

function hideContextMenu() {
  contextMenu.classList.add('hidden');
  dirContextMenu.classList.add('hidden');
  tabContextMenu.classList.add('hidden');
  contextMenuTarget = null;
  tabContextMenuTarget = null;
}

function handleContextMenuAction(e) {
  const action = e.target.dataset.action;
  if (!action || !contextMenuTarget) return;

  const filePath = contextMenuTarget.dataset.path;

  switch (action) {
    case 'open':
      openFileInTab(filePath);
      break;
    case 'add-context':
      addFileToContext(filePath);
      break;
    case 'open-side':
      if (!splitViewActive) toggleSplitView();
      openFileInTab(filePath, true);
      break;
    case 'show-finder':
      window.claude.showInFinder(filePath);
      break;
  }

  hideContextMenu();
}

async function handleDirContextMenuAction(e) {
  const action = e.target.dataset.action;
  if (!action || !contextMenuTarget) return;

  const dirPath = contextMenuTarget.dataset.path;

  switch (action) {
    case 'set-cwd':
      await window.claude.setCwd(dirPath);
      updateFolderPath(dirPath);
      expandedDirs.clear();
      await refreshFileTree();
      break;
    case 'expand-all':
      await expandAllInDirectory(dirPath, contextMenuTarget);
      break;
    case 'show-finder':
      window.claude.showInFinder(dirPath);
      break;
  }

  hideContextMenu();
}

// Handle tab context menu actions
function handleTabContextMenuAction(e) {
  const action = e.target.dataset.action;
  if (!action || !tabContextMenuTarget) return;

  const tabId = tabContextMenuTarget;
  const tab = tabs.get(tabId);

  switch (action) {
    case 'move-left':
      moveTabToPanelWithUI(tabId, 'primary');
      break;
    case 'move-right':
      moveTabToPanelWithUI(tabId, 'secondary');
      break;
    case 'close-tab':
      closeTab(tabId);
      break;
  }

  hideContextMenu();
}

// Move tab to a panel (called from context menu)
function moveTabToPanelWithUI(tabId, panelName) {
  moveTabToPanel(tabId, panelName, true);
}

// Recursively expand all subdirectories
async function expandAllInDirectory(dirPath, itemElement) {
  // First expand this directory if not already
  if (!expandedDirs.has(dirPath)) {
    await toggleDirectory(dirPath, itemElement);
  }

  // Find all child directories and expand them
  const childContainer = fileTree.querySelector(`.file-children[data-parent-path="${CSS.escape(dirPath)}"]`);
  if (childContainer) {
    const childDirs = childContainer.querySelectorAll(':scope > .file-item.directory');
    for (const childDir of childDirs) {
      await expandAllInDirectory(childDir.dataset.path, childDir);
    }
  }
}

// Add file to Claude context
function addFileToContext(filePath) {
  if (!sessionActive || !terminal) {
    console.log('Session not active');
    return;
  }

  // Type the file path into the terminal (user can then reference it)
  const fileName = filePath.split('/').pop();
  // Just send the @filename pattern that Claude understands
  terminal.paste(`@${fileName} `);
  terminal.focus();
}

// Track expanded directories
const expandedDirs = new Set();

// File tree with expandable directories
async function refreshFileTree() {
  const files = await window.claude.listFiles();

  if (files.length === 0) {
    fileTree.innerHTML = '<div class="empty-state">No files</div>';
    return;
  }

  fileTree.innerHTML = '';
  await renderFileItems(files, fileTree, 0);
}

// Render file items at a given depth
async function renderFileItems(files, container, depth) {
  for (const file of files) {
    const item = createFileItem(file, depth);
    container.appendChild(item);

    // If directory is expanded, render its children
    if (file.isDirectory && expandedDirs.has(file.path)) {
      const childContainer = document.createElement('div');
      childContainer.className = 'file-children';
      childContainer.dataset.parentPath = file.path;
      container.appendChild(childContainer);

      const children = await window.claude.listDirectory(file.path);
      await renderFileItems(children, childContainer, depth + 1);
    }
  }
}

// Create a single file item element
function createFileItem(file, depth) {
  const item = document.createElement('div');
  item.className = `file-item ${file.isDirectory ? 'directory' : ''}`;
  item.dataset.path = file.path;
  item.style.paddingLeft = `${12 + depth * 16}px`;

  const isExpanded = expandedDirs.has(file.path);
  const icon = file.isDirectory ? (isExpanded ? '▼' : '▶') : '◇';

  if (file.isDirectory) {
    item.innerHTML = `
      <span class="icon">${icon}</span>
      <span class="name">${escapeHtml(file.name)}</span>
      <button class="quick-start-btn" title="Start Claude session here">▶</button>
    `;
  } else {
    item.innerHTML = `
      <span class="icon">${icon}</span>
      <span class="name">${escapeHtml(file.name)}</span>
    `;
  }

  // Quick start button handler for directories
  const quickStartBtn = item.querySelector('.quick-start-btn');
  if (quickStartBtn) {
    quickStartBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await startSessionInDirectory(file.path);
    });
  }

  // Click handler
  item.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (e.button !== 0) return;
    // Ignore if clicking on quick start button
    if (e.target.classList.contains('quick-start-btn')) return;

    if (file.isDirectory) {
      await toggleDirectory(file.path, item);
    } else {
      openFileInTab(file.path);
    }
  });

  // Right click - context menu
  item.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    e.stopPropagation();
    showContextMenu(e.clientX, e.clientY, item);
  });

  return item;
}

// Toggle directory expansion
async function toggleDirectory(dirPath, itemElement) {
  const isExpanded = expandedDirs.has(dirPath);

  if (isExpanded) {
    // Collapse
    expandedDirs.delete(dirPath);
    const childContainer = fileTree.querySelector(`.file-children[data-parent-path="${CSS.escape(dirPath)}"]`);
    if (childContainer) {
      childContainer.remove();
    }
    // Update icon
    const icon = itemElement.querySelector('.icon');
    if (icon) icon.textContent = '▶';
  } else {
    // Expand
    expandedDirs.add(dirPath);

    // Update icon
    const icon = itemElement.querySelector('.icon');
    if (icon) icon.textContent = '▼';

    // Create child container
    const childContainer = document.createElement('div');
    childContainer.className = 'file-children';
    childContainer.dataset.parentPath = dirPath;

    // Insert after the item
    itemElement.insertAdjacentElement('afterend', childContainer);

    // Load and render children
    const children = await window.claude.listDirectory(dirPath);
    const depth = parseInt(itemElement.style.paddingLeft) / 16;
    await renderFileItems(children, childContainer, depth);
  }
}

// Drag and drop
function setupDragDrop() {
  const contentArea = document.getElementById('content-area');

  contentArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.remove('hidden');
  });

  contentArea.addEventListener('dragleave', (e) => {
    if (e.target === contentArea || !contentArea.contains(e.relatedTarget)) {
      dropZone.classList.add('hidden');
    }
  });

  contentArea.addEventListener('drop', async (e) => {
    e.preventDefault();
    dropZone.classList.add('hidden');

    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;

    // Check if it's a single folder being dropped
    const firstFile = files[0];
    if (files.length === 1 && !firstFile.type) {
      // Likely a folder - set as working directory
      await window.claude.setCwd(firstFile.path);
      updateFolderPath(firstFile.path);
      await refreshFileTree();
      return;
    }

    // Copy files to current directory
    const filePaths = files.map(f => f.path);
    await copyFilesToDirectory(filePaths);
  });
}

// Copy files to current working directory
async function copyFilesToDirectory(filePaths) {
  const results = await window.claude.copyFiles(filePaths);

  const succeeded = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);

  if (succeeded.length > 0) {
    console.log('Copied:', succeeded.map(r => r.name).join(', '));
  }
  if (failed.length > 0) {
    console.log('Failed:', failed.map(r => `${r.name} (${r.error})`).join(', '));
  }

  await refreshFileTree();
}

// Terminal setup
function createTerminal() {
  terminal = new window.Terminal({
    fontFamily: '"IBM Plex Mono", "SF Mono", Monaco, Menlo, monospace',
    fontSize: 13,
    lineHeight: 1.4,
    cursorBlink: true,
    cursorStyle: 'bar',
    theme: {
      background: '#161616',
      foreground: '#f4f4f4',
      cursor: '#E20000',
      cursorAccent: '#161616',
      selectionBackground: '#525252',
      black: '#161616',
      red: '#E20000',
      green: '#24a148',
      yellow: '#f1c21b',
      blue: '#0f62fe',
      magenta: '#8a3ffc',
      cyan: '#1192e8',
      white: '#f4f4f4',
      brightBlack: '#525252',
      brightRed: '#fa4d56',
      brightGreen: '#42be65',
      brightYellow: '#f1c21b',
      brightBlue: '#4589ff',
      brightMagenta: '#a56eff',
      brightCyan: '#33b1ff',
      brightWhite: '#ffffff'
    },
    allowProposedApi: true
  });

  fitAddon = new window.FitAddon.FitAddon();
  terminal.loadAddon(fitAddon);

  // Add web links addon to make URLs clickable
  const webLinksAddon = new window.WebLinksAddon.WebLinksAddon((event, uri) => {
    // Open links in browser tab instead of external browser
    openUrlInTab(uri);
  });
  terminal.loadAddon(webLinksAddon);

  terminal.open(terminalContainer);
  fitAddon.fit();

  updateSizeDisplay();

  // Handle user input - send to PTY
  terminal.onData((data) => {
    if (sessionActive) {
      window.claude.terminalInput(data);

      // Clear input-needed state when user provides input
      sessionStatus.textContent = 'LIVE';
      sessionStatus.classList.remove('input-needed');
      sessionStatus.classList.add('live');

      // Remove attention indicator from terminal tab
      const terminalTab = tabs.get('terminal');
      if (terminalTab && terminalTab.tabElement) {
        terminalTab.tabElement.classList.remove('needs-attention');
      }
    }
  });

  // Handle resize
  terminal.onResize(({ cols, rows }) => {
    if (sessionActive) {
      window.claude.terminalResize(cols, rows);
    }
    updateSizeDisplay();
  });

  return terminal;
}

function updateSizeDisplay() {
  if (terminal) {
    terminalSize.textContent = `${terminal.cols}×${terminal.rows}`;
  }
}

// Session history
const MAX_RECENT_SESSIONS = 10;

function getRecentSessions() {
  try {
    const stored = localStorage.getItem('recentSessions');
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function saveSessionToHistory(dirPath) {
  const sessions = getRecentSessions();
  // Remove if already exists
  const filtered = sessions.filter(s => s.path !== dirPath);
  // Add to front
  filtered.unshift({
    path: dirPath,
    name: dirPath.split('/').pop(),
    timestamp: Date.now()
  });
  // Limit size
  const trimmed = filtered.slice(0, MAX_RECENT_SESSIONS);
  localStorage.setItem('recentSessions', JSON.stringify(trimmed));
  updateRecentSessionsUI();
}

function updateRecentSessionsUI() {
  const recentList = document.getElementById('recent-sessions-list');
  if (!recentList) return;

  const sessions = getRecentSessions();
  if (sessions.length === 0) {
    recentList.innerHTML = '<div class="empty-state">No recent sessions</div>';
    return;
  }

  recentList.innerHTML = sessions.map(session => `
    <div class="recent-session-item" data-path="${escapeHtml(session.path)}">
      <span class="recent-session-icon">◆</span>
      <span class="recent-session-name">${escapeHtml(session.name)}</span>
      <span class="recent-session-path">${escapeHtml(session.path)}</span>
    </div>
  `).join('');

  // Add click handlers
  recentList.querySelectorAll('.recent-session-item').forEach(item => {
    item.addEventListener('click', () => {
      startSessionInDirectory(item.dataset.path);
    });
  });
}

// Start session in a specific directory
async function startSessionInDirectory(dirPath) {
  await window.claude.setCwd(dirPath);
  updateFolderPath(dirPath);
  expandedDirs.clear();
  await refreshFileTree();
  await startSession();
}

// Session management
async function startSession() {
  // Re-check Claude installation (in case user installed manually)
  if (!claudeInstalled) {
    claudeInstalled = await window.claude.checkClaudeInstalled();
    if (!claudeInstalled) {
      showSetupScreen();
      return;
    }
    showWelcomeScreen();
  }

  const cwd = await window.claude.getCwd();
  if (!cwd) {
    alert('Please select a working directory first');
    return;
  }

  // Save to session history
  saveSessionToHistory(cwd);

  if (!terminal) {
    createTerminal();
  }

  welcomeScreen.classList.add('hidden');
  terminalContainer.classList.remove('hidden');

  setTimeout(() => {
    fitAddon.fit();
    updateSizeDisplay();
    window.claude.startTerminal(terminal.cols, terminal.rows);
  }, 100);

  sessionActive = true;
  sessionStatus.textContent = 'LIVE';
  sessionStatus.classList.add('live');

  startBtn.style.display = 'none';
  stopBtn.style.display = 'block';

  terminal.focus();

  window.claude.onTerminalData((data) => {
    terminal.write(data);
  });

  window.claude.onTerminalExit((code) => {
    sessionActive = false;
    sessionStatus.textContent = `EXITED (${code})`;
    sessionStatus.classList.remove('live');
    sessionStatus.classList.remove('input-needed');

    startBtn.style.display = 'block';
    stopBtn.style.display = 'none';

    terminal.write('\r\n\x1b[90m--- Session ended ---\x1b[0m\r\n');
  });

  // Listen for input-needed notifications
  window.claude.onInputNeeded((data) => {
    // Add visual indicator to status
    sessionStatus.textContent = 'INPUT NEEDED';
    sessionStatus.classList.add('input-needed');

    // Flash the terminal tab if not visible
    const terminalTab = tabs.get('terminal');
    if (terminalTab && terminalTab.tabElement) {
      terminalTab.tabElement.classList.add('needs-attention');
    }
  });
}

async function stopSession() {
  await window.claude.stopTerminal();
  sessionActive = false;

  sessionStatus.textContent = 'STOPPED';
  sessionStatus.classList.remove('live');

  startBtn.style.display = 'block';
  stopBtn.style.display = 'none';
}

// Utility
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Initialize the app
init();
