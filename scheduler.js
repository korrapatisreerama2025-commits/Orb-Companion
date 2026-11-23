/**
 * Desktop AI Companion - Scheduler & IPC Dispatcher (scheduler.js)
 * 
 * Manages global keyboard shortcuts (Ctrl+Shift+P, Ctrl+Space, Ctrl+Shift+H),
 * 100ms real-time cursor tracking for orb eye gaze direction, physics corner-snapping
 * glide animations, and IPC communication handlers with defensive error boundaries.
 */

const { globalShortcut, ipcMain, screen, BrowserWindow, app, shell, clipboard } = require('electron');
const { exec } = require('child_process');
const { isSensitiveClipboardText } = require('./clipboard');
const { TIMING_CONFIG, WINDOW_CONFIG } = require('./config');
const {
  loadConfig,
  saveConfig,
  loadMemory,
  saveMemory,
  openSettingsWindow,
  closeSettingsWindow,
  getSettingsWindow,
  setStartOnLogin,
  updateTrayMenu,
  getActiveCharacterProfile,
  switchCharacterProfile,
  saveCharacterProfile,
  deleteCharacterProfile
} = require('./settings');
const { capturePrimaryScreenWithHash, getActiveWindow, getFormattedDisplays } = require('./capture');
const { callClaudeStreamAPI, checkOllamaStatus, writeToErrorLog } = require('./api');
const { saveNote, getNotesSummary } = require('./notes');
const { resolveEffectiveScreenMode, SCREEN_MODE_BADGES } = require('./modes');
const {
  validateWindowMove,
  validateIgnoreMouseEvents,
  validateDisplayTarget,
  validateClaudeStreamParams,
  validateSaveConfig,
  validateSaveMemory,
  validateExternalUrl,
  validateAppName,
  validateNoteText,
  validateOllamaHost,
  validateCharacterProfile,
  validateProfileId,
  validateSafeAction,
  validateOutfitId,
  validateBondProfileUpdate,
  ALLOWED_SCREEN_MODES
} = require('./ipcValidator');
const {
  loadProfile,
  saveProfile,
  addXp,
  checkDailyCheckIn,
  checkSeasonalOutfit,
  checkNeglectStatus
} = require('./bond');
const { executeSafeAction, getCompanionFolderPath } = require('./actions');
const { ALLOWED_SAFE_ACTIONS } = require('./config');
const {
  validateRegion,
  setActiveFocusedRegion,
  getActiveFocusedRegion,
  clearActiveFocusedRegion,
  consumeActiveFocusedRegion,
  openSnipOverlayWindow,
  closeSnipOverlayWindow,
  getCurrentSnipDisplay
} = require('./regionFocus');

let cursorTrackInterval = null;

// ==========================================================
// GLOBAL SHORTCUT REGISTRATION
// ==========================================================

/**
 * Registers global keyboard shortcuts with error boundaries:
 * - Ctrl+Shift+P: Pause / Resume companion
 * - Ctrl+Space: Push-to-Talk voice interaction
 * - Ctrl+Shift+H: Help Mode screen tip and error analysis
 * 
 * @param {Function} getMainWindow - Getter returning the active main BrowserWindow
 */
function registerGlobalShortcuts(getMainWindow) {
  try {
    // 1. Pause / Resume shortcut (Ctrl+Shift+P)
    const pauseRegistered = globalShortcut.register('CommandOrControl+Shift+P', () => {
      try {
        const win = getMainWindow();
        if (win && !win.isDestroyed()) {
          win.webContents.send('shortcut-toggle-pause');
        }
      } catch (err) {
        console.warn('[Scheduler] Shortcut pause error:', err.message);
      }
    });

    if (!pauseRegistered) {
      console.warn('[Scheduler] Failed to register global shortcut CommandOrControl+Shift+P');
    }

    // 2. Push-to-Talk shortcut (Ctrl+Space)
    const pttRegistered = globalShortcut.register('CommandOrControl+Space', () => {
      try {
        const win = getMainWindow();
        if (win && !win.isDestroyed()) {
          win.show();
          win.focus();
          win.webContents.send('global-ptt-down');
        }
      } catch (err) {
        console.warn('[Scheduler] Shortcut PTT error:', err.message);
      }
    });

    if (!pttRegistered) {
      console.warn('[Scheduler] Failed to register global shortcut CommandOrControl+Space');
    }

    // 3. Help Mode shortcut (Ctrl+Shift+H)
    const helpRegistered = globalShortcut.register('CommandOrControl+Shift+H', () => {
      try {
        const win = getMainWindow();
        if (win && !win.isDestroyed()) {
          win.show();
          win.focus();
          win.webContents.send('trigger-help-mode');
        }
      } catch (err) {
        console.warn('[Scheduler] Shortcut Help error:', err.message);
      }
    });

    if (!helpRegistered) {
      console.warn('[Scheduler] Failed to register global shortcut CommandOrControl+Shift+H');
    }

    // 4. Quick Note shortcut (Ctrl+Shift+N)
    const noteRegistered = globalShortcut.register('CommandOrControl+Shift+N', () => {
      try {
        const win = getMainWindow();
        if (win && !win.isDestroyed()) {
          win.show();
          win.focus();
          win.webContents.send('trigger-quick-note');
        }
      } catch (err) {
        console.warn('[Scheduler] Shortcut Quick Note error:', err.message);
      }
    });

    if (!noteRegistered) {
      console.warn('[Scheduler] Failed to register global shortcut CommandOrControl+Shift+N');
    }

    // 5. Region Focus shortcut (Ctrl+Shift+S)
    const regionRegistered = globalShortcut.register('CommandOrControl+Shift+S', () => {
      try {
        openSnipOverlayWindow(getMainWindow);
        const win = getMainWindow();
        if (win && !win.isDestroyed()) {
          win.webContents.send('trigger-region-focus');
        }
      } catch (err) {
        console.warn('[Scheduler] Shortcut Region Focus error:', err.message);
      }
    });

    if (!regionRegistered) {
      console.warn('[Scheduler] Failed to register global shortcut CommandOrControl+Shift+S');
    }

    // 6. Select-to-Ask shortcut (Ctrl+Shift+E)
    const selectToAskRegistered = globalShortcut.register('CommandOrControl+Shift+E', async () => {
      try {
        await handleSelectToAskTrigger(getMainWindow);
      } catch (err) {
        console.warn('[Scheduler] Shortcut Select-to-Ask error:', err.message);
      }
    });

    if (!selectToAskRegistered) {
      console.warn('[Scheduler] Failed to register global shortcut CommandOrControl+Shift+E');
    }
  } catch (err) {
    console.error('[Scheduler] Error registering global shortcuts:', err.message);
  }
}

/**
 * Simulates Ctrl+C keystroke cross-platform:
 * - Windows: PowerShell SendKeys
 * - macOS: AppleScript System Events
 * - Linux: xdotool
 */
function simulateCtrlC() {
  return new Promise((resolve) => {
    const platform = process.platform;
    let cmd = '';
    if (platform === 'win32') {
      cmd = 'powershell -NoProfile -NonInteractive -WindowStyle Hidden -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait(\'^c\')"';
    } else if (platform === 'darwin') {
      cmd = 'osascript -e \'tell application "System Events" to keystroke "c" using command down\'';
    } else {
      cmd = 'xdotool key ctrl+c';
    }
    exec(cmd, { timeout: 1500 }, () => {
      resolve();
    });
  });
}

/**
 * Captures selected text without polluting or overwriting the user's previous clipboard:
 * 1. Reads & caches current clipboard
 * 2. Writes unique sentinel
 * 3. Simulates Ctrl+C
 * 4. Reads copied text
 * 5. Restores original clipboard
 * 6. Returns captured text (or empty if unchanged/sentinel)
 */
async function captureSelectedText() {
  let previousClipboard = '';
  try {
    previousClipboard = clipboard.readText();
  } catch (_) {}

  const sentinel = '__COMPANION_SENTINEL_' + Date.now() + '_' + Math.random().toString(36) + '__';
  try {
    clipboard.writeText(sentinel);
  } catch (_) {}

  await simulateCtrlC();
  await new Promise((r) => setTimeout(r, 160));

  let copied = '';
  try {
    copied = clipboard.readText();
  } catch (_) {}

  // Immediately restore previous clipboard
  try {
    clipboard.writeText(previousClipboard);
  } catch (_) {}

  if (copied === sentinel || !copied || !copied.trim()) {
    return '';
  }
  return copied;
}

/**
 * Handles Select-to-Ask trigger (via Ctrl+Shift+E shortcut or IPC invocation):
 * Checks sensitivity (passwords, card numbers, API keys).
 * STRICT PRIVACY REQUIREMENT: NEVER logs selected text.
 */
async function handleSelectToAskTrigger(getMainWindow, overrideText) {
  let selectedText = '';
  if (typeof overrideText === 'string') {
    selectedText = overrideText;
  } else {
    selectedText = await captureSelectedText();
  }

  const win = getMainWindow();
  if (!win || win.isDestroyed()) return { status: 'no_window' };

  if (!selectedText || !selectedText.trim()) {
    win.show();
    win.focus();
    win.webContents.send('select-to-ask-offer', { empty: true });
    return { status: 'empty' };
  }

  // Security check: Never run on text that looks like a password, API key, or card number
  if (isSensitiveClipboardText(selectedText)) {
    // STRICT SECURITY: Never log selectedText
    win.show();
    win.focus();
    win.webContents.send('select-to-ask-offer', { isSensitive: true });
    return { status: 'sensitive' };
  }

  // Safe selection: STRICT SECURITY: Never log selectedText
  win.show();
  win.focus();
  win.webContents.send('select-to-ask-offer', { text: selectedText });
  return { status: 'offered' };
}

/**
 * Unregisters all active global shortcuts on exit.
 */
function unregisterGlobalShortcuts() {
  try {
    globalShortcut.unregisterAll();
  } catch (err) {
    console.warn('[Scheduler] Error unregistering global shortcuts:', err.message);
  }
}

// ==========================================================
// CURSOR TRACKING (ORB GAZE)
// ==========================================================

/**
 * Starts 100ms cursor tracking interval to send relative coordinates
 * from the orb center so the orb naturally tracks user gaze.
 * Also monitors active display switches to let the orb smoothly follow the user across monitors.
 * 
 * @param {Function} getMainWindow 
 */
function startCursorTracking(getMainWindow) {
  stopCursorTracking();

  let lastSentCursor = { x: 0, y: 0 };
  let lastCursorDisplayId = null;
  let cursorDisplayDwellTicks = 0;
  let isTransitioningDisplay = false;

  cursorTrackInterval = setInterval(() => {
    try {
      const win = getMainWindow();
      if (!win || win.isDestroyed()) return;

      const cursorPos = screen.getCursorScreenPoint();
      const [winX, winY] = win.getPosition();

      // Multi-Monitor Active Screen Tracking
      const currentCursorDisplay = screen.getDisplayNearestPoint(cursorPos);
      if (currentCursorDisplay) {
        if (currentCursorDisplay.id !== lastCursorDisplayId) {
          lastCursorDisplayId = currentCursorDisplay.id;
          cursorDisplayDwellTicks = 0;
        } else {
          cursorDisplayDwellTicks++;
        }

        // When user has actively dwelled on the new screen for ~600ms (6 ticks)
        if (cursorDisplayDwellTicks === 6 && !isTransitioningDisplay && !win._isDragging) {
          const cfg = loadConfig();
          const shouldFollow = cfg.followActiveMonitor !== false && (cfg.liveDisplay === 'active' || cfg.followActiveMonitor === true);
          if (shouldFollow) {
            const currentCenter = {
              x: win.getBounds().x + win.getBounds().width / 2,
              y: win.getBounds().y + win.getBounds().height / 2
            };
            const currentWinDisplay = screen.getDisplayNearestPoint(currentCenter);
            if (currentWinDisplay.id !== currentCursorDisplay.id) {
              isTransitioningDisplay = true;
              console.log(`[Multi-Monitor] Switching orb to active display: ${currentCursorDisplay.id}`);
              snapWindowToCorner(win, false, currentCursorDisplay).then(() => {
                isTransitioningDisplay = false;
                if (win && !win.isDestroyed()) {
                  win.webContents.send('display-changed', {
                    displayId: String(currentCursorDisplay.id),
                    bounds: currentCursorDisplay.bounds
                  });
                }
              }).catch(() => {
                isTransitioningDisplay = false;
              });
            }
          }
        }
      }

      // Calculate relative gaze offset to 72px orb center
      const gaze = calculateGazeVector({ x: winX, y: winY }, cursorPos);
      const relX = gaze.relX;
      const relY = gaze.relY;

      // Only dispatch if cursor moved more than threshold
      const dist = Math.hypot(cursorPos.x - lastSentCursor.x, cursorPos.y - lastSentCursor.y);
      if (dist >= TIMING_CONFIG.cursorMinDistanceDiff) {
        lastSentCursor = cursorPos;
        win.webContents.send('cursor-track', { relX, relY });
      }
    } catch (_) {
      // Non-critical background telemetry
    }
  }, TIMING_CONFIG.cursorTrackIntervalMs);
}

/**
 * Calculates candidate snapping corner coordinates for a given display workArea and window bounds.
 */
function calculateCorners(workArea, winBounds = {}, margin = TIMING_CONFIG.cornerSnapMarginPx) {
  const workX = workArea?.x || 0;
  const workY = workArea?.y || 0;
  const workWidth = workArea?.width || 1920;
  const workHeight = workArea?.height || 1080;
  const width = winBounds.width || WINDOW_CONFIG.main.width;
  const height = winBounds.height || WINDOW_CONFIG.main.height;

  return [
    { name: 'top-left', x: workX + margin, y: workY + margin },
    { name: 'top-right', x: workX + workWidth - width - margin, y: workY + margin },
    { name: 'bottom-left', x: workX + margin, y: workY + workHeight - height - margin },
    { name: 'bottom-right', x: workX + workWidth - width - margin, y: workY + workHeight - height - margin }
  ];
}

/**
 * Finds the nearest corner from a candidate list based on Euclidean distance.
 */
function findNearestCorner(currentPos, corners) {
  if (!corners || corners.length === 0) return null;
  let minDist = Infinity;
  let nearest = corners[corners.length - 1]; // Default to bottom-right
  for (const c of corners) {
    const dist = Math.hypot(currentPos.x - c.x, currentPos.y - c.y);
    if (dist < minDist) {
      minDist = dist;
      nearest = c;
    }
  }
  return nearest;
}

/**
 * Calculates gaze direction vector and distance from companion orb center to cursor point.
 */
function calculateGazeVector(winPos, cursorPos) {
  const winX = winPos?.x || 0;
  const winY = winPos?.y || 0;
  const orbCenterX = winX + Math.round(WINDOW_CONFIG.main.width / 2);
  const orbCenterY = winY + 245;

  const curX = cursorPos?.x || 0;
  const curY = cursorPos?.y || 0;

  return {
    relX: curX - orbCenterX,
    relY: curY - orbCenterY,
    distance: Math.hypot(curX - orbCenterX, curY - orbCenterY)
  };
}

/**
 * Stops cursor tracking interval.
 */
function stopCursorTracking() {
  if (cursorTrackInterval) {
    clearInterval(cursorTrackInterval);
    cursorTrackInterval = null;
  }
}

// ==========================================================
// CORNER SNAPPING GLIDE ANIMATION
// ==========================================================

/**
 * Calculates nearest corner and smoothly animates the window with cubic ease-out.
 * Supports multi-monitor targeting: preserves corresponding corner position when moving between screens.
 * 
 * @param {BrowserWindow} win 
 * @param {boolean} reduceMotion - If true, jumps instantly without animation
 * @param {Display} [targetDisplay] - Optional target display
 * @returns {Promise<object>} Nearest corner object { name, x, y }
 */
function snapWindowToCorner(win, reduceMotion, targetDisplay) {
  if (!win || win.isDestroyed()) return Promise.resolve(null);

  try {
    const currentBounds = win.getBounds();
    const currentCenter = {
      x: currentBounds.x + currentBounds.width / 2,
      y: currentBounds.y + currentBounds.height / 2
    };

    const currentDisplay = screen.getDisplayNearestPoint(currentCenter);
    const display = targetDisplay || currentDisplay;
    const margin = TIMING_CONFIG.cornerSnapMarginPx;
    const corners = calculateCorners(display.workArea, currentBounds, margin);

    let nearestCorner;
    if (targetDisplay && targetDisplay.id !== currentDisplay.id) {
      // Switching monitors: determine which corner window occupies on current screen and match it
      const currentCorners = calculateCorners(currentDisplay.workArea, currentBounds, margin);
      const match = findNearestCorner(currentBounds, currentCorners);
      const bestName = match ? match.name : 'bottom-right';
      nearestCorner = corners.find(c => c.name === bestName) || corners[3];
    } else {
      nearestCorner = findNearestCorner(currentBounds, corners);
    }

    if (reduceMotion) {
      win.setPosition(nearestCorner.x, nearestCorner.y);
      saveConfig({ windowX: nearestCorner.x, windowY: nearestCorner.y });
      return Promise.resolve(nearestCorner);
    }

    // Smooth glide animation
    return new Promise((resolve) => {
      const startX = currentBounds.x;
      const startY = currentBounds.y;
      const targetX = nearestCorner.x;
      const targetY = nearestCorner.y;
      const duration = TIMING_CONFIG.snapAnimationDurationMs;
      const startTime = Date.now();

      if (win._snapInterval) {
        clearInterval(win._snapInterval);
      }

      win._snapInterval = setInterval(() => {
        if (!win || win.isDestroyed()) {
          clearInterval(win._snapInterval);
          return resolve(nearestCorner);
        }

        const elapsed = Date.now() - startTime;
        const progress = Math.min(1, elapsed / duration);

        // Cubic ease-out: 1 - (1 - t)^3
        const ease = 1 - Math.pow(1 - progress, 3);
        const curX = Math.round(startX + (targetX - startX) * ease);
        const curY = Math.round(startY + (targetY - startY) * ease);

        win.setPosition(curX, curY);

        if (progress >= 1) {
          clearInterval(win._snapInterval);
          win._snapInterval = null;
          saveConfig({ windowX: targetX, windowY: targetY });
          resolve(nearestCorner);
        }
      }, TIMING_CONFIG.snapAnimationIntervalMs);
    });
  } catch (err) {
    console.error('[Scheduler] Error in snapWindowToCorner:', err.message);
    return Promise.resolve(null);
  }
}

/**
 * Moves companion window to a designated screen target ('primary', 'active', or specific display ID).
 * 
 * @param {BrowserWindow} win 
 * @param {string|number} displayTarget 
 * @returns {Promise<boolean>}
 */
async function moveWindowToDisplay(win, displayTarget) {
  if (!win || win.isDestroyed()) return false;
  if (!screen || typeof screen.getPrimaryDisplay !== 'function') return false;

  try {
    const all = screen.getAllDisplays ? screen.getAllDisplays() : [screen.getPrimaryDisplay()];
    let targetDisplay = null;

    if (displayTarget === 'primary') {
      targetDisplay = screen.getPrimaryDisplay();
    } else if (displayTarget === 'active') {
      try {
        const cursorPos = screen.getCursorScreenPoint();
        targetDisplay = screen.getDisplayNearestPoint(cursorPos);
      } catch (_) {
        targetDisplay = screen.getPrimaryDisplay();
      }
    } else if (displayTarget) {
      targetDisplay = all.find(d => String(d.id) === String(displayTarget)) ||
                      all[parseInt(displayTarget, 10) - 1] ||
                      screen.getPrimaryDisplay();
    } else {
      targetDisplay = screen.getPrimaryDisplay();
    }

    if (targetDisplay) {
      await snapWindowToCorner(win, false, targetDisplay);
      return true;
    }
    return false;
  } catch (err) {
    console.warn('[Scheduler] moveWindowToDisplay error:', err.message);
    return false;
  }
}

/**
 * Registers multi-monitor topology listeners (added, removed, metrics changed)
 * to prevent the companion from getting stranded off-screen.
 * 
 * @param {Function} getMainWindow 
 */
function registerDisplayListeners(getMainWindow) {
  if (!screen || typeof screen.on !== 'function') return;

  const handleDisplayChange = () => {
    try {
      const win = getMainWindow();
      if (!win || win.isDestroyed()) return;

      const [curX, curY] = win.getPosition();
      const allDisplays = screen.getAllDisplays();
      const [winW, winH] = win.getSize();

      const isVisible = allDisplays.some(d => {
        const b = d.bounds;
        return curX >= b.x - winW && curX <= b.x + b.width &&
               curY >= b.y - winH && curY <= b.y + b.height;
      });

      if (!isVisible) {
        console.log('[Multi-Monitor] Window off-screen after display topology change. Snapping to primary display.');
        snapWindowToCorner(win, true, screen.getPrimaryDisplay());
      }
    } catch (err) {
      console.warn('[Multi-Monitor] Display change handler warning:', err.message);
    }
  };

  screen.on('display-added', handleDisplayChange);
  screen.on('display-removed', handleDisplayChange);
  screen.on('display-metrics-changed', handleDisplayChange);
}

// ==========================================================
// CENTRAL IPC HANDLER REGISTRATION
// ==========================================================

/**
 * Registers all IPC event handlers with defensive error boundaries.
 * 
 * @param {Function} getMainWindow 
 */
function registerIpcHandlers(getMainWindow) {
  // Register multi-monitor topology listeners
  registerDisplayListeners(getMainWindow);

  // Click-through on transparent areas
  ipcMain.on('set-ignore-mouse-events', (event, ignore, options) => {
    try {
      const validated = validateIgnoreMouseEvents(ignore, options);
      const win = BrowserWindow.fromWebContents(event.sender);
      if (win && !win.isDestroyed()) {
        win.setIgnoreMouseEvents(validated.ignore, validated.options);
      }
    } catch (err) {
      console.warn('[IPC] set-ignore-mouse-events error:', err.message);
    }
  });

  // Window manual drag support with active drag guard
  ipcMain.on('window-move', (event, payload) => {
    try {
      const validated = validateWindowMove(payload);
      if (!validated) return;
      const win = BrowserWindow.fromWebContents(event.sender);
      if (win && !win.isDestroyed()) {
        win._isDragging = true;
        if (win._dragTimer) clearTimeout(win._dragTimer);
        win._dragTimer = setTimeout(() => { win._isDragging = false; }, 800);

        const [curX, curY] = win.getPosition();
        win.setPosition(curX + validated.deltaX, curY + validated.deltaY);
      }
    } catch (err) {
      console.warn('[IPC] window-move error:', err.message);
    }
  });

  // Multi-Monitor display list
  ipcMain.handle('get-displays', () => {
    try {
      return getFormattedDisplays();
    } catch (err) {
      console.error('[IPC] get-displays error:', err.message);
      return [];
    }
  });

  // Move companion window to specific display target
  ipcMain.handle('move-to-display', async (event, displayId) => {
    try {
      const target = validateDisplayTarget(displayId);
      if (!target) return false;
      const win = BrowserWindow.fromWebContents(event.sender) || (getMainWindow ? getMainWindow() : null);
      if (win) {
        return await moveWindowToDisplay(win, target);
      }
      return false;
    } catch (err) {
      console.error('[IPC] move-to-display error:', err.message);
      return false;
    }
  });

  // Snap window to nearest display corner
  ipcMain.handle('snap-window-to-corner', async (event, reduceMotion) => {
    try {
      const win = BrowserWindow.fromWebContents(event.sender);
      return await snapWindowToCorner(win, Boolean(reduceMotion));
    } catch (err) {
      console.error('[IPC] snap-window-to-corner error:', err.message);
      return null;
    }
  });

  // Capture screen request
  ipcMain.handle('capture-screen-with-hash', async () => {
    try {
      return await capturePrimaryScreenWithHash();
    } catch (err) {
      console.error('[IPC] capture-screen-with-hash error:', err.message);
      return null;
    }
  });

  // Start Claude stream
  ipcMain.on('start-claude-stream', (event, params) => {
    try {
      const validatedParams = validateClaudeStreamParams(params);
      if (!validatedParams) {
        console.warn('[IPC] Invalid parameters for start-claude-stream rejected.');
        return;
      }
      callClaudeStreamAPI(validatedParams, event);
    } catch (err) {
      console.error('[IPC] start-claude-stream error:', err.message);
    }
  });

  // Open / Close Settings Window
  ipcMain.on('open-settings-window', () => {
    try {
      openSettingsWindow();
    } catch (err) {
      console.error('[IPC] open-settings-window error:', err.message);
    }
  });

  ipcMain.on('close-settings-window', () => {
    try {
      closeSettingsWindow();
    } catch (err) {
      console.error('[IPC] close-settings-window error:', err.message);
    }
  });

  // Active foreground window info
  ipcMain.handle('get-active-window', async () => {
    try {
      return await getActiveWindow();
    } catch (err) {
      console.warn('[IPC] get-active-window error:', err.message);
      return null;
    }
  });

  // Smart Screen Mode info & configuration
  ipcMain.handle('get-screen-mode', async () => {
    try {
      const config = loadConfig();
      const activeWindow = await getActiveWindow();
      const mode = resolveEffectiveScreenMode(config, activeWindow);
      const badge = SCREEN_MODE_BADGES[mode] || SCREEN_MODE_BADGES.default;
      return {
        mode,
        smartScreenModes: config.smartScreenModes !== false,
        overrideMode: config.currentScreenMode || 'auto',
        badge,
        activeWindow: activeWindow ? { owner: activeWindow.owner, title: activeWindow.title } : null
      };
    } catch (err) {
      console.warn('[IPC] get-screen-mode error:', err.message);
      return { mode: 'default', smartScreenModes: true, badge: SCREEN_MODE_BADGES.default, activeWindow: null };
    }
  });

  ipcMain.handle('set-screen-mode', async (event, mode) => {
    try {
      const cleanMode = (typeof mode === 'string' && ALLOWED_SCREEN_MODES.has(mode)) ? mode : 'auto';
      saveConfig({ currentScreenMode: cleanMode });
      return true;
    } catch (err) {
      console.warn('[IPC] set-screen-mode error:', err.message);
      return false;
    }
  });

  ipcMain.handle('set-smart-screen-modes', async (event, enabled) => {
    try {
      saveConfig({ smartScreenModes: Boolean(enabled) });
      return true;
    } catch (err) {
      console.warn('[IPC] set-smart-screen-modes error:', err.message);
      return false;
    }
  });

  // Login Item Settings
  ipcMain.handle('get-login-item-settings', async () => {
    try {
      return app.getLoginItemSettings().openAtLogin;
    } catch (err) {
      console.warn('[IPC] get-login-item-settings error:', err.message);
      return false;
    }
  });

  ipcMain.handle('set-login-item-settings', async (event, openAtLogin) => {
    try {
      setStartOnLogin(Boolean(openAtLogin));
      return app.getLoginItemSettings().openAtLogin;
    } catch (err) {
      console.warn('[IPC] set-login-item-settings error:', err.message);
      return false;
    }
  });

  // Config get / save
  ipcMain.handle('get-config', async () => {
    try {
      return loadConfig();
    } catch (err) {
      console.error('[IPC] get-config error:', err.message);
      return {};
    }
  });

  ipcMain.handle('save-config', async (event, newConfig) => {
    try {
      const validatedConfig = validateSaveConfig(newConfig);
      if (!validatedConfig) {
        console.warn('[IPC] Invalid save-config payload rejected.');
        return null;
      }
      if (typeof validatedConfig.startOnLogin === 'boolean') {
        const currentLoginState = app.getLoginItemSettings().openAtLogin;
        if (currentLoginState !== validatedConfig.startOnLogin) {
          setStartOnLogin(validatedConfig.startOnLogin);
        }
      }

      const updated = saveConfig(validatedConfig);
      const mainWin = getMainWindow();
      const settingsWin = getSettingsWindow();

      if (mainWin && !mainWin.isDestroyed() && event.sender !== mainWin.webContents) {
        mainWin.webContents.send('config-updated', updated);
      }
      if (settingsWin && !settingsWin.isDestroyed() && event.sender !== settingsWin.webContents) {
        settingsWin.webContents.send('config-updated', updated);
      }
      try {
        updateTrayMenu();
      } catch (_) {}
      return updated;
    } catch (err) {
      console.error('[IPC] save-config error:', err.message);
      return null;
    }
  });

  // Memory get / save
  ipcMain.handle('get-memory', async () => {
    try {
      return loadMemory();
    } catch (err) {
      console.error('[IPC] get-memory error:', err.message);
      return {};
    }
  });

  ipcMain.handle('save-memory', async (event, newMemory) => {
    try {
      const validated = validateSaveMemory(newMemory);
      if (!validated) {
        console.warn('[IPC] Invalid save-memory payload rejected.');
        return null;
      }
      return saveMemory(validated);
    } catch (err) {
      console.error('[IPC] save-memory error:', err.message);
      return null;
    }
  });

  // Open external URL in default browser
  ipcMain.handle('open-external', async (event, url) => {
    try {
      const cleanUrl = validateExternalUrl(url);
      if (cleanUrl) {
        await shell.openExternal(cleanUrl);
        return { success: true };
      }
    } catch (err) {
      console.warn('[IPC] open-external error:', err.message);
    }
    return { success: false };
  });

  // Open local application
  ipcMain.handle('open-app', async (event, appName) => {
    try {
      const target = validateAppName(appName);
      if (target) {
        const appCommands = {
          'notepad': 'notepad.exe',
          'calc': 'calc.exe',
          'calculator': 'calc.exe',
          'paint': 'mspaint.exe',
          'terminal': 'start powershell.exe',
          'powershell': 'start powershell.exe',
          'cmd': 'start cmd.exe',
          'code': 'code',
          'vscode': 'code',
          'taskmgr': 'taskmgr.exe',
          'task manager': 'taskmgr.exe',
          'explorer': 'explorer.exe',
          'files': 'explorer.exe'
        };
        const cmd = appCommands[target];
        if (cmd) {
          exec(cmd, (err) => {
            if (err) console.warn('[IPC] open-app exec error:', err.message);
          });
          return { success: true };
        }
      }
    } catch (err) {
      console.warn('[IPC] open-app error:', err.message);
    }
    return { success: false };
  });

  // Quick Notes handlers
  ipcMain.handle('save-note', async (event, noteText) => {
    try {
      const cleanText = validateNoteText(noteText);
      if (!cleanText) {
        return { success: false, error: 'Empty or invalid note.' };
      }
      return saveNote(cleanText);
    } catch (err) {
      console.error('[IPC] save-note error:', err.message);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('get-notes-today', async () => {
    try {
      return getNotesSummary();
    } catch (err) {
      console.error('[IPC] get-notes-today error:', err.message);
      return { count: 0, notes: [], formattedText: 'Error loading notes.', speakText: '' };
    }
  });

  // Test Ollama local connection
  ipcMain.handle('test-ollama-connection', async (event, host) => {
    try {
      const cleanHost = validateOllamaHost(host) || 'http://127.0.0.1:11434';
      return await checkOllamaStatus(cleanHost);
    } catch (err) {
      console.warn('[IPC] test-ollama-connection error:', err.message);
      return { ok: false, models: [], error: err.message };
    }
  });

  // Set local-only mode
  ipcMain.handle('set-local-only', async (event, enabled) => {
    try {
      const cfg = saveConfig({ localOnly: Boolean(enabled) });
      updateTrayMenu();
      return cfg;
    } catch (err) {
      console.warn('[IPC] set-local-only error:', err.message);
      return null;
    }
  });

  // Region Focus handlers (Ctrl+Shift+S snipping overlay)
  ipcMain.on('start-region-focus', () => {
    try {
      openSnipOverlayWindow(getMainWindow);
      const win = getMainWindow();
      if (win && !win.isDestroyed()) {
        win.webContents.send('trigger-region-focus');
      }
    } catch (err) {
      console.warn('[IPC] start-region-focus error:', err.message);
    }
  });

  ipcMain.on('cancel-region-focus', () => {
    try {
      closeSnipOverlayWindow();
    } catch (err) {
      console.warn('[IPC] cancel-region-focus error:', err.message);
    }
  });

  ipcMain.on('snip-complete', (event, rawRect) => {
    try {
      const curDisplay = getCurrentSnipDisplay() || (screen && screen.getPrimaryDisplay ? screen.getPrimaryDisplay() : null);
      const displayBounds = curDisplay ? curDisplay.bounds : { width: 1920, height: 1080 };
      const validated = validateRegion(rawRect, displayBounds);
      if (validated && curDisplay) {
        const regionData = {
          ...validated,
          displayId: String(curDisplay.id),
          displayBounds: curDisplay.bounds,
          screenX: curDisplay.bounds.x + validated.x,
          screenY: curDisplay.bounds.y + validated.y,
          timestamp: Date.now()
        };
        setActiveFocusedRegion(regionData);
        closeSnipOverlayWindow();
        const mainWin = getMainWindow();
        if (mainWin && !mainWin.isDestroyed()) {
          mainWin.webContents.send('region-focus-changed', { region: regionData });
        }
      } else {
        closeSnipOverlayWindow();
      }
    } catch (err) {
      console.warn('[IPC] snip-complete error:', err.message);
      closeSnipOverlayWindow();
    }
  });

  ipcMain.on('snip-cancel', () => {
    try {
      closeSnipOverlayWindow();
    } catch (err) {
      console.warn('[IPC] snip-cancel error:', err.message);
    }
  });

  ipcMain.handle('get-focused-region', async () => {
    try {
      return getActiveFocusedRegion();
    } catch (err) {
      console.warn('[IPC] get-focused-region error:', err.message);
      return null;
    }
  });

  ipcMain.handle('clear-focused-region', async () => {
    try {
      clearActiveFocusedRegion();
      const mainWin = getMainWindow();
      if (mainWin && !mainWin.isDestroyed()) {
        mainWin.webContents.send('region-focus-changed', { region: null });
      }
      return true;
    } catch (err) {
      console.warn('[IPC] clear-focused-region error:', err.message);
      return false;
    }
  });

  ipcMain.handle('consume-focused-region', async () => {
    try {
      const reg = consumeActiveFocusedRegion();
      const mainWin = getMainWindow();
      if (mainWin && !mainWin.isDestroyed()) {
        mainWin.webContents.send('region-focus-changed', { region: null });
      }
      return reg;
    } catch (err) {
      console.warn('[IPC] consume-focused-region error:', err.message);
      return null;
    }
  });

  // Character Creator & Profiles handlers
  ipcMain.handle('get-character-profiles', async () => {
    try {
      const cfg = loadConfig();
      const active = getActiveCharacterProfile(cfg);
      return {
        activeProfileId: cfg.characterProfileId,
        activeProfile: active,
        profiles: cfg.characterProfiles || []
      };
    } catch (err) {
      console.warn('[IPC] get-character-profiles error:', err.message);
      return { activeProfileId: 'profile_aura', activeProfile: null, profiles: [] };
    }
  });

  ipcMain.handle('switch-character-profile', async (event, profileId) => {
    try {
      const cleanId = validateProfileId(profileId);
      if (!cleanId) return null;
      return switchCharacterProfile(cleanId);
    } catch (err) {
      console.warn('[IPC] switch-character-profile error:', err.message);
      return null;
    }
  });

  ipcMain.handle('save-character-profile', async (event, profile) => {
    try {
      const cleanProfile = validateCharacterProfile(profile);
      if (!cleanProfile) {
        return { success: false, error: 'Invalid character profile specification.' };
      }
      return saveCharacterProfile(cleanProfile);
    } catch (err) {
      console.warn('[IPC] save-character-profile error:', err.message);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('delete-character-profile', async (event, profileId) => {
    try {
      const cleanId = validateProfileId(profileId);
      if (!cleanId) {
        return { success: false, error: 'Invalid profile ID.' };
      }
      return deleteCharacterProfile(cleanId);
    } catch (err) {
      console.warn('[IPC] delete-character-profile error:', err.message);
      return { success: false, error: err.message };
    }
  });

  // Safe Actions Execution handler (requires explicit user confirmation in UI)
  ipcMain.handle('execute-safe-action', async (event, rawAction) => {
    try {
      const validatedAction = validateSafeAction(rawAction);
      if (!validatedAction) {
        console.warn('[IPC] Invalid or prohibited safe action payload rejected:', rawAction);
        return { success: false, error: 'Prohibited or invalid action specification.' };
      }
      return await executeSafeAction(validatedAction, { getMainWindow });
    } catch (err) {
      console.error('[IPC] execute-safe-action error:', err.message);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('get-companion-folder-path', async () => {
    try {
      return getCompanionFolderPath();
    } catch (err) {
      console.warn('[IPC] get-companion-folder-path error:', err.message);
      return '';
    }
  });

  ipcMain.handle('get-allowed-safe-actions', async () => {
    return ALLOWED_SAFE_ACTIONS;
  });

  // Select-to-Ask trigger handler (useful for testing or direct invocation)
  ipcMain.handle('trigger-select-to-ask', async (event, overrideText) => {
    try {
      return await handleSelectToAskTrigger(getMainWindow, overrideText);
    } catch (err) {
      console.warn('[Scheduler] trigger-select-to-ask error:', err.message);
      return { status: 'error', error: err.message };
    }
  });

  // Bond System & Profile Handlers
  ipcMain.handle('get-bond-profile', async () => {
    try {
      return loadProfile();
    } catch (err) {
      console.warn('[Bond] get-bond-profile error:', err.message);
      return {};
    }
  });

  ipcMain.handle('save-bond-profile', async (event, rawProfile) => {
    try {
      const clean = validateBondProfileUpdate(rawProfile);
      const saved = saveProfile(clean);
      const win = getMainWindow();
      if (win && !win.isDestroyed()) {
        win.webContents.send('bond-updated', saved);
      }
      return saved;
    } catch (err) {
      console.warn('[Bond] save-bond-profile error:', err.message);
      return loadProfile();
    }
  });

  ipcMain.handle('add-bond-xp', async (event, amount, reason) => {
    try {
      const safeAmount = Number.isFinite(Number(amount)) ? Number(amount) : 0;
      const cleanReason = typeof reason === 'string' ? reason.slice(0, 50) : '';
      const result = addXp(safeAmount, cleanReason);
      const win = getMainWindow();
      if (win && !win.isDestroyed()) {
        win.webContents.send('bond-updated', result.newProfile);
      }
      return result;
    } catch (err) {
      console.warn('[Bond] add-bond-xp error:', err.message);
      return { xp: 0, level: 1, leveledUp: false, unlockedItems: [] };
    }
  });

  ipcMain.handle('equip-outfit', async (event, outfitId) => {
    try {
      const cleanOutfit = validateOutfitId(outfitId);
      const saved = saveProfile({ equippedOutfit: cleanOutfit });
      const win = getMainWindow();
      if (win && !win.isDestroyed()) {
        win.webContents.send('bond-updated', saved);
      }
      return saved;
    } catch (err) {
      console.warn('[Bond] equip-outfit error:', err.message);
      return loadProfile();
    }
  });

  ipcMain.handle('check-daily-checkin', async () => {
    try {
      const result = checkDailyCheckIn();
      if (result.checkedIn) {
        const win = getMainWindow();
        if (win && !win.isDestroyed()) {
          win.webContents.send('bond-updated', result.profile);
        }
      }
      return result;
    } catch (err) {
      console.warn('[Bond] check-daily-checkin error:', err.message);
      return { checkedIn: false, xpAwarded: 0 };
    }
  });

  ipcMain.handle('check-neglect', async (event, lastDate) => {
    try {
      return checkNeglectStatus(lastDate);
    } catch (err) {
      console.warn('[Bond] check-neglect error:', err.message);
      return { isNeglected: false, daysInactive: 0 };
    }
  });

  // Quit application
  ipcMain.on('quit-app', () => {
    try {
      app.quit();
    } catch (err) {
      console.error('[IPC] quit-app error:', err.message);
    }
  });
}

module.exports = {
  registerGlobalShortcuts,
  unregisterGlobalShortcuts,
  startCursorTracking,
  stopCursorTracking,
  snapWindowToCorner,
  moveWindowToDisplay,
  registerDisplayListeners,
  registerIpcHandlers,
  calculateCorners,
  findNearestCorner,
  calculateGazeVector,
  simulateCtrlC,
  captureSelectedText,
  handleSelectToAskTrigger
};
