/**
 * Desktop AI Companion - Region Focus & Snipping (regionFocus.js)
 * 
 * Manages Region Focus (Ctrl+Shift+S):
 * Allows the user to drag a rectangular box on screen to focus the companion's
 * vision strictly on that region for their next question.
 * 
 * Benefits:
 * - Faster: Only the cropped region is encoded and transmitted.
 * - Cheaper: Significantly fewer vision tokens billed by Claude models.
 * - More Private: Zero pixels outside the focused box are captured or sent.
 */

const electron = require('electron');
const screen = typeof electron === 'object' && electron !== null ? electron.screen : null;
const BrowserWindow = typeof electron === 'object' && electron !== null ? electron.BrowserWindow : null;
const path = require('path');

// Active focused region for the next question
let activeFocusedRegion = null;

// Currently active snipping overlay BrowserWindow
let snipWindow = null;
let currentSnipDisplay = null;

/**
 * Validates and normalizes raw bounding box coordinates against display boundaries.
 * Enforces a minimum region dimension of 20x20 pixels.
 * 
 * @param {object} rawRect - { x, y, width, height }
 * @param {object} [displayBounds] - { width, height }
 * @returns {object|null} Normalized rect or null if invalid
 */
function validateRegion(rawRect, displayBounds) {
  if (!rawRect || typeof rawRect !== 'object') return null;

  let x = Number(rawRect.x);
  let y = Number(rawRect.y);
  let width = Number(rawRect.width);
  let height = Number(rawRect.height);

  if (isNaN(x) || isNaN(y) || isNaN(width) || isNaN(height)) return null;

  // Handle drags in reverse direction (e.g. dragging bottom-right to top-left)
  if (width < 0) {
    x += width;
    width = Math.abs(width);
  }
  if (height < 0) {
    y += height;
    height = Math.abs(height);
  }

  // Minimum threshold: 20x20 pixels to avoid accidental clicks
  if (width < 20 || height < 20) {
    return null;
  }

  // Clamp within display boundaries if provided
  if (displayBounds && displayBounds.width && displayBounds.height) {
    x = Math.max(0, Math.min(x, displayBounds.width - 20));
    y = Math.max(0, Math.min(y, displayBounds.height - 20));
    width = Math.max(20, Math.min(width, displayBounds.width - x));
    height = Math.max(20, Math.min(height, displayBounds.height - y));
  }

  return {
    x: Math.round(x),
    y: Math.round(y),
    width: Math.round(width),
    height: Math.round(height)
  };
}

/**
 * Sets the active focused region.
 * 
 * @param {object|null} region 
 */
function setActiveFocusedRegion(region) {
  if (!region) {
    activeFocusedRegion = null;
    return;
  }
  const validated = validateRegion(region, region.displayBounds);
  if (!validated) {
    activeFocusedRegion = null;
    return;
  }
  activeFocusedRegion = {
    ...validated,
    screenX: region.screenX != null ? Math.round(region.screenX) : (region.displayBounds ? region.displayBounds.x + validated.x : validated.x),
    screenY: region.screenY != null ? Math.round(region.screenY) : (region.displayBounds ? region.displayBounds.y + validated.y : validated.y),
    displayId: region.displayId ? String(region.displayId) : 'primary',
    displayBounds: region.displayBounds || null,
    timestamp: Date.now()
  };
}

/**
 * Returns the currently active focused region, or null.
 * 
 * @returns {object|null}
 */
function getActiveFocusedRegion() {
  return activeFocusedRegion;
}

/**
 * Clears the active focused region.
 */
function clearActiveFocusedRegion() {
  activeFocusedRegion = null;
}

/**
 * Consumes the active focused region for one-shot "next question" semantics.
 * Returns the region and clears it from state.
 * 
 * @returns {object|null}
 */
function consumeActiveFocusedRegion() {
  const reg = activeFocusedRegion;
  activeFocusedRegion = null;
  return reg;
}

/**
 * Opens the fullscreen transparent snipping overlay window across the monitor
 * where the user's cursor currently resides.
 * 
 * @param {Function} [getMainWindow] - Getter for the main companion window
 * @param {object} [options] - Optional display override options
 * @returns {BrowserWindow|null}
 */
function openSnipOverlayWindow(getMainWindow, options = {}) {
  if (!BrowserWindow || !screen) {
    console.warn('[RegionFocus] BrowserWindow or screen not available (running in Node context)');
    return null;
  }

  closeSnipOverlayWindow();

  try {
    const primaryDisplay = screen.getPrimaryDisplay();
    const allDisplays = screen.getAllDisplays ? screen.getAllDisplays() : [primaryDisplay];

    let targetDisplay = primaryDisplay;
    if (options.displayId) {
      targetDisplay = allDisplays.find(d => String(d.id) === String(options.displayId)) || primaryDisplay;
    } else {
      try {
        const cursorPoint = screen.getCursorScreenPoint();
        targetDisplay = screen.getDisplayNearestPoint(cursorPoint) || primaryDisplay;
      } catch (_) {}
    }

    currentSnipDisplay = targetDisplay;
    const { x, y, width, height } = targetDisplay.bounds;

    snipWindow = new BrowserWindow({
      x,
      y,
      width,
      height,
      transparent: true,
      frame: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      movable: false,
      enableLargerThanScreen: true,
      hasShadow: false,
      fullscreenable: false,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false
      }
    });

    snipWindow.setAlwaysOnTop(true, 'screen-saver');
    snipWindow.loadFile(path.join(__dirname, 'renderer', 'snip.html'));

    snipWindow.once('ready-to-show', () => {
      if (snipWindow && !snipWindow.isDestroyed()) {
        snipWindow.show();
        snipWindow.focus();
      }
    });

    snipWindow.on('closed', () => {
      snipWindow = null;
      currentSnipDisplay = null;
    });

    return snipWindow;
  } catch (err) {
    console.error('[RegionFocus] Failed to create snip overlay window:', err.message);
    snipWindow = null;
    currentSnipDisplay = null;
    return null;
  }
}

/**
 * Closes the active snipping overlay window if open.
 */
function closeSnipOverlayWindow() {
  if (snipWindow && !snipWindow.isDestroyed()) {
    try {
      snipWindow.close();
    } catch (_) {}
  }
  snipWindow = null;
  currentSnipDisplay = null;
}

/**
 * Returns the active snip window reference.
 */
function getSnipWindow() {
  return snipWindow;
}

/**
 * Returns the current snip target display.
 */
function getCurrentSnipDisplay() {
  return currentSnipDisplay;
}

/**
 * Formats a prompt hint when region focus is active.
 * 
 * @param {object} region 
 * @returns {string}
 */
function buildRegionFocusPromptHint(region) {
  if (!region) return '';
  return `[REGION FOCUS ACTIVE]: The user selected a specific region of interest (${region.width}×${region.height} px). The attached image shows ONLY this focused crop. Prioritize analyzing the visible code, errors, text, or visual elements in this region.`;
}

module.exports = {
  validateRegion,
  setActiveFocusedRegion,
  getActiveFocusedRegion,
  clearActiveFocusedRegion,
  consumeActiveFocusedRegion,
  openSnipOverlayWindow,
  closeSnipOverlayWindow,
  getSnipWindow,
  getCurrentSnipDisplay,
  buildRegionFocusPromptHint
};
