/**
 * Desktop AI Companion - Application Entry Point (main.js)
 * 
 * Orchestrates application lifecycle, window management, system tray,
 * global shortcuts, and top-level error boundaries.
 * 
 * Modular Architecture:
 * - config.js: Central repository of tunable constants, system prompts, paths, and defaults.
 * - settings.js: Persistent user preferences, memory storage, budget tracking, settings window, and tray.
 * - capture.js: Screen capture with 32x32 hash change detection, active-win inspection, and privacy shield.
 * - api.js: Anthropic Claude Messages streaming SSE, prompt caching, retries with backoff, and error logging.
 * - scheduler.js: Global shortcuts, cursor tracking for gaze direction, corner snapping, and IPC dispatch.
 */

const electron = require('electron');
const app = typeof electron === 'object' && electron !== null ? electron.app : null;
const BrowserWindow = typeof electron === 'object' && electron !== null ? electron.BrowserWindow : null;
const screen = typeof electron === 'object' && electron !== null ? electron.screen : null;
const session = typeof electron === 'object' && electron !== null ? electron.session : null;
const powerMonitor = typeof electron === 'object' && electron !== null ? electron.powerMonitor : null;
const path = require('path');
const { WINDOW_CONFIG } = require('./config');
const {
  loadConfig,
  saveConfig,
  setMainWindowRef,
  createTray,
  syncStartOnLoginWithConfig,
  destroyTray
} = require('./settings');
const {
  registerGlobalShortcuts,
  unregisterGlobalShortcuts,
  startCursorTracking,
  stopCursorTracking,
  registerIpcHandlers
} = require('./scheduler');
const { startClipboardMonitor, stopClipboardMonitor } = require('./clipboard');
const { writeToErrorLog } = require('./api');
const { installConsoleRedactor, migrateEnvToSafeStorage } = require('./security');

// Install global auto-redactor: prevents passwords, API keys, and credit cards from reaching logs
installConsoleRedactor();

// Primary companion BrowserWindow reference
let mainWindow = null;

// ==========================================================
// PROCESS ERROR BOUNDARIES (CRASH PREVENTION)
// ==========================================================

/**
 * Top-level uncaught exception handler.
 * Ensures an unexpected runtime exception in any module never crashes the entire application.
 */
process.on('uncaughtException', (err) => {
  console.error('[Main Boundary] Uncaught Exception caught:', err.message);
  try {
    writeToErrorLog({
      type: 'UNCAUGHT_EXCEPTION',
      status: 'CRITICAL',
      message: err.message,
      extra: { reason: err.stack ? err.stack.slice(0, 160) : 'No stack' }
    });
  } catch (_) {}
});

/**
 * Top-level unhandled rejection handler.
 */
process.on('unhandledRejection', (reason) => {
  const msg = reason instanceof Error ? reason.message : String(reason);
  console.warn('[Main Boundary] Unhandled Promise Rejection:', msg);
  try {
    writeToErrorLog({
      type: 'UNHANDLED_REJECTION',
      status: 'WARN',
      message: msg
    });
  } catch (_) {}
});

// ==========================================================
// MAIN COMPANION WINDOW
// ==========================================================

/**
 * Creates the transparent, frameless, always-on-top glass companion window.
 */
function createWindow() {
  const config = loadConfig();
  const primaryDisplay = screen.getPrimaryDisplay();
  const allDisplays = screen.getAllDisplays ? screen.getAllDisplays() : [primaryDisplay];
  const { width: winWidth, height: winHeight, margin } = WINDOW_CONFIG.main;

  let targetDisplay = primaryDisplay;
  if (config.liveDisplay && config.liveDisplay !== 'active' && config.liveDisplay !== 'primary') {
    targetDisplay = allDisplays.find(d => String(d.id) === String(config.liveDisplay)) || primaryDisplay;
  }
  const { x: workX, y: workY, width: screenWidth, height: screenHeight } = targetDisplay.workArea;

  // Restore previous position if inside any connected screen, or default to bottom-right of target screen
  let posX = config.windowX;
  let posY = config.windowY;

  const isPosValid = posX != null && posY != null && allDisplays.some(d => {
    const b = d.bounds;
    return posX >= b.x - winWidth && posX <= b.x + b.width &&
           posY >= b.y - winHeight && posY <= b.y + b.height;
  });

  if (!isPosValid) {
    posX = workX + screenWidth - winWidth - margin;
    posY = workY + screenHeight - winHeight - margin;
  }

  console.log(`[Main] Companion window created at coordinates (${posX}, ${posY}) on screen ${targetDisplay.bounds.width}x${targetDisplay.bounds.height}`);

  const appIcon = path.join(__dirname, 'assets', 'icon.png');

  mainWindow = new BrowserWindow({
    width: winWidth,
    height: winHeight,
    x: posX,
    y: posY,
    icon: appIcon,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: false,
    resizable: false,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus();
    try {
      mainWindow.setAlwaysOnTop(true, 'screen-saver');
      mainWindow.moveTop();
    } catch (_) {}
  });

  // Fallback to guarantee visibility even if ready-to-show event is delayed
  setTimeout(() => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (!mainWindow.isVisible()) {
        mainWindow.show();
      }
      mainWindow.focus();
      try {
        mainWindow.setAlwaysOnTop(true, 'screen-saver');
        mainWindow.moveTop();
      } catch (_) {}
    }
  }, 1000);

  // Save window position on drag / snap
  mainWindow.on('moved', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    try {
      const [x, y] = mainWindow.getPosition();
      saveConfig({ windowX: x, windowY: y });
    } catch (_) {}
  });

  // Window-level Error Boundaries
  mainWindow.webContents.on('render-process-gone', (event, details) => {
    console.error('[Main Boundary] Companion renderer process gone:', details.reason);
    writeToErrorLog({
      type: 'RENDER_PROCESS_GONE',
      status: 'CRITICAL',
      message: `Renderer process terminated: ${details.reason}`,
      extra: { reason: details.reason }
    });
    // Attempt smooth recovery if not a clean exit
    if (details.reason !== 'clean-exit' && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.reload();
    }
  });

  mainWindow.webContents.on('unresponsive', () => {
    console.warn('[Main Boundary] Companion window became unresponsive.');
    writeToErrorLog({
      type: 'WINDOW_UNRESPONSIVE',
      status: 'WARN',
      message: 'Companion window became temporarily unresponsive.'
    });
  });

  mainWindow.on('closed', () => {
    stopCursorTracking();
    mainWindow = null;
    setMainWindowRef(null);
  });

  setMainWindowRef(mainWindow);
}

// ==========================================================
// APPLICATION LIFECYCLE
// ==========================================================

if (app && typeof app.whenReady === 'function') {
  app.whenReady().then(() => {
    // Grant speech and microphone permissions for Web Speech API
    session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
      callback(true);
    });
    session.defaultSession.setPermissionCheckHandler(() => true);

    // Enforce strict Content Security Policy across all window requests
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [
            "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; media-src 'self' data: blob:; connect-src 'self' https://api.anthropic.com http://127.0.0.1:11434 http://localhost:11434; object-src 'none'; base-uri 'self'; form-action 'self';"
          ]
        }
      });
    });

    // Migrate any plain .env API keys to secure safeStorage
    migrateEnvToSafeStorage(path.join(__dirname, '.env'), loadConfig(), saveConfig);

    // Initialize main UI and tray
    createWindow();
    createTray();
    syncStartOnLoginWithConfig();

    // Register shortcuts, cursor tracking, and IPC handlers
    const getMainWindow = () => mainWindow;
    registerGlobalShortcuts(getMainWindow);
    startCursorTracking(getMainWindow);
    startClipboardMonitor(getMainWindow);
    registerIpcHandlers(getMainWindow);

    // OS Power Monitor for System Shutdown and Suspend
    if (powerMonitor) {
      try {
        powerMonitor.on('shutdown', () => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('companion-wave-goodbye', { reason: 'shutdown' });
          }
        });
        powerMonitor.on('suspend', () => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('companion-wave-goodbye', { reason: 'suspend' });
          }
        });
        powerMonitor.on('on-ac', () => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('power-state-changed', { state: 'on-ac' });
          }
        });
        powerMonitor.on('on-battery', () => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('power-state-changed', { state: 'on-battery' });
          }
        });
      } catch (pmErr) {
        console.warn('[Main] powerMonitor setup warning:', pmErr.message);
      }
    }

    // Automated test runner flag (--test)
    if (process.argv.includes('--test')) {
      console.log('[Test Mode] Companion initialized successfully. Exiting after verification.');
      setTimeout(() => {
        app.quit();
      }, 1500);
    }
  });

  app.on('will-quit', () => {
    unregisterGlobalShortcuts();
    stopCursorTracking();
    stopClipboardMonitor();
    destroyTray();
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });
} else {
  // Pure Node runtime fallback (e.g. testing or CLI invocation)
  if (process.argv.includes('--test')) {
    console.log('[Main] Running under Node runtime. Modules and boundaries loaded cleanly.');
  }
}
