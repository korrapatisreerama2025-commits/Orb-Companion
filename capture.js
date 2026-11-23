/**
 * Desktop AI Companion - Vision & Screen Capture (capture.js)
 * 
 * Captures the primary display, downscales to 768px JPEG (quality 60), computes a
 * 32x32 grayscale luminance hash for change detection, inspects the foreground window
 * using active-win, and enforces the Privacy Shield blocklist.
 */

const { desktopCapturer, screen } = require('electron');
const { DEFAULT_BLOCKLIST, VISION_CONFIG } = require('./config');
const { loadConfig } = require('./settings');
const { detectScreenContext, resolveEffectiveScreenMode } = require('./modes');
const {
  getActiveFocusedRegion,
  setActiveFocusedRegion,
  clearActiveFocusedRegion,
  consumeActiveFocusedRegion
} = require('./regionFocus');

// Previous 32x32 grayscale perceptual hash (1024 bytes)
let previousScreenHash = null;

// Foreground application continuous duration tracker (for 60-min break reminders)
const appDurationTracker = {
  currentApp: '',
  firstSeen: Date.now(),
  lastBreakSuggestedAt: 0
};

// Cached active-win dynamic import function
let activeWinFn = null;

/**
 * Retrieves foreground window information via active-win.
 * Tracks continuous active duration for break suggestions and checks quiet mode.
 * 
 * @returns {Promise<{ title: string, owner: string, processId: number, bounds: object|null, isQuiet?: boolean, quietReason?: string|null } | null>}
 */
async function getActiveWindow() {
  try {
    if (!activeWinFn) {
      const mod = await import('active-win');
      activeWinFn = mod.default;
    }
    const info = await activeWinFn();
    if (info) {
      const appName = info.owner?.name || '';
      const winTitle = info.title || '';
      const bounds = info.bounds ? {
        x: info.bounds.x,
        y: info.bounds.y,
        width: info.bounds.width,
        height: info.bounds.height
      } : null;

      // Update continuous duration tracker
      if (appName && appName !== appDurationTracker.currentApp) {
        appDurationTracker.currentApp = appName;
        appDurationTracker.firstSeen = Date.now();
        appDurationTracker.lastBreakSuggestedAt = 0;
      }

      let isQuiet = false;
      let quietReason = null;
      try {
        if (screen && typeof screen.getPrimaryDisplay === 'function') {
          const primaryDisplay = screen.getPrimaryDisplay();
          const displayBounds = primaryDisplay ? primaryDisplay.bounds : null;
          const quietCheck = isQuietActivity({ title: winTitle, owner: appName, bounds }, displayBounds);
          isQuiet = quietCheck.isQuiet;
          quietReason = quietCheck.reason;
        }
      } catch (_) {}

      return {
        title: winTitle,
        owner: appName,
        processId: info.owner?.processId,
        bounds,
        isQuiet,
        quietReason
      };
    }
  } catch (err) {
    console.warn('[Capture] active-win detection error:', err.message);
  }
  return null;
}

/**
 * Returns current continuous duration tracking state for prompt construction.
 */
function getAppDurationTracker() {
  return appDurationTracker;
}

/**
 * Checks if the foreground application is in a quiet scenario:
 * 1. Full-screen applications (window bounds covering primary monitor bounds)
 * 2. Video calls & meetings (Zoom, Microsoft Teams, Google Meet, Webex, Slack Huddle, Discord call, Skype, etc.)
 * 3. Presentations & slide shows (PowerPoint slide show/presenter view, Keynote, Google Slides present mode)
 * 
 * When quiet, the companion stays 100% silent and never opens speech bubbles or makes sounds.
 * 
 * @param {object|null} winInfo - Window info { title, owner, bounds }
 * @param {object|null} displayBounds - Primary display bounds { x, y, width, height }
 * @returns {{ isQuiet: boolean, reason: string|null }}
 */
function isQuietActivity(winInfo, displayBounds) {
  if (!winInfo) return { isQuiet: false, reason: null };

  const title = (winInfo.title || '').toLowerCase();
  const owner = (winInfo.owner || '').toLowerCase();

  // Exclude Desktop AI Companion itself
  if (owner.includes('desktop ai companion') || title.includes('desktop ai companion')) {
    return { isQuiet: false, reason: null };
  }

  // 1. Video Calls & Web Meetings
  const videoCallOwners = [
    'zoom', 'teams', 'webex', 'skype', 'bluejeans', 'chime', 
    'gotomeeting', 'ringcentral', 'whereby', 'voov'
  ];
  const isVideoCallOwner = videoCallOwners.some(app => owner.includes(app));
  const isVideoCallTitle = /(?:zoom\s+(?:meeting|webinar)|meeting\s+controls|google\s+meet|meet\.google\.com|meet\s*[-–]|microsoft\s+teams.*call|teams\s+meeting|slack\s+huddle|\bhuddle\b|discord.*(?:voice|call)|voice\s+connected|screen\s+shar(?:e|ing)|webex\s+meeting|cisco\s+webex|video\s+call|audio\s+call|in\s+a\s+call|meeting\s+in\s+progress)/i.test(title);

  if (isVideoCallOwner || isVideoCallTitle) {
    return { isQuiet: true, reason: 'videocall' };
  }

  // 2. Presentations & Slide Shows
  const isPresentationOwner = /powerpnt|powerpoint|keynote|simpress/i.test(owner);
  const isPresentationTitle = /(?:powerpoint\s+slide\s+show|\bslide\s*show\b|presenter\s+view|google\s+slides.*present|presentation.*google\s+slides|keynote.*presentation|full\s*screen\s*presentation|presentation\s+mode)/i.test(title);

  if (isPresentationOwner || isPresentationTitle) {
    return { isQuiet: true, reason: 'presentation' };
  }

  // 3. Full-Screen Applications
  // Window width and height cover at least display width - 4 and display height - 4
  if (winInfo.bounds && displayBounds) {
    const b = winInfo.bounds;
    const d = displayBounds;
    if (b.width >= (d.width - 4) && b.height >= (d.height - 4)) {
      return { isQuiet: true, reason: 'fullscreen' };
    }
  }

  return { isQuiet: false, reason: null };
}

/**
 * Checks if the foreground application name or window title matches the privacy blocklist.
 * 
 * @param {object|null} winInfo - Window info { title, owner }
 * @param {string[]} [blocklist] - Custom blocklist array
 * @returns {boolean} True if blocked
 */
function isWindowBlocked(winInfo, blocklist) {
  if (!winInfo) return false;
  const title = (winInfo.title || '').toLowerCase();
  const owner = (winInfo.owner || '').toLowerCase();
  const list = (blocklist && Array.isArray(blocklist) && blocklist.length > 0)
    ? blocklist
    : DEFAULT_BLOCKLIST;

  return list.some(item => {
    const kw = item.trim().toLowerCase();
    return kw && (title.includes(kw) || owner.includes(kw));
  });
}

/**
 * Returns formatted details for all connected monitors (ID, name, resolution, primary flag).
 * 
 * @returns {Array<{ id: string, index: number, name: string, label: string, isPrimary: boolean, bounds: object, workArea: object, scaleFactor: number }>}
 */
function getFormattedDisplays() {
  try {
    if (!screen || typeof screen.getPrimaryDisplay !== 'function') {
      return [{
        id: 'primary',
        index: 1,
        name: 'Primary Screen',
        label: 'Primary Screen (Default)',
        isPrimary: true,
        bounds: { x: 0, y: 0, width: 1920, height: 1080 },
        workArea: { x: 0, y: 0, width: 1920, height: 1040 },
        scaleFactor: 1
      }];
    }

    const primary = screen.getPrimaryDisplay();
    const all = screen.getAllDisplays ? screen.getAllDisplays() : [primary];

    return all.map((d, index) => {
      const isPrimary = d.id === primary.id;
      const name = d.label || `Display ${index + 1}`;
      const dimensions = `${d.bounds.width}×${d.bounds.height}`;
      return {
        id: String(d.id),
        index: index + 1,
        name,
        label: `${name} (${dimensions})${isPrimary ? ' - Primary' : ''}`,
        isPrimary,
        bounds: d.bounds,
        workArea: d.workArea,
        scaleFactor: d.scaleFactor || 1
      };
    });
  } catch (err) {
    console.warn('[Capture] getFormattedDisplays fallback error:', err.message);
    return [];
  }
}

/**
 * Resolves which display to capture based on config.watchDisplay and active foreground context.
 * 
 * @param {object} config - Application configuration
 * @param {object|null} activeWindow - Active foreground window with bounds
 * @returns {Display|null} Electron display object
 */
function resolveWatchDisplay(config, activeWindow) {
  if (!screen || typeof screen.getPrimaryDisplay !== 'function') return null;

  try {
    const primary = screen.getPrimaryDisplay();
    const all = screen.getAllDisplays ? screen.getAllDisplays() : [primary];
    const watchSetting = config?.watchDisplay || 'active';

    // 1. Follow Active Screen: matches foreground window or cursor position
    if (watchSetting === 'active') {
      if (activeWindow?.bounds) {
        const b = activeWindow.bounds;
        const center = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
        const winDisplay = screen.getDisplayNearestPoint(center);
        if (winDisplay) return winDisplay;
      }
      try {
        const cursorPoint = screen.getCursorScreenPoint();
        const cursorDisplay = screen.getDisplayNearestPoint(cursorPoint);
        if (cursorDisplay) return cursorDisplay;
      } catch (_) {}
      return primary;
    }

    // 2. Explicit Primary Display
    if (watchSetting === 'primary') {
      return primary;
    }

    // 3. Specific Display ID
    const matched = all.find(d => String(d.id) === String(watchSetting));
    if (matched) return matched;

    // Fallback to primary if specified monitor is disconnected
    return primary;
  } catch (err) {
    console.warn('[Capture] resolveWatchDisplay error:', err.message);
    return screen?.getPrimaryDisplay ? screen.getPrimaryDisplay() : null;
  }
}

/**
 * Captures display, computes 32x32 luminance hash to detect meaningful screen changes,
 * and downscales to 768px JPEG (quality 60). Supports multi-monitor watch selection
 * and Region Focus (Ctrl+Shift+S cropped bounding box).
 * 
 * Enforces privacy shield & quiet mode:
 * - If active window is on blocklist or screenshots are disabled, zero image data is captured.
 * - If active window is a full-screen app, video call, or presentation, completely suppresses commentary.
 * 
 * When Region Focus is active:
 * - The captured image is cropped to ONLY the user-selected box at native crisp resolution.
 * - Zero pixels outside the crop box are encoded or transmitted.
 * 
 * @param {object} [customConfig] - Optional override config
 * @param {object} [customRegion] - Optional explicit region override
 * @param {object} [options] - Optional flags ({ ignoreRegion: boolean })
 * @returns {Promise<{
 *   imageBase64: string|null,
 *   screenChanged: boolean,
 *   avgDiff: number,
 *   isBlocked: boolean,
 *   isQuiet: boolean,
 *   quietReason: string|null,
 *   screenshotsDisabled?: boolean,
 *   activeWindow: object|null,
 *   targetDisplay?: { id: string, name: string, bounds: object },
 *   isRegionFocused?: boolean,
 *   focusedRegion?: object|null
 * }>}
 */
async function captureScreenWithHash(customConfig, customRegion, options = {}) {
  try {
    const config = customConfig || loadConfig();
    const activeWindow = await getActiveWindow();

    // Check for active focused region unless explicitly ignored (e.g. background polling)
    const effectiveRegion = (!options.ignoreRegion) ? (customRegion || getActiveFocusedRegion()) : null;

    let targetDisplay = null;
    if (effectiveRegion && effectiveRegion.displayId && screen && typeof screen.getAllDisplays === 'function') {
      const all = screen.getAllDisplays();
      targetDisplay = all.find(d => String(d.id) === String(effectiveRegion.displayId));
    }

    if (!targetDisplay) {
      targetDisplay = resolveWatchDisplay(config, activeWindow) ||
        (screen && typeof screen.getPrimaryDisplay === 'function' ? screen.getPrimaryDisplay() : null);
    }

    const displayBounds = targetDisplay ? targetDisplay.bounds : null;
    const quietStatus = isQuietActivity(activeWindow, displayBounds);
    const screenMode = resolveEffectiveScreenMode(config, activeWindow);

    const displayInfo = targetDisplay ? {
      id: String(targetDisplay.id),
      name: targetDisplay.label || (targetDisplay.id === screen?.getPrimaryDisplay?.()?.id ? 'Primary Screen' : `Display ${targetDisplay.id}`),
      bounds: targetDisplay.bounds
    } : null;

    // 1. Check if user turned off screenshots toggle or in local-only / offline mode
    if (config.screenshotsEnabled === false || config.localOnly === true) {
      return {
        imageBase64: null,
        screenChanged: true,
        avgDiff: 0,
        isBlocked: false,
        isQuiet: quietStatus.isQuiet,
        quietReason: quietStatus.reason,
        screenshotsDisabled: true,
        localOnly: !!config.localOnly,
        screenMode,
        activeWindow,
        targetDisplay: displayInfo,
        isRegionFocused: !!effectiveRegion,
        focusedRegion: effectiveRegion || null
      };
    }

    // 2. Check if active foreground window is on privacy blocklist
    const isBlocked = isWindowBlocked(activeWindow, config.blocklist);
    if (isBlocked) {
      console.log(`[Privacy Shield] Active window "${activeWindow?.title || activeWindow?.owner}" is blocked. Zero screenshot taken.`);
      return {
        imageBase64: null,
        screenChanged: false,
        avgDiff: 0,
        isBlocked: true,
        isQuiet: quietStatus.isQuiet,
        quietReason: quietStatus.reason,
        screenMode: 'default',
        activeWindow: null,
        targetDisplay: displayInfo,
        isRegionFocused: !!effectiveRegion,
        focusedRegion: effectiveRegion || null
      };
    }

    // 3. Check quiet mode (full-screen, video calls, presentations)
    if (quietStatus.isQuiet) {
      console.log(`[Quiet Mode] Detected ${quietStatus.reason} for window "${activeWindow?.title || activeWindow?.owner}". Suppressing screen analysis.`);
      return {
        imageBase64: null,
        screenChanged: false,
        avgDiff: 0,
        isBlocked: false,
        isQuiet: true,
        quietReason: quietStatus.reason,
        screenMode,
        activeWindow,
        targetDisplay: displayInfo,
        isRegionFocused: !!effectiveRegion,
        focusedRegion: effectiveRegion || null
      };
    }

    if (!targetDisplay) {
      throw new Error('No target display available for screen capture');
    }

    const { width, height } = targetDisplay.size || targetDisplay.bounds;

    let imageBase64 = null;
    let screenChanged = true;
    let avgDiff = 255;
    let isRegionFocused = false;
    let focusedRegion = null;

    if (effectiveRegion) {
      // ----------------------------------------------------
      // REGION FOCUS CAPTURE
      // ----------------------------------------------------
      // Capture full native resolution so text/code inside cropped area is crystal clear
      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: { width, height }
      });

      if (!sources || sources.length === 0) {
        throw new Error('No desktop screen sources found for region capture');
      }

      const source = sources.find(s => s.display_id === `${targetDisplay.id}`) ||
                     sources.find(s => s.name && s.name.includes(`${targetDisplay.id}`)) ||
                     sources[0];
      const thumb = source.thumbnail;

      const cropX = Math.max(0, Math.min(Math.round(effectiveRegion.x), width - 10));
      const cropY = Math.max(0, Math.min(Math.round(effectiveRegion.y), height - 10));
      const cropW = Math.max(10, Math.min(Math.round(effectiveRegion.width), width - cropX));
      const cropH = Math.max(10, Math.min(Math.round(effectiveRegion.height), height - cropY));

      let cropped = (thumb && typeof thumb.crop === 'function')
        ? thumb.crop({ x: cropX, y: cropY, width: cropW, height: cropH })
        : thumb;

      // If cropped region is wider than targetWidth (768), scale down proportionally
      if (cropped && typeof cropped.getSize === 'function' && cropped.getSize().width > VISION_CONFIG.targetWidth) {
        const scale = VISION_CONFIG.targetWidth / cropped.getSize().width;
        cropped = cropped.resize({
          width: VISION_CONFIG.targetWidth,
          height: Math.round(cropped.getSize().height * scale)
        });
      }

      const buffer = (cropped && typeof cropped.toJPEG === 'function')
        ? cropped.toJPEG(VISION_CONFIG.jpegQuality)
        : Buffer.from('');
      imageBase64 = buffer.toString('base64');
      screenChanged = true;
      avgDiff = 100;
      isRegionFocused = true;
      focusedRegion = {
        x: cropX,
        y: cropY,
        width: cropW,
        height: cropH,
        displayId: String(targetDisplay.id)
      };
    } else {
      // ----------------------------------------------------
      // STANDARD FULL-SCREEN CAPTURE
      // ----------------------------------------------------
      const targetWidth = VISION_CONFIG.targetWidth;
      const targetHeight = Math.round((height / width) * targetWidth);

      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: { width: targetWidth, height: targetHeight }
      });

      if (!sources || sources.length === 0) {
        throw new Error('No desktop screen sources found');
      }

      const source = sources.find(s => s.display_id === `${targetDisplay.id}`) ||
                     sources.find(s => s.name && s.name.includes(`${targetDisplay.id}`)) ||
                     sources[0];
      const thumb = source.thumbnail;
      if (!thumb || (typeof thumb.isEmpty === 'function' && thumb.isEmpty())) {
        return {
          status: 'NO_IMAGE',
          reason: 'Desktop screen capture thumbnail was empty',
          hasChanged: false,
          base64: null,
          screenMode: 'general',
          context: null
        };
      }

      // 3. Compute 32x32 grayscale hash for change detection
      const small = thumb.resize({ width: VISION_CONFIG.hashSize, height: VISION_CONFIG.hashSize });
      const bmp = small.toBitmap(); // 32 * 32 * 4 = 4096 bytes
      const currentHash = computeGrayscaleHash(bmp);

      if (previousScreenHash) {
        const comp = compareHashes(currentHash, previousScreenHash, VISION_CONFIG.hashDiffThreshold);
        avgDiff = comp.avgDiff;
        screenChanged = comp.screenChanged;
      } else {
        avgDiff = 255;
        screenChanged = true;
      }

      previousScreenHash = currentHash;

      // 4. Encode downscaled 768px thumbnail as JPEG quality 60
      const buffer = thumb.toJPEG(VISION_CONFIG.jpegQuality);
      imageBase64 = buffer.toString('base64');
    }

    return {
      imageBase64,
      screenChanged,
      avgDiff,
      isBlocked: false,
      isQuiet: false,
      quietReason: null,
      screenMode,
      activeWindow,
      targetDisplay: displayInfo,
      isRegionFocused,
      focusedRegion
    };
  } catch (err) {
    console.error('[Capture] Screen capture error boundary caught failure:', err.message);
    return {
      imageBase64: null,
      screenChanged: true,
      avgDiff: 255,
      isBlocked: false,
      isQuiet: false,
      quietReason: null,
      screenMode: 'default',
      activeWindow: null,
      isRegionFocused: false,
      focusedRegion: null
    };
  }
}

// Backwards-compatible alias for existing callers
const capturePrimaryScreenWithHash = captureScreenWithHash;

/**
 * Computes a 1024-byte grayscale luminance hash from a 4096-byte 32x32 bitmap buffer.
 * Standard luminance: 0.299*R + 0.587*G + 0.114*B
 * 
 * @param {Buffer|Uint8Array} bmp - 4096-byte bitmap buffer (32x32x4)
 * @returns {Uint8Array} 1024-byte grayscale hash
 */
function computeGrayscaleHash(bmp) {
  if (!bmp || bmp.length < 4096) {
    throw new Error('Bitmap buffer must be at least 4096 bytes (32x32x4)');
  }
  const hash = new Uint8Array(1024);
  for (let i = 0; i < 1024; i++) {
    const idx = i * 4;
    const b = bmp[idx];
    const g = bmp[idx + 1];
    const r = bmp[idx + 2];
    hash[i] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
  }
  return hash;
}

/**
 * Compares two 1024-byte grayscale hashes to detect meaningful visual change.
 * 
 * @param {Uint8Array} hash1 
 * @param {Uint8Array} hash2 
 * @param {number} [threshold] - Default VISION_CONFIG.hashDiffThreshold
 * @returns {{ avgDiff: number, screenChanged: boolean }}
 */
function compareHashes(hash1, hash2, threshold = VISION_CONFIG.hashDiffThreshold) {
  if (!hash1 || !hash2 || hash1.length !== 1024 || hash2.length !== 1024) {
    return { avgDiff: 255, screenChanged: true };
  }
  let diff = 0;
  for (let i = 0; i < 1024; i++) {
    diff += Math.abs(hash1[i] - hash2[i]);
  }
  const avgDiff = diff / 1024;
  return {
    avgDiff,
    screenChanged: avgDiff >= threshold
  };
}

/**
 * Resets screen hash comparison (useful on mode changes).
 */
function resetScreenHash() {
  previousScreenHash = null;
}

module.exports = {
  getActiveWindow,
  getAppDurationTracker,
  isWindowBlocked,
  isQuietActivity,
  getFormattedDisplays,
  resolveWatchDisplay,
  captureScreenWithHash,
  capturePrimaryScreenWithHash,
  resetScreenHash,
  computeGrayscaleHash,
  compareHashes,
  detectScreenContext,
  resolveEffectiveScreenMode,
  getActiveFocusedRegion,
  setActiveFocusedRegion,
  clearActiveFocusedRegion,
  consumeActiveFocusedRegion
};
