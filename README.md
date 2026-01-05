# Claude Code GUI

A native desktop GUI wrapper for [Claude Code CLI](https://github.com/anthropics/claude-code) with integrated file browser, document viewer, and web browser.

## Features

- **Full Terminal Experience**: Run Claude Code in a native terminal emulator (xterm.js)
- **File Explorer**: Browse, expand directories, and manage files
  - Click to open files in tabs
  - Right-click context menu for actions
  - Quick-start button (▶) on folders to start sessions
- **Document Viewer**: View documents directly in the app
  - PDF, Word (.docx), Excel (.xlsx), CSV
  - Images (PNG, JPG, GIF, SVG)
  - Code/text files with line numbers
- **Integrated Browser**: Links clicked in terminal open in browser tabs
- **Split View**: View terminal and files/browser side by side
- **Session History**: Resume recent sessions with one click
- **Drag & Drop**: Drop folders to set working directory, files to copy

## Prerequisites

- [Claude Code CLI](https://github.com/anthropics/claude-code) must be installed and available in PATH
- macOS, Windows, or Linux

## Installation

### From Release (Recommended)

1. Go to [Releases](https://github.com/MarcGyongyosi/ClaudeCodeX/releases)
2. Download the appropriate installer for your platform:
   - macOS: `.dmg` (universal - works on Intel and Apple Silicon)
   - Windows: `.exe` installer
   - Linux: `.AppImage` or `.deb`

#### macOS Installation (Step-by-Step)

Since the app is not signed with an Apple Developer certificate, macOS will show a security warning. Follow these steps:

1. **Download** the `.dmg` file from Releases
2. **Open** the DMG and drag "Claude Code" to Applications
3. **First launch** - Right-click (or Control-click) the app and select "Open"
   - You'll see a warning: "Claude Code cannot be opened because it is from an unidentified developer"
   - Click **Done** (not "Move to Trash")
4. **Allow the app**:
   - Open **System Settings** (or System Preferences on older macOS)
   - Go to **Privacy & Security**
   - Scroll down to the Security section
   - You'll see: "Claude Code was blocked from use because it is not from an identified developer"
   - Click **Open Anyway**
5. **Confirm**: A final dialog will appear - click **Open**
6. The app will now launch and you won't need to repeat these steps

**Note**: You only need to do this once. After the first successful launch, the app will open normally.

### From Source

```bash
# Clone the repository
git clone https://github.com/MarcGyongyosi/ClaudeCodeX.git
cd ClaudeCodeX

# Install dependencies
npm install

# Run in development mode
npm start

# Build for your platform
npm run build
```

## Usage

1. **Select a Working Directory**: Click the folder icon or drop a folder
2. **Start a Session**: Click "Initialize" or the ▶ button on any folder
3. **Work with Files**:
   - Click files in sidebar to open in tabs
   - Right-click for context menu (Add to Context, Open Side by Side)
4. **Split View**: Click the split icon (║) to enable side-by-side view
5. **Resume Sessions**: Click any recent session on the welcome screen

## Keyboard Shortcuts

All Claude Code CLI shortcuts work in the terminal.

## Building Icons

To generate app icons from the SVG:

```bash
# macOS - requires iconutil
# Convert SVG to PNG sizes, then use iconutil to create .icns

# Windows - requires imagemagick
convert assets/icon.svg -resize 256x256 assets/icon.ico

# Linux
convert assets/icon.svg -resize 512x512 assets/icon.png
```

## Development

```bash
# Start in development mode
npm start

# Build for current platform
npm run build

# Build for specific platform
npm run build:mac
npm run build:win
npm run build:linux
```

## Tech Stack

- Electron
- xterm.js (terminal emulator)
- node-pty (pseudo-terminal)
- mammoth (Word documents)
- xlsx (Excel files)
- papaparse (CSV parsing)

## License

Private - All rights reserved
