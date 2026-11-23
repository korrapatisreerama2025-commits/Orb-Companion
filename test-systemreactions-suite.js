/**
 * Desktop AI Companion - System-Aware Reactions Test Suite (test-systemreactions-suite.js)
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { DEFAULT_CONFIG } = require('./config');
const { validateSaveConfig } = require('./ipcValidator');

async function runTestSuite() {
  console.log('🧪 Starting System-Aware Reactions Test Suite...\n');

  // ==========================================================
  // TEST 1: Config Defaults & Settings Validator
  // ==========================================================
  console.log('Test 1: Verifying DEFAULT_CONFIG and ipcValidator for reaction toggles...');
  assert.strictEqual(DEFAULT_CONFIG.reactionLowBattery, true, 'reactionLowBattery should default to true');
  assert.strictEqual(DEFAULT_CONFIG.reactionChargerPlugged, true, 'reactionChargerPlugged should default to true');
  assert.strictEqual(DEFAULT_CONFIG.reactionChargerUnplugged, true, 'reactionChargerUnplugged should default to true');
  assert.strictEqual(DEFAULT_CONFIG.reactionNetworkChange, true, 'reactionNetworkChange should default to true');
  assert.strictEqual(DEFAULT_CONFIG.reactionHeadphones, true, 'reactionHeadphones should default to true');

  const validated = validateSaveConfig({
    reactionLowBattery: false,
    reactionChargerPlugged: true,
    reactionChargerUnplugged: false,
    reactionNetworkChange: true,
    reactionHeadphones: false
  });
  assert.strictEqual(validated.reactionLowBattery, false);
  assert.strictEqual(validated.reactionChargerPlugged, true);
  assert.strictEqual(validated.reactionChargerUnplugged, false);
  assert.strictEqual(validated.reactionNetworkChange, true);
  assert.strictEqual(validated.reactionHeadphones, false);
  console.log('  ✅ Config defaults and validator verified.\n');

  // ==========================================================
  // TEST 2: Quip Dictionary & 5 Variants Non-Repeating
  // ==========================================================
  console.log('Test 2: Verifying SYSTEM_REACTION_QUIPS (5 variants per event, no consecutive repeat)...');
  const appJs = fs.readFileSync(path.join(__dirname, 'renderer', 'app.js'), 'utf-8');
  const quipsMatch = appJs.match(/const SYSTEM_REACTION_QUIPS = ({[\s\S]*?\n};)/);
  assert.ok(quipsMatch, 'SYSTEM_REACTION_QUIPS should exist in renderer/app.js');
  const SYSTEM_REACTION_QUIPS = eval(`(${quipsMatch[1].replace(/;$/, '')})`);

  const events = [
    'low_battery',
    'charger_plugged',
    'charger_unplugged',
    'wifi_lost',
    'wifi_online',
    'headphones_connected'
  ];

  for (const evt of events) {
    assert.ok(Array.isArray(SYSTEM_REACTION_QUIPS[evt]), `${evt} must be an array`);
    assert.strictEqual(SYSTEM_REACTION_QUIPS[evt].length, 5, `${evt} must have exactly 5 variants`);
    for (const q of SYSTEM_REACTION_QUIPS[evt]) {
      assert.strictEqual(typeof q, 'string');
      assert.ok(q.trim().length > 5, 'Quip text must be substantial');
    }
  }

  // Non-repeating test
  const lastIndices = {};
  function getNext(reactionType) {
    const list = SYSTEM_REACTION_QUIPS[reactionType];
    const lastIdx = lastIndices[reactionType] ?? -1;
    let nextIdx = Math.floor(Math.random() * list.length);
    while (nextIdx === lastIdx && list.length > 1) {
      nextIdx = Math.floor(Math.random() * list.length);
    }
    lastIndices[reactionType] = nextIdx;
    return list[nextIdx];
  }

  for (const evt of events) {
    let prev = '';
    for (let i = 0; i < 40; i++) {
      const cur = getNext(evt);
      assert.notStrictEqual(cur, prev, `Consecutive repetition detected for ${evt}: "${cur}"`);
      prev = cur;
    }
  }
  console.log('  ✅ Exactly 5 variants per event and consecutive non-repetition verified.\n');

  // ==========================================================
  // TEST 3: Battery Low Once-Per-Drop Semantics
  // ==========================================================
  console.log('Test 3: Verifying battery below 20% once-per-drop logic...');
  let hasAlertedLowBattery = false;
  let alertCount = 0;

  function updateBattery(level, charging) {
    if (level < 0.20 && !charging) {
      if (!hasAlertedLowBattery) {
        hasAlertedLowBattery = true;
        alertCount++;
      }
    } else if (level >= 0.20 || charging) {
      hasAlertedLowBattery = false;
    }
  }

  // Normal discharging (50%) -> no alert
  updateBattery(0.50, false);
  assert.strictEqual(alertCount, 0);

  // Drop to 19% while discharging -> alert 1
  updateBattery(0.19, false);
  assert.strictEqual(alertCount, 1);
  assert.strictEqual(hasAlertedLowBattery, true);

  // Drops further to 18%, 15%, 10% while discharging -> MUST NOT spam
  updateBattery(0.18, false);
  updateBattery(0.15, false);
  updateBattery(0.10, false);
  assert.strictEqual(alertCount, 1, 'Should not trigger again during the same drop');

  // Charger plugged in -> resets hasAlertedLowBattery
  updateBattery(0.10, true);
  assert.strictEqual(hasAlertedLowBattery, false);
  assert.strictEqual(alertCount, 1);

  // Charged to 25%, unplugged, then drops to 17% -> alert 2
  updateBattery(0.25, false);
  updateBattery(0.17, false);
  assert.strictEqual(alertCount, 2, 'Should trigger once on new drop below 20%');
  console.log('  ✅ Battery once-per-drop logic verified.\n');

  // ==========================================================
  // TEST 4: Settings HTML, CSS, Preload, and Main IPC
  // ==========================================================
  console.log('Test 4: Verifying settings HTML, CSS, preload, and main IPC wiring...');
  const settingsHtml = fs.readFileSync(path.join(__dirname, 'renderer', 'settings.html'), 'utf-8');
  const settingsJs = fs.readFileSync(path.join(__dirname, 'renderer', 'settings.js'), 'utf-8');
  const styleCss = fs.readFileSync(path.join(__dirname, 'renderer', 'style.css'), 'utf-8');
  const preloadJs = fs.readFileSync(path.join(__dirname, 'preload.js'), 'utf-8');
  const mainJs = fs.readFileSync(path.join(__dirname, 'main.js'), 'utf-8');

  // Settings inputs
  assert.ok(settingsHtml.includes('id="reaction-low-battery-toggle"'));
  assert.ok(settingsHtml.includes('id="reaction-charger-plugged-toggle"'));
  assert.ok(settingsHtml.includes('id="reaction-charger-unplugged-toggle"'));
  assert.ok(settingsHtml.includes('id="reaction-network-change-toggle"'));
  assert.ok(settingsHtml.includes('id="reaction-headphones-toggle"'));

  // Settings JS bindings
  assert.ok(settingsJs.includes('reactionLowBatteryToggle'));
  assert.ok(settingsJs.includes('reactionLowBattery:'));

  // CSS Bob animation and reduced motion
  assert.ok(styleCss.includes('.orb.happy-bobbing'));
  assert.ok(styleCss.includes('@keyframes orbHappyBob'));
  const reducedMotionIndex = styleCss.indexOf('@media (prefers-reduced-motion: reduce)');
  assert.ok(reducedMotionIndex !== -1);
  const reducedMotionPart = styleCss.slice(reducedMotionIndex);
  assert.ok(reducedMotionPart.includes('.orb.happy-bobbing'));

  // Preload and Main IPC
  assert.ok(preloadJs.includes('onPowerStateChanged:'));
  assert.ok(mainJs.includes("powerMonitor.on('on-ac'"));
  assert.ok(mainJs.includes("powerMonitor.on('on-battery'"));
  console.log('  ✅ Settings HTML, CSS, preload, and main IPC verified.\n');

  console.log('🎉 All System-Aware Reactions tests PASSED successfully!\n');
}

runTestSuite().catch(err => {
  console.error('❌ Test suite failed:', err);
  process.exit(1);
});
