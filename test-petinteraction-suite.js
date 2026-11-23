/**
 * Desktop AI Companion - Pet-like Interaction Test Suite (test-petinteraction-suite.js)
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { DEFAULT_CONFIG } = require('./config');
const { validateSaveConfig } = require('./ipcValidator');
const CompanionVoiceCommands = require('./renderer/commands');

async function runTestSuite() {
  console.log('🧪 Starting Pet-like Interaction Test Suite...\n');

  // ==========================================================
  // TEST 1: Config Defaults & Master Volume Validation
  // ==========================================================
  console.log('Test 1: Verifying soundVolume and soundMuted config & validator...');
  assert.strictEqual(DEFAULT_CONFIG.soundVolume, 0.8, 'Default sound volume should be 0.8');
  assert.strictEqual(DEFAULT_CONFIG.soundMuted, false, 'Default sound muted should be false');

  const validVol = validateSaveConfig({ soundVolume: 0.72 });
  assert.strictEqual(validVol.soundVolume, 0.72);

  const mutedTrue = validateSaveConfig({ soundMuted: true });
  assert.strictEqual(mutedTrue.soundMuted, true);

  const invalidVol = validateSaveConfig({ soundVolume: -0.2 });
  assert.strictEqual(invalidVol.soundVolume, undefined);
  console.log('  ✅ Config defaults and validation verified.\n');

  // ==========================================================
  // TEST 2: Voice Commands for Muting/Unmuting Sounds
  // ==========================================================
  console.log('Test 2: Verifying voice commands for muting and unmuting sounds...');
  let soundMutedState = null;
  const mockContext = {
    setSoundMuted: (val) => { soundMutedState = val; }
  };

  const res1 = await CompanionVoiceCommands.evaluateVoiceCommand('mute sounds', mockContext);
  assert.strictEqual(res1.handled, true);
  assert.ok(res1.badge.includes('Sounds Muted'));
  assert.strictEqual(soundMutedState, true);

  const res2 = await CompanionVoiceCommands.evaluateVoiceCommand('unmute audio', mockContext);
  assert.strictEqual(res2.handled, true);
  assert.ok(res2.badge.includes('Sounds Unmuted'));
  assert.strictEqual(soundMutedState, false);
  console.log('  ✅ Sound mute voice commands verified.\n');

  // ==========================================================
  // TEST 3: HTML Markup in index.html and settings.html
  // ==========================================================
  console.log('Test 3: Verifying HTML markup for hearts, mute menu item, and volume slider...');
  const indexHtml = fs.readFileSync(path.join(__dirname, 'renderer', 'index.html'), 'utf-8');
  const settingsHtml = fs.readFileSync(path.join(__dirname, 'renderer', 'settings.html'), 'utf-8');

  // Floating hearts SVG in index.html
  assert.ok(indexHtml.includes('id="effect-hearts"'), 'SVG #effect-hearts must exist in index.html');
  assert.ok(indexHtml.includes('class="floating-heart heart-1"'), 'Floating heart 1 must exist');
  assert.ok(indexHtml.includes('class="floating-heart heart-2"'), 'Floating heart 2 must exist');
  assert.ok(indexHtml.includes('class="floating-heart heart-3"'), 'Floating heart 3 must exist');

  // Context menu mute toggle in index.html
  assert.ok(indexHtml.includes('id="menu-toggle-mute"'), 'Mute toggle must exist in context menu');
  assert.ok(indexHtml.includes('id="menu-mute-icon"'), '#menu-mute-icon must exist');
  assert.ok(indexHtml.includes('id="menu-mute-text"'), '#menu-mute-text must exist');

  // Master sound volume slider in settings.html
  assert.ok(settingsHtml.includes('id="master-volume-slider"'), 'Volume slider must exist in settings.html');
  assert.ok(settingsHtml.includes('id="master-volume-badge"'), 'Volume badge must exist in settings.html');
  assert.ok(settingsHtml.includes('Master Sound Volume'), 'Master Sound Volume title must exist');
  console.log('  ✅ HTML markup verified.\n');

  // ==========================================================
  // TEST 4: CSS Styles, Animations & Reduced Motion
  // ==========================================================
  console.log('Test 4: Verifying CSS head lean, squish animation, floating hearts, and reduced motion...');
  const css = fs.readFileSync(path.join(__dirname, 'renderer', 'style.css'), 'utf-8');

  // Head lean on .orb
  assert.ok(css.includes('rotate: var(--lean-rotate, 0deg);'), 'Must define rotate: var(--lean-rotate)');
  assert.ok(css.includes('translate: var(--lean-x, 0px) var(--lean-y, 0px);'), 'Must define translate: var(--lean-x) var(--lean-y)');

  // Poke squish animation
  assert.ok(css.includes('.orb.squishing'), 'Must define .orb.squishing');
  assert.ok(css.includes('@keyframes orbSquish'), 'Must define @keyframes orbSquish');

  // Floating hearts
  assert.ok(css.includes('.orb-face.showing-hearts .effect-hearts'), 'Must define .orb-face.showing-hearts');
  assert.ok(css.includes('@keyframes heartFloatUp'), 'Must define @keyframes heartFloatUp');

  // Reduced motion safety
  assert.ok(css.includes('@media (prefers-reduced-motion: reduce)'), 'Must include prefers-reduced-motion');
  assert.ok(css.includes('rotate: 0deg !important;'), 'Must reset rotate to 0deg under reduced motion');
  assert.ok(css.includes('translate: 0px 0px !important;'), 'Must reset translate to 0px under reduced motion');
  assert.ok(css.includes('.orb.squishing,'), 'Must disable squish animation under reduced motion');
  assert.ok(css.includes('.effect-hearts {'), 'Must hide hearts under reduced motion');
  console.log('  ✅ CSS styles and reduced motion safety verified.\n');

  // ==========================================================
  // TEST 5: App Controller & Pet Logic in app.js
  // ==========================================================
  console.log('Test 5: Verifying pet interactions, squeak, purr, and mute logic in app.js...');
  const appJs = fs.readFileSync(path.join(__dirname, 'renderer', 'app.js'), 'utf-8');

  assert.ok(appJs.includes('function scheduleCursorLook('), 'Must define throttled scheduleCursorLook');
  assert.ok(appJs.includes('requestAnimationFrame('), 'Must use requestAnimationFrame for cursor throttling');
  assert.ok(appJs.includes('--lean-rotate'), 'Must calculate --lean-rotate');
  assert.ok(appJs.includes('function registerPetMove('), 'Must define registerPetMove');
  assert.ok(appJs.includes('function triggerPetting('), 'Must define triggerPetting');
  assert.ok(appJs.includes('playPurrSound();'), 'Must play purr sound on petting');
  assert.ok(appJs.includes('function playPurrSound('), 'Must synthesize soft purr sound');
  assert.ok(appJs.includes('function playSqueakSound('), 'Must synthesize poke squeak sound');
  assert.ok(appJs.includes('function getMasterVolume('), 'Must define getMasterVolume');
  assert.ok(appJs.includes('function toggleSoundMute('), 'Must define toggleSoundMute');
  assert.ok(appJs.includes('window.companionPet'), 'Must expose window.companionPet');
  console.log('  ✅ App controller and pet logic verified.\n');

  console.log('🎉 ALL PET-LIKE INTERACTION TESTS PASSED SUCCESSFULLY!');
}

runTestSuite().catch(err => {
  console.error('❌ Test suite failed:', err);
  process.exit(1);
});
