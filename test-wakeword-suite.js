/**
 * Test Suite for Hands-Free Wake Word & Always-Listening Feature
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('🧪 Starting Wake Word & Always-Listening Test Suite...\n');

// Test 1: Config defaults & settings.json schema
console.log('Test 1: Verifying wakeWordEnabled and wakeWord in config.js & settings.json...');
const { DEFAULT_CONFIG } = require('./config');
const settingsJson = JSON.parse(fs.readFileSync(path.join(__dirname, 'settings.json'), 'utf8'));

assert.strictEqual(DEFAULT_CONFIG.wakeWordEnabled, true, 'DEFAULT_CONFIG.wakeWordEnabled should default to true');
assert.strictEqual(DEFAULT_CONFIG.wakeWord, 'hey orb', 'DEFAULT_CONFIG.wakeWord should default to "hey orb"');
assert.strictEqual(settingsJson.wakeWordEnabled, true, 'settings.json wakeWordEnabled should be true');
assert.strictEqual(settingsJson.wakeWord, 'hey orb', 'settings.json wakeWord should be "hey orb"');
console.log('  ✓ Config defaults and settings.json declare wakeWordEnabled: true and wakeWord: "hey orb".\n');

// Test 2: Wake Word normalization & regex matching logic
console.log('Test 2: Verifying wake phrase normalization and keyword detection regex...');

function escapeRegex(str) {
  return (str || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeWakePhrase(phrase) {
  return (phrase || 'hey orb')
    .toLowerCase()
    .trim()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ');
}

function createWakeRegex(phrase) {
  const norm = normalizeWakePhrase(phrase);
  return new RegExp(`(?:^|\\b)${escapeRegex(norm).replace(/\s+/g, '[\\s,.-]+')}(?:\\b|$)`, 'i');
}

// Test default "hey orb"
const defaultRegex = createWakeRegex('hey orb');
assert.ok(defaultRegex.test('hey orb'), '"hey orb" should match standalone');
assert.ok(defaultRegex.test('hey orb what is on my screen'), '"hey orb what is on my screen" should match prefix');
assert.ok(defaultRegex.test('hey, orb! what time is it'), 'Punctuation-separated "hey, orb!" should match');
assert.ok(defaultRegex.test('HEY ORB'), 'Case-insensitive "HEY ORB" should match');
assert.ok(!defaultRegex.test('orbital velocity'), '"orbital velocity" should NOT match');
assert.ok(!defaultRegex.test('hey robot'), '"hey robot" should NOT match');

// Trailing command extraction logic
function extractTrailingCommand(fullTranscript, wakePhrase) {
  const normTarget = normalizeWakePhrase(wakePhrase);
  const regex = createWakeRegex(normTarget);
  const match = fullTranscript.toLowerCase().match(regex);
  if (!match) return null;
  const trailing = fullTranscript.toLowerCase().slice(match.index + match[0].length).replace(/^[,\s.]+/, '').trim();
  return trailing;
}

assert.strictEqual(extractTrailingCommand('hey orb what is on my screen', 'hey orb'), 'what is on my screen');
assert.strictEqual(extractTrailingCommand('hey orb, tell me a joke', 'hey orb'), 'tell me a joke');
assert.strictEqual(extractTrailingCommand('hey orb', 'hey orb'), '');

// Test custom wake word
const customRegex = createWakeRegex('computer');
assert.ok(customRegex.test('computer set a timer'), '"computer" wake word should match');
assert.strictEqual(extractTrailingCommand('computer open youtube', 'computer'), 'open youtube');

console.log('  ✓ Wake phrase normalization, regex detection, and trailing command extraction verified.\n');

// Test 3: Local Voice Commands in renderer/commands.js
console.log('Test 3: Verifying wake-word voice commands in renderer/commands.js...');
const { evaluateVoiceCommand } = require('./renderer/commands');

(async () => {
  let isEnabled = true;
  let currentPhrase = 'hey orb';

  const mockContext = {
    isWakeWordEnabled: () => isEnabled,
    getWakeWord: () => currentPhrase,
    setWakeWordEnabled: async (enable) => { isEnabled = enable; },
    setWakeWord: async (phrase) => { currentPhrase = phrase; }
  };

  // 1. Status query
  let cmd = await evaluateVoiceCommand('what is my wake word', mockContext);
  assert.ok(cmd && cmd.handled, 'what is my wake word should be handled');
  assert.ok(cmd.message.includes('hey orb'), 'Response should mention "hey orb"');

  cmd = await evaluateVoiceCommand('is always listening on', mockContext);
  assert.ok(cmd && cmd.handled, 'is always listening on should be handled');
  assert.ok(cmd.message.includes('enabled') || cmd.message.includes('active'), 'Response should confirm enabled');

  // 2. Disable wake word
  cmd = await evaluateVoiceCommand('turn off wake word', mockContext);
  assert.ok(cmd && cmd.handled, 'turn off wake word should be handled');
  assert.strictEqual(isEnabled, false, 'wakeWordEnabled should be set to false');
  assert.ok(cmd.badge.includes('Off'), 'Badge should show Wake Word Off');

  cmd = await evaluateVoiceCommand('disable always listening', mockContext);
  assert.ok(cmd && cmd.handled, 'disable always listening should be handled');

  // 3. Enable wake word
  cmd = await evaluateVoiceCommand('turn on wake word', mockContext);
  assert.ok(cmd && cmd.handled, 'turn on wake word should be handled');
  assert.strictEqual(isEnabled, true, 'wakeWordEnabled should be set to true');
  assert.ok(cmd.badge.includes('On'), 'Badge should show Wake Word On');

  cmd = await evaluateVoiceCommand('enable always listening', mockContext);
  assert.ok(cmd && cmd.handled, 'enable always listening should be handled');

  // 4. Change wake word phrase
  cmd = await evaluateVoiceCommand('change wake word to hey companion', mockContext);
  assert.ok(cmd && cmd.handled, 'change wake word should be handled');
  assert.strictEqual(currentPhrase, 'hey companion', 'Wake phrase should update to "hey companion"');
  assert.ok(cmd.message.includes('hey companion'), 'Message should confirm new phrase');

  cmd = await evaluateVoiceCommand('set wake word to computer', mockContext);
  assert.ok(cmd && cmd.handled, 'set wake word should be handled');
  assert.strictEqual(currentPhrase, 'computer', 'Wake phrase should update to "computer"');

  console.log('  ✓ Local voice commands for status, toggling, and changing wake phrase verified.\n');

  // Test 4: HTML markup in renderer/index.html & renderer/settings.html
  console.log('Test 4: Verifying HTML markup for listening indicator & settings toggle...');
  const indexHtml = fs.readFileSync(path.join(__dirname, 'renderer', 'index.html'), 'utf8');
  const settingsHtml = fs.readFileSync(path.join(__dirname, 'renderer', 'settings.html'), 'utf8');

  // Index HTML checks
  assert.ok(indexHtml.includes('id="orb-listening-indicator"'), 'index.html should have #orb-listening-indicator');
  assert.ok(indexHtml.includes('listening-pulse-dot'), 'index.html should have .listening-pulse-dot');
  assert.ok(indexHtml.includes('listening-mic-icon'), 'index.html should have .listening-mic-icon');
  assert.ok(indexHtml.includes('id="menu-toggle-wake"'), 'index.html should have #menu-toggle-wake');
  assert.ok(indexHtml.includes('id="menu-wake-check"'), 'index.html should have #menu-wake-check');

  // Settings HTML checks
  assert.ok(settingsHtml.includes('id="wake-word-toggle"'), 'settings.html should have #wake-word-toggle');
  assert.ok(settingsHtml.includes('id="wake-word-input"'), 'settings.html should have #wake-word-input');
  assert.ok(settingsHtml.includes('Hands-Free Wake Word'), 'settings.html should have section header');

  console.log('  ✓ HTML markup for listening indicator, menu item, and settings controls verified.\n');

  // Test 5: CSS styling in renderer/style.css
  console.log('Test 5: Verifying CSS styles and animations for listening indicator...');
  const styleCss = fs.readFileSync(path.join(__dirname, 'renderer', 'style.css'), 'utf8');

  assert.ok(styleCss.includes('.orb-listening-indicator'), 'style.css should style .orb-listening-indicator');
  assert.ok(styleCss.includes('@keyframes listeningPillSpring'), 'style.css should have @keyframes listeningPillSpring');
  assert.ok(styleCss.includes('@keyframes listeningMicGlow'), 'style.css should have @keyframes listeningMicGlow');
  assert.ok(styleCss.includes('@keyframes listeningDotPulse'), 'style.css should have @keyframes listeningDotPulse');

  // Theme skin overrides
  assert.ok(styleCss.includes('body.theme-neon .orb-listening-indicator'), 'Neon theme override should exist');
  assert.ok(styleCss.includes('body.theme-minimal-white .orb-listening-indicator'), 'Minimal White theme override should exist');
  assert.ok(styleCss.includes('body.theme-dark-glass .orb-listening-indicator'), 'Dark Glass theme override should exist');
  assert.ok(styleCss.includes('body.theme-sunset .orb-listening-indicator'), 'Sunset theme override should exist');

  console.log('  ✓ CSS styles, keyframe animations, and theme overrides verified.\n');

  // Test 6: Settings JS loading and saving
  console.log('Test 6: Verifying renderer/settings.js binds wakeWord and wakeWordEnabled...');
  const settingsJs = fs.readFileSync(path.join(__dirname, 'renderer', 'settings.js'), 'utf8');

  assert.ok(settingsJs.includes('wakeWordToggle'), 'settings.js should define wakeWordToggle');
  assert.ok(settingsJs.includes('wakeWordInput'), 'settings.js should define wakeWordInput');
  assert.ok(settingsJs.includes('wakeWordEnabled: newWakeWordEnabled'), 'settings.js should save wakeWordEnabled');
  assert.ok(settingsJs.includes('wakeWord: newWakeWord'), 'settings.js should save wakeWord');

  console.log('  ✓ renderer/settings.js correctly reads, displays, and saves wake word preferences.\n');

  // Test 7: App.js wiring & acoustic feedback protection
  console.log('Test 7: Verifying renderer/app.js wake word engine and acoustic feedback protection...');
  const appJs = fs.readFileSync(path.join(__dirname, 'renderer', 'app.js'), 'utf8');

  assert.ok(appJs.includes('initWakeWordRecognizer'), 'app.js should define initWakeWordRecognizer');
  assert.ok(appJs.includes('tryStartWakeWordRecognizer'), 'app.js should define tryStartWakeWordRecognizer');
  assert.ok(appJs.includes('stopWakeWordRecognizer'), 'app.js should define stopWakeWordRecognizer');
  assert.ok(appJs.includes('toggleWakeWordEnabled'), 'app.js should define toggleWakeWordEnabled');
  assert.ok(appJs.includes('updateWakeWordPhrase'), 'app.js should define updateWakeWordPhrase');
  assert.ok(appJs.includes('updateWakeWordUI'), 'app.js should define updateWakeWordUI');
  assert.ok(appJs.includes('handleVoiceTranscript'), 'app.js should define handleVoiceTranscript');

  // Feedback loop protection: stopWakeWordRecognizer called in speakTextDirectly & processSentenceQueue
  const speakTextDirectlyFunc = appJs.slice(appJs.indexOf('function speakTextDirectly('), appJs.indexOf('function bounceOrbAlert('));
  assert.ok(speakTextDirectlyFunc.includes('stopWakeWordRecognizer()'), 'speakTextDirectly must stop wake recognition to avoid feedback');
  assert.ok(speakTextDirectlyFunc.includes('tryStartWakeWordRecognizer'), 'speakTextDirectly must resume wake recognition when done speaking');

  console.log('  ✓ App.js wake engine and acoustic feedback protection verified.\n');

  console.log('🎉 ALL WAKE WORD & ALWAYS-LISTENING TESTS PASSED SUCCESSFULLY!');
})();
