/**
 * Desktop AI Companion - Safe Actions Engine (actions.js)
 * 
 * Manages propose-and-confirm safe actions for the companion orb:
 * 1. open_app: Launch whitelisted application (strictly no arbitrary shell commands)
 * 2. open_url: Open website in browser (strictly http/https protocols)
 * 3. set_reminder: Schedule a timer reminder with visual/auditory trigger
 * 4. create_file: Create/write files inside designated "Companion" folder (no path traversal, no deleting)
 * 5. copy_clipboard: Copy text to system clipboard
 * 6. toggle_dnd: Toggle Do-Not-Disturb / Quiet mode for a specified duration
 * 
 * Security Guarantees:
 * - Allowed actions are strictly whitelisted in config.js.
 * - Deleting files is permanently banned (no delete_file, unlink, or removal operations).
 * - Running shell commands is permanently banned (no exec, bash, cmd, powershell).
 * - All actions MUST be confirmed by the user before running.
 */

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

let electron = null;
try {
  electron = require('electron');
} catch (_) {}

const app = electron && typeof electron === 'object' ? electron.app : null;
const shell = electron && typeof electron === 'object' ? electron.shell : null;
const clipboard = electron && typeof electron === 'object' ? electron.clipboard : null;

const {
  ALLOWED_SAFE_ACTIONS,
  FORBIDDEN_OPERATIONS
} = require('./config');

const ALLOWED_EXPRESSIONS = new Set([
  'happy',
  'curious',
  'excited',
  'surprised',
  'worried'
]);
const {
  validateAppName,
  validateExternalUrl
} = require('./ipcValidator');
const {
  loadConfig,
  saveConfig,
  updateTrayMenu
} = require('./settings');

// ==========================================================
// COMPANION DIRECTORY STORAGE
// ==========================================================

/**
 * Returns the absolute path to the dedicated "Companion" user directory.
 * In production: User's Documents/Companion
 * In dev/test: Workspace/Companion
 * Creates the directory recursively if it does not exist.
 * 
 * @returns {string} Absolute directory path
 */
function getCompanionFolderPath() {
  let baseDir = '';
  try {
    if (app && typeof app.getPath === 'function') {
      baseDir = path.join(app.getPath('documents'), 'Companion');
    }
  } catch (_) {}

  if (!baseDir) {
    baseDir = path.join(__dirname, 'Companion');
  }

  if (!fs.existsSync(baseDir)) {
    try {
      fs.mkdirSync(baseDir, { recursive: true });
    } catch (_) {}
  }

  return baseDir;
}

// Action Icons map for UI Chips
const SAFE_ACTION_ICONS = {
  open_app: '💻',
  open_url: '🌐',
  set_reminder: '⏰',
  create_file: '📝',
  copy_clipboard: '📋',
  toggle_dnd: '🌙'
};

// Default human-readable labels generator
function generateActionLabel(type, params = {}) {
  switch (type) {
    case 'open_app': {
      const appName = params.app || params.appName || params.name || 'Application';
      return `Open ${appName.charAt(0).toUpperCase() + appName.slice(1)}`;
    }
    case 'open_url': {
      let host = params.url || 'website';
      try {
        const u = new URL(/^https?:\/\//i.test(host) ? host : `https://${host}`);
        host = u.hostname.replace(/^www\./, '');
      } catch (_) {}
      return `Open ${host}`;
    }
    case 'set_reminder': {
      const msg = params.message || params.text || 'Reminder';
      const mins = params.minutes || (params.seconds ? Math.round(params.seconds / 60) : 5);
      return `Set reminder (${mins}m): "${msg.length > 20 ? msg.slice(0, 18) + '...' : msg}"`;
    }
    case 'create_file': {
      const name = path.basename(params.filename || params.name || 'note.txt');
      return `Create file "${name}" in Companion`;
    }
    case 'copy_clipboard': {
      const preview = (params.text || params.content || 'text').trim();
      return `Copy to clipboard (${preview.length > 18 ? preview.slice(0, 15) + '...' : preview})`;
    }
    case 'toggle_dnd': {
      const mins = params.minutes || 30;
      return `Turn on Do-Not-Disturb (${mins}m)`;
    }
    default:
      return 'Perform Action';
  }
}

// Active scheduled reminders
const activeReminders = new Map();

/**
 * Schedules a reminder timer that fires via IPC event.
 */
function scheduleReminder({ id = 'rem_' + Date.now(), message, minutes = 5, context = {} }) {
  const delayMs = Math.max(1000, Math.round(minutes * 60 * 1000));

  if (activeReminders.has(id)) {
    clearTimeout(activeReminders.get(id).timer);
  }

  const timer = setTimeout(() => {
    activeReminders.delete(id);
    try {
      if (context.getMainWindow) {
        const win = context.getMainWindow();
        if (win && !win.isDestroyed()) {
          win.webContents.send('companion-reminder-trigger', {
            id,
            message,
            timestamp: Date.now()
          });
        }
      }
    } catch (err) {
      console.warn('[Actions] Error dispatching reminder trigger:', err.message);
    }
  }, delayMs);

  activeReminders.set(id, {
    id,
    message,
    minutes,
    timer,
    createdAt: Date.now(),
    firesAt: Date.now() + delayMs
  });

  return id;
}

/**
 * Returns list of active reminders.
 */
function getActiveReminders() {
  return Array.from(activeReminders.values()).map(r => ({
    id: r.id,
    message: r.message,
    minutes: r.minutes,
    remainingMs: Math.max(0, r.firesAt - Date.now())
  }));
}

/**
 * Cancels a reminder by ID.
 */
function cancelReminder(id) {
  if (activeReminders.has(id)) {
    clearTimeout(activeReminders.get(id).timer);
    activeReminders.delete(id);
    return true;
  }
  return false;
}

// ==========================================================
// STRUCTURED ACTION PARSING
// ==========================================================

/**
 * Normalizes action type names and handles common synonyms.
 */
function normalizeActionType(rawType) {
  if (!rawType || typeof rawType !== 'string') return null;
  const t = rawType.trim().toLowerCase().replace(/[-\s]/g, '_');

  const aliases = {
    'open_app': 'open_app',
    'launch_app': 'open_app',
    'open_application': 'open_app',
    'open_url': 'open_url',
    'open_website': 'open_url',
    'open_link': 'open_url',
    'set_reminder': 'set_reminder',
    'reminder': 'set_reminder',
    'create_reminder': 'set_reminder',
    'create_file': 'create_file',
    'write_file': 'create_file',
    'save_file': 'create_file',
    'create_note': 'create_file',
    'copy_clipboard': 'copy_clipboard',
    'copy_to_clipboard': 'copy_clipboard',
    'clipboard_copy': 'copy_clipboard',
    'toggle_dnd': 'toggle_dnd',
    'dnd': 'toggle_dnd',
    'do_not_disturb': 'toggle_dnd',
    'quiet_mode': 'toggle_dnd'
  };

  return aliases[t] || t;
}

/**
 * Parses raw text from LLM / voice model to extract any proposed structured action.
 * Strips the action JSON out of the conversational text so TTS / speech bubbles read cleanly.
 * Validates against the strict whitelist and rejects any forbidden operations.
 * 
 * @param {string} rawText - Full response text from Claude or Ollama
 * @returns {{ cleanText: string, action: { id: string, type: string, params: object, label: string, icon: string } | null }}
 */
function parseStructuredAction(rawText) {
  if (!rawText || typeof rawText !== 'string') {
    return { cleanText: '', action: null };
  }

  let text = rawText;
  let parsedAction = null;
  let matchedBlock = null;

  // 1. Try markdown fenced code blocks (```json ... ``` or ```action ... ```)
  const fenceRegex = /```(?:json|action)?\s*([\s\S]*?)\s*```/i;
  const fenceMatch = text.match(fenceRegex);
  if (fenceMatch) {
    try {
      const candidate = JSON.parse(fenceMatch[1].trim());
      if (candidate && typeof candidate === 'object') {
        parsedAction = candidate;
        matchedBlock = fenceMatch[0];
      }
    } catch (_) {}
  }

  // 2. Try XML/HTML tags (<action> ... </action>)
  if (!parsedAction) {
    const tagRegex = /<action>\s*([\s\S]*?)\s*<\/action>/i;
    const tagMatch = text.match(tagRegex);
    if (tagMatch) {
      try {
        const candidate = JSON.parse(tagMatch[1].trim());
        if (candidate && typeof candidate === 'object') {
          parsedAction = candidate;
          matchedBlock = tagMatch[0];
        }
      } catch (_) {}
    }
  }

  // 3. Try inline/trailing JSON object containing "action": "..." or "expression": "..."
  if (!parsedAction) {
    const jsonRegex = /\{[\s\r\n]*"(?:action|type|expression)"[\s\r\n]*:[\s\S]*?\}(?=[^}]*$)/;
    const jsonMatch = text.match(jsonRegex);
    if (jsonMatch) {
      try {
        const candidate = JSON.parse(jsonMatch[0].trim());
        if (candidate && typeof candidate === 'object') {
          parsedAction = candidate;
          matchedBlock = jsonMatch[0];
        }
      } catch (_) {}
    }
  }

  if (!parsedAction) {
    return { cleanText: text.trim(), action: null, expression: null };
  }

  const cleanText = matchedBlock ? text.replace(matchedBlock, '').trim() : text.trim();

  // Extract optional expression field (happy, curious, excited, surprised, worried)
  const rawExpr = parsedAction.expression || parsedAction.faceExpression;
  let cleanExpression = null;
  if (typeof rawExpr === 'string') {
    const normExpr = rawExpr.trim().toLowerCase();
    if (ALLOWED_EXPRESSIONS.has(normExpr)) {
      cleanExpression = normExpr;
    }
  }

  // Validate action type (if any action was proposed)
  const rawType = parsedAction.action || parsedAction.type;
  if (!rawType) {
    // Standalone expression response without safe action proposal
    return { cleanText, action: null, expression: cleanExpression };
  }

  const normType = normalizeActionType(rawType);

  // Security check: Check against forbidden operations (permanently banned)
  if (
    FORBIDDEN_OPERATIONS.includes(normType) ||
    /delete|remove|unlink|rmdir|shell|exec|cmd|powershell|bash/i.test(String(rawType))
  ) {
    console.warn(`[Actions Boundary] Prohibited action detected and rejected: ${rawType}`);
    // Strip malicious block, do NOT return an actionable chip
    return { cleanText, action: null, expression: cleanExpression };
  }

  // Whitelist check
  if (!ALLOWED_SAFE_ACTIONS.includes(normType)) {
    console.warn(`[Actions Boundary] Action type not in allowed whitelist: ${normType}`);
    return { cleanText, action: null, expression: cleanExpression };
  }

  // Clean params
  const rawParams = (parsedAction.params && typeof parsedAction.params === 'object') ? parsedAction.params : {};
  const cleanParams = {};

  if (normType === 'open_app') {
    cleanParams.app = String(rawParams.app || rawParams.appName || rawParams.name || '').trim().toLowerCase();
  } else if (normType === 'open_url') {
    cleanParams.url = String(rawParams.url || rawParams.link || rawParams.website || '').trim();
  } else if (normType === 'set_reminder') {
    cleanParams.message = String(rawParams.message || rawParams.text || rawParams.task || 'Reminder').trim();
    cleanParams.minutes = Number(rawParams.minutes) || (rawParams.seconds ? Number(rawParams.seconds) / 60 : 5);
  } else if (normType === 'create_file') {
    cleanParams.filename = String(rawParams.filename || rawParams.name || 'note.txt').trim();
    cleanParams.content = typeof rawParams.content === 'string' ? rawParams.content : String(rawParams.text || '');
  } else if (normType === 'copy_clipboard') {
    cleanParams.text = typeof rawParams.text === 'string' ? rawParams.text : String(rawParams.content || '');
  } else if (normType === 'toggle_dnd') {
    if (rawParams.enabled != null) cleanParams.enabled = Boolean(rawParams.enabled);
    if (rawParams.minutes != null) cleanParams.minutes = Number(rawParams.minutes);
  }

  const label = (typeof parsedAction.label === 'string' && parsedAction.label.trim())
    ? parsedAction.label.trim()
    : generateActionLabel(normType, cleanParams);
  const icon = SAFE_ACTION_ICONS[normType] || '⚡';

  return {
    cleanText,
    action: {
      id: 'act_' + Math.random().toString(36).slice(2, 9),
      type: normType,
      params: cleanParams,
      label,
      icon
    },
    expression: cleanExpression
  };
}

// ==========================================================
// ACTION EXECUTION ENGINE (CONFIRMATION REQUIRED)
// ==========================================================

/**
 * Executes a verified safe action after explicit user confirmation.
 * Strictly guarantees:
 * - Deleting files is permanently banned and rejected.
 * - Running shell commands is permanently banned and rejected.
 * - Allowed actions must be in ALLOWED_SAFE_ACTIONS.
 * - Path traversal for create_file is strictly prevented.
 * 
 * @param {object} action - Action specification { type, params }
 * @param {object} context - Execution context { getMainWindow }
 * @returns {Promise<{ success: boolean, message?: string, error?: string, [key: string]: any }>}
 */
async function executeSafeAction(action, context = {}) {
  if (!action || typeof action !== 'object') {
    return { success: false, error: 'Invalid action payload.' };
  }

  const actionType = normalizeActionType(action.type || action.action);

  // 1. Permanent Security Ban on deletions and arbitrary shell execution
  if (
    FORBIDDEN_OPERATIONS.includes(actionType) ||
    /delete|remove|unlink|rmdir|shell|exec|cmd|powershell|bash/i.test(String(actionType))
  ) {
    return {
      success: false,
      error: 'Deleting files and running arbitrary shell commands are strictly prohibited.'
    };
  }

  // 2. Strict Whitelist Check
  if (!ALLOWED_SAFE_ACTIONS.includes(actionType)) {
    return {
      success: false,
      error: `Action "${actionType}" is not permitted by configuration whitelist.`
    };
  }

  const params = action.params || {};

  // 3. Execution per action type
  switch (actionType) {
    case 'open_app': {
      const rawTarget = params.app || params.appName || params.name;
      const cleanApp = validateAppName(rawTarget);
      if (!cleanApp) {
        return {
          success: false,
          error: `Application "${rawTarget || 'unknown'}" is not in the allowed application whitelist.`
        };
      }

      // Safe launcher: predefined system command mapping only (no shell injection possible)
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

      const cmd = appCommands[cleanApp];
      if (!cmd) {
        return { success: false, error: `No safe launch handler for ${cleanApp}.` };
      }

      try {
        exec(cmd, (err) => {
          if (err) console.warn('[Actions] open_app exec error:', err.message);
        });
        return { success: true, message: `Opened ${cleanApp}` };
      } catch (err) {
        return { success: false, error: err.message };
      }
    }

    case 'open_url': {
      const rawUrl = params.url || params.link || params.website;
      const cleanUrl = validateExternalUrl(rawUrl);
      if (!cleanUrl) {
        return { success: false, error: 'Invalid or unsafe URL protocol (only http/https allowed).' };
      }

      try {
        if (shell && typeof shell.openExternal === 'function') {
          await shell.openExternal(cleanUrl);
          return { success: true, message: `Opened ${cleanUrl}` };
        } else {
          return { success: false, error: 'Electron shell is not available.' };
        }
      } catch (err) {
        return { success: false, error: err.message };
      }
    }

    case 'set_reminder': {
      const rawMsg = params.message || params.text || params.task || 'Reminder';
      const cleanMsg = String(rawMsg).trim().slice(0, 300);
      const minutes = Number(params.minutes) || (params.seconds ? Number(params.seconds) / 60 : 5);
      const safeMinutes = Math.max(0.1, Math.min(1440, minutes));

      const reminderId = scheduleReminder({
        message: cleanMsg,
        minutes: safeMinutes,
        context
      });

      return {
        success: true,
        reminderId,
        message: `Reminder set: "${cleanMsg}" in ${safeMinutes} min`
      };
    }

    case 'create_file': {
      const rawFilename = params.filename || params.name || 'note.txt';

      // Disallow any delete/unlink parameters or names
      if (/delete|remove|unlink|rmdir/i.test(String(rawFilename))) {
        return { success: false, error: 'Deleting files is strictly prohibited.' };
      }

      // Sanitize filename to basename, removing illegal filesystem characters
      const cleanBasename = path.basename(String(rawFilename).replace(/[/\\?%*:|"<>]/g, '_'));
      if (!cleanBasename || cleanBasename === '.' || cleanBasename === '..') {
        return { success: false, error: 'Invalid filename provided.' };
      }

      const compFolder = getCompanionFolderPath();
      const targetPath = path.resolve(compFolder, cleanBasename);

      // Verify resolved path is strictly inside the Companion directory (prevent traversal attacks)
      if (!targetPath.startsWith(path.resolve(compFolder))) {
        return { success: false, error: 'Path traversal outside Companion folder is prohibited.' };
      }

      const content = typeof params.content === 'string' ? params.content : String(params.text || '');

      try {
        fs.writeFileSync(targetPath, content, 'utf-8');
        return {
          success: true,
          message: `Created "${cleanBasename}" in Companion folder`,
          filename: cleanBasename,
          path: targetPath
        };
      } catch (err) {
        return { success: false, error: err.message };
      }
    }

    case 'copy_clipboard': {
      const rawText = typeof params.text === 'string' ? params.text : String(params.content || '');
      const cleanText = rawText.slice(0, 50000);

      try {
        if (clipboard && typeof clipboard.writeText === 'function') {
          clipboard.writeText(cleanText);
          return { success: true, message: 'Copied to clipboard' };
        } else {
          return { success: false, error: 'Clipboard API not available.' };
        }
      } catch (err) {
        return { success: false, error: err.message };
      }
    }

    case 'toggle_dnd': {
      const currentConfig = loadConfig();
      const minutes = Number(params.minutes) || 30;
      const isCurrentlyDnd = (currentConfig.shutUpUntil && currentConfig.shutUpUntil > Date.now());

      let newDndState = false;
      if (params.enabled != null) {
        newDndState = Boolean(params.enabled);
      } else {
        newDndState = !isCurrentlyDnd;
      }

      const shutUpUntil = newDndState ? Date.now() + minutes * 60 * 1000 : null;
      const updated = saveConfig({ shutUpUntil });
      updateTrayMenu();

      if (context.getMainWindow) {
        const win = context.getMainWindow();
        if (win && !win.isDestroyed()) {
          win.webContents.send('config-updated', updated);
        }
      }

      return {
        success: true,
        dndEnabled: newDndState,
        message: newDndState
          ? `Do-Not-Disturb turned ON for ${minutes} minutes`
          : 'Do-Not-Disturb turned OFF'
      };
    }

    default:
      return { success: false, error: `Unhandled safe action: ${actionType}` };
  }
}

module.exports = {
  getCompanionFolderPath,
  SAFE_ACTION_ICONS,
  generateActionLabel,
  parseStructuredAction,
  executeSafeAction,
  scheduleReminder,
  getActiveReminders,
  cancelReminder,
  normalizeActionType,
  ALLOWED_EXPRESSIONS
};
