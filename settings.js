/**
 * Desktop AI Companion - Settings & State Management (settings.js)
 * 
 * Manages persistent user preferences (settings.json), long-term companion memory
 * (memory.json), daily API call budget enforcement, the frosted glass settings window,
 * system tray presence, and OS auto-launch on login.
 */

const { app, BrowserWindow, screen, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const {
  settingsPath,
  memoryPath,
  legacyConfigPath,
  DEFAULT_CONFIG,
  DEFAULT_MEMORY,
  DEFAULT_CHARACTER_PROFILES,
  WINDOW_CONFIG
} = require('./config');
const {
  isSafeStorageAvailable,
  encryptApiKey,
  decryptApiKey,
  migrateEnvToSafeStorage
} = require('./security');

// Active window references
let mainWindowRef = null;
let settingsWindow = null;
let tray = null;

/**
 * Register reference to the primary companion window for IPC broadcast dispatch.
 * @param {BrowserWindow} win 
 */
function setMainWindowRef(win) {
  mainWindowRef = win;
}

// ==========================================================
// CONFIGURATION PERSISTENCE (settings.json)
// ==========================================================

/**
 * Loads current settings from settings.json with graceful fallback migration.
 * @returns {object} Merged configuration object with defaults guaranteed
 */
function loadConfig() {
  try {
    // Helper to ensure valid profiles and decrypt safeStorage credentials on loaded config
    const sanitizeConfig = (cfg) => {
      const profiles = (Array.isArray(cfg.characterProfiles) && cfg.characterProfiles.length > 0)
        ? cfg.characterProfiles
        : DEFAULT_CHARACTER_PROFILES;
      const profileId = cfg.characterProfileId || (profiles[0] && profiles[0].id) || 'profile_aura';

      // Resolve API key: Priority 1 = safeStorage encrypted key, Priority 2 = config plaintext, Priority 3 = env
      let resolvedKey = '';
      if (cfg.encryptedApiKey) {
        resolvedKey = decryptApiKey(cfg.encryptedApiKey);
      }
      if (!resolvedKey && cfg.apiKey) {
        resolvedKey = cfg.apiKey;
        // Auto-migrate plaintext key to encrypted safeStorage if available
        if (isSafeStorageAvailable() && resolvedKey) {
          const enc = encryptApiKey(resolvedKey);
          if (enc) {
            cfg.encryptedApiKey = enc;
            delete cfg.apiKey;
            try {
              fs.writeFileSync(settingsPath, JSON.stringify(cfg, null, 2), 'utf-8');
            } catch (_) {}
          }
        }
      }
      if (!resolvedKey && process.env.ANTHROPIC_API_KEY) {
        resolvedKey = process.env.ANTHROPIC_API_KEY;
      }

      // Resolve Gemini API key
      let resolvedGeminiKey = '';
      if (cfg.encryptedGeminiApiKey) {
        resolvedGeminiKey = decryptApiKey(cfg.encryptedGeminiApiKey);
      }
      if (!resolvedGeminiKey && cfg.geminiApiKey) {
        resolvedGeminiKey = cfg.geminiApiKey;
        if (isSafeStorageAvailable() && resolvedGeminiKey) {
          const encGemini = encryptApiKey(resolvedGeminiKey);
          if (encGemini) {
            cfg.encryptedGeminiApiKey = encGemini;
            delete cfg.geminiApiKey;
            try {
              fs.writeFileSync(settingsPath, JSON.stringify(cfg, null, 2), 'utf-8');
            } catch (_) {}
          }
        }
      }
      if (!resolvedGeminiKey && process.env.GEMINI_API_KEY) {
        resolvedGeminiKey = process.env.GEMINI_API_KEY;
      }

      const activeProvider = cfg.aiProvider || (resolvedGeminiKey && !resolvedKey ? 'gemini' : 'claude');

      return {
        ...DEFAULT_CONFIG,
        ...cfg,
        characterProfiles: profiles,
        characterProfileId: profileId,
        aiProvider: activeProvider,
        apiKey: resolvedKey || '',
        geminiApiKey: resolvedGeminiKey || '',
        geminiModel: cfg.geminiModel || 'gemini-2.0-flash'
      };
    };

    // 1. Primary storage path (dev root or %APPDATA%)
    if (fs.existsSync(settingsPath)) {
      const data = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      return sanitizeConfig(data);
    }

    // 2. Fallback to bundled settings.json on fresh packaged install
    const bundledSettings = path.join(__dirname, 'settings.json');
    if (app && app.isPackaged && fs.existsSync(bundledSettings)) {
      try {
        const bundled = JSON.parse(fs.readFileSync(bundledSettings, 'utf-8'));
        const merged = sanitizeConfig(bundled);
        fs.writeFileSync(settingsPath, JSON.stringify(merged, null, 2), 'utf-8');
        return merged;
      } catch (_) {}
    }

    // 3. Fallback to legacy configuration file if present
    if (fs.existsSync(legacyConfigPath)) {
      const data = JSON.parse(fs.readFileSync(legacyConfigPath, 'utf-8'));
      const merged = sanitizeConfig(data);
      fs.writeFileSync(settingsPath, JSON.stringify(merged, null, 2), 'utf-8');
      return merged;
    }
  } catch (err) {
    console.error('[Settings] Error reading settings.json:', err.message);
  }

  // Fallback: create fresh settings.json with defaults
  try {
    fs.writeFileSync(settingsPath, JSON.stringify(DEFAULT_CONFIG, null, 2), 'utf-8');
  } catch (_) {}

  return { ...DEFAULT_CONFIG };
}

/**
 * Saves updated preferences to settings.json with safeStorage encryption.
 * @param {object} newConfig - Delta of configuration properties to merge
 * @returns {object} Full updated configuration object
 */
function saveConfig(newConfig) {
  try {
    const current = loadConfig();
    const updated = { ...current, ...newConfig };

    // Disk config: ensure API key is encrypted and never written plaintext when safeStorage is available
    const diskConfig = { ...updated };
    if (newConfig.apiKey != null) {
      const plainKey = String(newConfig.apiKey).trim();
      if (plainKey && isSafeStorageAvailable()) {
        const enc = encryptApiKey(plainKey);
        if (enc) {
          diskConfig.encryptedApiKey = enc;
          delete diskConfig.apiKey;
        } else {
          diskConfig.apiKey = plainKey;
        }
      } else if (!plainKey) {
        delete diskConfig.encryptedApiKey;
        diskConfig.apiKey = '';
      }
    } else if (current.encryptedApiKey) {
      diskConfig.encryptedApiKey = current.encryptedApiKey;
      delete diskConfig.apiKey;
    }

    // Disk config: ensure Gemini API key is encrypted and never written plaintext when safeStorage is available
    if (newConfig.geminiApiKey != null) {
      const plainGemini = String(newConfig.geminiApiKey).trim();
      if (plainGemini && isSafeStorageAvailable()) {
        const encGemini = encryptApiKey(plainGemini);
        if (encGemini) {
          diskConfig.encryptedGeminiApiKey = encGemini;
          delete diskConfig.geminiApiKey;
        } else {
          diskConfig.geminiApiKey = plainGemini;
        }
      } else if (!plainGemini) {
        delete diskConfig.encryptedGeminiApiKey;
        diskConfig.geminiApiKey = '';
      }
    } else if (current.encryptedGeminiApiKey) {
      diskConfig.encryptedGeminiApiKey = current.encryptedGeminiApiKey;
      delete diskConfig.geminiApiKey;
    }

    fs.writeFileSync(settingsPath, JSON.stringify(diskConfig, null, 2), 'utf-8');
    updateTrayMenu();
    return updated;
  } catch (err) {
    console.error('[Settings] Error saving settings.json:', err.message);
    return null;
  }
}

// ==========================================================
// CHARACTER PROFILES MANAGEMENT
// ==========================================================

/**
 * Resolves the currently active character profile.
 * @param {object} [cfg] - Optional config object
 * @returns {object} Active profile object
 */
function getActiveCharacterProfile(cfg) {
  const config = cfg || loadConfig();
  const profiles = (Array.isArray(config.characterProfiles) && config.characterProfiles.length > 0)
    ? config.characterProfiles
    : DEFAULT_CHARACTER_PROFILES;
  const activeId = config.characterProfileId || (profiles[0] && profiles[0].id);
  return profiles.find(p => p.id === activeId) || profiles[0];
}

/**
 * Switches the active character profile and notifies all windows and tray.
 * @param {string} profileId - ID of profile to activate
 * @returns {object|null} The activated profile or null
 */
function switchCharacterProfile(profileId) {
  try {
    const config = loadConfig();
    const profiles = (Array.isArray(config.characterProfiles) && config.characterProfiles.length > 0)
      ? config.characterProfiles
      : DEFAULT_CHARACTER_PROFILES;
    const target = profiles.find(p => p.id === profileId);
    if (!target) return null;

    const delta = { characterProfileId: target.id };
    if (target.voiceURI) {
      delta.voiceURI = target.voiceURI;
    }
    const updated = saveConfig(delta);

    // Broadcast profile change to renderers
    if (mainWindowRef && !mainWindowRef.isDestroyed()) {
      mainWindowRef.webContents.send('profile-changed', target);
      mainWindowRef.webContents.send('config-updated', updated);
    }
    if (settingsWindow && !settingsWindow.isDestroyed()) {
      settingsWindow.webContents.send('profile-changed', target);
      settingsWindow.webContents.send('config-updated', updated);
    }

    updateTrayMenu();
    return target;
  } catch (err) {
    console.error('[Settings] Error switching character profile:', err.message);
    return null;
  }
}

/**
 * Saves or updates a character profile in settings.json.
 * @param {object} profile
 * @returns {{ success: boolean, profile?: object, error?: string }}
 */
function saveCharacterProfile(profile) {
  try {
    const config = loadConfig();
    let profiles = (Array.isArray(config.characterProfiles) && config.characterProfiles.length > 0)
      ? [...config.characterProfiles]
      : [...DEFAULT_CHARACTER_PROFILES];

    const profileId = profile.id || `profile_${Date.now()}`;
    const cleanProfile = {
      id: profileId,
      name: profile.name ? profile.name.trim() : 'Companion',
      shape: ['orb', 'blob', 'cube', 'ring'].includes(profile.shape) ? profile.shape : 'orb',
      palette: profile.palette || 'cyan-violet',
      primaryColor: profile.primaryColor || '#00F3FF',
      secondaryColor: profile.secondaryColor || '#A855F7',
      glowStrength: typeof profile.glowStrength === 'number' ? Math.max(0, Math.min(2.0, profile.glowStrength)) : 1.0,
      voiceURI: profile.voiceURI || '',
      customSystemPrompt: profile.customSystemPrompt || ''
    };

    const existingIdx = profiles.findIndex(p => p.id === cleanProfile.id);
    if (existingIdx !== -1) {
      profiles[existingIdx] = cleanProfile;
    } else {
      profiles.push(cleanProfile);
    }

    const delta = {
      characterProfiles: profiles,
      characterProfileId: cleanProfile.id
    };
    if (cleanProfile.voiceURI) {
      delta.voiceURI = cleanProfile.voiceURI;
    }

    const updated = saveConfig(delta);

    if (mainWindowRef && !mainWindowRef.isDestroyed()) {
      mainWindowRef.webContents.send('profile-changed', cleanProfile);
      mainWindowRef.webContents.send('config-updated', updated);
    }
    if (settingsWindow && !settingsWindow.isDestroyed()) {
      settingsWindow.webContents.send('profile-changed', cleanProfile);
      settingsWindow.webContents.send('config-updated', updated);
    }

    updateTrayMenu();
    return { success: true, profile: cleanProfile };
  } catch (err) {
    console.error('[Settings] Error saving character profile:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Deletes a character profile (prevents deleting the last remaining profile).
 * @param {string} profileId
 * @returns {{ success: boolean, activeProfileId?: string, profile?: object, error?: string }}
 */
function deleteCharacterProfile(profileId) {
  try {
    const config = loadConfig();
    let profiles = (Array.isArray(config.characterProfiles) && config.characterProfiles.length > 0)
      ? [...config.characterProfiles]
      : [...DEFAULT_CHARACTER_PROFILES];

    if (profiles.length <= 1) {
      return { success: false, error: 'Cannot delete the only remaining profile.' };
    }

    const filtered = profiles.filter(p => p.id !== profileId);
    if (filtered.length === profiles.length) {
      return { success: false, error: 'Profile not found.' };
    }

    let activeId = config.characterProfileId;
    if (activeId === profileId) {
      activeId = filtered[0].id;
    }

    const updated = saveConfig({
      characterProfiles: filtered,
      characterProfileId: activeId
    });

    const newActiveProfile = filtered.find(p => p.id === activeId);

    if (mainWindowRef && !mainWindowRef.isDestroyed()) {
      if (newActiveProfile) mainWindowRef.webContents.send('profile-changed', newActiveProfile);
      mainWindowRef.webContents.send('config-updated', updated);
    }
    if (settingsWindow && !settingsWindow.isDestroyed()) {
      if (newActiveProfile) settingsWindow.webContents.send('profile-changed', newActiveProfile);
      settingsWindow.webContents.send('config-updated', updated);
    }

    updateTrayMenu();
    return { success: true, activeProfileId: activeId, profile: newActiveProfile };
  } catch (err) {
    console.error('[Settings] Error deleting character profile:', err.message);
    return { success: false, error: err.message };
  }
}

// ==========================================================
// MEMORY PERSISTENCE (memory.json)
// ==========================================================

/**
 * Loads remembered user facts from memory.json.
 * @returns {object} Memory state { userName, facts: string[] }
 */
function loadMemory() {
  try {
    if (fs.existsSync(memoryPath)) {
      return JSON.parse(fs.readFileSync(memoryPath, 'utf-8'));
    }
    const bundledMemory = path.join(__dirname, 'memory.json');
    if (app && app.isPackaged && fs.existsSync(bundledMemory)) {
      try {
        const bundled = JSON.parse(fs.readFileSync(bundledMemory, 'utf-8'));
        fs.writeFileSync(memoryPath, JSON.stringify(bundled, null, 2), 'utf-8');
        return bundled;
      } catch (_) {}
    }
    fs.writeFileSync(memoryPath, JSON.stringify(DEFAULT_MEMORY, null, 2), 'utf-8');
    return { ...DEFAULT_MEMORY };
  } catch (err) {
    console.error('[Settings] Error reading memory.json:', err.message);
    return { ...DEFAULT_MEMORY };
  }
}

/**
 * Saves updated facts into memory.json.
 * @param {object} newMemory 
 * @returns {object} Updated memory state
 */
function saveMemory(newMemory) {
  try {
    const current = loadMemory();
    const updated = { ...current, ...newMemory };
    fs.writeFileSync(memoryPath, JSON.stringify(updated, null, 2), 'utf-8');
    return updated;
  } catch (err) {
    console.error('[Settings] Error saving memory.json:', err.message);
    return null;
  }
}

// ==========================================================
// DAILY API BUDGET MANAGEMENT
// ==========================================================

/**
 * Checks if today's call count has reached dailyApiBudget.
 * Automatically resets count if calendar date changed.
 * Increments count and broadcasts if allowed.
 * 
 * @returns {{ allowed: boolean, count: number, budget: number, friendlyMessage?: string }}
 */
function checkAndIncrementApiBudget() {
  const config = loadConfig();
  const today = new Date().toISOString().slice(0, 10);
  let usage = config.apiUsage;
  if (!usage || typeof usage !== 'object' || usage.date !== today) {
    usage = { date: today, count: 0 };
  }

  const budget = config.dailyApiBudget != null ? config.dailyApiBudget : 100;

  // Enforce budget limit if budget > 0
  if (budget > 0 && usage.count >= budget) {
    return {
      allowed: false,
      count: usage.count,
      budget,
      friendlyMessage: `We've reached today's API budget limit (${usage.count}/${budget} calls)! Taking a rest until tomorrow, or you can adjust your budget in Settings.`
    };
  }

  // Increment and persist count
  usage.count += 1;
  saveConfig({ apiUsage: usage });

  // Broadcast updated usage
  broadcastApiUsage({ ...usage, budget });

  return {
    allowed: true,
    count: usage.count,
    budget
  };
}

/**
 * Decrements the usage count if an API call fails before reaching Anthropic or on 401.
 */
function decrementApiUsage() {
  try {
    const config = loadConfig();
    const today = new Date().toISOString().slice(0, 10);
    const usage = config.apiUsage || { date: today, count: 0 };
    if (usage.date === today && usage.count > 0) {
      usage.count -= 1;
      saveConfig({ apiUsage: usage });
      broadcastApiUsage({ ...usage, budget: config.dailyApiBudget });
    }
  } catch (err) {
    console.warn('[Settings] Error decrementing API usage:', err.message);
  }
}

/**
 * Broadcasts live API usage stats to active windows.
 */
function broadcastApiUsage(data) {
  if (mainWindowRef && !mainWindowRef.isDestroyed()) {
    mainWindowRef.webContents.send('api-usage-updated', data);
  }
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.webContents.send('api-usage-updated', data);
  }
}

// ==========================================================
// FROSTED GLASS SETTINGS WINDOW
// ==========================================================

/**
 * Opens or restores the dedicated Settings Window.
 */
function openSettingsWindow() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    if (settingsWindow.isMinimized()) settingsWindow.restore();
    settingsWindow.show();
    settingsWindow.focus();
    return;
  }

  try {
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;
    const { width: winWidth, height: winHeight } = WINDOW_CONFIG.settings;

    const appIcon = path.join(__dirname, 'assets', 'icon.png');

    settingsWindow = new BrowserWindow({
      width: winWidth,
      height: winHeight,
      icon: appIcon,
      x: Math.round((screenWidth - winWidth) / 2),
      y: Math.round((screenHeight - winHeight) / 2),
      transparent: true,
      frame: false,
      resizable: false,
      alwaysOnTop: true,
      skipTaskbar: false,
      hasShadow: true,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false
      }
    });

    settingsWindow.loadFile(path.join(__dirname, 'renderer', 'settings.html'));

    settingsWindow.on('closed', () => {
      settingsWindow = null;
    });
  } catch (err) {
    console.error('[Settings] Failed to create settings window:', err.message);
  }
}

/**
 * Closes the Settings Window if open.
 */
function closeSettingsWindow() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.close();
  }
}

function getSettingsWindow() {
  return settingsWindow;
}

// ==========================================================
// SYSTEM TRAY ICON & CONTROLS
// ==========================================================

/**
 * Initializes system tray presence with context menu.
 */
function createTray() {
  if (tray && !tray.isDestroyed()) return;

  try {
    const iconPath = process.platform === 'win32' && fs.existsSync(path.join(__dirname, 'assets', 'icon.ico'))
      ? path.join(__dirname, 'assets', 'icon.ico')
      : path.join(__dirname, 'assets', 'tray-icon.png');
    const icon = nativeImage.createFromPath(iconPath);

    tray = new Tray(icon);
    tray.setToolTip('Desktop AI Companion');

    updateTrayMenu();

    tray.on('click', () => {
      if (mainWindowRef && !mainWindowRef.isDestroyed()) {
        if (mainWindowRef.isMinimized()) mainWindowRef.restore();
        mainWindowRef.show();
        mainWindowRef.focus();
      }
    });

    tray.on('double-click', () => {
      openSettingsWindow();
    });
  } catch (err) {
    console.error('[Settings] Failed to create system tray:', err.message);
  }
}

/**
 * Updates tray tooltip and context menu items (Pause/Resume, Settings, Start on Login, Quit).
 */
function updateTrayMenu() {
  if (!tray || tray.isDestroyed()) return;

  try {
    const config = loadConfig();
    const isPaused = !!config.isPaused;
    const startOnLogin = app ? app.getLoginItemSettings().openAtLogin : false;

    const profiles = (Array.isArray(config.characterProfiles) && config.characterProfiles.length > 0)
      ? config.characterProfiles
      : DEFAULT_CHARACTER_PROFILES;
    const activeProfileId = config.characterProfileId || (profiles[0] && profiles[0].id);

    const profileMenuItems = profiles.map(p => {
      const shapeEmoji = {
        orb: '🔮',
        blob: '🫧',
        cube: '🧊',
        ring: '🪐'
      }[p.shape] || '✨';
      return {
        label: `${shapeEmoji}  ${p.name || 'Unnamed'} (${p.shape || 'orb'})`,
        type: 'radio',
        checked: p.id === activeProfileId,
        click: () => {
          switchCharacterProfile(p.id);
        }
      };
    });

    const contextMenu = Menu.buildFromTemplate([
      {
        label: isPaused ? '▶  Resume Companion' : '⏸  Pause Companion',
        click: () => {
          togglePauseFromMain();
        }
      },
      {
        label: '🎭  Character Profiles',
        submenu: profileMenuItems
      },
      {
        label: '⚙  Settings...',
        click: () => {
          openSettingsWindow();
        }
      },
      {
        label: '🚀  Start on Login',
        type: 'checkbox',
        checked: startOnLogin,
        click: (menuItem) => {
          setStartOnLogin(menuItem.checked);
        }
      },
      { type: 'separator' },
      {
        label: '✕  Quit',
        click: () => {
          app.quit();
        }
      }
    ]);

    tray.setContextMenu(contextMenu);
    try {
      tray.setToolTip(isPaused ? 'Desktop AI Companion (Paused)' : 'Desktop AI Companion');
    } catch (_) {}
  } catch (err) {
    console.error('[Settings] Failed to update tray menu:', err.message);
  }
}

/**
 * Toggles pause state via renderer IPC shortcut or direct config update.
 */
function togglePauseFromMain() {
  if (mainWindowRef && !mainWindowRef.isDestroyed()) {
    mainWindowRef.webContents.send('shortcut-toggle-pause');
  } else {
    const config = loadConfig();
    saveConfig({ isPaused: !config.isPaused });
    updateTrayMenu();
  }
}

/**
 * Configures OS automatic startup on login.
 * @param {boolean} openAtLogin 
 */
function setStartOnLogin(openAtLogin) {
  if (!app) return;
  const isDev = !app.isPackaged;
  app.setLoginItemSettings({
    openAtLogin: !!openAtLogin,
    path: process.execPath,
    args: isDev ? [path.resolve('.')] : []
  });
  saveConfig({ startOnLogin: !!openAtLogin });
  updateTrayMenu();
}

/**
 * Syncs login item setting from saved settings.json.
 */
function syncStartOnLoginWithConfig() {
  if (!app) return;
  const config = loadConfig();
  if (typeof config.startOnLogin === 'boolean') {
    const currentLogin = app.getLoginItemSettings().openAtLogin;
    if (currentLogin !== config.startOnLogin) {
      setStartOnLogin(config.startOnLogin);
    }
  }
}

/**
 * Clean destruction of tray on application exit.
 */
function destroyTray() {
  if (tray && !tray.isDestroyed()) {
    tray.destroy();
    tray = null;
  }
}

module.exports = {
  setMainWindowRef,
  loadConfig,
  saveConfig,
  loadMemory,
  saveMemory,
  checkAndIncrementApiBudget,
  decrementApiUsage,
  openSettingsWindow,
  closeSettingsWindow,
  getSettingsWindow,
  getActiveCharacterProfile,
  switchCharacterProfile,
  saveCharacterProfile,
  deleteCharacterProfile,
  createTray,
  updateTrayMenu,
  togglePauseFromMain,
  setStartOnLogin,
  syncStartOnLoginWithConfig,
  destroyTray
};
