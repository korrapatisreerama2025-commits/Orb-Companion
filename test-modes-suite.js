/**
 * Comprehensive Unit & Integration Test Suite for Smart Screen Modes
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const {
  SCREEN_MODES,
  SCREEN_MODE_PROMPTS,
  SCREEN_MODE_USER_HINTS,
  SCREEN_MODE_BADGES,
  detectScreenContext,
  resolveEffectiveScreenMode
} = require('./modes');
const { buildSystemPrompt, buildUserPrompt, buildOllamaSystemPrompt } = require('./api');
const CompanionVoiceCommands = require('./renderer/commands');

console.log('====================================================');
console.log('SMART SCREEN MODES VERIFICATION TEST SUITE');
console.log('====================================================\n');

let passedTests = 0;
let totalTests = 0;

async function test(name, fn) {
  totalTests++;
  try {
    await fn();
    console.log(`[PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`[FAIL] ${name}:`, err.message);
  }
}

async function runAllTests() {
  // ----------------------------------------------------
  // 1. CONTEXT DETECTION HEURISTICS
  // ----------------------------------------------------
  console.log('--- 1. Context Detection from Active Windows ---');

  // A. Coding Mode
  await test('Detects coding mode from IDE process names', () => {
    assert.strictEqual(detectScreenContext({ owner: 'Code.exe', title: 'welcome' }), SCREEN_MODES.CODING);
    assert.strictEqual(detectScreenContext({ owner: 'cursor', title: 'project' }), SCREEN_MODES.CODING);
    assert.strictEqual(detectScreenContext({ owner: 'idea64.exe', title: 'Main.java' }), SCREEN_MODES.CODING);
    assert.strictEqual(detectScreenContext({ owner: 'WindowsTerminal.exe', title: 'PowerShell' }), SCREEN_MODES.CODING);
  });

  await test('Detects coding mode from file extensions in window title', () => {
    assert.strictEqual(detectScreenContext({ owner: 'notepad', title: 'server.js - Notepad' }), SCREEN_MODES.CODING);
    assert.strictEqual(detectScreenContext({ owner: 'sublime_text', title: 'main.py' }), SCREEN_MODES.CODING);
    assert.strictEqual(detectScreenContext({ owner: 'Code', title: 'engine.rs' }), SCREEN_MODES.CODING);
  });

  await test('Detects coding mode from developer websites in browser', () => {
    assert.strictEqual(detectScreenContext({ owner: 'chrome.exe', title: 'How to fix TypeError - Stack Overflow' }), SCREEN_MODES.CODING);
    assert.strictEqual(detectScreenContext({ owner: 'msedge.exe', title: 'Pull Request #42 · user/companion · GitHub' }), SCREEN_MODES.CODING);
    assert.strictEqual(detectScreenContext({ owner: 'firefox', title: 'Two Sum - LeetCode' }), SCREEN_MODES.CODING);
  });

  // B. Writing Mode
  await test('Detects writing mode from word processors and note apps', () => {
    assert.strictEqual(detectScreenContext({ owner: 'WINWORD.EXE', title: 'Document1 - Word' }), SCREEN_MODES.WRITING);
    assert.strictEqual(detectScreenContext({ owner: 'Notion.exe', title: 'Product Spec' }), SCREEN_MODES.WRITING);
    assert.strictEqual(detectScreenContext({ owner: 'Obsidian', title: 'Chapter 2 Notes' }), SCREEN_MODES.WRITING);
    assert.strictEqual(detectScreenContext({ owner: 'Typora.exe', title: 'article.md' }), SCREEN_MODES.WRITING);
  });

  await test('Detects writing mode from online document editors', () => {
    assert.strictEqual(detectScreenContext({ owner: 'chrome.exe', title: 'Project Proposal - Google Docs' }), SCREEN_MODES.WRITING);
    assert.strictEqual(detectScreenContext({ owner: 'brave.exe', title: 'Drafting: The Future of AI - Medium - Write' }), SCREEN_MODES.WRITING);
  });

  // C. Video Mode
  await test('Detects video mode from media players', () => {
    assert.strictEqual(detectScreenContext({ owner: 'vlc.exe', title: 'Inception.2010.mkv' }), SCREEN_MODES.VIDEO);
    assert.strictEqual(detectScreenContext({ owner: 'mpv.exe', title: 'video.mp4' }), SCREEN_MODES.VIDEO);
  });

  await test('Detects video mode from streaming websites in browser', () => {
    assert.strictEqual(detectScreenContext({ owner: 'chrome.exe', title: 'Lofi Hip Hop Radio - YouTube' }), SCREEN_MODES.VIDEO);
    assert.strictEqual(detectScreenContext({ owner: 'firefox.exe', title: 'Stranger Things | Netflix' }), SCREEN_MODES.VIDEO);
    assert.strictEqual(detectScreenContext({ owner: 'msedge.exe', title: 'Gaming Stream - Twitch' }), SCREEN_MODES.VIDEO);
  });

  // D. Reading Mode
  await test('Detects reading mode from PDF and documentation viewers', () => {
    assert.strictEqual(detectScreenContext({ owner: 'AcroRd32.exe', title: 'Research_Paper.pdf' }), SCREEN_MODES.READING);
    assert.strictEqual(detectScreenContext({ owner: 'SumatraPDF.exe', title: 'clean_code.pdf' }), SCREEN_MODES.READING);
    assert.strictEqual(detectScreenContext({ owner: 'chrome.exe', title: 'Quantum mechanics - Wikipedia' }), SCREEN_MODES.READING);
    assert.strictEqual(detectScreenContext({ owner: 'firefox.exe', title: 'Array.prototype.map() - MDN Web Docs' }), SCREEN_MODES.READING);
    assert.strictEqual(detectScreenContext({ owner: 'msedge.exe', title: '[2301.00001] Attention Is All You Need - arXiv' }), SCREEN_MODES.READING);
  });

  // E. Design Mode
  await test('Detects design mode from design and 3D modeling tools', () => {
    assert.strictEqual(detectScreenContext({ owner: 'Figma.exe', title: 'Mobile App Wireframes' }), SCREEN_MODES.DESIGN);
    assert.strictEqual(detectScreenContext({ owner: 'chrome.exe', title: 'Dashboard UI Kit - Figma' }), SCREEN_MODES.DESIGN);
    assert.strictEqual(detectScreenContext({ owner: 'Photoshop.exe', title: 'poster_v1.psd' }), SCREEN_MODES.DESIGN);
    assert.strictEqual(detectScreenContext({ owner: 'blender.exe', title: 'character_rig.blend' }), SCREEN_MODES.DESIGN);
    assert.strictEqual(detectScreenContext({ owner: 'chrome.exe', title: 'Instagram Post Template - Canva' }), SCREEN_MODES.DESIGN);
  });

  // F. Browsing Mode & Fallback
  await test('Detects browsing mode for general web exploration in browsers', () => {
    assert.strictEqual(detectScreenContext({ owner: 'chrome.exe', title: 'Amazon.com: Online Shopping' }), SCREEN_MODES.BROWSING);
    assert.strictEqual(detectScreenContext({ owner: 'msedge.exe', title: 'Reddit: Dive into anything' }), SCREEN_MODES.BROWSING);
  });

  await test('Returns default mode for unknown or empty active window', () => {
    assert.strictEqual(detectScreenContext(null), SCREEN_MODES.DEFAULT);
    assert.strictEqual(detectScreenContext({ owner: '', title: '' }), SCREEN_MODES.DEFAULT);
  });

  // ----------------------------------------------------
  // 2. EFFECTIVE MODE RESOLUTION & MANUAL OVERRIDES
  // ----------------------------------------------------
  console.log('\n--- 2. Effective Mode Resolution & Overrides ---');

  await test('Resolves auto-detected mode when currentScreenMode is auto', () => {
    const config = { smartScreenModes: true, currentScreenMode: 'auto' };
    const win = { owner: 'Code.exe', title: 'main.js' };
    assert.strictEqual(resolveEffectiveScreenMode(config, win), SCREEN_MODES.CODING);
  });

  await test('Enforces manual mode override over window detection', () => {
    const config = { smartScreenModes: true, currentScreenMode: 'writing' };
    const win = { owner: 'Code.exe', title: 'main.js' };
    assert.strictEqual(resolveEffectiveScreenMode(config, win), SCREEN_MODES.WRITING);
  });

  await test('Returns default mode when smartScreenModes is disabled', () => {
    const config = { smartScreenModes: false, currentScreenMode: 'coding' };
    const win = { owner: 'Code.exe', title: 'main.js' };
    assert.strictEqual(resolveEffectiveScreenMode(config, win), SCREEN_MODES.DEFAULT);
  });

  // ----------------------------------------------------
  // 3. PROMPT SPECIALIZATION PER MODE
  // ----------------------------------------------------
  console.log('\n--- 3. Prompt Specialization per Mode ---');

  await test('Coding prompt notices bugs, missing semicolons, or unhandled errors', () => {
    const prompt = SCREEN_MODE_PROMPTS.coding;
    assert.match(prompt, /CODING\s+mode/i);
    assert.match(prompt, /bugs/i);
    assert.match(prompt, /missing\s+semicolons/i);
    assert.match(prompt, /unhandled\s+errors/i);
  });

  await test('Writing prompt offers light style feedback', () => {
    const prompt = SCREEN_MODE_PROMPTS.writing;
    assert.match(prompt, /WRITING\s+mode/i);
    assert.match(prompt, /style\s+feedback/i);
    assert.match(prompt, /flow/i);
  });

  await test('Video prompt instructs to stay mostly quiet', () => {
    const prompt = SCREEN_MODE_PROMPTS.video;
    assert.match(prompt, /VIDEO\s+mode/i);
    assert.match(prompt, /mostly\s+quiet/i);
  });

  await test('buildSystemPrompt injects mode overlay when screenMode is provided', () => {
    const sysPrompt = buildSystemPrompt({
      personality: 'friendly',
      isHelpMode: false,
      isClipboardAction: false,
      isNextStepMode: false,
      screenMode: 'coding',
      smartScreenModes: true
    });
    assert.match(sysPrompt, /SMART\s+SCREEN\s+MODE\s+-\s+CODING/i);
    assert.match(sysPrompt, /missing\s+semicolons/i);
  });

  await test('buildUserPrompt provides specialized directive for coding mode', () => {
    const userPrompt = buildUserPrompt({
      isHelpMode: false,
      isNextStepMode: false,
      userTranscript: '',
      isBlocked: false,
      screenshotsEnabled: true,
      screenMode: 'coding',
      smartScreenModes: true
    });
    assert.match(userPrompt, /notice\s+any\s+bugs/i);
    assert.match(userPrompt, /missing\s+semicolons/i);
  });

  await test('buildOllamaSystemPrompt injects mode directives for local models', () => {
    const ollamaCoding = buildOllamaSystemPrompt({
      personality: 'friendly',
      screenMode: 'coding',
      smartScreenModes: true
    });
    assert.match(ollamaCoding, /CODING\s+mode/i);
    assert.match(ollamaCoding, /missing\s+semicolons/i);

    const ollamaWriting = buildOllamaSystemPrompt({
      personality: 'friendly',
      screenMode: 'writing',
      smartScreenModes: true
    });
    assert.match(ollamaWriting, /WRITING\s+mode/i);
    assert.match(ollamaWriting, /style\s+feedback/i);

    const ollamaVideo = buildOllamaSystemPrompt({
      personality: 'friendly',
      screenMode: 'video',
      smartScreenModes: true
    });
    assert.match(ollamaVideo, /VIDEO\s+mode/i);
    assert.match(ollamaVideo, /mostly\s+quiet/i);
  });

  // ----------------------------------------------------
  // 4. VOICE COMMANDS FOR SMART SCREEN MODES
  // ----------------------------------------------------
  console.log('\n--- 4. Voice Commands for Smart Screen Modes ---');

  await test('Voice command: "what screen mode is this?" queries active mode', async () => {
    const mockContext = {
      getScreenModeInfo: () => ({ mode: 'coding', label: 'Coding Mode', description: 'Noticing bugs, missing semicolons, and errors' })
    };
    const res = await CompanionVoiceCommands.evaluateVoiceCommand('what screen mode is this', mockContext);
    assert.strictEqual(res.handled, true);
    assert.match(res.message, /Coding Mode is active/i);
    assert.match(res.speak, /Coding Mode/i);
  });

  await test('Voice command: "switch mode to writing" switches mode', async () => {
    let switchedMode = null;
    const mockContext = {
      setScreenMode: (m) => { switchedMode = m; }
    };
    const res = await CompanionVoiceCommands.evaluateVoiceCommand('switch mode to writing', mockContext);
    assert.strictEqual(res.handled, true);
    assert.strictEqual(switchedMode, 'writing');
    assert.match(res.message, /Switched screen mode to Writing Mode/i);
  });

  await test('Voice command: "disable smart screen modes" toggles feature', async () => {
    let enabledState = null;
    const mockContext = {
      setSmartScreenModes: (en) => { enabledState = en; }
    };
    const res = await CompanionVoiceCommands.evaluateVoiceCommand('disable smart screen modes', mockContext);
    assert.strictEqual(res.handled, true);
    assert.strictEqual(enabledState, false);
    assert.match(res.speak, /disabled/i);
  });

  // ----------------------------------------------------
  // 5. UI, HTML, AND CSS MARKUP VERIFICATION
  // ----------------------------------------------------
  console.log('\n--- 5. HTML, CSS, and UI Verification ---');

  await test('Context menu includes #menu-screen-mode in renderer/index.html', () => {
    const html = fs.readFileSync(path.join(__dirname, 'renderer', 'index.html'), 'utf-8');
    assert.ok(html.includes('id="menu-screen-mode"'), 'Must have #menu-screen-mode');
    assert.ok(html.includes('id="menu-screen-mode-text"'), 'Must have #menu-screen-mode-text');
  });

  await test('Settings window includes Smart Screen Modes section in renderer/settings.html', () => {
    const html = fs.readFileSync(path.join(__dirname, 'renderer', 'settings.html'), 'utf-8');
    assert.ok(html.includes('id="smart-screen-modes-toggle"'), 'Must have #smart-screen-modes-toggle');
    assert.ok(html.includes('id="screen-mode-select"'), 'Must have #screen-mode-select');
    assert.ok(html.includes('id="screen-mode-badge"'), 'Must have #screen-mode-badge');
  });

  await test('CSS includes styles for all smart screen mode bubbles in renderer/style.css', () => {
    const css = fs.readFileSync(path.join(__dirname, 'renderer', 'style.css'), 'utf-8');
    assert.ok(css.includes('.speech-bubble.mode-coding'), 'Must style .mode-coding');
    assert.ok(css.includes('.speech-bubble.mode-writing'), 'Must style .mode-writing');
    assert.ok(css.includes('.speech-bubble.mode-video'), 'Must style .mode-video');
    assert.ok(css.includes('.speech-bubble.mode-reading'), 'Must style .mode-reading');
    assert.ok(css.includes('.speech-bubble.mode-design'), 'Must style .mode-design');
    assert.ok(css.includes('.speech-bubble.mode-browsing'), 'Must style .mode-browsing');
  });

  console.log('\n====================================================');
  console.log(`TEST SUITE RESULTS: ${passedTests}/${totalTests} PASSED`);
  console.log('====================================================');

  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

runAllTests().catch((err) => {
  console.error('Unhandled test suite error:', err);
  process.exit(1);
});
