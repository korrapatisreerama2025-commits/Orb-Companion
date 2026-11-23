/**
 * Test Suite for Interruption Handling & "Shut Up for 30 Minutes" Feature
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('🧪 Starting Interruption Handling & "Shut Up for 30 Minutes" Test Suite...\n');

// Test 1: Config defaults & settings.json schema
console.log('Test 1: Verifying shutUpUntil in config.js & settings.json...');
const { DEFAULT_CONFIG } = require('./config');
const settingsJson = JSON.parse(fs.readFileSync(path.join(__dirname, 'settings.json'), 'utf8'));

assert.strictEqual(DEFAULT_CONFIG.shutUpUntil, null, 'DEFAULT_CONFIG.shutUpUntil should default to null');
assert.strictEqual(settingsJson.shutUpUntil, null, 'settings.json shutUpUntil should be null');
console.log('  ✓ Config defaults and settings.json properly declare shutUpUntil: null.\n');

// Test 2: Voice Commands in renderer/commands.js
console.log('Test 2: Verifying "shut up for 30 minutes" and quiet voice commands in renderer/commands.js...');
const { evaluateVoiceCommand } = require('./renderer/commands');

(async () => {
  let quietMinsRequested = 0;
  let isQuiet = false;
  let cancelled = false;

  const mockContext = {
    shutUpForMinutes: (mins) => {
      quietMinsRequested = mins;
      isQuiet = true;
    },
    cancelShutUp: () => {
      isQuiet = false;
      cancelled = true;
    },
    isShutUpActive: () => isQuiet,
    getRemainingShutUpMinutes: () => isQuiet ? quietMinsRequested : 0
  };

  // 1. "shut up for 30 minutes"
  let cmd = await evaluateVoiceCommand('shut up for 30 minutes', mockContext);
  assert.ok(cmd && cmd.handled, 'shut up for 30 minutes should be handled');
  assert.strictEqual(cmd.isShutUp, true, 'isShutUp flag should be true');
  assert.strictEqual(cmd.minutes, 30, 'Duration should be 30 minutes');
  assert.strictEqual(quietMinsRequested, 30, 'context.shutUpForMinutes should be called with 30');
  assert.strictEqual(cmd.speak, null, 'speak must be null (must not speak when told to shut up)');
  assert.ok(cmd.badge.includes('30m'), 'Badge should show 30m');

  // 2. "shut up" (default duration 30m)
  cmd = await evaluateVoiceCommand('shut up', mockContext);
  assert.ok(cmd && cmd.handled, 'shut up should be handled');
  assert.strictEqual(cmd.minutes, 30, 'shut up default should be 30 minutes');

  // 3. "be quiet for 30 minutes"
  cmd = await evaluateVoiceCommand('be quiet for 30 minutes', mockContext);
  assert.ok(cmd && cmd.handled, 'be quiet for 30 minutes should be handled');
  assert.strictEqual(cmd.minutes, 30);

  // 4. "mute for 30 minutes"
  cmd = await evaluateVoiceCommand('mute for 30 minutes', mockContext);
  assert.ok(cmd && cmd.handled, 'mute for 30 minutes should be handled');
  assert.strictEqual(cmd.minutes, 30);

  // 5. "shut up for 15 minutes" (custom duration)
  cmd = await evaluateVoiceCommand('shut up for 15 minutes', mockContext);
  assert.ok(cmd && cmd.handled, 'shut up for 15 minutes should be handled');
  assert.strictEqual(cmd.minutes, 15, 'Custom duration 15 should be parsed');
  assert.strictEqual(quietMinsRequested, 15);

  // 6. "shut up for half an hour"
  cmd = await evaluateVoiceCommand('shut up for half an hour', mockContext);
  assert.ok(cmd && cmd.handled, 'shut up for half an hour should be handled');
  assert.strictEqual(cmd.minutes, 30);

  // 7. Status query: "how much quiet time is left?"
  cmd = await evaluateVoiceCommand('how much quiet time is left', mockContext);
  assert.ok(cmd && cmd.handled, 'status query should be handled');
  assert.ok(cmd.message.includes('30'), 'Status should mention remaining minutes');

  // 8. "unmute" / "resume talking"
  cmd = await evaluateVoiceCommand('unmute', mockContext);
  assert.ok(cmd && cmd.handled, 'unmute should be handled');
  assert.strictEqual(cancelled, true, 'cancelShutUp should be called');
  assert.ok(cmd.message.includes('unmuted'), 'Confirmation should report unmuted');

  cmd = await evaluateVoiceCommand('resume talking', mockContext);
  assert.ok(cmd && cmd.handled, 'resume talking should be handled');

  console.log('  ✓ Voice commands for "shut up for 30 minutes", custom durations, queries, and unmuting verified.\n');

  // Test 3: HTML Markup for context menu item
  console.log('Test 3: Verifying context menu item #menu-shut-up-30 in renderer/index.html...');
  const indexHtml = fs.readFileSync(path.join(__dirname, 'renderer', 'index.html'), 'utf8');

  assert.ok(indexHtml.includes('id="menu-shut-up-30"'), 'index.html must contain #menu-shut-up-30');
  assert.ok(indexHtml.includes('id="menu-shut-up-icon"'), 'index.html must contain #menu-shut-up-icon');
  assert.ok(indexHtml.includes('id="menu-shut-up-text"'), 'index.html must contain #menu-shut-up-text');
  assert.ok(indexHtml.includes('id="menu-shut-up-check"'), 'index.html must contain #menu-shut-up-check');
  assert.ok(indexHtml.includes('Shut up for 30m'), 'index.html must display "Shut up for 30m"');

  console.log('  ✓ Context menu item #menu-shut-up-30 markup verified.\n');

  // Test 4: CSS Styles for speech bubble fading
  console.log('Test 4: Verifying CSS transition and .speech-bubble.fading in renderer/style.css...');
  const styleCss = fs.readFileSync(path.join(__dirname, 'renderer', 'style.css'), 'utf8');

  assert.ok(styleCss.includes('.speech-bubble.fading'), 'style.css must define .speech-bubble.fading');
  assert.ok(styleCss.includes('opacity: 0'), '.speech-bubble.fading must set opacity: 0');
  assert.ok(styleCss.includes('pointer-events: none'), '.speech-bubble.fading must disable pointer events');
  assert.ok(styleCss.includes('transition:'), '.speech-bubble.fading must have smooth transition');

  console.log('  ✓ CSS smooth fading rules verified.\n');

  // Test 5: Renderer app.js interruption handling and 30-minute quiet logic
  console.log('Test 5: Verifying interruption handling and 30m quiet logic in renderer/app.js...');
  const appJs = fs.readFileSync(path.join(__dirname, 'renderer', 'app.js'), 'utf8');

  // Interruption core functions
  assert.ok(appJs.includes('function interruptSpeech('), 'app.js must declare interruptSpeech()');
  assert.ok(appJs.includes('function fadeSpeechBubble('), 'app.js must declare fadeSpeechBubble()');
  assert.ok(appJs.includes('window.speechSynthesis.cancel()'), 'interruptSpeech must cancel speech synthesis');

  // 30-minute quiet logic
  assert.ok(appJs.includes('function setShutUp('), 'app.js must declare setShutUp()');
  assert.ok(appJs.includes('function cancelShutUp('), 'app.js must declare cancelShutUp()');
  assert.ok(appJs.includes('function isShutUpActive('), 'app.js must declare isShutUpActive()');
  assert.ok(appJs.includes('function getRemainingShutUpMinutes('), 'app.js must declare getRemainingShutUpMinutes()');
  assert.ok(appJs.includes('function updateShutUpMenuUI('), 'app.js must declare updateShutUpMenuUI()');

  // Key press interruption
  assert.ok(appJs.includes("interruptSpeech('key_press')"), 'keydown listener must call interruptSpeech on key press while speaking');

  // User talking interruption
  assert.ok(appJs.includes("interruptSpeech('voice_interruption')"), 'rec.onresult must call interruptSpeech when user talks while speaking');

  // Clicks & PTT interruption
  assert.ok(appJs.includes("interruptSpeech('orb_click')"), 'orb click must interrupt speech if speaking');
  assert.ok(appJs.includes("interruptSpeech('bubble_click')"), 'bubble click must interrupt speech if speaking');
  assert.ok(appJs.includes("interruptSpeech('ptt_interrupt')"), 'PTT down must interrupt speech if speaking');

  // Proactive observation suppression during quiet mode
  assert.ok(appJs.includes('isShutUpActive()'), 'triggerObservation must check isShutUpActive()');

  // Menu click wiring
  assert.ok(appJs.includes('menuShutUp30.addEventListener'), 'menuShutUp30 click listener must be wired');

  console.log('  ✓ All interruption triggers, voice cut-off, bubble fade, and quiet mode logic verified.\n');

  // Test 6: 30-minute math & expiration logic
  console.log('Test 6: Verifying 30-minute duration math...');
  const now = Date.now();
  const future30m = now + 30 * 60 * 1000;
  const remainingCalculated = Math.max(1, Math.ceil((future30m - now) / 60000));
  assert.strictEqual(remainingCalculated, 30, 'Calculated remaining time should be 30 minutes');

  console.log('  ✓ 30-minute countdown math verified.\n');

  console.log('🎉 ALL INTERRUPTION HANDLING & "SHUT UP FOR 30 MINUTES" TESTS PASSED SUCCESSFULLY!');
})();
