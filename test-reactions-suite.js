/**
 * Desktop AI Companion - Event Reactions Test Suite (test-reactions-suite.js)
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

async function runTestSuite() {
  console.log('🧪 Starting Event Reactions Test Suite...\n');

  // ==========================================================
  // TEST 1: Goal Completion Voice Commands & Confetti Trigger
  // ==========================================================
  console.log('Test 1: Verifying Goal Completion voice commands & confetti trigger...');
  const CompanionVoiceCommands = require('./renderer/commands');

  let confettiTriggered = false;
  let sympatheticTriggered = false;
  let waveTriggered = false;
  let waveShouldQuit = null;

  const mockContext = {
    triggerConfetti: () => { confettiTriggered = true; },
    triggerSympatheticReaction: () => { sympatheticTriggered = true; },
    triggerWaveGoodbye: (quit) => { waveTriggered = true; waveShouldQuit = quit; }
  };

  // 1. Goal completion
  const goalRes1 = await CompanionVoiceCommands.evaluateVoiceCommand('completed goal: ship electron release', mockContext);
  assert.strictEqual(goalRes1.handled, true);
  assert.strictEqual(goalRes1.isGoalComplete, true);
  assert.strictEqual(goalRes1.confetti, true);
  assert.strictEqual(confettiTriggered, true);
  assert.ok(goalRes1.message.includes('ship electron release'));

  confettiTriggered = false;
  const goalRes2 = await CompanionVoiceCommands.evaluateVoiceCommand('goal complete', mockContext);
  assert.strictEqual(goalRes2.handled, true);
  assert.strictEqual(goalRes2.isGoalComplete, true);
  assert.strictEqual(goalRes2.confetti, true);
  assert.strictEqual(confettiTriggered, true);

  confettiTriggered = false;
  const goalRes3 = await CompanionVoiceCommands.evaluateVoiceCommand('I finished my goal write unit tests', mockContext);
  assert.strictEqual(goalRes3.handled, true);
  assert.strictEqual(goalRes3.confetti, true);
  console.log('  ✓ Goal completion voice commands trigger confetti burst and celebratory message.');

  // ==========================================================
  // TEST 2: Build Error Pattern & Sympathetic Reaction
  // ==========================================================
  console.log('\nTest 2: Verifying Build Error detection and sympathetic expression...');
  const BUILD_ERROR_PATTERN = /(?:build\s+(?:failed|error)|compilation\s+(?:error|failed)|syntaxerror|typeerror|referenceerror|npm\s+err!|error\s+ts\d+|failed\s+to\s+compile|error:\s+cannot\s+find|traceback\s+\(most\s+recent\s+call\s+last\)|cargo\s+build\s+failed)/i;

  // Pattern detection
  assert.ok(BUILD_ERROR_PATTERN.test('npm ERR! code ELIFECYCLE'));
  assert.ok(BUILD_ERROR_PATTERN.test('Build failed with 2 errors: SyntaxError: Unexpected token'));
  assert.ok(BUILD_ERROR_PATTERN.test('Failed to compile: TypeError: Cannot read properties of undefined'));
  assert.ok(BUILD_ERROR_PATTERN.test('Traceback (most recent call last): File "main.py", line 4'));
  assert.strictEqual(BUILD_ERROR_PATTERN.test('Everything compiled cleanly with 0 warnings'), false);

  // Voice command: build error
  const errRes1 = await CompanionVoiceCommands.evaluateVoiceCommand('my build failed', mockContext);
  assert.strictEqual(errRes1.handled, true);
  assert.strictEqual(errRes1.isBuildError, true);
  assert.strictEqual(errRes1.sympathetic, true);
  assert.strictEqual(sympatheticTriggered, true);
  assert.strictEqual(errRes1.badge, '💙 Sympathetic Companion');

  sympatheticTriggered = false;
  const errRes2 = await CompanionVoiceCommands.evaluateVoiceCommand('compilation error', mockContext);
  assert.strictEqual(errRes2.handled, true);
  assert.strictEqual(errRes2.sympathetic, true);
  assert.strictEqual(sympatheticTriggered, true);
  console.log('  ✓ Build errors trigger sympathetic orb expression, blue badge, and comforting response.');

  // ==========================================================
  // TEST 3: Goodbye & Shutdown Waving Reaction
  // ==========================================================
  console.log('\nTest 3: Verifying Goodbye and Shutdown waving reaction...');

  // Casual goodbye
  const byeRes1 = await CompanionVoiceCommands.evaluateVoiceCommand('goodbye', mockContext);
  assert.strictEqual(byeRes1.handled, true);
  assert.strictEqual(byeRes1.isGoodbye, true);
  assert.strictEqual(byeRes1.waving, true);
  assert.strictEqual(byeRes1.shouldQuit, false);
  assert.strictEqual(waveTriggered, true);
  assert.strictEqual(waveShouldQuit, false);

  // Casual bye companion
  waveTriggered = false;
  const byeRes2 = await CompanionVoiceCommands.evaluateVoiceCommand('bye companion', mockContext);
  assert.strictEqual(byeRes2.handled, true);
  assert.strictEqual(byeRes2.waving, true);
  assert.strictEqual(byeRes2.shouldQuit, false);
  assert.strictEqual(waveTriggered, true);

  // Shutdown / Exit / Quit
  waveTriggered = false;
  const shutRes = await CompanionVoiceCommands.evaluateVoiceCommand('shut down', mockContext);
  assert.strictEqual(shutRes.handled, true);
  assert.strictEqual(shutRes.isGoodbye, true);
  assert.strictEqual(shutRes.waving, true);
  assert.strictEqual(shutRes.shouldQuit, true);
  assert.strictEqual(waveTriggered, true);
  assert.strictEqual(waveShouldQuit, true);
  assert.ok(shutRes.message.includes('Shutting down'));

  waveTriggered = false;
  const quitRes = await CompanionVoiceCommands.evaluateVoiceCommand('quit', mockContext);
  assert.strictEqual(quitRes.handled, true);
  assert.strictEqual(quitRes.shouldQuit, true);
  console.log('  ✓ Saying goodbye or shutting down initiates friendly waving reaction and clean farewell.');

  // ==========================================================
  // TEST 4: HTML Markup & Canvas Verification
  // ==========================================================
  console.log('\nTest 4: Verifying HTML markup for Confetti Canvas and Wave Badge...');
  const indexHtml = fs.readFileSync(path.join(__dirname, 'renderer', 'index.html'), 'utf-8');
  assert.ok(indexHtml.includes('id="confetti-canvas"'), 'index.html should have confetti canvas element');
  assert.ok(indexHtml.includes('id="orb-wave-badge"'), 'index.html should have wave badge element');
  console.log('  ✓ #confetti-canvas and #orb-wave-badge verified in renderer/index.html.');

  // ==========================================================
  // TEST 5: CSS Stylesheet Verification
  // ==========================================================
  console.log('\nTest 5: Verifying CSS animation and styling rules...');
  const styleCss = fs.readFileSync(path.join(__dirname, 'renderer', 'style.css'), 'utf-8');
  assert.ok(styleCss.includes('.confetti-canvas'), 'CSS should have .confetti-canvas styling');
  assert.ok(styleCss.includes('.orb-wave-badge'), 'CSS should have .orb-wave-badge styling');
  assert.ok(styleCss.includes('orbWaveMotion'), 'CSS should have orbWaveMotion keyframe animation');
  assert.ok(styleCss.includes('handWobbleWave'), 'CSS should have handWobbleWave keyframe animation');
  assert.ok(styleCss.includes('.orb-container.sympathetic .orb'), 'CSS should have sympathetic orb styling');
  assert.ok(styleCss.includes('.speech-bubble.sympathetic-mode'), 'CSS should have sympathetic speech bubble');
  assert.ok(styleCss.includes('.speech-bubble.celebration-mode'), 'CSS should have celebration mode speech bubble');
  console.log('  ✓ Confetti, wave animation, sympathetic expression, and celebration styles verified.');

  console.log('\n🎉 ALL EVENT REACTIONS TESTS PASSED SUCCESSFULLY!');
}

runTestSuite().catch(err => {
  console.error('\n❌ Test suite failed:', err);
  process.exit(1);
});
