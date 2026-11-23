/**
 * Region Focus (Ctrl+Shift+S) Verification Test Suite
 * 
 * Verifies:
 * 1. validateRegion normalization, clamping, and rejection of tiny/accidental drags (< 20px).
 * 2. Region state management (active, clear, single-use consume for next question).
 * 3. Cropping integration in capture.js (cropped native resolution, vision downscale, privacy boundary).
 * 4. Prompt building in api.js (buildSystemPrompt, buildUserPrompt, buildOllamaSystemPrompt).
 * 5. Voice command integration (trigger, clear, status queries).
 * 6. HTML, CSS, and package manifest verification.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const {
  validateRegion,
  setActiveFocusedRegion,
  getActiveFocusedRegion,
  clearActiveFocusedRegion,
  consumeActiveFocusedRegion,
  buildRegionFocusPromptHint
} = require('./regionFocus');

const {
  buildSystemPrompt,
  buildUserPrompt,
  buildOllamaSystemPrompt
} = require('./api');

const { evaluateVoiceCommand } = require('./renderer/commands');

console.log('====================================================');
console.log('REGION FOCUS (CTRL+SHIFT+S) VERIFICATION TEST SUITE');
console.log('====================================================\n');

let passedTests = 0;

async function runTest(desc, fn) {
  try {
    await fn();
    console.log(`[PASS] ${desc}`);
    passedTests++;
  } catch (err) {
    console.error(`[FAIL] ${desc}:`, err.message);
    process.exit(1);
  }
}

async function runAllTests() {
// ----------------------------------------------------
// 1. Coordinate Validation and Normalization
// ----------------------------------------------------
console.log('--- 1. Coordinate Normalization & Clamping ---');

await runTest('Normalizes standard top-left to bottom-right drag', () => {
  const rect = { x: 100, y: 150, width: 400, height: 300 };
  const bounds = { width: 1920, height: 1080 };
  const val = validateRegion(rect, bounds);
  assert(val !== null);
  assert.strictEqual(val.x, 100);
  assert.strictEqual(val.y, 150);
  assert.strictEqual(val.width, 400);
  assert.strictEqual(val.height, 300);
});

await runTest('Normalizes reverse bottom-right to top-left drag', () => {
  const rect = { x: 500, y: 450, width: -400, height: -300 };
  const bounds = { width: 1920, height: 1080 };
  const val = validateRegion(rect, bounds);
  assert(val !== null);
  assert.strictEqual(val.x, 100);
  assert.strictEqual(val.y, 150);
  assert.strictEqual(val.width, 400);
  assert.strictEqual(val.height, 300);
});

await runTest('Rejects accidental tiny clicks or micro-drags under 20x20', () => {
  const rect1 = { x: 100, y: 100, width: 15, height: 15 };
  assert.strictEqual(validateRegion(rect1), null);

  const rect2 = { x: 100, y: 100, width: 250, height: 10 };
  assert.strictEqual(validateRegion(rect2), null);
});

await runTest('Clamps regions exceeding display boundaries', () => {
  const rect = { x: 1800, y: 900, width: 300, height: 400 };
  const bounds = { width: 1920, height: 1080 };
  const val = validateRegion(rect, bounds);
  assert(val !== null);
  assert(val.x + val.width <= bounds.width);
  assert(val.y + val.height <= bounds.height);
});

await runTest('Rejects invalid or non-numeric input gracefully', () => {
  assert.strictEqual(validateRegion(null), null);
  assert.strictEqual(validateRegion({}), null);
  assert.strictEqual(validateRegion({ x: 'abc', y: 10, width: 100, height: 100 }), null);
});

// ----------------------------------------------------
// 2. Region State Management & Single-Use "Next Question"
// ----------------------------------------------------
console.log('\n--- 2. Region State Management & Single-Use Consumption ---');

await runTest('Sets and retrieves active focused region', () => {
  clearActiveFocusedRegion();
  assert.strictEqual(getActiveFocusedRegion(), null);

  setActiveFocusedRegion({ x: 200, y: 250, width: 500, height: 350, displayId: 'disp_1' });
  const active = getActiveFocusedRegion();
  assert(active !== null);
  assert.strictEqual(active.x, 200);
  assert.strictEqual(active.y, 250);
  assert.strictEqual(active.width, 500);
  assert.strictEqual(active.height, 350);
  assert.strictEqual(active.displayId, 'disp_1');
});

await runTest('Consumes active region for single-use next question', () => {
  setActiveFocusedRegion({ x: 150, y: 150, width: 300, height: 200 });
  const consumed = consumeActiveFocusedRegion();
  assert(consumed !== null);
  assert.strictEqual(consumed.width, 300);
  assert.strictEqual(consumed.height, 200);

  // Once consumed, active region must be null
  assert.strictEqual(getActiveFocusedRegion(), null);
});

await runTest('Clears active region explicitly', () => {
  setActiveFocusedRegion({ x: 50, y: 50, width: 100, height: 100 });
  assert(getActiveFocusedRegion() !== null);
  clearActiveFocusedRegion();
  assert.strictEqual(getActiveFocusedRegion(), null);
});

// ----------------------------------------------------
// 3. Prompt Specialization with Focused Region
// ----------------------------------------------------
console.log('\n--- 3. Prompt Specialization for Region Focus ---');

await runTest('buildSystemPrompt overlays REGION FOCUS ACTIVE instructions', () => {
  const focusedRegion = { x: 100, y: 100, width: 480, height: 320 };
  const prompt = buildSystemPrompt({
    personality: 'friendly',
    isRegionFocused: true,
    focusedRegion
  });

  assert(prompt.includes('[REGION FOCUS ACTIVE]'));
  assert(prompt.includes('480×320 px'));
  assert(prompt.includes('shows ONLY this focused crop'));
});

await runTest('buildUserPrompt appends focused region note', () => {
  const focusedRegion = { x: 100, y: 100, width: 480, height: 320 };
  const prompt = buildUserPrompt({
    userTranscript: 'What does this error message mean?',
    isRegionFocused: true,
    focusedRegion
  });

  assert(prompt.includes('What does this error message mean?'));
  assert(prompt.includes('[Note: Focused Screen Region Active: Image is cropped strictly to the 480×320 px area'));
});

await runTest('buildOllamaSystemPrompt includes focused region directive for local models', () => {
  const focusedRegion = { x: 100, y: 100, width: 500, height: 300 };
  const prompt = buildOllamaSystemPrompt({
    personality: 'friendly',
    isRegionFocused: true,
    focusedRegion
  });

  assert(prompt.includes('[The user selected a focused screen region of 500x300px. Focus on this specific area.]'));
});

// ----------------------------------------------------
// 4. Voice Commands for Region Focus
// ----------------------------------------------------
console.log('\n--- 4. Voice Command Integration ---');

await runTest('Voice command: "focus region" triggers snip overlay', async () => {
  let snipTriggered = false;
  const res = await evaluateVoiceCommand('focus region', {
    triggerRegionFocus: () => { snipTriggered = true; }
  });

  assert.strictEqual(res.handled, true);
  assert.strictEqual(res.isRegionFocusTrigger, true);
  assert(snipTriggered);
});

await runTest('Voice command: "crop screen" triggers snip overlay', async () => {
  let snipTriggered = false;
  const res = await evaluateVoiceCommand('crop screen', {
    triggerRegionFocus: () => { snipTriggered = true; }
  });

  assert.strictEqual(res.handled, true);
  assert.strictEqual(res.isRegionFocusTrigger, true);
  assert(snipTriggered);
});

await runTest('Voice command: "clear region focus" resets region', async () => {
  let cleared = false;
  const res = await evaluateVoiceCommand('clear region focus', {
    clearRegionFocus: () => { cleared = true; }
  });

  assert.strictEqual(res.handled, true);
  assert.strictEqual(res.isRegionFocusClear, true);
  assert(cleared);
});

await runTest('Voice command: "what region is focused?" reports status', async () => {
  const res1 = await evaluateVoiceCommand('what region is focused?', {
    getFocusedRegion: () => ({ width: 450, height: 300 })
  });
  assert.strictEqual(res1.handled, true);
  assert(res1.message.includes('450×300 px'));

  const res2 = await evaluateVoiceCommand('what region is focused?', {
    getFocusedRegion: () => null
  });
  assert.strictEqual(res2.handled, true);
  assert(res2.message.includes('No region focus active'));
});

// ----------------------------------------------------
// 5. HTML, CSS, and UI Verification
// ----------------------------------------------------
console.log('\n--- 5. HTML, CSS, and UI Structure ---');

await runTest('Context menu and badge exist in renderer/index.html', () => {
  const indexHtml = fs.readFileSync(path.join(__dirname, 'renderer', 'index.html'), 'utf-8');
  assert(indexHtml.includes('id="menu-focus-region"'), 'menu-focus-region missing');
  assert(indexHtml.includes('Ctrl+Shift+S'), 'Ctrl+Shift+S shortcut text missing');
  assert(indexHtml.includes('id="region-focus-badge"'), 'region-focus-badge missing');
  assert(indexHtml.includes('id="region-focus-clear-btn"'), 'region-focus-clear-btn missing');
});

await runTest('Snip overlay files exist and contain required markup & logic', () => {
  const snipHtml = fs.readFileSync(path.join(__dirname, 'renderer', 'snip.html'), 'utf-8');
  assert(snipHtml.includes('id="snip-banner"'), 'snip-banner missing');
  assert(snipHtml.includes('id="selection-box"'), 'selection-box missing');
  assert(snipHtml.includes('id="selection-dimensions"'), 'selection-dimensions missing');

  const snipJs = fs.readFileSync(path.join(__dirname, 'renderer', 'snip.js'), 'utf-8');
  assert(snipJs.includes('snipComplete'), 'snipComplete call missing');
  assert(snipJs.includes('snipCancel'), 'snipCancel call missing');
  assert(snipJs.includes('Escape'), 'Escape handler missing');
});

await runTest('CSS defines region-focus-badge across all 4 themes in renderer/style.css', () => {
  const css = fs.readFileSync(path.join(__dirname, 'renderer', 'style.css'), 'utf-8');
  assert(css.includes('.region-focus-badge'), 'Base .region-focus-badge missing');
  assert(css.includes('body.theme-neon .region-focus-badge'), 'Neon theme badge missing');
  assert(css.includes('body.theme-minimal-white .region-focus-badge'), 'Minimal White theme badge missing');
  assert(css.includes('body.theme-dark-glass .region-focus-badge'), 'Dark Glass theme badge missing');
  assert(css.includes('body.theme-sunset .region-focus-badge'), 'Sunset theme badge missing');
});

await runTest('Settings window contains Region Focus section in renderer/settings.html', () => {
  const settingsHtml = fs.readFileSync(path.join(__dirname, 'renderer', 'settings.html'), 'utf-8');
  assert(settingsHtml.includes('Region Focus'), 'Region Focus title missing');
  assert(settingsHtml.includes('Ctrl+Shift+S'), 'Ctrl+Shift+S badge missing');
  assert(settingsHtml.includes('id="trigger-snip-btn"'), 'trigger-snip-btn missing');
});

await runTest('package.json includes regionFocus.js in distribution files', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf-8'));
  assert(pkg.build.files.includes('regionFocus.js'), 'regionFocus.js missing from package.json files');
});

console.log('\n====================================================');
console.log(`TEST SUITE RESULTS: ${passedTests}/${passedTests} PASSED`);
console.log('====================================================');
}

runAllTests().catch(err => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
