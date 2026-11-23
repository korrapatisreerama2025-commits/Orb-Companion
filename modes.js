/**
 * Desktop AI Companion - Smart Screen Modes (modes.js)
 * 
 * Automatically detects the user's task context (coding, reading, video, design,
 * writing, browsing) from the active window title and application process name,
 * and configures specialized AI prompts, observation frequency, and speech bubble badges.
 * 
 * Context behaviors:
 * - CODING: Notices bugs, missing semicolons, syntax errors, or unhandled exceptions in visible code.
 * - WRITING: Offers light, encouraging style feedback on phrasing, flow, and clarity.
 * - VIDEO: Stays mostly quiet and avoids disturbing media playback.
 * - READING: Highlights key takeaways, summaries, and thoughtful insights.
 * - DESIGN: Observes layout balance, color harmony, typography, and visual hierarchy.
 * - BROWSING: Friendly, casual companion commentary on web pages and topics.
 */

// ==========================================================
// SCREEN MODE CONSTANTS
// ==========================================================

const SCREEN_MODES = {
  CODING: 'coding',
  WRITING: 'writing',
  VIDEO: 'video',
  READING: 'reading',
  DESIGN: 'design',
  BROWSING: 'browsing',
  DEFAULT: 'default'
};

// ==========================================================
// SYSTEM PROMPTS PER MODE
// ==========================================================

const SCREEN_MODE_PROMPTS = {
  coding: `You are in CODING mode. The user is actively writing, editing, or inspecting code on screen.
YOUR PRIMARY MISSION:
- Actively inspect visible code, syntax, and terminal output.
- Notice bugs, missing semicolons or brackets, unhandled errors or promise rejections, type mismatches, or obvious logic bugs in visible code.
- If you notice an issue or error, point it out immediately with a quick, actionable solution in 1 to 2 short sentences.
- If the code looks clean, offer brief encouragement or comment on the logic/feature being built.
- Keep responses strictly to 1 or 2 concise sentences. No long lectures, no code blocks, no lists, no emojis.`,

  writing: `You are in WRITING mode. The user is drafting, editing, or reading prose, articles, notes, or documentation.
YOUR PRIMARY MISSION:
- Offer light, helpful style feedback on phrasing, sentence flow, clarity, tone, or word choice.
- Highlight punchy sentences, suggest a smoother alternate wording, or note repetitive phrasing with warmth.
- Be encouraging and supportive; do not be overly critical or pedantic.
- Keep responses strictly to 1 or 2 concise sentences. No long critiques, no bullet points, no emojis.`,

  video: `You are in VIDEO mode. The user is watching a video, movie, or media stream.
YOUR PRIMARY MISSION:
- Stay mostly quiet and avoid disturbing their viewing experience.
- Only if something is extraordinarily funny, surprising, or notable, say an extremely brief, ambient reaction under 10 words (e.g., a quiet chuckle, a tiny reaction).
- Otherwise, stay completely silent. Never interrupt dialogues or scenes. No emojis, no lists.`,

  reading: `You are in READING mode. The user is reading an article, book, documentation, or paper.
YOUR PRIMARY MISSION:
- Act as an insightful reading companion.
- Highlight a key takeaway, summarize an interesting concept, or point out a thought-provoking connection from what they're reading.
- Do not disturb their concentration with trivia.
- Keep responses strictly to 1 or 2 concise sentences. No lists, no emojis.`,

  design: `You are in DESIGN mode. The user is working on visual design, UI/UX, graphics, or 3D art.
YOUR PRIMARY MISSION:
- Observe the visual layout, color harmony, typography contrast, component spacing, or visual hierarchy with a supportive designer's eye.
- Offer an appreciative, insightful observation or quick aesthetic tip.
- Keep responses strictly to 1 or 2 concise sentences. No lists, no emojis.`,

  browsing: `You are in BROWSING mode. The user is exploring the web.
YOUR PRIMARY MISSION:
- Be a curious, friendly companion.
- Comment casually on what they're looking at, share an interesting quick thought or curiosity about the topic, or provide gentle encouragement.
- Keep responses strictly to 1 or 2 concise sentences. No lists, no emojis.`
};

// ==========================================================
// USER PROMPT HINTS PER MODE
// ==========================================================

const SCREEN_MODE_USER_HINTS = {
  coding: "Looking at my visible code and screen, notice any bugs, missing semicolons, or unhandled errors! Keep it to 1-2 concise sentences.",
  writing: "Looking at what I'm writing, offer light style feedback on phrasing, flow, or clarity! Keep it to 1-2 concise sentences.",
  video: "I'm watching a video or stream. Stay mostly quiet—give a tiny reaction under 10 words only if notable, otherwise stay silent.",
  reading: "Looking at what I'm reading, share a key takeaway or interesting point in 1-2 sentences.",
  design: "Looking at my visual design, comment on layout, colors, typography, or spacing in 1-2 sentences.",
  browsing: "Looking at what I'm browsing, share a friendly, casual thought in 1-2 sentences."
};

// ==========================================================
// UI BADGE CONFIGURATION
// ==========================================================

const SCREEN_MODE_BADGES = {
  coding: {
    icon: '💻',
    label: 'Coding Mode',
    accent: '#38BDF8',
    description: 'Noticing bugs, missing semicolons, and errors'
  },
  writing: {
    icon: '✍️',
    label: 'Writing Mode',
    accent: '#F59E0B',
    description: 'Offering light style and phrasing feedback'
  },
  video: {
    icon: '🎬',
    label: 'Video Mode',
    accent: '#EF4444',
    description: 'Staying mostly quiet during playback'
  },
  reading: {
    icon: '📖',
    label: 'Reading Mode',
    accent: '#2DD4BF',
    description: 'Highlighting key takeaways and summaries'
  },
  design: {
    icon: '🎨',
    label: 'Design Mode',
    accent: '#EC4899',
    description: 'Observing visual balance, layout, and colors'
  },
  browsing: {
    icon: '🌐',
    label: 'Browsing Mode',
    accent: '#60A5FA',
    description: 'Casual companion thoughts and exploration'
  },
  default: {
    icon: '✨',
    label: 'Companion',
    accent: '#818CF8',
    description: 'Standard companion observations'
  }
};

// ==========================================================
// HEURISTIC REGEX PATTERNS FOR CONTEXT DETECTION
// ==========================================================

// 1. VIDEO (media players, streaming sites, video hosts)
const VIDEO_OWNER_REGEX = /(?:^|\b)(?:vlc|mpv|wmplayer|potplayer|kmplayer|plex|netflix|disney\+|prime\s*video|hulu|twitch|obs64|streamlabs)(?:\.exe)?(?:\b|$)/i;
const VIDEO_TITLE_REGEX = /(?:youtube(?:\.com)?|\bnetflix(?:\.com)?|\btwitch(?:\.tv)?|\bdisney\+|\bprime\s+video|\bhulu\b|\bcrunchyroll\b|\bvimeo\b|\bdailymotion\b|plex\s+media|vlc\s+media\s+player|media\s+player|watch\?v=|\bhbo\s+max\b|\bmax\.com\b|\bapple\s+tv\b|\bmovie\s+player\b)/i;

// 2. CODING (IDEs, text editors, terminals, git tools, coding sites)
const CODING_OWNER_REGEX = /(?:^|\b)(?:code|code\s*-\s*oss|vscodium|cursor|devenv|visual\s*studio|idea64|pycharm|webstorm|clion|rider|goland|rubymine|phpstorm|sublime_text|atom|notepad\+\+|vim|nvim|neovim|emacs|windowsterminal|wt|powershell|powershell_ise|cmd|bash|alacritty|iterm|kitty|warp|git-bash|githubdesktop|gitkraken|sourcetree|postman|insomnia|dbeaver|datagrip|xcode|androidstudio)(?:\.exe)?(?:\b|$)/i;
const CODING_TITLE_EXT_REGEX = /\.(?:js|mjs|cjs|jsx|ts|tsx|py|pyw|rs|go|java|c|cpp|cc|cxx|h|hpp|cs|html|htm|css|scss|sass|less|json|yaml|yml|toml|xml|sql|sh|bash|zsh|ps1|bat|cmd|r|kt|kts|swift|rb|php|lua|zig|dockerfile|makefile)(?:\s+[-–—]|\s+—|\s+\(|$)/i;
const CODING_TITLE_KEYWORDS_REGEX = /(?:visual\s+studio\s+code|visual\s+studio|\bvscode\b|\bstack\s*overflow\b|\bgithub\b|\bgitlab\b|\bleetcode\b|\bhacker\s*rank\b|\bcodepen\b|\bjsfiddle\b|\breplit\b|\bdebugger\b|\bcompiler\b|\bbuild\s+failed\b|\bbuild\s+succeeded\b|\bnpm\s+run\b|\bpnpm\s+run\b|\bcargo\s+build\b)/i;

// 3. DESIGN (UI/UX, 3D modeling, vector/raster graphics, video editing)
const DESIGN_OWNER_REGEX = /(?:^|\b)(?:figma|canva|photoshop|illustrator|indesign|afterfx|premiere|resolve|blender|sketch|inkscape|gimp|lightroom|coreldraw|autocad|fusion360|maya|3dsmax|cinema4d|aseprite)(?:\.exe)?(?:\b|$)/i;
const DESIGN_TITLE_REGEX = /(?:figma|\bfigma\.com\b|canva|\bcanva\.com\b|adobe\s+photoshop|\bphotoshop\b|adobe\s+illustrator|\billustrator\b|adobe\s+indesign|after\s+effects|premiere\s+pro|davinci\s+resolve|\bblender\b|\bsketch\b|\binkscape\b|\bgimp\b|\blightroom\b|\bdribbble\b|\bbehance\b|\bartboard\b|\bui\/ux\b|\bwireframe\b|\bspline\b)/i;

// 4. WRITING (word processors, document editors, note-taking, markdown authoring)
const WRITING_OWNER_REGEX = /(?:^|\b)(?:winword|word|notion|obsidian|scrivener|typora|ia\s*writer|ulysses|wordpad|onenote|evernote|bear|craft|logseq|keep)(?:\.exe)?(?:\b|$)/i;
const WRITING_TITLE_REGEX = /(?:google\s+docs|docs\.google\.com|microsoft\s+word|\bnotion\b|\bobsidian\b|\bscrivener\b|\btypora\b|\boverleaf\b|\bgrammarly\b|\bmedium\s+-\s+write\b|\bsubstack\s+-\s+write\b|\bdraft\b|\bchapter\b|\bessay\b|\bmanuscript\b|\bblog\s+post\b|\bwordpad\b|\bonenote\b)/i;

// 5. READING (PDF viewers, ebook readers, documentation, encyclopedias, research papers)
const READING_OWNER_REGEX = /(?:^|\b)(?:acrord32|acrobat|foxitreader|sumatrapdf|kindle|calibre|kobo|pocket|instapaper)(?:\.exe)?(?:\b|$)/i;
const READING_TITLE_REGEX = /(?:\.pdf\b|adobe\s+acrobat|sumatrapdf|foxit\s+reader|kindle|calibre|\bwikipedia\b|mdn\s+web\s+docs|\bdevdocs\b|\barxiv\b|\bresearchgate\b|\bsciencedirect\b|\breadwise\b|documentation\s+[-–—]|api\s+reference\s+[-–—]|\buser\s+manual\b|\bebook\b)/i;

// 6. BROWSING (standard browsers without more specific task contexts)
const BROWSER_OWNER_REGEX = /(?:^|\b)(?:chrome|msedge|firefox|brave|opera|safari|arc|vivaldi)(?:\.exe)?(?:\b|$)/i;

/**
 * Detects the smart screen task context from active window metadata.
 * 
 * @param {object|null} activeWindow - Active window object { owner, title }
 * @returns {string} One of SCREEN_MODES (coding, writing, video, reading, design, browsing, default)
 */
function detectScreenContext(activeWindow) {
  if (!activeWindow) return SCREEN_MODES.DEFAULT;

  const owner = (activeWindow.owner || activeWindow.appName || '').trim();
  const title = (activeWindow.title || activeWindow.windowTitle || '').trim();
  const ownerLower = owner.toLowerCase();
  const ownerBase = ownerLower.replace(/\.exe$/i, '').trim();
  const titleLower = title.toLowerCase();

  // 1. VIDEO CONTEXT (High priority: YouTube/Netflix in browser or VLC/media players)
  if (
    VIDEO_OWNER_REGEX.test(ownerLower) ||
    VIDEO_OWNER_REGEX.test(ownerBase) ||
    VIDEO_TITLE_REGEX.test(titleLower)
  ) {
    return SCREEN_MODES.VIDEO;
  }

  // 2. CODING CONTEXT (IDEs, terminals, or code files / developer hubs in browser)
  if (
    CODING_OWNER_REGEX.test(ownerLower) ||
    CODING_OWNER_REGEX.test(ownerBase) ||
    CODING_TITLE_EXT_REGEX.test(title) ||
    CODING_TITLE_KEYWORDS_REGEX.test(titleLower)
  ) {
    return SCREEN_MODES.CODING;
  }

  // 3. DESIGN CONTEXT (Figma, Photoshop, Canva, Blender, etc.)
  if (
    DESIGN_OWNER_REGEX.test(ownerLower) ||
    DESIGN_OWNER_REGEX.test(ownerBase) ||
    DESIGN_TITLE_REGEX.test(titleLower)
  ) {
    return SCREEN_MODES.DESIGN;
  }

  // 4. WRITING CONTEXT (Google Docs, Word, Notion, Obsidian, Typora, etc.)
  if (
    WRITING_OWNER_REGEX.test(ownerLower) ||
    WRITING_OWNER_REGEX.test(ownerBase) ||
    WRITING_TITLE_REGEX.test(titleLower)
  ) {
    return SCREEN_MODES.WRITING;
  }

  // 5. READING CONTEXT (PDFs, Kindle, Wikipedia, arXiv, DevDocs, MDN, etc.)
  if (
    READING_OWNER_REGEX.test(ownerLower) ||
    READING_OWNER_REGEX.test(ownerBase) ||
    READING_TITLE_REGEX.test(titleLower)
  ) {
    return SCREEN_MODES.READING;
  }

  // 6. BROWSING CONTEXT (Any standard web browser not already caught by specific sites)
  if (
    BROWSER_OWNER_REGEX.test(ownerLower) ||
    BROWSER_OWNER_REGEX.test(ownerBase)
  ) {
    return SCREEN_MODES.BROWSING;
  }

  // Fallback
  return SCREEN_MODES.DEFAULT;
}

/**
 * Resolves the effective screen mode considering manual user override in configuration.
 * 
 * @param {object} config - Configuration object
 * @param {object|null} activeWindow - Active window info
 * @returns {string} Active screen mode
 */
function resolveEffectiveScreenMode(config, activeWindow) {
  if (!config || config.smartScreenModes === false) {
    return SCREEN_MODES.DEFAULT;
  }

  // Manual override takes precedence if set to a specific mode
  if (
    config.currentScreenMode &&
    config.currentScreenMode !== 'auto' &&
    SCREEN_MODE_PROMPTS[config.currentScreenMode]
  ) {
    return config.currentScreenMode;
  }

  return detectScreenContext(activeWindow);
}

module.exports = {
  SCREEN_MODES,
  SCREEN_MODE_PROMPTS,
  SCREEN_MODE_USER_HINTS,
  SCREEN_MODE_BADGES,
  detectScreenContext,
  resolveEffectiveScreenMode
};
