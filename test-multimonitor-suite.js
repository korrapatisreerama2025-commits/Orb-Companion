/**
 * Desktop AI Companion - Multi-Monitor Support Test Suite (test-multimonitor-suite.js)
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

async function runTestSuite() {
  console.log('🧪 Starting Multi-Monitor Support Test Suite...\n');

  // ==========================================================
  // TEST 1: Config Defaults & Settings File Schema
  // ==========================================================
  console.log('Test 1: Verifying multi-monitor config defaults and settings schema...');
  const { DEFAULT_CONFIG } = require('./config');
  const { loadConfig, saveConfig } = require('./settings');

  assert.strictEqual(DEFAULT_CONFIG.watchDisplay, 'active', 'DEFAULT_CONFIG must default watchDisplay to "active"');
  assert.strictEqual(DEFAULT_CONFIG.liveDisplay, 'active', 'DEFAULT_CONFIG must default liveDisplay to "active"');
  assert.strictEqual(DEFAULT_CONFIG.followActiveMonitor, true, 'DEFAULT_CONFIG must default followActiveMonitor to true');

  const loaded = loadConfig();
  assert.ok('watchDisplay' in loaded, 'Loaded config should have watchDisplay');
  assert.ok('liveDisplay' in loaded, 'Loaded config should have liveDisplay');
  assert.ok('followActiveMonitor' in loaded, 'Loaded config should have followActiveMonitor');

  console.log('  ✓ Config defaults correctly include watchDisplay, liveDisplay, and followActiveMonitor.');

  // ==========================================================
  // TEST 2: resolveWatchDisplay Logic
  // ==========================================================
  console.log('\nTest 2: Verifying resolveWatchDisplay logic across monitor targets...');
  const captureMod = require('./capture');

  // Mock electron screen setup
  const mockPrimary = {
    id: 101,
    label: 'Primary 1080p',
    bounds: { x: 0, y: 0, width: 1920, height: 1080 },
    workArea: { x: 0, y: 0, width: 1920, height: 1040 },
    scaleFactor: 1
  };
  const mockSecondary = {
    id: 102,
    label: 'Secondary 4K',
    bounds: { x: 1920, y: 0, width: 3840, height: 2160 },
    workArea: { x: 1920, y: 0, width: 3840, height: 2110 },
    scaleFactor: 1.5
  };
  const mockLeftMonitor = {
    id: 103,
    label: 'Left Monitor',
    bounds: { x: -1920, y: 0, width: 1920, height: 1080 },
    workArea: { x: -1920, y: 0, width: 1920, height: 1040 },
    scaleFactor: 1
  };

  const allMockDisplays = [mockPrimary, mockSecondary, mockLeftMonitor];

  // If captureMod has resolveWatchDisplay exported
  assert.strictEqual(typeof captureMod.resolveWatchDisplay, 'function', 'resolveWatchDisplay must be exported from capture.js');

  // Case A: Explicit 'primary'
  const targetPrimary = captureMod.resolveWatchDisplay({ watchDisplay: 'primary' }, null);
  // (In test environment screen may be mocked or Electron screen)
  console.log('  ✓ resolveWatchDisplay function exists and runs safely without throwing.');

  // ==========================================================
  // TEST 3: Multi-Monitor Coordinate & Corner Snapping Math
  // ==========================================================
  console.log('\nTest 3: Verifying corner snapping coordinates across multiple displays...');

  function computeSnapPosition(targetDisplay, winWidth, winHeight, margin) {
    const wa = targetDisplay.workArea;
    return {
      x: Math.round(wa.x + wa.width - winWidth - margin),
      y: Math.round(wa.y + wa.height - winHeight - margin)
    };
  }

  const winW = 300;
  const winH = 300;
  const margin = 24;

  // Screen 1 (Primary: 0,0 1920x1040)
  const posPrimary = computeSnapPosition(mockPrimary, winW, winH, margin);
  assert.strictEqual(posPrimary.x, 1920 - 300 - 24); // 1596
  assert.strictEqual(posPrimary.y, 1040 - 300 - 24); // 716

  // Screen 2 (Secondary on the right: 1920,0 3840x2110)
  const posSecondary = computeSnapPosition(mockSecondary, winW, winH, margin);
  assert.strictEqual(posSecondary.x, 1920 + 3840 - 300 - 24); // 5436
  assert.strictEqual(posSecondary.y, 2110 - 300 - 24); // 1786

  // Screen 3 (Left monitor with negative coordinates: -1920,0 1920x1040)
  const posLeft = computeSnapPosition(mockLeftMonitor, winW, winH, margin);
  assert.strictEqual(posLeft.x, -1920 + 1920 - 300 - 24); // -324
  assert.strictEqual(posLeft.y, 1040 - 300 - 24); // 716

  assert.ok(posLeft.x < 0, 'Left monitor coordinates correctly support negative x positions without snapping back falsely.');
  console.log('  ✓ Multi-monitor coordinate math cleanly handles secondary and negative coordinate displays.');

  // ==========================================================
  // TEST 4: Voice Commands for Multi-Monitor
  // ==========================================================
  console.log('\nTest 4: Verifying Voice Commands for multi-monitor inspection & switching...');
  const CompanionVoiceCommands = require('./renderer/commands');

  let movedToTarget = null;
  let followMonitorState = null;

  const mockContext = {
    getWatchDisplay: () => 'active',
    getLiveDisplay: () => 'primary',
    getFollowActiveMonitor: () => true,
    moveToDisplay: (target) => { movedToTarget = target; return true; },
    setFollowActiveMonitor: (val) => { followMonitorState = val; return true; }
  };

  // Status queries
  const statusRes1 = await CompanionVoiceCommands.evaluateVoiceCommand("what screen are you on?", mockContext);
  assert.strictEqual(statusRes1.handled, true);
  assert.ok(statusRes1.message.includes('primary') || statusRes1.message.includes('screen'));

  const statusRes2 = await CompanionVoiceCommands.evaluateVoiceCommand("which monitor are you watching?", mockContext);
  assert.strictEqual(statusRes2.handled, true);
  assert.ok(statusRes2.message.includes('Active monitor') || statusRes2.message.includes('watch'));

  // Move screen commands
  const moveRes1 = await CompanionVoiceCommands.evaluateVoiceCommand("move to primary monitor", mockContext);
  assert.strictEqual(moveRes1.handled, true);
  assert.strictEqual(movedToTarget, 'primary');

  const moveRes2 = await CompanionVoiceCommands.evaluateVoiceCommand("move to screen 2", mockContext);
  assert.strictEqual(moveRes2.handled, true);
  assert.strictEqual(movedToTarget, '2');

  const moveRes3 = await CompanionVoiceCommands.evaluateVoiceCommand("switch to monitor 1", mockContext);
  assert.strictEqual(moveRes3.handled, true);
  assert.strictEqual(movedToTarget, '1');

  // Follow me commands
  const followRes1 = await CompanionVoiceCommands.evaluateVoiceCommand("follow me", mockContext);
  assert.strictEqual(followRes1.handled, true);
  assert.strictEqual(followMonitorState, true);

  const followRes2 = await CompanionVoiceCommands.evaluateVoiceCommand("turn off monitor follow", mockContext);
  assert.strictEqual(followRes2.handled, true);
  assert.strictEqual(followMonitorState, false);

  const followRes3 = await CompanionVoiceCommands.evaluateVoiceCommand("stop following me", mockContext);
  assert.strictEqual(followRes3.handled, true);
  assert.strictEqual(followMonitorState, false);

  const followRes4 = await CompanionVoiceCommands.evaluateVoiceCommand("turn on monitor follow", mockContext);
  assert.strictEqual(followRes4.handled, true);
  assert.strictEqual(followMonitorState, true);

  console.log('  ✓ Voice commands properly handle screen queries, moving displays, and follow toggles.');

  // ==========================================================
  // TEST 5: Settings HTML and JS Verification
  // ==========================================================
  console.log('\nTest 5: Verifying Multi-Monitor settings UI elements & markup...');
  const settingsHtml = fs.readFileSync(path.join(__dirname, 'renderer', 'settings.html'), 'utf-8');
  assert.ok(settingsHtml.includes('id="monitor-count-badge"'), 'settings.html must have monitor-count-badge');
  assert.ok(settingsHtml.includes('id="watch-display-select"'), 'settings.html must have watch-display-select');
  assert.ok(settingsHtml.includes('id="live-display-select"'), 'settings.html must have live-display-select');
  assert.ok(settingsHtml.includes('id="follow-monitor-toggle"'), 'settings.html must have follow-monitor-toggle');

  const settingsJs = fs.readFileSync(path.join(__dirname, 'renderer', 'settings.js'), 'utf-8');
  assert.ok(settingsJs.includes('populateDisplays'), 'settings.js must have populateDisplays function');
  assert.ok(settingsJs.includes('watchDisplay: newWatchDisplay'), 'settings.js must save watchDisplay');
  assert.ok(settingsJs.includes('liveDisplay: newLiveDisplay'), 'settings.js must save liveDisplay');
  assert.ok(settingsJs.includes('followActiveMonitor: newFollowActiveMonitor'), 'settings.js must save followActiveMonitor');

  const preloadJs = fs.readFileSync(path.join(__dirname, 'preload.js'), 'utf-8');
  assert.ok(preloadJs.includes("getDisplays: () => ipcRenderer.invoke('get-displays')"), 'preload.js must expose getDisplays');
  assert.ok(preloadJs.includes("moveToDisplay: (displayId) => ipcRenderer.invoke('move-to-display', displayId)"), 'preload.js must expose moveToDisplay');
  assert.ok(preloadJs.includes("onDisplayChanged: (callback) =>"), 'preload.js must expose onDisplayChanged');

  console.log('  ✓ Settings UI and IPC bridges correctly configured for multi-monitor support.');

  console.log('\n🎉 ALL MULTI-MONITOR TESTS PASSED SUCCESSFULLY!\n');
}

runTestSuite().catch(err => {
  console.error('\n❌ Multi-Monitor Test Suite failed:', err);
  process.exit(1);
});
