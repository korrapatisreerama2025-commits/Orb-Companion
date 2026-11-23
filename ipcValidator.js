/**
 * Desktop AI Companion - Strict IPC Message Validation Engine (ipcValidator.js)
 * 
 * Enforces comprehensive schema validation, type checks, bounds checks, prototype
 * pollution defense, and protocol sanitization on all inbound IPC messages from renderers.
 */

const path = require('path');
const { ALLOWED_SAFE_ACTIONS, FORBIDDEN_OPERATIONS, ALLOWED_OUTFITS } = require('./config');

const ALLOWED_OUTFIT_SET = new Set(ALLOWED_OUTFITS || [
  'none',
  'bow',
  'bandana',
  'glasses',
  'scarf',
  'crown',
  'santa-hat',
  'party-hat',
  'festival-decorations'
]);

// Supported Screen Modes
const ALLOWED_SCREEN_MODES = new Set([
  'auto',
  'default',
  'coding',
  'writing',
  'video',
  'reading',
  'design',
  'browsing'
]);

// Supported Personalities
const ALLOWED_PERSONALITIES = new Set([
  'friendly',
  'sarcastic',
  'study-buddy',
  'calm-mentor'
]);

// Supported Character Shapes
const ALLOWED_CHARACTER_SHAPES = new Set([
  'orb',
  'blob',
  'cube',
  'ring'
]);

// Supported Select-to-Ask Translation Languages
const ALLOWED_TRANSLATE_LANGUAGES = new Set([
  'English',
  'Hindi',
  'Telugu',
  'Japanese'
]);

// Whitelist of allowed application launch targets
const ALLOWED_APP_NAMES = new Set([
  'notepad',
  'calc',
  'calculator',
  'paint',
  'terminal',
  'powershell',
  'cmd',
  'code',
  'vscode',
  'taskmgr',
  'task manager',
  'explorer',
  'files'
]);

/**
 * Checks for prototype pollution attack vectors in object keys.
 * @param {object} obj 
 * @returns {boolean} True if clean, false if pollution detected
 */
function isCleanObject(obj) {
  if (obj == null || typeof obj !== 'object') return false;
  const keys = Object.keys(obj);
  for (const k of keys) {
    if (k === '__proto__' || k === 'constructor' || k === 'prototype') {
      return false;
    }
  }
  return true;
}

/**
 * Validates 'window-move' payload.
 */
function validateWindowMove(payload) {
  if (!payload || typeof payload !== 'object' || !isCleanObject(payload)) {
    return null;
  }
  const deltaX = Number(payload.deltaX);
  const deltaY = Number(payload.deltaY);
  if (!Number.isFinite(deltaX) || !Number.isFinite(deltaY)) {
    return null;
  }
  // Clamp drag deltas to reasonable single-frame limits
  const clampedX = Math.max(-2000, Math.min(2000, Math.round(deltaX)));
  const clampedY = Math.max(-2000, Math.min(2000, Math.round(deltaY)));
  return { deltaX: clampedX, deltaY: clampedY };
}

/**
 * Validates 'set-ignore-mouse-events' payload.
 */
function validateIgnoreMouseEvents(ignore, options) {
  const safeIgnore = Boolean(ignore);
  let safeOptions = undefined;
  if (options && typeof options === 'object' && isCleanObject(options)) {
    safeOptions = { forward: Boolean(options.forward) };
  }
  return { ignore: safeIgnore, options: safeOptions };
}

/**
 * Validates 'move-to-display' payload.
 */
function validateDisplayTarget(displayId) {
  if (displayId == null) return null;
  const str = String(displayId).trim();
  if (!str || str.length > 32) return null;
  if (/^[a-zA-Z0-9_\-]+$/.test(str)) {
    return str;
  }
  return null;
}

/**
 * Validates 'start-claude-stream' payload.
 */
function validateClaudeStreamParams(params) {
  if (!params || typeof params !== 'object' || !isCleanObject(params)) {
    return null;
  }
  if (!params.streamId || typeof params.streamId !== 'string' || params.streamId.length > 100) {
    return null;
  }

  const clean = {
    streamId: params.streamId.replace(/[^a-zA-Z0-9_\-]/g, ''),
    isRandom: Boolean(params.isRandom),
    isHelpMode: Boolean(params.isHelpMode),
    isNextStepMode: Boolean(params.isNextStepMode),
    isClipboardAction: Boolean(params.isClipboardAction),
    isSelectToAsk: Boolean(params.isSelectToAsk),
    isRegionFocused: Boolean(params.isRegionFocused),
    isOffline: Boolean(params.isOffline)
  };

  if (typeof params.selectToAskAction === 'string' && ['explain', 'simplify', 'translate', 'quiz', 'quiz_evaluate'].includes(params.selectToAskAction)) {
    clean.selectToAskAction = params.selectToAskAction;
  }

  if (typeof params.selectToAskTargetLang === 'string' && ALLOWED_TRANSLATE_LANGUAGES.has(params.selectToAskTargetLang)) {
    clean.selectToAskTargetLang = params.selectToAskTargetLang;
  }

  if (typeof params.quizQuestion === 'string') {
    clean.quizQuestion = params.quizQuestion.slice(0, 2000);
  }

  if (typeof params.userAnswer === 'string') {
    clean.userAnswer = params.userAnswer.slice(0, 2000);
  }

  if (typeof params.userTranscript === 'string') {
    clean.userTranscript = params.userTranscript.slice(0, 10000);
  }

  if (typeof params.personality === 'string' && ALLOWED_PERSONALITIES.has(params.personality)) {
    clean.personality = params.personality;
  }

  if (typeof params.screenMode === 'string' && ALLOWED_SCREEN_MODES.has(params.screenMode)) {
    clean.screenMode = params.screenMode;
  }

  if (typeof params.mood === 'string' && /^[a-z]{3,16}$/.test(params.mood)) {
    clean.mood = params.mood;
  }

  if (params.focusedRegion && typeof params.focusedRegion === 'object' && isCleanObject(params.focusedRegion)) {
    const { x, y, width, height } = params.focusedRegion;
    if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(width) && Number.isFinite(height)) {
      clean.focusedRegion = {
        x: Math.max(0, Math.round(x)),
        y: Math.max(0, Math.round(y)),
        width: Math.max(20, Math.min(10000, Math.round(width))),
        height: Math.max(20, Math.min(10000, Math.round(height)))
      };
    }
  }

  return clean;
}

/**
 * Validates 'save-config' payload with strict whitelist and range sanitization.
 */
function validateSaveConfig(rawConfig) {
  if (!rawConfig || typeof rawConfig !== 'object' || !isCleanObject(rawConfig)) {
    return null;
  }

  const clean = {};

  if (typeof rawConfig.apiKey === 'string') {
    clean.apiKey = rawConfig.apiKey.trim().slice(0, 256);
  }

  if (typeof rawConfig.geminiApiKey === 'string') {
    clean.geminiApiKey = rawConfig.geminiApiKey.trim().slice(0, 256);
  }

  if (typeof rawConfig.aiProvider === 'string' && ['claude', 'gemini', 'ollama'].includes(rawConfig.aiProvider)) {
    clean.aiProvider = rawConfig.aiProvider;
  }

  if (typeof rawConfig.geminiModel === 'string') {
    clean.geminiModel = rawConfig.geminiModel.trim().replace(/[^a-zA-Z0-9_\-.:]/g, '').slice(0, 64);
  }

  if (rawConfig.dailyApiBudget != null) {
    const budget = Number(rawConfig.dailyApiBudget);
    if (Number.isFinite(budget) && budget >= 0 && budget <= 100000) {
      clean.dailyApiBudget = Math.round(budget);
    }
  }

  if (rawConfig.frequencySeconds != null) {
    const freq = Number(rawConfig.frequencySeconds);
    if (Number.isFinite(freq) && freq >= 10 && freq <= 3600) {
      clean.frequencySeconds = Math.round(freq);
    }
  }

  if (typeof rawConfig.frequency === 'string' && ['often', 'normal', 'rare'].includes(rawConfig.frequency)) {
    clean.frequency = rawConfig.frequency;
  }

  if (typeof rawConfig.personality === 'string' && ALLOWED_PERSONALITIES.has(rawConfig.personality)) {
    clean.personality = rawConfig.personality;
  }

  if (typeof rawConfig.theme === 'string' && ['auto', 'minimal-white', 'sunset', 'neon', 'dark-glass'].includes(rawConfig.theme)) {
    clean.theme = rawConfig.theme;
  }

  if (typeof rawConfig.voiceURI === 'string') {
    clean.voiceURI = rawConfig.voiceURI.slice(0, 200);
  }

  if (rawConfig.voiceEnabled != null) clean.voiceEnabled = Boolean(rawConfig.voiceEnabled);
  if (rawConfig.isVoiceMuted != null) clean.isVoiceMuted = Boolean(rawConfig.isVoiceMuted);
  if (rawConfig.soundMuted != null) clean.soundMuted = Boolean(rawConfig.soundMuted);
  if (rawConfig.soundVolume != null) {
    const vol = Number(rawConfig.soundVolume);
    if (Number.isFinite(vol) && vol >= 0 && vol <= 1) {
      clean.soundVolume = Math.round(vol * 100) / 100;
    }
  }
  if (rawConfig.screenshotsEnabled != null) clean.screenshotsEnabled = Boolean(rawConfig.screenshotsEnabled);
  if (rawConfig.adaptiveFrequency != null) clean.adaptiveFrequency = Boolean(rawConfig.adaptiveFrequency);
  if (rawConfig.smartScreenModes != null) clean.smartScreenModes = Boolean(rawConfig.smartScreenModes);
  if (rawConfig.reactionLowBattery != null) clean.reactionLowBattery = Boolean(rawConfig.reactionLowBattery);
  if (rawConfig.reactionChargerPlugged != null) clean.reactionChargerPlugged = Boolean(rawConfig.reactionChargerPlugged);
  if (rawConfig.reactionChargerUnplugged != null) clean.reactionChargerUnplugged = Boolean(rawConfig.reactionChargerUnplugged);
  if (rawConfig.reactionNetworkChange != null) clean.reactionNetworkChange = Boolean(rawConfig.reactionNetworkChange);
  if (rawConfig.reactionHeadphones != null) clean.reactionHeadphones = Boolean(rawConfig.reactionHeadphones);
  if (typeof rawConfig.translateLanguage === 'string' && ALLOWED_TRANSLATE_LANGUAGES.has(rawConfig.translateLanguage)) {
    clean.translateLanguage = rawConfig.translateLanguage;
  }
  if (rawConfig.clickStartsPomodoro != null) clean.clickStartsPomodoro = Boolean(rawConfig.clickStartsPomodoro);
  if (rawConfig.nudgeWaterEnabled != null) clean.nudgeWaterEnabled = Boolean(rawConfig.nudgeWaterEnabled);
  if (rawConfig.nudgeStretchEnabled != null) clean.nudgeStretchEnabled = Boolean(rawConfig.nudgeStretchEnabled);
  if (rawConfig.nudgePostureEnabled != null) clean.nudgePostureEnabled = Boolean(rawConfig.nudgePostureEnabled);
  if (rawConfig.nudgeEyeRuleEnabled != null) clean.nudgeEyeRuleEnabled = Boolean(rawConfig.nudgeEyeRuleEnabled);

  if (rawConfig.pomodoroFocusMinutes != null) {
    const pFocus = parseInt(rawConfig.pomodoroFocusMinutes, 10);
    if (!isNaN(pFocus) && pFocus >= 1 && pFocus <= 240) {
      clean.pomodoroFocusMinutes = pFocus;
    }
  }

  if (rawConfig.pomodoroBreakMinutes != null) {
    const pBreak = parseInt(rawConfig.pomodoroBreakMinutes, 10);
    if (!isNaN(pBreak) && pBreak >= 1 && pBreak <= 60) {
      clean.pomodoroBreakMinutes = pBreak;
    }
  }

  if (rawConfig.nudgeWaterIntervalMins != null) {
    const nWater = parseInt(rawConfig.nudgeWaterIntervalMins, 10);
    if (!isNaN(nWater) && nWater >= 5 && nWater <= 360) {
      clean.nudgeWaterIntervalMins = nWater;
    }
  }

  if (rawConfig.nudgeStretchIntervalMins != null) {
    const nStretch = parseInt(rawConfig.nudgeStretchIntervalMins, 10);
    if (!isNaN(nStretch) && nStretch >= 5 && nStretch <= 360) {
      clean.nudgeStretchIntervalMins = nStretch;
    }
  }

  if (rawConfig.nudgePostureIntervalMins != null) {
    const nPosture = parseInt(rawConfig.nudgePostureIntervalMins, 10);
    if (!isNaN(nPosture) && nPosture >= 5 && nPosture <= 360) {
      clean.nudgePostureIntervalMins = nPosture;
    }
  }

  if (rawConfig.nudgeEyeRuleIntervalMins != null) {
    const nEye = parseInt(rawConfig.nudgeEyeRuleIntervalMins, 10);
    if (!isNaN(nEye) && nEye >= 5 && nEye <= 360) {
      clean.nudgeEyeRuleIntervalMins = nEye;
    }
  }

  if (rawConfig.wellbeingStats && typeof rawConfig.wellbeingStats === 'object' && isCleanObject(rawConfig.wellbeingStats)) {
    const ws = rawConfig.wellbeingStats;
    clean.wellbeingStats = {
      date: typeof ws.date === 'string' ? ws.date.slice(0, 32) : new Date().toISOString().slice(0, 10),
      todayFocusMinutes: Number.isFinite(ws.todayFocusMinutes) ? Math.max(0, Math.round(ws.todayFocusMinutes)) : 0,
      todayWaterCount: Number.isFinite(ws.todayWaterCount) ? Math.max(0, Math.round(ws.todayWaterCount)) : 0,
      streakDays: Number.isFinite(ws.streakDays) ? Math.max(1, Math.round(ws.streakDays)) : 1,
      lastActiveDate: typeof ws.lastActiveDate === 'string' ? ws.lastActiveDate.slice(0, 32) : new Date().toISOString().slice(0, 10)
    };
  }
  if (rawConfig.localOnly != null) clean.localOnly = Boolean(rawConfig.localOnly);
  if (rawConfig.followActiveMonitor != null) clean.followActiveMonitor = Boolean(rawConfig.followActiveMonitor);
  if (rawConfig.wakeWordEnabled != null) clean.wakeWordEnabled = Boolean(rawConfig.wakeWordEnabled);
  if (rawConfig.clipboardAwareness != null) clean.clipboardAwareness = Boolean(rawConfig.clipboardAwareness);
  if (rawConfig.doNotDisturbGames != null) clean.doNotDisturbGames = Boolean(rawConfig.doNotDisturbGames);
  if (rawConfig.startOnLogin != null) clean.startOnLogin = Boolean(rawConfig.startOnLogin);

  if (typeof rawConfig.wakeWord === 'string') {
    clean.wakeWord = rawConfig.wakeWord.trim().slice(0, 64);
  }

  if (typeof rawConfig.ollamaHost === 'string') {
    try {
      const u = new URL(rawConfig.ollamaHost.trim());
      if (u.protocol === 'http:' || u.protocol === 'https:') {
        clean.ollamaHost = u.origin;
      }
    } catch (_) {}
  }

  if (typeof rawConfig.ollamaModel === 'string') {
    clean.ollamaModel = rawConfig.ollamaModel.trim().replace(/[^a-zA-Z0-9_\-.:]/g, '').slice(0, 64);
  }

  if (typeof rawConfig.currentScreenMode === 'string' && ALLOWED_SCREEN_MODES.has(rawConfig.currentScreenMode)) {
    clean.currentScreenMode = rawConfig.currentScreenMode;
  }

  if (typeof rawConfig.characterProfileId === 'string') {
    clean.characterProfileId = rawConfig.characterProfileId.trim().slice(0, 64);
  }

  if (Array.isArray(rawConfig.blocklist)) {
    clean.blocklist = rawConfig.blocklist
      .filter(item => typeof item === 'string')
      .map(item => item.trim().toLowerCase().slice(0, 100))
      .filter(Boolean);
  }

  if (Array.isArray(rawConfig.characterProfiles)) {
    clean.characterProfiles = rawConfig.characterProfiles
      .map(p => validateCharacterProfile(p))
      .filter(Boolean);
  }

  if (Number.isFinite(rawConfig.windowX)) clean.windowX = Math.round(rawConfig.windowX);
  if (Number.isFinite(rawConfig.windowY)) clean.windowY = Math.round(rawConfig.windowY);

  return clean;
}

/**
 * Validates 'save-memory' payload.
 */
function validateSaveMemory(rawMemory) {
  if (!rawMemory || typeof rawMemory !== 'object' || !isCleanObject(rawMemory)) {
    return null;
  }
  const clean = {};
  if (typeof rawMemory.userName === 'string') {
    clean.userName = rawMemory.userName.trim().slice(0, 100);
  }
  if (Array.isArray(rawMemory.userFacts)) {
    clean.userFacts = rawMemory.userFacts
      .filter(f => typeof f === 'string')
      .map(f => f.trim().slice(0, 500))
      .filter(Boolean)
      .slice(0, 200);
  }
  if (Array.isArray(rawMemory.notes)) {
    clean.notes = rawMemory.notes
      .filter(n => n && typeof n === 'object' && isCleanObject(n) && typeof n.text === 'string')
      .map(n => ({
        id: String(n.id || Date.now()).slice(0, 64),
        text: n.text.trim().slice(0, 2000),
        timestamp: typeof n.timestamp === 'string' ? n.timestamp.slice(0, 64) : new Date().toISOString()
      }))
      .slice(0, 500);
  }
  return clean;
}

/**
 * Validates 'open-external' target URL.
 * Strictly guarantees only safe http/https web links are opened.
 */
function validateExternalUrl(rawUrl) {
  if (typeof rawUrl !== 'string' || !rawUrl.trim()) return null;
  const trimmed = rawUrl.trim();
  // Reject non-http(s) schemes like file:, javascript:, data:, etc.
  if (/^[a-zA-Z0-9+.-]+:/.test(trimmed) && !/^https?:\/\//i.test(trimmed)) {
    return null;
  }
  try {
    const parsed = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.href;
    }
  } catch (_) {}
  return null;
}

/**
 * Validates 'open-app' application query.
 * Strictly whitelists known application names to prevent shell injection.
 */
function validateAppName(rawAppName) {
  if (typeof rawAppName !== 'string' || !rawAppName.trim()) return null;
  const clean = rawAppName.trim().toLowerCase();
  // Match longest allowed app target first (e.g. 'calculator' before 'calc')
  const sortedAllowed = Array.from(ALLOWED_APP_NAMES).sort((a, b) => b.length - a.length);
  for (const allowed of sortedAllowed) {
    if (clean.includes(allowed)) {
      return allowed;
    }
  }
  return null;
}

/**
 * Validates 'save-note' text.
 */
function validateNoteText(rawText) {
  if (typeof rawText !== 'string' || !rawText.trim()) return null;
  return rawText.trim().slice(0, 5000);
}

/**
 * Validates Ollama connection host URL.
 */
function validateOllamaHost(rawHost) {
  if (typeof rawHost !== 'string' || !rawHost.trim()) return null;
  try {
    const u = new URL(rawHost.trim());
    if (u.protocol === 'http:' || u.protocol === 'https:') {
      return u.origin;
    }
  } catch (_) {}
  return null;
}

/**
 * Validates a character profile object.
 */
function validateCharacterProfile(profile) {
  if (!profile || typeof profile !== 'object' || !isCleanObject(profile)) {
    return null;
  }
  if (!profile.id || typeof profile.id !== 'string' || !/^[a-zA-Z0-9_\-]{2,64}$/.test(profile.id)) {
    return null;
  }
  const clean = {
    id: profile.id,
    name: typeof profile.name === 'string' ? profile.name.trim().slice(0, 64) : 'Companion',
    shape: (typeof profile.shape === 'string' && ALLOWED_CHARACTER_SHAPES.has(profile.shape)) ? profile.shape : 'orb',
    palette: typeof profile.palette === 'string' ? profile.palette.trim().slice(0, 64) : 'cyan-violet'
  };

  const hexRegex = /^#[0-9a-fA-F]{6}$/;
  clean.primaryColor = (typeof profile.primaryColor === 'string' && hexRegex.test(profile.primaryColor))
    ? profile.primaryColor
    : '#00F3FF';
  clean.secondaryColor = (typeof profile.secondaryColor === 'string' && hexRegex.test(profile.secondaryColor))
    ? profile.secondaryColor
    : '#A855F7';

  const glow = Number(profile.glowStrength);
  clean.glowStrength = (Number.isFinite(glow) && glow >= 0 && glow <= 2.0) ? glow : 1.0;

  if (typeof profile.customSystemPrompt === 'string') {
    clean.customSystemPrompt = profile.customSystemPrompt.trim().slice(0, 2000);
  }

  return clean;
}

/**
 * Validates 'switch-character-profile' and 'delete-character-profile' profileId.
 */
function validateProfileId(rawId) {
  if (typeof rawId !== 'string') return null;
  const clean = rawId.trim();
  if (/^[a-zA-Z0-9_\-]{2,64}$/.test(clean)) {
    return clean;
  }
  return null;
}

/**
 * Validates 'execute-safe-action' payload.
 * Strictly guarantees allowed actions whitelist and blocks deleting files or shell commands.
 */
function validateSafeAction(rawAction) {
  if (!rawAction || typeof rawAction !== 'object' || !isCleanObject(rawAction)) {
    return null;
  }

  const rawType = String(rawAction.type || rawAction.action || '').trim().toLowerCase().replace(/[-\s]/g, '_');
  if (!rawType) return null;

  // Security check: Check against forbidden operations
  if (
    FORBIDDEN_OPERATIONS.includes(rawType) ||
    /delete|remove|unlink|rmdir|shell|exec|cmd|powershell|bash/i.test(rawType)
  ) {
    return null;
  }

  // Security check: Check against allowed actions whitelist
  if (!ALLOWED_SAFE_ACTIONS.includes(rawType)) {
    return null;
  }

  const rawParams = (rawAction.params && typeof rawAction.params === 'object' && isCleanObject(rawAction.params))
    ? rawAction.params
    : {};
  const cleanParams = {};

  if (rawType === 'open_app') {
    const rawApp = rawParams.app || rawParams.appName || rawParams.name;
    if (typeof rawApp !== 'string') return null;
    if (/[;&|`$><]/.test(rawApp) || /\s+-(?:[a-zA-Z0-9]|-)/.test(rawApp)) return null;
    const cleanApp = validateAppName(rawApp);
    if (!cleanApp) return null;
    cleanParams.app = cleanApp;
  } else if (rawType === 'open_url') {
    const rawUrl = rawParams.url || rawParams.link || rawParams.website;
    const cleanUrl = validateExternalUrl(rawUrl);
    if (!cleanUrl) return null;
    cleanParams.url = cleanUrl;
  } else if (rawType === 'set_reminder') {
    const rawMsg = rawParams.message || rawParams.text || rawParams.task || 'Reminder';
    cleanParams.message = String(rawMsg).trim().slice(0, 300);
    const rawMinutes = Number(rawParams.minutes) || (rawParams.seconds ? Number(rawParams.seconds) / 60 : 5);
    cleanParams.minutes = Math.max(0.1, Math.min(1440, rawMinutes));
  } else if (rawType === 'create_file') {
    const rawName = String(rawParams.filename || rawParams.name || 'note.txt').trim();
    if (/delete|remove|unlink|rmdir/i.test(rawName)) return null;
    if (rawName.includes('..') || rawName.includes('/') || rawName.includes('\\')) return null;
    const cleanName = path.basename(rawName.replace(/[/\\?%*:|"<>]/g, '_')).trim();
    if (!cleanName || cleanName === '.' || cleanName.includes('..')) return null;
    cleanParams.filename = cleanName.slice(0, 100);
    cleanParams.content = typeof rawParams.content === 'string'
      ? rawParams.content.slice(0, 100000)
      : String(rawParams.text || '').slice(0, 100000);
  } else if (rawType === 'copy_clipboard') {
    cleanParams.text = typeof rawParams.text === 'string'
      ? rawParams.text.slice(0, 50000)
      : String(rawParams.content || '').slice(0, 50000);
  } else if (rawType === 'toggle_dnd') {
    if (rawParams.enabled != null) cleanParams.enabled = Boolean(rawParams.enabled);
    if (rawParams.minutes != null && Number.isFinite(Number(rawParams.minutes))) {
      cleanParams.minutes = Math.max(1, Math.min(1440, Math.round(Number(rawParams.minutes))));
    }
  }

  const clean = {
    type: rawType,
    params: cleanParams
  };

  if (typeof rawAction.label === 'string') {
    clean.label = rawAction.label.trim().slice(0, 100);
  }

  return clean;
}

/**
 * Validates outfit ID string against allowed outfits.
 */
function validateOutfitId(outfitId) {
  if (typeof outfitId !== 'string') return 'none';
  const clean = outfitId.trim().toLowerCase();
  return ALLOWED_OUTFIT_SET.has(clean) ? clean : 'none';
}

/**
 * Validates 'save-bond-profile' payload.
 */
function validateBondProfileUpdate(raw) {
  if (!raw || typeof raw !== 'object' || !isCleanObject(raw)) {
    return null;
  }
  const clean = {};
  if (raw.xp != null) {
    const xp = Number(raw.xp);
    if (Number.isFinite(xp) && xp >= 0) {
      clean.xp = Math.round(xp);
    }
  }
  if (typeof raw.equippedOutfit === 'string' && ALLOWED_OUTFIT_SET.has(raw.equippedOutfit.trim().toLowerCase())) {
    clean.equippedOutfit = raw.equippedOutfit.trim().toLowerCase();
  }
  if (typeof raw.birthday === 'string') {
    const b = raw.birthday.trim().slice(0, 10);
    if (/^(?:\d{4}-)?\d{1,2}-\d{1,2}$/.test(b) || b === '') {
      clean.birthday = b;
    }
  }
  if (raw.seasonalAutoEquip != null) {
    clean.seasonalAutoEquip = Boolean(raw.seasonalAutoEquip);
  }
  if (raw.totalPets != null && Number.isFinite(Number(raw.totalPets))) {
    clean.totalPets = Math.max(0, Math.round(Number(raw.totalPets)));
  }
  if (raw.totalClicks != null && Number.isFinite(Number(raw.totalClicks))) {
    clean.totalClicks = Math.max(0, Math.round(Number(raw.totalClicks)));
  }
  if (raw.totalFocusSessions != null && Number.isFinite(Number(raw.totalFocusSessions))) {
    clean.totalFocusSessions = Math.max(0, Math.round(Number(raw.totalFocusSessions)));
  }
  if (typeof raw.lastInteractionDate === 'string') {
    clean.lastInteractionDate = raw.lastInteractionDate.slice(0, 32);
  }
  if (typeof raw.lastCheckInDate === 'string') {
    clean.lastCheckInDate = raw.lastCheckInDate.slice(0, 32);
  }
  return clean;
}

module.exports = {
  isCleanObject,
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
  ALLOWED_SCREEN_MODES,
  ALLOWED_PERSONALITIES,
  ALLOWED_CHARACTER_SHAPES,
  ALLOWED_TRANSLATE_LANGUAGES,
  ALLOWED_OUTFIT_SET
};
