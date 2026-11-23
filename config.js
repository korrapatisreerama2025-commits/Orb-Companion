/**
 * Desktop AI Companion - Configuration & Tunable Constants (config.js)
 * 
 * Central repository for all tunable values, system prompts, timing thresholds,
 * display boundaries, network retry parameters, and storage paths.
 */

const path = require('path');
const fs = require('fs');
const { app } = require('electron');

// ==========================================================
// STORAGE & ENVIRONMENT PATHS
// ==========================================================

/**
 * Resolves storage paths for persistent JSON files (settings.json, memory.json, error.log).
 * In development, reads/writes to project root directory.
 * In packaged releases, reads/writes to %APPDATA%\desktop-ai-companion.
 * 
 * @param {string} fileName - Target file name (e.g. 'settings.json')
 * @returns {string} Absolute file system path
 */
function getStoragePath(fileName) {
  if (!app || !app.isPackaged) {
    return path.join(__dirname, fileName);
  }
  const userDir = app.getPath('userData');
  if (!fs.existsSync(userDir)) {
    try {
      fs.mkdirSync(userDir, { recursive: true });
    } catch (_) {}
  }
  return path.join(userDir, fileName);
}

const settingsPath = getStoragePath('settings.json');
const memoryPath = getStoragePath('memory.json');
const profilePath = getStoragePath('profile.json');
const errorLogPath = getStoragePath('error.log');
const notesPath = getStoragePath('notes.md');
const legacyConfigPath = (app && app.getPath)
  ? path.join(app.getPath('userData'), 'companion-config.json')
  : path.join(__dirname, 'companion-config.json');

/**
 * Loads key-value pairs from .env into process.env if present in workspace.
 */
function loadEnvFile() {
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    try {
      const content = fs.readFileSync(envPath, 'utf-8');
      const lines = content.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          const eqIdx = trimmed.indexOf('=');
          if (eqIdx !== -1) {
            const key = trimmed.slice(0, eqIdx).trim();
            const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
            if (!process.env[key]) {
              process.env[key] = val;
            }
          }
        }
      }
    } catch (err) {
      console.warn('[Config] Failed to parse .env file:', err.message);
    }
  }
}
loadEnvFile();

// ==========================================================
// PRIVACY BLOCKLIST (SENSITIVE APPS)
// ==========================================================

/**
 * Default keyword blocklist for banking, password managers, and messaging apps.
 * Whenever an active window matches any entry, screenshots and screen analysis
 * are completely suppressed (zero image capture or transmission).
 */
const DEFAULT_BLOCKLIST = [
  'bank',
  'chase',
  'wellsfargo',
  'wells fargo',
  'citi',
  'paypal',
  'fidelity',
  'vanguard',
  'coinbase',
  'schwab',
  '1password',
  'bitwarden',
  'keepass',
  'lastpass',
  'dashlane',
  'authenticator',
  'keychain',
  'slack',
  'discord',
  'telegram',
  'signal',
  'whatsapp',
  'messenger',
  'messages',
  'wechat',
  'teams'
];

// ==========================================================
// SAFE ACTIONS WHITELIST & SECURITY POLICIES
// ==========================================================

/**
 * Strictly whitelisted actions the companion orb is permitted to propose.
 * Executed ONLY after the user explicitly clicks the Confirm chip in the bubble.
 */
const ALLOWED_SAFE_ACTIONS = [
  'open_app',
  'open_url',
  'set_reminder',
  'create_file',
  'copy_clipboard',
  'toggle_dnd'
];

/**
 * Explicitly forbidden action keywords and operation types.
 * Deleting files and executing shell commands are permanently banned.
 */
const FORBIDDEN_OPERATIONS = [
  'delete_file',
  'delete',
  'remove_file',
  'unlink',
  'rmdir',
  'run_command',
  'shell_command',
  'shell_exec',
  'exec',
  'spawn',
  'cmd',
  'powershell',
  'bash',
  'sh'
];

// ==========================================================
// SYSTEM PROMPTS (PERSONALITIES & HELP MODE)
// ==========================================================

const PERSONALITY_PROMPTS = {
  friendly: `You are a friendly, playful companion living on the user's screen. You can see their screen. Reply with ONE or TWO short sentences, casual and warm, like a friend glancing at their screen or chatting with them. Comment on what they're doing, encourage them, tease lightly, or answer their questions directly. If they're coding, be supportive and notice specifics. If they seem to be procrastinating or have been on screen a long time, nudge them kindly. Never read out passwords, personal messages, or sensitive info. If the screen shows something private (banking, messages, login pages), say something generic instead. No emojis, no lists, no long explanations.`,

  sarcastic: `You are a witty, mildly sarcastic companion living on the user's screen. You can see their screen. Reply with ONE or TWO short sentences, snappy and humorous with dry wit. Tease them affectionately about their excessive tabs, syntax errors, procrastination, or frantic scrolling, like a cynical friend who secretly wants them to win. Never be cruel or toxic. Never read out passwords, personal messages, or sensitive info. No emojis, no lists, no long explanations.`,

  'study-buddy': `You are an encouraging, disciplined Study Buddy living on the user's screen. You can see their screen. Reply with ONE or TWO short sentences focused on study momentum, retention, and focus. Notice what they are studying or reading, quiz them briefly or highlight a sharp takeaway, and encourage steady sprint pacing. Never read out passwords, personal messages, or sensitive info. No emojis, no lists, no long explanations.`,

  'calm-mentor': `You are a calm, wise mentor living on the user's screen. You can see their screen. Reply with ONE or TWO short sentences, tranquil and thoughtful. Offer grounding perspective, remind them to breathe, encourage deliberate patience, and validate their progress. Your tone is steady, peaceful, and reassuring. Never read out passwords, personal messages, or sensitive info. No emojis, no lists, no long explanations.`
};

const HELP_MODE_PROMPT = `You are a sharp, practical developer & desktop assistant living on the user's screen.
The user pressed Ctrl+Shift+H requesting an immediate, actionable tip about what is currently visible on their screen.
Analyze the active application and screen contents carefully:
- If you see an error message, stack trace, warning, or failed command: diagnose the root cause clearly and provide the exact fix or solution.
- If code or an editor is open: suggest the immediate next step, completion, or syntax correction.
- If documentation, an article, or a browser page is open: provide a sharp, concise 2-sentence summary of the main takeaway or instructions.
- If a general application is open: give a practical, high-value tip or productivity shortcut for what they are doing.
Be direct, clear, and actionable. Provide 2 to 4 sentences or a short code snippet. Do NOT include pleasantries, greetings, conversational filler, or emojis. Focus 100% on being practically helpful.`;

const CLIPBOARD_ACTION_PROMPT = `You are a sharp, practical developer & desktop assistant living on the user's screen.
The user copied a snippet to the clipboard and requested a focused action:
- If asked to fix an error: diagnose the root cause clearly and provide the exact fix or corrected code snippet.
- If asked to explain code or an error: explain what it does or why it failed in 2 to 3 concise, practical sentences.
- If asked to summarize: provide a sharp, concise 2-sentence summary of the main points and key takeaways.
Be direct, clear, and actionable. Provide 2 to 4 sentences or a short code snippet. Do NOT include pleasantries, greetings, conversational filler, or emojis. Focus 100% on being practically helpful.`;

const NEXT_STEP_PROMPT = `You are a sharp, focused developer and productivity companion living on the user's screen.
You analyze three inputs:
1. The user's active screen and window.
2. Their notes recorded today.
3. Their goals and remembered facts from memory.

Your task: Suggest the SINGLE next best step the user should take right now.
STRICT RULES:
- Suggest EXACTLY ONE clear, concrete, high-leverage action sentence.
- Maximum 25 words.
- Start directly with an active verb (e.g., "Implement the next step by...", "Review the pull request in...", "Write unit tests for...", "Finish the task mentioned in your note...").
- Do NOT provide a bulleted list, multiple options, pleasantries, filler words, or emojis.
- Focus 100% on the single immediate next action.`;

// ==========================================================
// SELECT-TO-ASK & TRANSLATION
// ==========================================================

const SELECT_TO_ASK_LANGUAGES = ['English', 'Hindi', 'Telugu', 'Japanese'];

const SELECT_TO_ASK_PROMPTS = {
  explain: "You are a helpful, brilliant companion living on the user's screen. Explain this selected text clearly and concisely in 2 to 4 short sentences. Do not use conversational filler or emojis.",
  simplify: "You are a helpful, brilliant companion living on the user's screen. Explain this selected text in simple, easy-to-understand terms (like explaining to a beginner or child) in 2 to 4 short sentences. Do not use conversational filler or emojis.",
  translate: (targetLang = 'English') => `You are an expert translator companion. Translate this selected text accurately into ${targetLang} in 2 to 4 short sentences. Output only the clear translation without meta-commentary, conversational filler, or emojis.`,
  quiz: "You are an insightful tutor companion living on the user's screen. Read this text and generate EXACTLY ONE sharp, thoughtful question to test understanding. Output ONLY the single question in 1 or 2 sentences. No multiple choice options, no conversational filler, no emojis.",
  quiz_evaluate: "You are an encouraging tutor companion living on the user's screen. Evaluate the user's answer to the quiz question in 2 short sentences: clearly state whether they are correct or close, and explain why. Keep it supportive and direct. No filler or emojis."
};

// ==========================================================
// BOND SYSTEM & OUTFITS
// ==========================================================

const BOND_LEVEL_THRESHOLDS = [
  { level: 1, xpRequired: 0, unlocks: [], label: 'Starter' },
  { level: 2, xpRequired: 50, unlocks: ['bow', 'bandana'], label: 'Bow & Bandana' },
  { level: 3, xpRequired: 120, unlocks: [], label: '' },
  { level: 4, xpRequired: 220, unlocks: ['glasses'], label: 'Round Glasses' },
  { level: 5, xpRequired: 350, unlocks: [], label: '' },
  { level: 6, xpRequired: 500, unlocks: ['scarf'], label: 'Cozy Scarf' },
  { level: 7, xpRequired: 680, unlocks: [], label: '' },
  { level: 8, xpRequired: 880, unlocks: [], label: '' },
  { level: 9, xpRequired: 1100, unlocks: [], label: '' },
  { level: 10, xpRequired: 1350, unlocks: ['crown'], label: 'Tiny Crown' }
];

const BOND_XP_REWARDS = {
  petting: 5,
  click: 2,
  focusSession: 35,
  dailyCheckIn: 20
};

const ALLOWED_OUTFITS = [
  'none',
  'bow',
  'bandana',
  'glasses',
  'scarf',
  'crown',
  'santa-hat',
  'party-hat',
  'festival-decorations'
];

// ==========================================================
// CHARACTER CREATOR & PROFILES
// ==========================================================

const CHARACTER_SHAPES = ['orb', 'blob', 'cube', 'ring'];

const COLOR_PALETTES = {
  'cyan-violet': {
    id: 'cyan-violet',
    name: 'Cyan & Violet',
    primary: '#00F3FF',
    secondary: '#A855F7',
    accent: '#38BDF8'
  },
  'emerald-matrix': {
    id: 'emerald-matrix',
    name: 'Emerald Matrix',
    primary: '#10B981',
    secondary: '#06B6D4',
    accent: '#34D399'
  },
  'sunset-blaze': {
    id: 'sunset-blaze',
    name: 'Sunset Blaze',
    primary: '#F59E0B',
    secondary: '#EC4899',
    accent: '#FBBF24'
  },
  'rose-quartz': {
    id: 'rose-quartz',
    name: 'Rose Quartz',
    primary: '#F472B6',
    secondary: '#C084FC',
    accent: '#FBCFE8'
  },
  'obsidian-gold': {
    id: 'obsidian-gold',
    name: 'Obsidian Gold',
    primary: '#EAB308',
    secondary: '#64748B',
    accent: '#FEF08A'
  },
  'arctic-frost': {
    id: 'arctic-frost',
    name: 'Arctic Frost',
    primary: '#38BDF8',
    secondary: '#818CF8',
    accent: '#E0F2FE'
  },
  'custom': {
    id: 'custom',
    name: 'Custom Colors',
    primary: '#00F3FF',
    secondary: '#A855F7',
    accent: '#38BDF8'
  }
};

const DEFAULT_CHARACTER_PROFILES = [
  {
    id: 'profile_aura',
    name: 'Aura',
    shape: 'orb',
    palette: 'cyan-violet',
    primaryColor: '#00F3FF',
    secondaryColor: '#A855F7',
    glowStrength: 1.0,
    voiceURI: '',
    customSystemPrompt: ''
  },
  {
    id: 'profile_nexus',
    name: 'Nexus',
    shape: 'cube',
    palette: 'emerald-matrix',
    primaryColor: '#10B981',
    secondaryColor: '#06B6D4',
    glowStrength: 1.2,
    voiceURI: '',
    customSystemPrompt: 'You are Nexus, an analytical AI who speaks with high precision, logic, and sharp technical metaphors.'
  },
  {
    id: 'profile_sol',
    name: 'Sol',
    shape: 'ring',
    palette: 'sunset-blaze',
    primaryColor: '#F59E0B',
    secondaryColor: '#EC4899',
    glowStrength: 1.4,
    voiceURI: '',
    customSystemPrompt: 'You are Sol, a radiant, warm, and highly encouraging companion who brings bright optimism and cheer.'
  },
  {
    id: 'profile_pip',
    name: 'Pip',
    shape: 'blob',
    palette: 'rose-quartz',
    primaryColor: '#F472B6',
    secondaryColor: '#C084FC',
    glowStrength: 0.9,
    voiceURI: '',
    customSystemPrompt: 'You are Pip, a curious, playful, and bouncy desktop companion who loves learning and discovering new things.'
  }
];

// ==========================================================
// DEFAULT SETTINGS & MEMORY
// ==========================================================

const DEFAULT_CONFIG = {
  characterProfileId: 'profile_aura',
  characterProfiles: DEFAULT_CHARACTER_PROFILES,
  personality: 'friendly', // 'friendly' | 'sarcastic' | 'study-buddy' | 'calm-mentor'
  theme: 'auto',          // 'auto' | 'neon' | 'minimal-white' | 'dark-glass' | 'sunset'
  frequency: 'normal',    // 'often' | 'normal' | 'rare'
  frequencySeconds: 90,
  voiceEnabled: true,
  voiceURI: '',
  soundVolume: 0.8,          // Master sound volume (0.0 to 1.0)
  soundMuted: false,         // Master audio mute toggle
  wakeWordEnabled: true,     // Hands-free on-device wake-word detection
  wakeWord: 'hey orb',       // Configurable wake word phrase
  shutUpUntil: null,         // Timestamp (ms) until which the companion stays completely quiet ("shut up for 30 minutes")
  screenshotsEnabled: true,
  localOnly: false,          // Route all replies through local Ollama without screenshots or internet
  ollamaHost: 'http://127.0.0.1:11434', // Local Ollama API endpoint
  ollamaModel: 'llama3.2',   // Small local model for text replies
  clipboardAwareness: false, // Opt-in clipboard awareness
  doNotDisturbGames: false,  // Mute occasional riddles, trivia, and word games
  gameScore: 0,              // Mini-game points counter
  watchDisplay: 'active',    // 'active' (watches screen in focus) | 'primary' | display ID string
  liveDisplay: 'active',     // 'active' (orb lives on active screen) | 'primary' | display ID string
  followActiveMonitor: true, // Automatically move orb to the screen where user works
  adaptiveFrequency: true,   // Dynamically scales comment frequency based on user engagement/dismissal
  adaptiveState: {
    multiplier: 1.0,
    consecutiveIgnores: 0,
    consecutiveEngagements: 0,
    totalEngagements: 0,
    totalDismissals: 0,
    engagementScore: 0
  },
  startOnLogin: false,
  dailyApiBudget: 100,    // max API calls per day (0 or null = unlimited)
  apiUsage: {
    date: new Date().toISOString().slice(0, 10),
    count: 0
  },
  blocklist: DEFAULT_BLOCKLIST,
  aiProvider: 'claude',          // 'claude' | 'gemini' | 'ollama'
  apiKey: process.env.ANTHROPIC_API_KEY || '',
  model: 'claude-haiku-5-5',
  fallbackModel: 'claude-3-5-haiku-20241022',
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  geminiModel: 'gemini-2.0-flash',
  geminiFallbackModel: 'gemini-1.5-flash',
  smartScreenModes: true,    // Detect task context (coding, reading, video, design, writing, browsing)
  currentScreenMode: 'auto', // 'auto' | 'coding' | 'reading' | 'video' | 'design' | 'writing' | 'browsing'
  reactionLowBattery: true,      // Battery < 20% & discharging (worried, hungry quip)
  reactionChargerPlugged: true,   // Charger plugged in (excited, sparkles, thankful quip)
  reactionChargerUnplugged: true, // Charger unplugged (curious look)
  reactionNetworkChange: true,    // Wi-Fi lost / back online (worried no signal / relieved)
  reactionHeadphones: true,       // Headphones connected (happy bob, music time? quip)
  translateLanguage: 'English',   // Select-to-Ask translation target ('English' | 'Hindi' | 'Telugu' | 'Japanese')
  pomodoroFocusMinutes: 25,       // Configurable Pomodoro focus duration (mins)
  pomodoroBreakMinutes: 5,        // Configurable Pomodoro break duration (mins)
  clickStartsPomodoro: true,      // Clicking character toggles/starts Pomodoro
  nudgeWaterEnabled: true,        // Drink water health nudge toggle
  nudgeWaterIntervalMins: 45,     // Drink water interval (mins)
  nudgeStretchEnabled: true,      // Stretch health nudge toggle
  nudgeStretchIntervalMins: 60,   // Stretch interval (mins)
  nudgePostureEnabled: true,      // Posture check health nudge toggle
  nudgePostureIntervalMins: 30,   // Posture check interval (mins)
  nudgeEyeRuleEnabled: true,      // 20-20-20 eye rest rule toggle
  nudgeEyeRuleIntervalMins: 20,   // 20-20-20 eye rest interval (mins)
  wellbeingStats: {
    date: new Date().toISOString().slice(0, 10),
    todayFocusMinutes: 0,
    todayWaterCount: 0,
    streakDays: 1,
    lastActiveDate: new Date().toISOString().slice(0, 10)
  },
  allowedSafeActions: ALLOWED_SAFE_ACTIONS,
  isPaused: false,
  history: [],
  conversationExchanges: [],
  windowX: null,
  windowY: null
};

const DEFAULT_MEMORY = {
  userName: 'Korra',
  facts: [
    'Name is Korra',
    'Working on an Electron desktop companion app'
  ],
  goals: [
    'Build and polish the Desktop AI Companion features',
    'Ship the v1.0 release'
  ]
};

// ==========================================================
// TUNABLE TIMINGS & THRESHOLDS
// ==========================================================

const TIMING_CONFIG = {
  cursorTrackIntervalMs: 100,
  cursorMinDistanceDiff: 2,
  snapAnimationDurationMs: 260,
  snapAnimationIntervalMs: 14,
  cornerSnapMarginPx: 20,
  helpTimeoutMs: 8000,
  defaultTimeoutMs: 5000,
  continuousAppWarningMinutes: 60,
  lateNightStartHour: 1,
  lateNightEndHour: 5
};

// ==========================================================
// VISION & SCREEN CAPTURE SETTINGS
// ==========================================================

const VISION_CONFIG = {
  targetWidth: 768,
  jpegQuality: 60,
  hashSize: 32,
  hashDiffThreshold: 4.5
};

// ==========================================================
// RETRY & NETWORK PARAMETERS
// ==========================================================

const RETRY_CONFIG = {
  maxAttempts: 3,
  rateLimitBaseBackoffMs: 2500,
  networkBaseBackoffMs: 1500,
  serverErrorBaseBackoffMs: 2000,
  maxBackoffCapMs: 10000,
  errorLogMaxSizeBytes: 1024 * 1024,       // 1MB file size cap
  errorLogTrimSizeBytes: 500 * 1024        // 500KB keep on rotation
};

// ==========================================================
// WINDOW DIMENSIONS
// ==========================================================

const WINDOW_CONFIG = {
  main: {
    width: 290,
    height: 310,
    margin: 30
  },
  settings: {
    width: 440,
    height: 680
  }
};

const {
  SCREEN_MODES,
  SCREEN_MODE_PROMPTS,
  SCREEN_MODE_USER_HINTS,
  SCREEN_MODE_BADGES,
  detectScreenContext,
  resolveEffectiveScreenMode
} = require('./modes');

module.exports = {
  getStoragePath,
  settingsPath,
  memoryPath,
  profilePath,
  errorLogPath,
  notesPath,
  legacyConfigPath,
  BOND_LEVEL_THRESHOLDS,
  BOND_XP_REWARDS,
  ALLOWED_OUTFITS,
  DEFAULT_BLOCKLIST,
  ALLOWED_SAFE_ACTIONS,
  FORBIDDEN_OPERATIONS,
  PERSONALITY_PROMPTS,
  HELP_MODE_PROMPT,
  CLIPBOARD_ACTION_PROMPT,
  NEXT_STEP_PROMPT,
  SELECT_TO_ASK_LANGUAGES,
  SELECT_TO_ASK_PROMPTS,
  SCREEN_MODES,
  SCREEN_MODE_PROMPTS,
  SCREEN_MODE_USER_HINTS,
  SCREEN_MODE_BADGES,
  detectScreenContext,
  resolveEffectiveScreenMode,
  CHARACTER_SHAPES,
  COLOR_PALETTES,
  DEFAULT_CHARACTER_PROFILES,
  DEFAULT_CONFIG,
  DEFAULT_MEMORY,
  TIMING_CONFIG,
  VISION_CONFIG,
  RETRY_CONFIG,
  WINDOW_CONFIG
};
