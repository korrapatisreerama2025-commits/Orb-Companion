/**
 * Desktop AI Companion - Offline & Local-Only Mode Test Suite (test-offline-suite.js)
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

async function runTestSuite() {
  console.log('🧪 Starting Offline & Local-Only Mode Test Suite...\n');

  // ==========================================================
  // TEST 1: Config Defaults & Settings File Schema
  // ==========================================================
  console.log('Test 1: Verifying offline & local-only config defaults and schema...');
  const { DEFAULT_CONFIG } = require('./config');
  const { loadConfig, saveConfig } = require('./settings');

  assert.strictEqual(DEFAULT_CONFIG.localOnly, false, 'DEFAULT_CONFIG must default localOnly to false');
  assert.strictEqual(DEFAULT_CONFIG.ollamaHost, 'http://127.0.0.1:11434', 'DEFAULT_CONFIG must default ollamaHost to http://127.0.0.1:11434');
  assert.strictEqual(DEFAULT_CONFIG.ollamaModel, 'llama3.2', 'DEFAULT_CONFIG must default ollamaModel to llama3.2');

  const loaded = loadConfig();
  assert.ok('localOnly' in loaded, 'Loaded config should have localOnly');
  assert.ok('ollamaHost' in loaded, 'Loaded config should have ollamaHost');
  assert.ok('ollamaModel' in loaded, 'Loaded config should have ollamaModel');

  const settingsRaw = JSON.parse(fs.readFileSync(path.join(__dirname, 'settings.json'), 'utf-8'));
  assert.strictEqual(typeof settingsRaw.localOnly, 'boolean', 'settings.json must declare localOnly boolean');
  assert.strictEqual(typeof settingsRaw.ollamaHost, 'string', 'settings.json must declare ollamaHost string');
  assert.strictEqual(typeof settingsRaw.ollamaModel, 'string', 'settings.json must declare ollamaModel string');

  console.log('  ✓ Config defaults and settings.json declare localOnly, ollamaHost, and ollamaModel.');

  // ==========================================================
  // TEST 2: Screen Capture Suppression in Local-Only Mode
  // ==========================================================
  console.log('\nTest 2: Verifying screenshot capture is completely suppressed in local-only mode...');
  const { captureScreenWithHash } = require('./capture');

  const captureRes = await captureScreenWithHash({ localOnly: true, screenshotsEnabled: true });
  assert.strictEqual(captureRes.imageBase64, null, 'imageBase64 must be null when in local-only mode');
  assert.strictEqual(captureRes.screenshotsDisabled, true, 'screenshotsDisabled must be true in local-only mode');
  assert.strictEqual(captureRes.localOnly, true, 'localOnly flag must be reflected in capture result');

  console.log('  ✓ Screen capture returns imageBase64: null and screenshotsDisabled: true in local-only mode.');

  // ==========================================================
  // TEST 3: buildOllamaSystemPrompt Optimization
  // ==========================================================
  console.log('\nTest 3: Verifying buildOllamaSystemPrompt formatting for local models...');
  const { buildOllamaSystemPrompt } = require('./api');

  assert.strictEqual(typeof buildOllamaSystemPrompt, 'function', 'buildOllamaSystemPrompt must be exported');

  // Friendly prompt
  const friendlyPrompt = buildOllamaSystemPrompt({
    personality: 'friendly',
    memory: { userName: 'Korra' },
    activeWindow: { owner: 'VS Code', title: 'main.js' }
  });
  assert.ok(friendlyPrompt.includes('friendly'), 'Prompt should reflect friendly personality');
  assert.ok(friendlyPrompt.includes('Korra'), 'Prompt should embed user name');
  assert.ok(friendlyPrompt.includes('VS Code'), 'Prompt should embed active window app');
  assert.ok(friendlyPrompt.includes('No emojis'), 'Prompt should instruct no emojis');

  // Sarcastic prompt
  const sarcasticPrompt = buildOllamaSystemPrompt({ personality: 'sarcastic' });
  assert.ok(sarcasticPrompt.includes('sarcastic'), 'Prompt should reflect sarcastic personality');

  // Help mode prompt
  const helpPrompt = buildOllamaSystemPrompt({
    isHelpMode: true,
    activeWindow: { owner: 'Terminal', title: 'PowerShell' }
  });
  assert.ok(helpPrompt.includes('practical developer'), 'Help mode prompt should instruct practical assistance');
  assert.ok(helpPrompt.includes('Terminal'), 'Help mode prompt should embed active window');

  // Clipboard action prompt
  const clipboardPrompt = buildOllamaSystemPrompt({ isClipboardAction: true });
  assert.ok(clipboardPrompt.includes('practical coding and desktop assistant'), 'Clipboard action prompt should be concise & practical');

  console.log('  ✓ buildOllamaSystemPrompt creates concise, optimized system instructions for local models.');

  // ==========================================================
  // TEST 4: checkOllamaStatus Logic
  // ==========================================================
  console.log('\nTest 4: Verifying checkOllamaStatus error boundary...');
  const { checkOllamaStatus } = require('./api');

  assert.strictEqual(typeof checkOllamaStatus, 'function', 'checkOllamaStatus must be exported');

  // Testing unreachable host should return ok: false without crashing
  const statusRes = await checkOllamaStatus('http://127.0.0.1:59999');
  assert.strictEqual(statusRes.ok, false, 'Unreachable host should report ok: false');
  assert.ok(statusRes.error, 'Should provide error string');
  assert.ok(Array.isArray(statusRes.models), 'models should be an array');

  console.log('  ✓ checkOllamaStatus handles unreachable host gracefully without throwing.');

  // ==========================================================
  // TEST 5: Voice Commands for Offline & Local-Only Mode
  // ==========================================================
  console.log('\nTest 5: Verifying Voice Commands for local mode, cloud mode, and status queries...');
  const CompanionVoiceCommands = require('./renderer/commands');

  let localState = false;
  let onlineState = true;

  const mockContext = {
    isLocalOnly: () => localState,
    isOnline: () => onlineState,
    setLocalOnly: (val) => { localState = val; return true; }
  };

  // Status query in cloud mode
  const statusRes1 = await CompanionVoiceCommands.evaluateVoiceCommand("what mode are you in?", mockContext);
  assert.strictEqual(statusRes1.handled, true);
  assert.strictEqual(statusRes1.isModeStatus, true);
  assert.ok(statusRes1.message.includes('Cloud mode'));

  // Switch to local mode
  const localRes1 = await CompanionVoiceCommands.evaluateVoiceCommand("local mode", mockContext);
  assert.strictEqual(localRes1.handled, true);
  assert.strictEqual(localRes1.isLocalToggle, true);
  assert.strictEqual(localRes1.enabled, true);
  assert.strictEqual(localState, true);
  assert.ok(localRes1.message.includes('Local only mode enabled'));

  // Status query in local mode
  const statusRes2 = await CompanionVoiceCommands.evaluateVoiceCommand("are you local?", mockContext);
  assert.strictEqual(statusRes2.handled, true);
  assert.ok(statusRes2.message.includes('Local Only mode'));

  // Switch to cloud mode
  const cloudRes1 = await CompanionVoiceCommands.evaluateVoiceCommand("switch to cloud mode", mockContext);
  assert.strictEqual(cloudRes1.handled, true);
  assert.strictEqual(cloudRes1.isLocalToggle, true);
  assert.strictEqual(cloudRes1.enabled, false);
  assert.strictEqual(localState, false);
  assert.ok(cloudRes1.message.includes('Cloud mode enabled'));

  // Additional variants
  const localRes2 = await CompanionVoiceCommands.evaluateVoiceCommand("go offline", mockContext);
  assert.strictEqual(localRes2.handled, true);
  assert.strictEqual(localRes2.enabled, true);

  const cloudRes2 = await CompanionVoiceCommands.evaluateVoiceCommand("online mode", mockContext);
  assert.strictEqual(cloudRes2.handled, true);
  assert.strictEqual(cloudRes2.enabled, false);

  const localRes3 = await CompanionVoiceCommands.evaluateVoiceCommand("toggle local only", mockContext);
  assert.strictEqual(localRes3.handled, true);

  console.log('  ✓ Voice commands properly route local mode, cloud mode, and network status queries.');

  // ==========================================================
  // TEST 6: HTML & CSS UI Elements Verification
  // ==========================================================
  console.log('\nTest 6: Verifying HTML, CSS, and Preload IPC bridges for mode indicator & settings...');
  const indexHtml = fs.readFileSync(path.join(__dirname, 'renderer', 'index.html'), 'utf-8');
  assert.ok(indexHtml.includes('id="network-mode-badge"'), 'index.html must have #network-mode-badge');
  assert.ok(indexHtml.includes('id="network-mode-icon"'), 'index.html must have #network-mode-icon');
  assert.ok(indexHtml.includes('id="network-mode-label"'), 'index.html must have #network-mode-label');
  assert.ok(indexHtml.includes('id="menu-toggle-local"'), 'index.html context menu must have #menu-toggle-local');

  const settingsHtml = fs.readFileSync(path.join(__dirname, 'renderer', 'settings.html'), 'utf-8');
  assert.ok(settingsHtml.includes('id="local-only-toggle"'), 'settings.html must have #local-only-toggle');
  assert.ok(settingsHtml.includes('id="ollama-host-input"'), 'settings.html must have #ollama-host-input');
  assert.ok(settingsHtml.includes('id="ollama-model-input"'), 'settings.html must have #ollama-model-input');
  assert.ok(settingsHtml.includes('id="test-ollama-btn"'), 'settings.html must have #test-ollama-btn');

  const styleCss = fs.readFileSync(path.join(__dirname, 'renderer', 'style.css'), 'utf-8');
  assert.ok(styleCss.includes('.network-mode-badge'), 'style.css must style .network-mode-badge');
  assert.ok(styleCss.includes('.network-mode-badge.local'), 'style.css must style .network-mode-badge.local');
  assert.ok(styleCss.includes('.network-mode-badge.offline'), 'style.css must style .network-mode-badge.offline');
  assert.ok(styleCss.includes('.speech-bubble.local-mode-reply'), 'style.css must style .local-mode-reply');

  const preloadJs = fs.readFileSync(path.join(__dirname, 'preload.js'), 'utf-8');
  assert.ok(preloadJs.includes("testOllamaConnection:"), 'preload.js must expose testOllamaConnection');
  assert.ok(preloadJs.includes("setLocalOnly:"), 'preload.js must expose setLocalOnly');

  const settingsJs = fs.readFileSync(path.join(__dirname, 'renderer', 'settings.js'), 'utf-8');
  assert.ok(settingsJs.includes('localOnlyToggle'), 'settings.js must reference localOnlyToggle');
  assert.ok(settingsJs.includes('localOnly: newLocalOnly'), 'settings.js must save localOnly');
  assert.ok(settingsJs.includes('ollamaHost: newOllamaHost'), 'settings.js must save ollamaHost');
  assert.ok(settingsJs.includes('ollamaModel: newOllamaModel'), 'settings.js must save ollamaModel');

  console.log('  ✓ HTML markup, CSS styling, and IPC bridge functions fully verified.');

  console.log('\n🎉 ALL OFFLINE & LOCAL-ONLY MODE TESTS PASSED SUCCESSFULLY!\n');
}

runTestSuite().catch(err => {
  console.error('\n❌ Offline & Local-Only Mode Test Suite failed:', err);
  process.exit(1);
});
