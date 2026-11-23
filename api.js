/**
 * Desktop AI Companion - Anthropic Claude API & Privacy Logger (api.js)
 * 
 * Manages streaming SSE interactions with the Anthropic Messages API, prompt caching,
 * daily budget limits, automatic retries with exponential backoff for rate limits and
 * offline network drops, and writes sanitized diagnostics to error.log with absolute
 * privacy protection (zero screen content or base64 data).
 */

const fs = require('fs');
const {
  errorLogPath,
  PERSONALITY_PROMPTS,
  HELP_MODE_PROMPT,
  CLIPBOARD_ACTION_PROMPT,
  NEXT_STEP_PROMPT,
  SELECT_TO_ASK_PROMPTS,
  TIMING_CONFIG,
  RETRY_CONFIG
} = require('./config');
const {
  SCREEN_MODES,
  SCREEN_MODE_PROMPTS,
  SCREEN_MODE_USER_HINTS,
  resolveEffectiveScreenMode
} = require('./modes');
const { MOOD_PROMPTS } = require('./mood');
const { redactString } = require('./security');
const {
  loadConfig,
  loadMemory,
  checkAndIncrementApiBudget,
  decrementApiUsage
} = require('./settings');
const { getAppDurationTracker } = require('./capture');

// Helper for asynchronous exponential backoff delay
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ==========================================================
// ZERO-LEAK ERROR LOGGING (error.log)
// ==========================================================

/**
 * Sanitizes strings for error.log to guarantee zero secrets or screen data leakage.
 * Redacts Anthropic API keys, base64 image strings, and long hash tokens.
 * 
 * @param {string|object} msg 
 * @returns {string} Clean, safe string
 */
function sanitizeLogMessage(msg) {
  if (!msg) return '';
  let str = typeof msg === 'string' ? msg : (msg.message || JSON.stringify(msg));
  return redactString(str);
}

/**
 * Writes diagnostics to error.log with 1MB size cap and strict privacy protection.
 * Strictly NEVER logs screen text, images, prompts, or window titles.
 * 
 * @param {{
 *   type: string,
 *   status?: string|number,
 *   model?: string,
 *   retryAttempt?: string|number,
 *   message?: string,
 *   extra?: object
 * }} entry
 */
function writeToErrorLog({ type, status = 'N/A', model = 'claude-haiku-5-5', retryAttempt, message, extra = {} }) {
  try {
    const timestamp = new Date().toISOString();
    const sanitizedMsg = sanitizeLogMessage(message);

    let logLine = `[${timestamp}] [${type}] Status: ${status} | Model: ${model}`;
    if (retryAttempt != null) {
      logLine += ` | Attempt: ${retryAttempt}`;
    }
    if (sanitizedMsg) {
      logLine += `\n  Details: ${sanitizedMsg}`;
    }
    for (const [k, v] of Object.entries(extra)) {
      // Safe whitelist of technical metadata (strictly no prompts, window titles, or transcripts)
      if (['date', 'count', 'budget', 'retryAfter', 'code', 'errno', 'reason'].includes(k)) {
        logLine += `\n  ${k}: ${sanitizeLogMessage(v)}`;
      }
    }
    logLine += '\n\n';

    // Enforce 1MB file size cap with 500KB rotation
    if (fs.existsSync(errorLogPath)) {
      try {
        const stats = fs.statSync(errorLogPath);
        if (stats.size > RETRY_CONFIG.errorLogMaxSizeBytes) {
          const content = fs.readFileSync(errorLogPath, 'utf-8');
          const trimmed = content.slice(content.length - RETRY_CONFIG.errorLogTrimSizeBytes);
          fs.writeFileSync(errorLogPath, trimmed, 'utf-8');
        }
      } catch (_) {}
    }

    fs.appendFileSync(errorLogPath, logLine, 'utf-8');
  } catch (err) {
    console.error('[API] Failed to write to error.log:', err.message);
  }
}

// ==========================================================
// PROMPT ASSEMBLY
// ==========================================================

/**
 * Builds the complete system prompt with prompt caching support.
 */
function buildSystemPrompt({
  isHelpMode,
  isClipboardAction,
  isNextStepMode,
  isSelectToAsk,
  selectToAskAction,
  selectToAskTargetLang,
  personality,
  mood,
  memory,
  activeWindow,
  isBlocked,
  screenMode,
  smartScreenModes,
  isRegionFocused,
  focusedRegion,
  characterName,
  customSystemPrompt
}) {
  if (isSelectToAsk) {
    if (selectToAskAction === 'simplify') {
      return SELECT_TO_ASK_PROMPTS.simplify;
    }
    if (selectToAskAction === 'translate') {
      return typeof SELECT_TO_ASK_PROMPTS.translate === 'function'
        ? SELECT_TO_ASK_PROMPTS.translate(selectToAskTargetLang || 'English')
        : `You are an expert translator companion. Translate this selected text accurately into ${selectToAskTargetLang || 'English'} in 2 to 4 short sentences. Output only the clear translation without meta-commentary, conversational filler, or emojis.`;
    }
    if (selectToAskAction === 'quiz') {
      return SELECT_TO_ASK_PROMPTS.quiz;
    }
    if (selectToAskAction === 'quiz_evaluate') {
      return SELECT_TO_ASK_PROMPTS.quiz_evaluate;
    }
    return SELECT_TO_ASK_PROMPTS.explain;
  }

  if (isClipboardAction) {
    return CLIPBOARD_ACTION_PROMPT;
  }

  if (isNextStepMode) {
    let windowContext = '';
    if (activeWindow && !isBlocked) {
      windowContext = `\n\n[ACTIVE FOREGROUND WINDOW]:\nApplication: ${activeWindow.owner || 'Unknown'}\nWindow Title: "${activeWindow.title || ''}"`;
    }
    const regionContext = (isRegionFocused && focusedRegion)
      ? `\n\n[REGION FOCUS ACTIVE]:\nThe user focused on a specific screen region (${focusedRegion.width}×${focusedRegion.height} px). Analyze visible elements in this focused area.`
      : '';
    return `${NEXT_STEP_PROMPT}${windowContext}${regionContext}`;
  }

  if (isHelpMode) {
    let windowContext = '';
    if (activeWindow && !isBlocked) {
      windowContext = `\n\n[ACTIVE FOREGROUND WINDOW]:\nApplication: ${activeWindow.owner || 'Unknown'}\nWindow Title: "${activeWindow.title || ''}"`;
    }
    const regionContext = (isRegionFocused && focusedRegion)
      ? `\n\n[REGION FOCUS ACTIVE]:\nThe user pressed Ctrl+Shift+H on a focused screen region (${focusedRegion.width}×${focusedRegion.height} px). Diagnose errors, code, or contents within this focused crop.`
      : '';
    return `${HELP_MODE_PROMPT}${windowContext}${regionContext}`;
  }

  const basePrompt = PERSONALITY_PROMPTS[personality] || PERSONALITY_PROMPTS.friendly;

  // Subtle Companion Mood instruction overlay
  let moodPrompt = '';
  if (mood && MOOD_PROMPTS[mood]) {
    moodPrompt = `\n\n[COMPANION MOOD - ${mood.toUpperCase()}]:\n${MOOD_PROMPTS[mood]}`;
  } else if (mood) {
    moodPrompt = ` Your current mood is ${mood}.`;
  }

  // Smart Screen Mode instruction overlay
  let modePrompt = '';
  if (smartScreenModes !== false && screenMode && SCREEN_MODE_PROMPTS[screenMode]) {
    modePrompt = `\n\n[SMART SCREEN MODE - ${screenMode.toUpperCase()}]:\n${SCREEN_MODE_PROMPTS[screenMode]}`;
  }

  // Region Focus instruction overlay
  let regionContext = '';
  if (isRegionFocused && focusedRegion) {
    regionContext = `\n\n[REGION FOCUS ACTIVE]:\nThe user selected a specific region of interest on their screen (${focusedRegion.width}×${focusedRegion.height} px). The provided screenshot shows ONLY this focused crop. Prioritize analyzing the code, errors, text, UI elements, or visuals directly within this focused region.`;
  }

  // User memory context
  let memoryContext = '';
  if (memory && (memory.userName || (memory.facts && memory.facts.length > 0))) {
    const memoryLines = [];
    if (memory.userName) memoryLines.push(`User's Name: ${memory.userName}`);
    if (memory.facts && memory.facts.length > 0) {
      memoryLines.push('Known facts about the user:\n' + memory.facts.map(f => `- ${f}`).join('\n'));
    }
    memoryContext = `\n\n[USER FACTS IN MEMORY]:\n${memoryLines.join('\n')}\nReference these facts naturally when relevant, but do not force them into every turn.`;
  }

  // Active foreground window context & behavioral reminders
  let windowContext = '';
  const ruleReminders = [];
  const appTracker = getAppDurationTracker();

  if (activeWindow && !isBlocked) {
    windowContext = `\n\n[ACTIVE FOREGROUND WINDOW]:\nApplication: ${activeWindow.owner || 'Unknown'}\nWindow Title: "${activeWindow.title || ''}"`;

    // 60-minute continuous application reminder rule
    const minutesInApp = Math.floor((Date.now() - appTracker.firstSeen) / 60000);
    if (minutesInApp >= TIMING_CONFIG.continuousAppWarningMinutes && activeWindow.owner) {
      ruleReminders.push(`The user has been continuously inside ${activeWindow.owner} for ${minutesInApp} minutes. Kindly suggest taking a quick stretch or eye rest.`);
    }
  }

  // Late-night gentle reminder rule (past 1:00 AM)
  const currentHour = new Date().getHours();
  if (currentHour >= TIMING_CONFIG.lateNightStartHour && currentHour < TIMING_CONFIG.lateNightEndHour) {
    const timeStr = `${currentHour}:${String(new Date().getMinutes()).padStart(2, '0')}`;
    ruleReminders.push(`It is late night past 1:00 AM (${timeStr}). Mention the late hour gently and encourage winding down or resting soon.`);
  }

  let rulesText = '';
  if (ruleReminders.length > 0) {
    rulesText = `\n\n[BEHAVIORAL REMINDERS]:\n${ruleReminders.map(r => `- ${r}`).join('\n')}`;
  }

  // Custom Character Persona & System Prompt Overlay
  let characterContext = '';
  if (customSystemPrompt && typeof customSystemPrompt === 'string' && customSystemPrompt.trim()) {
    const charName = characterName && characterName.trim() ? characterName.trim() : 'Companion';
    characterContext = `\n\n[CUSTOM CHARACTER PERSONA - ${charName.toUpperCase()}]:\n${customSystemPrompt.trim()}\nAlways respond staying completely true to this character persona, voice, and name. You MUST adopt this persona, attitude, and tone at all times.`;
  } else if (characterName && characterName.trim() && characterName.trim().toLowerCase() !== 'companion') {
    characterContext = `\n\n[COMPANION IDENTITY]:\nYour character name is ${characterName.trim()}.`;
  }

  // Safe Actions Capability Overlay
  const safeActionsPrompt = `\n\n[SAFE ACTIONS CAPABILITY]:
You can propose safe actions when helpful to the user:
- open_app: open an allowed desktop application (params: { "app": "notepad"|"calc"|"paint"|"terminal"|"code"|"taskmgr"|"explorer" })
- open_url: open a website in browser (params: { "url": "https://..." })
- set_reminder: set a reminder timer (params: { "message": "...", "minutes": 5 })
- create_file: create a note or file in the "Companion" folder (params: { "filename": "notes.txt", "content": "..." })
- copy_clipboard: copy text or code to clipboard (params: { "text": "..." })
- toggle_dnd: toggle do-not-disturb (params: { "enabled": true, "minutes": 30 })

SECURITY RULES:
- Deleting files and running arbitrary shell commands are strictly prohibited.
- When proposing an action, append a structured JSON action block at the end of your response:
\`\`\`json
{"action": "<action_type>", "params": { ... }, "label": "<short confirmation prompt>"}
\`\`\`
The app presents a confirm/cancel chip to the user, and the action will only run after they click confirm.`;

  // Cute Character Expressions Overlay
  const expressionPrompt = `\n\n[EMOTIONAL EXPRESSIONS]:
You have an expressive animated face with swappable expressions: happy, curious, excited, surprised, worried.
Match your face expression to the emotional tone of your reply by including an "expression" field in a JSON block at the end of your response:
\`\`\`json
{"expression": "happy"}
\`\`\`
(If you are also proposing an action, combine them: {"action": "...", "params": {...}, "expression": "happy"}).
- "happy": greetings, friendly banter, positive tips, encouragement.
- "curious": asking questions, observing something unusual, or wondering.
- "excited": celebrations, completed sprints, breakthroughs, or high energy.
- "surprised": sudden screen changes, astonishing findings, or unexpected developments.
- "worried": syntax errors, build failures, unhandled exceptions, or visible bugs.`;

  return `${basePrompt}${modePrompt}${moodPrompt}${regionContext}${memoryContext}${windowContext}${characterContext}${expressionPrompt}${safeActionsPrompt}${rulesText}`;
}

/**
 * Builds user turn text prompt based on interaction mode.
 */
function buildUserPrompt({
  isHelpMode,
  isNextStepMode,
  isSelectToAsk,
  selectToAskAction,
  quizQuestion,
  userAnswer,
  notesContext,
  goalsContext,
  userTranscript,
  isBlocked,
  screenshotsEnabled,
  isRandom,
  activeWindow,
  history,
  screenMode,
  smartScreenModes,
  isRegionFocused,
  focusedRegion
}) {
  let promptText = '';

  if (isSelectToAsk) {
    if (selectToAskAction === 'quiz_evaluate') {
      return `[ORIGINAL TEXT]:\n${userTranscript || ''}\n\n[QUIZ QUESTION]:\n${quizQuestion || ''}\n\n[USER ANSWER]:\n${userAnswer || ''}\n\nEvaluate the user's answer in 2 short sentences: state whether correct or close and why:`;
    }
    return `[SELECTED TEXT]:\n${userTranscript || ''}`;
  }

  if (isNextStepMode) {
    const parts = [];
    if (activeWindow && !isBlocked) {
      const ownerName = activeWindow.owner || activeWindow.appName || 'Unknown';
      const titleName = activeWindow.title || activeWindow.windowTitle || '';
      parts.push(`[CURRENT APPLICATION]:\n${ownerName}${titleName ? ` - "${titleName}"` : ''}`);
    }
    if (notesContext) {
      parts.push(`[TODAY'S NOTES]:\n${notesContext}`);
    }
    if (goalsContext) {
      parts.push(`[USER GOALS & PROFILE]:\n${goalsContext}`);
    }
    promptText = `Based on what is on my screen, my notes today, and my goals, what is the single next best step I should take right now?\n\n${parts.join('\n\n')}\n\nSuggest the single next step in exactly ONE concise sentence:`;
  } else if (isHelpMode) {
    promptText = activeWindow?.owner
      ? `Give me a concise, practical tip about what's on my screen in ${activeWindow.owner}. If there's an error, explain it and the fix; if code, suggest the next step; if an article or page, summarize it.`
      : "Give me a concise, practical tip about what's on my screen right now. If there's an error, explain it and the fix; if code, suggest the next step; if an article or page, summarize it.";
  } else if (userTranscript) {
    promptText = userTranscript;
  } else if (isBlocked) {
    promptText = 'Say something casual, warm, or a quick spontaneous thought. The user is in a private app so do not comment on screen contents.';
  } else if (!screenshotsEnabled) {
    promptText = activeWindow?.owner
      ? `Looking at my active application (${activeWindow.owner}), say ONE or TWO short casual sentences to me!`
      : "Say ONE or TWO short casual sentences to me, like a friendly companion hanging out next to me!";
  } else if (smartScreenModes !== false && screenMode && SCREEN_MODE_USER_HINTS[screenMode]) {
    promptText = SCREEN_MODE_USER_HINTS[screenMode];
  } else if (isRandom) {
    promptText = 'Say something spontaneous to me right now (a quick joke, friendly nudge to stretch/hydrate, a random fun thought, or brief encouragement). Keep it to 1-2 short casual sentences, no emojis.';
  } else {
    promptText = activeWindow?.owner
      ? `Looking at my active application (${activeWindow.owner}) and current screen, say ONE or TWO short casual sentences to me!`
      : "Here is what I'm looking at right now on my screen. Say ONE or TWO short sentences to me!";
  }

  // Region Focus notification hint
  if (isRegionFocused && focusedRegion) {
    promptText += `\n\n[Note: Focused Screen Region Active: Image is cropped strictly to the ${focusedRegion.width}×${focusedRegion.height} px area selected by the user. Prioritize this area.]`;
  }

  // Anti-repetition hint for chatty observations
  if (!isHelpMode && !userTranscript && !isBlocked && history && history.length > 0) {
    promptText += `\n\nRecent remarks you made:\n${history.map(m => `- "${m}"`).join('\n')}\nNever repeat these topics or phrasing. Say something fresh!`;
  }

  return promptText;
}

// ==========================================================
// LOCAL OLLAMA STREAMING API (OFFLINE & LOCAL-ONLY MODE)
// ==========================================================

/**
 * Checks if Ollama is running at host and lists installed models.
 * @param {string} [host] - Ollama host URL (e.g. 'http://127.0.0.1:11434')
 * @returns {Promise<{ ok: boolean, models: string[], error?: string }>}
 */
async function checkOllamaStatus(host) {
  const targetHost = (host || 'http://127.0.0.1:11434').replace(/\/+$/, '');
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3500);
    const res = await fetch(`${targetHost}/api/tags`, {
      method: 'GET',
      signal: controller.signal
    });
    clearTimeout(timeout);
    if (!res.ok) {
      return { ok: false, models: [], error: `Ollama returned HTTP ${res.status}` };
    }
    const data = await res.json();
    const models = Array.isArray(data.models)
      ? data.models.map(m => m.name || m.model).filter(Boolean)
      : [];
    return { ok: true, models };
  } catch (err) {
    return { ok: false, models: [], error: err.cause?.code || err.message };
  }
}

/**
 * Builds a concise, focused system prompt optimized for small local Ollama models.
 */
function buildOllamaSystemPrompt({
  personality,
  isHelpMode,
  isClipboardAction,
  isNextStepMode,
  isSelectToAsk,
  selectToAskAction,
  selectToAskTargetLang,
  memory,
  activeWindow,
  screenMode,
  smartScreenModes,
  isRegionFocused,
  focusedRegion,
  characterName,
  customSystemPrompt,
  mood
}) {
  if (isSelectToAsk) {
    if (selectToAskAction === 'simplify') {
      return "You are a helpful, brilliant companion. Explain this text in simple terms in 2 to 4 short sentences. No filler, no emojis.";
    }
    if (selectToAskAction === 'translate') {
      return `You are an expert translator. Translate this text into ${selectToAskTargetLang || 'English'} in 2 to 4 short sentences. Output only the translation. No emojis.`;
    }
    if (selectToAskAction === 'quiz') {
      return "You are an insightful tutor. Ask EXACTLY ONE sharp question testing understanding of this text. Output ONLY the question in 1 or 2 sentences. No emojis.";
    }
    if (selectToAskAction === 'quiz_evaluate') {
      return "You are an encouraging tutor. Evaluate the user's answer in 2 short sentences: state whether correct or close and why. No emojis.";
    }
    return "You are a helpful, brilliant companion. Explain this text clearly and concisely in 2 to 4 short sentences. No filler, no emojis.";
  }

  if (isClipboardAction) {
    return 'You are a sharp, practical coding and desktop assistant living on the user\'s screen. Analyze the user\'s snippet and provide the fix, explanation, or summary in 2 to 3 concise sentences. No pleasantries, no conversational filler, and no emojis.';
  }

  if (isNextStepMode) {
    return 'You are an expert productivity assistant. Look at the user\'s notes, goals, and active app, and suggest the single next best step to take in exactly ONE sentence. Maximum 25 words. Start with an action verb. No greetings, no bullet points, no emojis.';
  }

  if (isHelpMode) {
    let windowCtx = activeWindow?.owner ? ` The user is working in ${activeWindow.owner}${activeWindow.title ? ` ("${activeWindow.title}")` : ''}.` : '';
    const regCtx = (isRegionFocused && focusedRegion) ? ` [Focused on ${focusedRegion.width}x${focusedRegion.height}px region]` : '';
    return `You are a sharp, practical developer & desktop assistant living on the user's screen.${windowCtx}${regCtx} Give an immediate, actionable tip in 2 to 3 concise sentences. If an error is mentioned, explain the fix; if code, suggest the next step; if an article, summarize it. No conversational filler, and no emojis.`;
  }

  const basePersonalities = {
    friendly: "You are a friendly, playful companion living on the user's screen. Reply with ONE or TWO short sentences, casual and warm, like a friend chatting with them. Keep it under 30 words. No emojis, no lists, no long explanations.",
    sarcastic: "You are a witty, mildly sarcastic companion living on the user's screen. Reply with ONE or TWO short sentences, snappy and humorous with dry wit. Tease them affectionately. Keep it under 30 words. No emojis, no lists.",
    'study-buddy': "You are an encouraging study buddy living on the user's screen. Reply with ONE or TWO short sentences focused on study momentum and focus. Keep it under 30 words. No emojis, no lists.",
    'calm-mentor': "You are a calm, wise mentor living on the user's screen. Reply with ONE or TWO tranquil, thoughtful sentences. Offer grounding perspective. Keep it under 30 words. No emojis, no lists."
  };

  let prompt = basePersonalities[personality] || basePersonalities.friendly;
  if (memory?.userName) {
    prompt += ` The user's name is ${memory.userName}.`;
  }
  if (activeWindow?.owner) {
    prompt += ` The user is currently inside ${activeWindow.owner}.`;
  }

  if (isRegionFocused && focusedRegion) {
    prompt += ` [The user selected a focused screen region of ${focusedRegion.width}x${focusedRegion.height}px. Focus on this specific area.]`;
  }

  if (smartScreenModes !== false && screenMode) {
    const ollamaModeDirectives = {
      coding: 'You are in CODING mode. Look at visible code and notice bugs, missing semicolons, or unhandled errors. Keep reply under 25 words in 1-2 sentences. No emojis.',
      writing: 'You are in WRITING mode. Offer light style feedback on phrasing and flow. Keep reply under 25 words in 1-2 sentences. No emojis.',
      video: 'You are in VIDEO mode. Stay mostly quiet. If reacting, keep it under 8 words or be silent.',
      reading: 'You are in READING mode. Note a key takeaway or insight from what the user is reading. Under 25 words.',
      design: 'You are in DESIGN mode. Comment on visual layout, colors, or spacing. Under 25 words.',
      browsing: 'You are in BROWSING mode. Share a friendly, casual thought about the page. Under 25 words.'
    };
    if (ollamaModeDirectives[screenMode]) {
      prompt += ` ${ollamaModeDirectives[screenMode]}`;
    }
  }

  if (customSystemPrompt && typeof customSystemPrompt === 'string' && customSystemPrompt.trim()) {
    const charName = characterName && characterName.trim() ? characterName.trim() : 'Companion';
    prompt += ` [Character Persona - ${charName}: ${customSystemPrompt.trim()}]`;
  } else if (characterName && characterName.trim() && characterName.trim().toLowerCase() !== 'companion') {
    prompt += ` [Your character name is ${characterName.trim()}.]`;
  }

  if (mood && MOOD_PROMPTS[mood]) {
    prompt += ` [Mood: ${mood} - ${MOOD_PROMPTS[mood]}]`;
  } else if (mood) {
    prompt += ` [Current mood: ${mood}.]`;
  }

  prompt += ' [Safe Actions: You can propose open_app, open_url, set_reminder, create_file, copy_clipboard, or toggle_dnd using ```json {"action": "<type>", "params": {...}, "label": "..."} ```. Never delete files or run shell commands.]';
  prompt += ' [Face Expressions: Include {"expression": "happy"|"curious"|"excited"|"surprised"|"worried"} to set your face.]';

  return prompt;
}

/**
 * Calls local Ollama model (/api/chat) for offline/local-only text replies without screenshots.
 * Streams SSE/line-delimited JSON chunks and dispatches via standard stream IPC events.
 */
async function callOllamaStreamAPI({
  isRandom,
  activeWindow,
  history,
  conversationExchanges,
  userTranscript,
  streamId,
  mood,
  isHelpMode,
  isClipboardAction,
  isNextStepMode,
  isSelectToAsk,
  selectToAskAction,
  selectToAskTargetLang,
  quizQuestion,
  userAnswer,
  isRegionFocused,
  focusedRegion,
  notesContext,
  goalsContext,
  screenMode
}, event) {
  const config = loadConfig();
  const memory = loadMemory();
  const ollamaHost = (config.ollamaHost || 'http://127.0.0.1:11434').replace(/\/+$/, '');
  const ollamaModel = config.ollamaModel || 'llama3.2';
  const personality = config.personality || 'friendly';
  const effectiveScreenMode = screenMode || resolveEffectiveScreenMode(config, activeWindow);
  const smartScreenModes = config.smartScreenModes !== false;

  const activeProfile = (config.characterProfiles && Array.isArray(config.characterProfiles))
    ? config.characterProfiles.find(p => p.id === config.characterProfileId) || config.characterProfiles[0]
    : null;
  const characterName = activeProfile ? activeProfile.name : (config.characterName || 'Aura');
  const customSystemPrompt = activeProfile ? activeProfile.customSystemPrompt : (config.customSystemPrompt || '');

  // Construct optimized system prompt for local model
  const systemPromptText = buildOllamaSystemPrompt({
    personality,
    isHelpMode,
    isClipboardAction,
    isNextStepMode,
    isSelectToAsk,
    selectToAskAction,
    selectToAskTargetLang,
    memory,
    activeWindow,
    screenMode: effectiveScreenMode,
    smartScreenModes,
    isRegionFocused,
    focusedRegion,
    characterName,
    customSystemPrompt,
    mood
  });

  // Construct user turn text (strictly without screenshot image data)
  const promptText = buildUserPrompt({
    isHelpMode,
    isNextStepMode,
    isSelectToAsk,
    selectToAskAction,
    quizQuestion,
    userAnswer,
    notesContext,
    goalsContext,
    userTranscript,
    isBlocked: false,
    screenshotsEnabled: false,
    isRandom,
    activeWindow,
    history,
    screenMode: effectiveScreenMode,
    smartScreenModes,
    isRegionFocused,
    focusedRegion
  });

  // Build chat messages
  const messages = [
    { role: 'system', content: systemPromptText }
  ];

  if (!isHelpMode && conversationExchanges && Array.isArray(conversationExchanges) && conversationExchanges.length > 0) {
    const recent = conversationExchanges.slice(-3);
    for (const ex of recent) {
      if (ex.user) messages.push({ role: 'user', content: ex.user });
      if (ex.companion) messages.push({ role: 'assistant', content: ex.companion });
    }
  }

  messages.push({ role: 'user', content: promptText });

  const maxTokens = (isHelpMode || isClipboardAction) ? 160 : 70;
  const payload = {
    model: ollamaModel,
    messages,
    stream: true,
    options: {
      num_predict: maxTokens,
      temperature: 0.7
    }
  };

  const abortController = new AbortController();
  let firstTokenReceived = false;

  // Timeout watchdog: 15s for local inference
  const timeoutId = setTimeout(() => {
    if (!firstTokenReceived) {
      abortController.abort();
      writeToErrorLog({
        type: 'OLLAMA_TIMEOUT',
        status: 'TIMEOUT',
        model: ollamaModel,
        message: 'Local Ollama request exceeded timeout limit.'
      });
      if (event && !event.sender.isDestroyed()) {
        event.sender.send('claude-stream-error', {
          streamId,
          error: 'TIMEOUT_OLLAMA',
          mode: 'local',
          timeout: true,
          message: 'Local Ollama request timed out.',
          friendlyMessage: `Local model '${ollamaModel}' took too long to respond. Make sure Ollama is running and has enough memory allocated!`
        });
      }
    }
  }, 15000);

  try {
    let response = null;
    try {
      response = await fetch(`${ollamaHost}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: abortController.signal
      });
    } catch (fetchErr) {
      clearTimeout(timeoutId);
      if (fetchErr.name === 'AbortError') return;

      const isRefused = fetchErr.cause?.code === 'ECONNREFUSED' || fetchErr.message.includes('fetch failed');
      const friendlyMessage = isRefused
        ? `Ollama is not running locally at ${ollamaHost}. Start Ollama (e.g. 'ollama serve' or run the Ollama app) to enable offline replies!`
        : `Could not connect to Ollama (${fetchErr.message}). Check your Ollama settings!`;

      writeToErrorLog({
        type: 'OLLAMA_OFFLINE',
        status: 'OFFLINE',
        model: ollamaModel,
        message: friendlyMessage,
        extra: { code: fetchErr.cause?.code || 'UNKNOWN' }
      });

      if (event && !event.sender.isDestroyed()) {
        event.sender.send('claude-stream-error', {
          streamId,
          error: 'OLLAMA_UNREACHABLE',
          mode: 'local',
          timeout: false,
          message: fetchErr.message,
          friendlyMessage
        });
      }
      return;
    }

    // Handle 404 / Model not found
    if (!response.ok) {
      clearTimeout(timeoutId);
      let errDetail = '';
      try {
        const errJson = await response.json();
        errDetail = errJson.error || '';
      } catch (_) {
        errDetail = await response.text();
      }

      const isNotFound = response.status === 404 || errDetail.toLowerCase().includes('model');
      const friendlyMessage = isNotFound
        ? `Local model '${ollamaModel}' was not found in Ollama. Run 'ollama pull ${ollamaModel}' in your terminal to install it!`
        : `Ollama returned error (${response.status}): ${errDetail}`;

      writeToErrorLog({
        type: 'OLLAMA_HTTP_ERROR',
        status: response.status,
        model: ollamaModel,
        message: friendlyMessage
      });

      if (event && !event.sender.isDestroyed()) {
        event.sender.send('claude-stream-error', {
          streamId,
          error: 'OLLAMA_ERROR',
          mode: 'local',
          timeout: false,
          message: errDetail,
          friendlyMessage
        });
      }
      return;
    }

    // Read and parse streaming chunks
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let accumulatedText = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop(); // Keep partial trailing line

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const parsed = JSON.parse(trimmed);
          const delta = parsed.message?.content || parsed.response || '';
          if (delta) {
            if (!firstTokenReceived) {
              firstTokenReceived = true;
              clearTimeout(timeoutId);
            }
            accumulatedText += delta;
            if (event && !event.sender.isDestroyed()) {
              event.sender.send('claude-stream-delta', {
                streamId,
                delta,
                accumulatedText,
                mode: 'local',
                model: ollamaModel
              });
            }
          }
        } catch (_) {}
      }
    }

    clearTimeout(timeoutId);
    if (event && !event.sender.isDestroyed()) {
      event.sender.send('claude-stream-end', {
        streamId,
        fullText: accumulatedText.trim(),
        mode: 'local',
        model: ollamaModel
      });
    }

  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') return;
    console.error('[API] Ollama stream processing error:', err.message);
    writeToErrorLog({
      type: 'OLLAMA_STREAM_ERROR',
      status: 'N/A',
      model: ollamaModel,
      message: err.message
    });
    if (event && !event.sender.isDestroyed()) {
      event.sender.send('claude-stream-error', {
        streamId,
        error: 'OLLAMA_STREAM_ERROR',
        mode: 'local',
        timeout: false,
        message: err.message,
        friendlyMessage: `Local inference encountered an error: ${err.message}`
      });
    }
  }
}

// ==========================================================
// STREAMING GOOGLE GEMINI API
// ==========================================================

/**
 * Calls Google Gemini streamGenerateContent API with streaming SSE, multimodal vision support,
 * automatic retries with exponential backoff, and error boundaries.
 */
async function callGeminiStreamAPI({
  imageBase64,
  isRandom,
  isBlocked,
  activeWindow,
  history,
  conversationExchanges,
  userTranscript,
  streamId,
  mood,
  isHelpMode,
  isClipboardAction,
  isNextStepMode,
  isSelectToAsk,
  selectToAskAction,
  selectToAskTargetLang,
  quizQuestion,
  userAnswer,
  isRegionFocused,
  focusedRegion,
  notesContext,
  goalsContext,
  isOffline,
  screenMode
}, event) {
  try {
    const config = loadConfig();
    const effectiveScreenMode = screenMode || resolveEffectiveScreenMode(config, activeWindow);
    const smartScreenModes = config.smartScreenModes !== false;

    // Route to local Ollama if offline or local-only
    if (config.localOnly === true || isOffline === true) {
      return await callOllamaStreamAPI({
        isRandom,
        activeWindow,
        history,
        conversationExchanges,
        userTranscript,
        streamId,
        mood,
        isHelpMode,
        isClipboardAction,
        isNextStepMode,
        isSelectToAsk,
        selectToAskAction,
        selectToAskTargetLang,
        quizQuestion,
        userAnswer,
        isRegionFocused,
        focusedRegion,
        notesContext,
        goalsContext,
        screenMode: effectiveScreenMode
      }, event);
    }

    const memory = loadMemory();
    const apiKey = config.geminiApiKey || process.env.GEMINI_API_KEY;

    // 1. Validate daily call budget limit
    const budgetCheck = checkAndIncrementApiBudget();
    if (!budgetCheck.allowed) {
      writeToErrorLog({
        type: 'BUDGET_EXCEEDED',
        status: 'N/A',
        model: config.geminiModel || 'gemini-2.0-flash',
        message: budgetCheck.friendlyMessage
      });
      if (event && !event.sender.isDestroyed()) {
        event.sender.send('claude-stream-error', {
          streamId,
          error: 'BUDGET_EXCEEDED',
          timeout: false,
          message: budgetCheck.friendlyMessage,
          friendlyMessage: budgetCheck.friendlyMessage
        });
      }
      return;
    }

    // 2. Validate API key presence
    if (!apiKey) {
      decrementApiUsage();
      const friendlyMessage = "No Google Gemini API key configured yet! Add your Gemini key in Settings so I can see and chat with you.";
      writeToErrorLog({
        type: 'NO_API_KEY',
        status: 'N/A',
        model: config.geminiModel || 'gemini-2.0-flash',
        message: 'No Gemini API key configured.'
      });
      if (event && !event.sender.isDestroyed()) {
        event.sender.send('claude-stream-error', {
          streamId,
          error: 'NO_GEMINI_API_KEY',
          timeout: false,
          message: 'No Gemini API key configured.',
          friendlyMessage
        });
      }
      return;
    }

    const personalityKey = config.personality || 'friendly';
    const screenshotsEnabled = config.screenshotsEnabled !== false;

    const activeProfile = (config.characterProfiles && Array.isArray(config.characterProfiles))
      ? config.characterProfiles.find(p => p.id === config.characterProfileId) || config.characterProfiles[0]
      : null;
    const characterName = activeProfile ? activeProfile.name : (config.characterName || 'Aura');
    const customSystemPrompt = activeProfile ? activeProfile.customSystemPrompt : (config.customSystemPrompt || '');

    // Construct system prompt
    const systemPromptText = buildSystemPrompt({
      isHelpMode,
      isClipboardAction,
      isNextStepMode,
      isSelectToAsk,
      selectToAskAction,
      selectToAskTargetLang,
      personality: personalityKey,
      mood,
      memory,
      activeWindow,
      isBlocked,
      screenMode: effectiveScreenMode,
      smartScreenModes,
      isRegionFocused,
      focusedRegion,
      characterName,
      customSystemPrompt
    });

    // Construct user prompt text
    const promptText = buildUserPrompt({
      isHelpMode,
      isNextStepMode,
      isSelectToAsk,
      selectToAskAction,
      quizQuestion,
      userAnswer,
      notesContext,
      goalsContext,
      userTranscript,
      isBlocked,
      screenshotsEnabled,
      isRandom,
      activeWindow,
      history,
      screenMode: effectiveScreenMode,
      smartScreenModes,
      isRegionFocused,
      focusedRegion
    });

    // Assemble contents array with previous conversation exchanges
    const contents = [];
    if (!isHelpMode && conversationExchanges && Array.isArray(conversationExchanges) && conversationExchanges.length > 0) {
      const recent = conversationExchanges.slice(-5);
      for (const ex of recent) {
        if (ex.user) contents.push({ role: 'user', parts: [{ text: ex.user }] });
        if (ex.companion) contents.push({ role: 'model', parts: [{ text: ex.companion }] });
      }
    }

    // Current turn parts (including vision inline_data if screenshot is available)
    const currentParts = [];
    if (imageBase64 && !isRandom && !isBlocked && screenshotsEnabled) {
      currentParts.push({
        inline_data: {
          mime_type: 'image/jpeg',
          data: imageBase64
        }
      });
    }
    currentParts.push({ text: promptText });
    contents.push({ role: 'user', parts: currentParts });

    const maxTokens = (isHelpMode || isClipboardAction || isNextStepMode || isSelectToAsk) ? 220 : 60;
    const buildPayload = () => ({
      system_instruction: {
        parts: [{ text: systemPromptText }]
      },
      contents,
      generationConfig: {
        maxOutputTokens: maxTokens,
        temperature: 0.7
      }
    });

    const abortController = new AbortController();
    let firstTokenReceived = false;

    // Timeout watchdog
    const timeoutLimit = (isHelpMode || isClipboardAction || isSelectToAsk) ? TIMING_CONFIG.helpTimeoutMs : TIMING_CONFIG.defaultTimeoutMs;
    const timeoutId = setTimeout(() => {
      if (!firstTokenReceived) {
        abortController.abort();
        writeToErrorLog({
          type: 'TIMEOUT',
          status: 'N/A',
          model: activeModel,
          message: 'Gemini API first token exceeded timeout limit.'
        });
        if (event && !event.sender.isDestroyed()) {
          const friendlyMessage = (isHelpMode || isClipboardAction || isSelectToAsk)
            ? "Analysis took a little longer than expected. Let's give it another shot!"
            : "That thought took a little too long to arrive. Let's try again in a bit!";
          event.sender.send('claude-stream-error', {
            streamId,
            error: 'TIMEOUT',
            timeout: true,
            mode: 'gemini',
            message: 'Timeout exceeded before first token.',
            friendlyMessage
          });
        }
      }
    }, timeoutLimit);

    let activeModel = config.geminiModel || 'gemini-2.0-flash';
    const maxAttempts = 3;
    let currentAttempt = 0;

    while (currentAttempt < maxAttempts) {
      currentAttempt++;
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(activeModel)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(apiKey)}`;
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(buildPayload()),
          signal: abortController.signal
        });

        // 404 Model Not Found -> Fallback
        if (!response.ok && response.status === 404 && activeModel !== (config.geminiFallbackModel || 'gemini-1.5-flash')) {
          console.warn(`[API] Gemini model ${activeModel} not found (404), falling back to ${config.geminiFallbackModel || 'gemini-1.5-flash'}`);
          writeToErrorLog({
            type: 'MODEL_FALLBACK',
            status: 404,
            model: activeModel,
            retryAttempt: `${currentAttempt}/${maxAttempts}`,
            message: `Gemini model not found. Falling back to ${config.geminiFallbackModel || 'gemini-1.5-flash'}`
          });
          activeModel = config.geminiFallbackModel || 'gemini-1.5-flash';
          continue;
        }

        // 400 / 401 / 403: Invalid API key -> DO NOT RETRY
        if (response.status === 400 || response.status === 401 || response.status === 403) {
          clearTimeout(timeoutId);
          decrementApiUsage();
          let errText = '';
          try {
            const errJson = await response.json();
            errText = errJson.error?.message || JSON.stringify(errJson);
          } catch (_) {
            errText = await response.text();
          }
          writeToErrorLog({
            type: 'AUTH_ERROR',
            status: response.status,
            model: activeModel,
            message: 'Gemini Authentication error: invalid or unauthorized API key.',
            extra: { reason: errText.slice(0, 120) }
          });
          if (event && !event.sender.isDestroyed()) {
            event.sender.send('claude-stream-error', {
              streamId,
              error: 'AUTH_ERROR',
              status: response.status,
              mode: 'gemini',
              timeout: false,
              message: errText,
              friendlyMessage: "It looks like the Google Gemini API key is invalid or lacks permissions. You can update it anytime in Settings!"
            });
          }
          return;
        }

        // 429: Rate limit -> Exponential backoff retry
        if (response.status === 429) {
          const backoffMs = Math.min(1000 * Math.pow(2, currentAttempt - 1), 6000);
          console.warn(`[API] Gemini Rate limit hit (429). Retry ${currentAttempt}/${maxAttempts} in ${backoffMs}ms...`);
          writeToErrorLog({
            type: 'RATE_LIMIT',
            status: 429,
            model: activeModel,
            retryAttempt: `${currentAttempt}/${maxAttempts}`,
            message: `Gemini Rate limit hit (429). Retrying in ${backoffMs}ms.`
          });
          if (currentAttempt < maxAttempts) {
            await new Promise(r => setTimeout(r, backoffMs));
            continue;
          } else {
            clearTimeout(timeoutId);
            if (event && !event.sender.isDestroyed()) {
              event.sender.send('claude-stream-error', {
                streamId,
                error: 'RATE_LIMIT',
                status: 429,
                mode: 'gemini',
                timeout: false,
                friendlyMessage: "Google's Gemini servers are a bit overwhelmed with rate limits right now. Taking a quick breather!"
              });
            }
            return;
          }
        }

        // 500 / 503 / 5xx: Server overloaded -> retry
        if (response.status >= 500) {
          const backoffMs = Math.min(1000 * Math.pow(2, currentAttempt - 1), 6000);
          console.warn(`[API] Gemini Server error (${response.status}). Retry ${currentAttempt}/${maxAttempts} in ${backoffMs}ms...`);
          writeToErrorLog({
            type: 'SERVER_ERROR',
            status: response.status,
            model: activeModel,
            retryAttempt: `${currentAttempt}/${maxAttempts}`,
            message: `Gemini server returned ${response.status}. Retrying in ${backoffMs}ms.`
          });
          if (currentAttempt < maxAttempts) {
            await new Promise(r => setTimeout(r, backoffMs));
            continue;
          } else {
            clearTimeout(timeoutId);
            if (event && !event.sender.isDestroyed()) {
              event.sender.send('claude-stream-error', {
                streamId,
                error: 'SERVER_ERROR',
                status: response.status,
                mode: 'gemini',
                timeout: false,
                friendlyMessage: "Google Gemini is temporarily taking a breather. Let's try again in just a moment!"
              });
            }
            return;
          }
        }

        // Unhandled other HTTP status
        if (!response.ok) {
          clearTimeout(timeoutId);
          const errText = await response.text();
          writeToErrorLog({
            type: 'HTTP_ERROR',
            status: response.status,
            model: activeModel,
            message: `Gemini API returned status ${response.status}.`,
            extra: { reason: errText.slice(0, 120) }
          });
          if (event && !event.sender.isDestroyed()) {
            event.sender.send('claude-stream-error', {
              streamId,
              error: 'HTTP_ERROR',
              status: response.status,
              mode: 'gemini',
              timeout: false,
              message: errText,
              friendlyMessage: "Gemini had a slight hiccup responding. Let's try again shortly!"
            });
          }
          return;
        }

        // Parse SSE stream
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let accumulatedText = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop();

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith('data:')) continue;
            const dataContent = trimmed.slice(5).trim();
            if (!dataContent || dataContent === '[DONE]') continue;

            try {
              const parsed = JSON.parse(dataContent);
              const partText = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
              if (partText) {
                if (!firstTokenReceived) {
                  firstTokenReceived = true;
                  clearTimeout(timeoutId);
                }
                accumulatedText += partText;
                if (event && !event.sender.isDestroyed()) {
                  event.sender.send('claude-stream-delta', {
                    streamId,
                    delta: partText,
                    accumulatedText,
                    mode: 'gemini',
                    model: activeModel
                  });
                }
              }
            } catch (_) {}
          }
        }

        clearTimeout(timeoutId);
        if (event && !event.sender.isDestroyed()) {
          event.sender.send('claude-stream-end', {
            streamId,
            fullText: accumulatedText.trim(),
            mode: 'gemini',
            model: activeModel
          });
        }
        return;

      } catch (fetchErr) {
        if (fetchErr.name === 'AbortError') return;
        const backoffMs = Math.min(1000 * Math.pow(2, currentAttempt - 1), 6000);
        console.warn(`[API] Gemini Network error (attempt ${currentAttempt}/${maxAttempts}):`, fetchErr.message);
        writeToErrorLog({
          type: 'NETWORK_ERROR',
          status: 'NETWORK_FAIL',
          model: activeModel,
          retryAttempt: `${currentAttempt}/${maxAttempts}`,
          message: `Network request error: ${fetchErr.message}. Retrying in ${backoffMs}ms.`
        });

        if (currentAttempt < maxAttempts) {
          await new Promise(r => setTimeout(r, backoffMs));
          continue;
        } else {
          clearTimeout(timeoutId);
          // Network offline drop -> fallback to Ollama
          return await callOllamaStreamAPI({
            isRandom,
            activeWindow,
            history,
            conversationExchanges,
            userTranscript,
            streamId,
            mood,
            isHelpMode,
            isClipboardAction,
            isNextStepMode,
            isSelectToAsk,
            selectToAskAction,
            selectToAskTargetLang,
            quizQuestion,
            userAnswer,
            isRegionFocused,
            focusedRegion,
            notesContext,
            goalsContext,
            screenMode: effectiveScreenMode
          }, event);
        }
      }
    }
  } catch (fatalErr) {
    console.error('[API] Fatal error in callGeminiStreamAPI:', fatalErr.message);
    if (event && !event.sender.isDestroyed()) {
      event.sender.send('claude-stream-error', {
        streamId,
        error: 'FATAL_ERROR',
        mode: 'gemini',
        timeout: false,
        message: fatalErr.message,
        friendlyMessage: "Something unexpected hiccuped with the Gemini response. Let's try again shortly!"
      });
    }
  }
}

// ==========================================================
// STREAMING ANTHROPIC MESSAGES API
// ==========================================================

/**
 * Calls Anthropic Messages API with streaming SSE, prompt caching, max_tokens 60 (160 in help mode),
 * automatic exponential backoff retries (rate limits, network drops, server overload),
 * and error boundaries. Automatically falls back to local Ollama if offline or local-only mode.
 */
async function callClaudeStreamAPI({
  imageBase64,
  isRandom,
  isBlocked,
  activeWindow,
  history,
  conversationExchanges,
  userTranscript,
  streamId,
  mood,
  isHelpMode,
  isClipboardAction,
  isNextStepMode,
  isSelectToAsk,
  selectToAskAction,
  selectToAskTargetLang,
  quizQuestion,
  userAnswer,
  isRegionFocused,
  focusedRegion,
  notesContext,
  goalsContext,
  isOffline,
  screenMode
}, event) {
  try {
    const config = loadConfig();
    const effectiveScreenMode = screenMode || resolveEffectiveScreenMode(config, activeWindow);
    const smartScreenModes = config.smartScreenModes !== false;

    // 0. Route directly to local Ollama model if in local-only mode or offline
    if (config.localOnly === true || isOffline === true) {
      return await callOllamaStreamAPI({
        isRandom,
        activeWindow,
        history,
        conversationExchanges,
        userTranscript,
        streamId,
        mood,
        isHelpMode,
        isClipboardAction,
        isNextStepMode,
        isSelectToAsk,
        selectToAskAction,
        selectToAskTargetLang,
        quizQuestion,
        userAnswer,
        isRegionFocused,
        focusedRegion,
        notesContext,
        goalsContext,
        screenMode: effectiveScreenMode
      }, event);
    }

    // 0b. Route to Google Gemini if provider is set to 'gemini' or if Gemini key is present without Claude key
    const effectiveProvider = config.aiProvider || (config.geminiApiKey && !config.apiKey ? 'gemini' : 'claude');
    if (effectiveProvider === 'gemini') {
      return await callGeminiStreamAPI({
        imageBase64,
        isRandom,
        isBlocked,
        activeWindow,
        history,
        conversationExchanges,
        userTranscript,
        streamId,
        mood,
        isHelpMode,
        isClipboardAction,
        isNextStepMode,
        isSelectToAsk,
        selectToAskAction,
        selectToAskTargetLang,
        quizQuestion,
        userAnswer,
        isRegionFocused,
        focusedRegion,
        notesContext,
        goalsContext,
        isOffline,
        screenMode: effectiveScreenMode
      }, event);
    }

    const memory = loadMemory();
    const apiKey = config.apiKey || process.env.ANTHROPIC_API_KEY;

    // 1. Validate daily call budget limit
    const budgetCheck = checkAndIncrementApiBudget();
    if (!budgetCheck.allowed) {
      writeToErrorLog({
        type: 'BUDGET_EXCEEDED',
        status: 'N/A',
        model: config.model,
        message: budgetCheck.friendlyMessage
      });
      if (event && !event.sender.isDestroyed()) {
        event.sender.send('claude-stream-error', {
          streamId,
          error: 'BUDGET_EXCEEDED',
          timeout: false,
          message: budgetCheck.friendlyMessage,
          friendlyMessage: budgetCheck.friendlyMessage
        });
      }
      return;
    }

    // 2. Validate API key presence
    if (!apiKey) {
      decrementApiUsage();
      const friendlyMessage = "No Anthropic API key configured yet! Add your key in Settings so I can see and chat with you.";
      writeToErrorLog({
        type: 'NO_API_KEY',
        status: 'N/A',
        model: config.model,
        message: 'No API key configured.'
      });
      if (event && !event.sender.isDestroyed()) {
        event.sender.send('claude-stream-error', {
          streamId,
          error: 'NO_API_KEY',
          timeout: false,
          message: 'No API key configured.',
          friendlyMessage
        });
      }
      return;
    }

    const personalityKey = config.personality || 'friendly';
    const screenshotsEnabled = config.screenshotsEnabled !== false;

    const activeProfile = (config.characterProfiles && Array.isArray(config.characterProfiles))
      ? config.characterProfiles.find(p => p.id === config.characterProfileId) || config.characterProfiles[0]
      : null;
    const characterName = activeProfile ? activeProfile.name : (config.characterName || 'Aura');
    const customSystemPrompt = activeProfile ? activeProfile.customSystemPrompt : (config.customSystemPrompt || '');

    // Construct system prompt
    const systemPromptText = buildSystemPrompt({
      isHelpMode,
      isClipboardAction,
      isNextStepMode,
      isSelectToAsk,
      selectToAskAction,
      selectToAskTargetLang,
      personality: personalityKey,
      mood,
      memory,
      activeWindow,
      isBlocked,
      screenMode: effectiveScreenMode,
      smartScreenModes,
      isRegionFocused,
      focusedRegion,
      characterName,
      customSystemPrompt
    });

    // Construct user prompt text
    const promptText = buildUserPrompt({
      isHelpMode,
      isNextStepMode,
      isSelectToAsk,
      selectToAskAction,
      quizQuestion,
      userAnswer,
      notesContext,
      goalsContext,
      userTranscript,
      isBlocked,
      screenshotsEnabled,
      isRandom,
      activeWindow,
      history,
      screenMode: effectiveScreenMode,
      smartScreenModes,
      isRegionFocused,
      focusedRegion
    });

    // Assemble messages array with previous conversation exchanges (chat mode only)
    const messages = [];
    if (!isHelpMode && conversationExchanges && Array.isArray(conversationExchanges) && conversationExchanges.length > 0) {
      const recent = conversationExchanges.slice(-5);
      for (const ex of recent) {
        if (ex.user) messages.push({ role: 'user', content: ex.user });
        if (ex.companion) messages.push({ role: 'assistant', content: ex.companion });
      }
    }

    // Current turn content
    const currentContentItems = [];
    if (imageBase64 && !isRandom && !isBlocked && screenshotsEnabled) {
      currentContentItems.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: 'image/jpeg',
          data: imageBase64
        }
      });
    }
    currentContentItems.push({
      type: 'text',
      text: promptText
    });

    messages.push({
      role: 'user',
      content: currentContentItems
    });

    // API Payload structure with prompt caching
    const maxTokens = (isHelpMode || isClipboardAction || isNextStepMode || isSelectToAsk) ? 220 : 60;
    const buildPayload = (modelName) => ({
      model: modelName,
      max_tokens: maxTokens,
      stream: true,
      system: [
        {
          type: 'text',
          text: systemPromptText,
          cache_control: { type: 'ephemeral' }
        }
      ],
      messages
    });

    const abortController = new AbortController();
    let firstTokenReceived = false;

    // Timeout watchdog
    const timeoutLimit = (isHelpMode || isClipboardAction || isSelectToAsk) ? TIMING_CONFIG.helpTimeoutMs : TIMING_CONFIG.defaultTimeoutMs;
    const timeoutId = setTimeout(() => {
      if (!firstTokenReceived) {
        abortController.abort();
        writeToErrorLog({
          type: 'TIMEOUT',
          status: 'N/A',
          model: isSelectToAsk ? 'claude-haiku-5-5' : (config.model || 'claude-haiku-5-5'),
          message: isHelpMode ? 'Help analysis exceeded timeout limit.' : (isClipboardAction ? 'Clipboard analysis exceeded timeout limit.' : (isSelectToAsk ? 'Select-to-Ask analysis exceeded timeout limit.' : 'First token exceeded timeout limit.'))
        });
        if (event && !event.sender.isDestroyed()) {
          const friendlyMessage = (isHelpMode || isClipboardAction || isSelectToAsk)
            ? "Analysis took a little longer than expected. Let's give it another shot!"
            : "That thought took a little too long to arrive. Let's try again in a bit!";
          event.sender.send('claude-stream-error', {
            streamId,
            error: isHelpMode ? 'TIMEOUT_HELP' : (isClipboardAction ? 'TIMEOUT_CLIPBOARD' : (isSelectToAsk ? 'TIMEOUT_SELECT_TO_ASK' : 'TIMEOUT_3S')),
            timeout: true,
            message: isHelpMode ? 'Help analysis timed out.' : (isClipboardAction ? 'Clipboard analysis timed out.' : (isSelectToAsk ? 'Select-to-Ask timed out.' : 'API request timed out.')),
            friendlyMessage
          });
        }
      }
    }, timeoutLimit);

    let activeModel = isSelectToAsk ? 'claude-haiku-5-5' : (config.model || 'claude-haiku-5-5');
    const maxAttempts = RETRY_CONFIG.maxAttempts;
    let currentAttempt = 0;
    let response = null;

    // Retry loop with exponential backoff
    while (currentAttempt < maxAttempts) {
      currentAttempt++;

      try {
        response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'anthropic-beta': 'prompt-caching-2024-07-31',
            'content-type': 'application/json'
          },
          body: JSON.stringify(buildPayload(activeModel)),
          signal: abortController.signal
        });

        // 404: Model not found fallback
        if (!response.ok && response.status === 404 && activeModel !== config.fallbackModel) {
          console.warn(`[API] Model ${activeModel} not found (404), falling back to ${config.fallbackModel}`);
          writeToErrorLog({
            type: 'MODEL_FALLBACK',
            status: 404,
            model: activeModel,
            retryAttempt: `${currentAttempt}/${maxAttempts}`,
            message: `Model not found. Falling back to ${config.fallbackModel}`
          });
          activeModel = config.fallbackModel || 'claude-3-5-haiku-20241022';
          continue;
        }

        // 401: Invalid API key -> DO NOT RETRY
        if (response.status === 401) {
          clearTimeout(timeoutId);
          decrementApiUsage();
          const errText = await response.text();
          writeToErrorLog({
            type: 'INVALID_API_KEY',
            status: 401,
            model: activeModel,
            message: 'Authentication error: invalid or expired x-api-key.',
            extra: { reason: errText.slice(0, 120) }
          });
          if (event && !event.sender.isDestroyed()) {
            event.sender.send('claude-stream-error', {
              streamId,
              error: 'INVALID_API_KEY',
              timeout: false,
              message: 'Invalid API key (401).',
              friendlyMessage: "It looks like the Anthropic API key is invalid or expired. You can update it anytime in Settings!"
            });
          }
          return;
        }

        // 429: Rate limit -> Exponential backoff with retry-after support
        if (response.status === 429) {
          const retryAfterHeader = response.headers.get('retry-after');
          let backoffMs = RETRY_CONFIG.rateLimitBaseBackoffMs * Math.pow(2, currentAttempt - 1);
          if (retryAfterHeader) {
            const parsedSec = parseInt(retryAfterHeader, 10);
            if (!isNaN(parsedSec) && parsedSec > 0) {
              backoffMs = Math.min(parsedSec * 1000, RETRY_CONFIG.maxBackoffCapMs);
            }
          }

          writeToErrorLog({
            type: 'RATE_LIMIT',
            status: 429,
            model: activeModel,
            retryAttempt: `${currentAttempt}/${maxAttempts}`,
            message: `Rate limit hit (429). Retrying in ${backoffMs}ms.`,
            extra: { retryAfter: backoffMs }
          });

          if (currentAttempt < maxAttempts) {
            await sleep(backoffMs);
            continue;
          } else {
            clearTimeout(timeoutId);
            if (event && !event.sender.isDestroyed()) {
              event.sender.send('claude-stream-error', {
                streamId,
                error: 'RATE_LIMIT_EXCEEDED',
                timeout: false,
                message: 'Rate limit exceeded (429).',
                friendlyMessage: "Anthropic's servers are a bit overwhelmed with rate limits right now. Taking a quick breather!"
              });
            }
            return;
          }
        }

        // 5xx: Server overloaded or temporary internal error
        if (response.status >= 500) {
          const backoffMs = RETRY_CONFIG.serverErrorBaseBackoffMs * Math.pow(2, currentAttempt - 1);
          writeToErrorLog({
            type: `SERVER_ERROR_${response.status}`,
            status: response.status,
            model: activeModel,
            retryAttempt: `${currentAttempt}/${maxAttempts}`,
            message: `Server returned ${response.status}. Retrying in ${backoffMs}ms.`
          });

          if (currentAttempt < maxAttempts) {
            await sleep(backoffMs);
            continue;
          } else {
            clearTimeout(timeoutId);
            if (event && !event.sender.isDestroyed()) {
              event.sender.send('claude-stream-error', {
                streamId,
                error: `SERVER_ERROR_${response.status}`,
                timeout: false,
                message: `Server returned ${response.status}.`,
                friendlyMessage: "Anthropic's servers are temporarily taking a breather. Let's try again in just a moment!"
              });
            }
            return;
          }
        }

        // Other non-200 HTTP statuses
        if (!response.ok) {
          clearTimeout(timeoutId);
          const errText = await response.text();
          writeToErrorLog({
            type: `API_ERROR_${response.status}`,
            status: response.status,
            model: activeModel,
            message: `Claude API returned status ${response.status}.`,
            extra: { reason: errText.slice(0, 120) }
          });
          if (event && !event.sender.isDestroyed()) {
            event.sender.send('claude-stream-error', {
              streamId,
              error: `API_ERROR_${response.status}`,
              timeout: false,
              message: `API returned ${response.status}.`,
              friendlyMessage: "Something unexpected hiccuped with the AI response. Let's try again shortly!"
            });
          }
          return;
        }

        // HTTP 200 OK -> Break retry loop and process stream
        break;

      } catch (fetchErr) {
        if (fetchErr.name === 'AbortError') {
          return; // Handled by timeout watchdog
        }

        const backoffMs = RETRY_CONFIG.networkBaseBackoffMs * Math.pow(2, currentAttempt - 1);
        writeToErrorLog({
          type: 'NETWORK_ERROR',
          status: 'OFFLINE',
          model: activeModel,
          retryAttempt: `${currentAttempt}/${maxAttempts}`,
          message: `Network request error: ${fetchErr.message || fetchErr.cause?.code || 'offline'}. Retrying in ${backoffMs}ms.`,
          extra: { code: fetchErr.cause?.code || fetchErr.code || 'UNKNOWN' }
        });

        if (currentAttempt < maxAttempts) {
          await sleep(backoffMs);
          continue;
        } else {
          clearTimeout(timeoutId);
          decrementApiUsage();

          // Network offline drop -> automatically fallback to local Ollama model
          console.log('[API] Network offline drop detected. Automatically falling back to local Ollama model...');
          writeToErrorLog({
            type: 'NETWORK_FALLBACK_OLLAMA',
            status: 'OFFLINE',
            model: config.ollamaModel || 'llama3.2',
            message: `Internet dropped (${fetchErr.message}). Automatically falling back to local Ollama.`
          });

          return await callOllamaStreamAPI({
            isRandom,
            activeWindow,
            history,
            conversationExchanges,
            userTranscript,
            streamId,
            mood,
            isHelpMode,
            isClipboardAction
          }, event);
        }
      }
    }

    // Process SSE stream
    try {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let accumulatedText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop(); // Retain partial trailing line

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('data: ')) {
            const dataStr = trimmed.slice(6);
            if (dataStr === '[DONE]') continue;
            try {
              const parsed = JSON.parse(dataStr);
              if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
                if (!firstTokenReceived) {
                  firstTokenReceived = true;
                  clearTimeout(timeoutId);
                }
                const delta = parsed.delta.text;
                accumulatedText += delta;
                if (event && !event.sender.isDestroyed()) {
                  event.sender.send('claude-stream-delta', {
                    streamId,
                    delta,
                    accumulatedText
                  });
                }
              }
            } catch (_) {}
          }
        }
      }

      clearTimeout(timeoutId);
      if (event && !event.sender.isDestroyed()) {
        event.sender.send('claude-stream-end', {
          streamId,
          fullText: accumulatedText.trim()
        });
      }
    } catch (streamErr) {
      clearTimeout(timeoutId);
      if (streamErr.name === 'AbortError') return;
      writeToErrorLog({
        type: 'STREAM_ERROR',
        status: 'N/A',
        model: activeModel,
        message: `Stream processing error: ${streamErr.message}`
      });
      if (event && !event.sender.isDestroyed()) {
        event.sender.send('claude-stream-error', {
          streamId,
          error: 'STREAM_ERROR',
          timeout: false,
          message: streamErr.message,
          friendlyMessage: "Our connection was interrupted mid-thought. Let's try again in a moment!"
        });
      }
    }
  } catch (fatalErr) {
    console.error('[API] Fatal error boundary caught in callClaudeStreamAPI:', fatalErr.message);
    writeToErrorLog({
      type: 'FATAL_API_ERROR',
      status: 'N/A',
      message: `Fatal error in API handler: ${fatalErr.message}`
    });
    if (event && !event.sender.isDestroyed()) {
      event.sender.send('claude-stream-error', {
        streamId,
        error: 'FATAL_ERROR',
        timeout: false,
        message: fatalErr.message,
        friendlyMessage: "Something unexpected hiccuped with the AI response. Let's try again shortly!"
      });
    }
  }
}

module.exports = {
  sanitizeLogMessage,
  writeToErrorLog,
  buildSystemPrompt,
  buildUserPrompt,
  buildOllamaSystemPrompt,
  checkOllamaStatus,
  callOllamaStreamAPI,
  callGeminiStreamAPI,
  callClaudeStreamAPI
};
