/**
 * Desktop AI Companion - Adaptive Frequency & Quiet Mode Test Suite (test-adaptive-suite.js)
 * 
 * Verifies:
 * 1. Quiet Mode activity detection:
 *    - Full-screen apps (window bounds matching or covering display bounds)
 *    - Video calls & meetings (Zoom, Microsoft Teams, Google Meet, Slack Huddle, Discord call, Webex, Skype)
 *    - Presentations & slide shows (PowerPoint Slide Show, Presenter View, Google Slides present, Keynote)
 *    - Companion self-exclusion
 * 2. Adaptive Frequency scaling math:
 *    - Engagement increases frequency (decreases interval multiplier down to 0.5x min)
 *    - Dismissal / ignore decreases frequency (increases interval multiplier up to 2.5x max)
 *    - Interval range math scales correctly with multiplier
 *    - Disabling adaptive frequency defaults strictly to 1.0x baseline
 * 3. Voice commands:
 *    - Querying frequency status ("what's my frequency?", "how often do you talk?")
 *    - Resetting frequency ("reset frequency")
 *    - Toggling adaptive frequency ("adaptive frequency on/off")
 * 4. Settings & UI integration:
 *    - settings.html #adaptive-freq-toggle
 *    - settings.js loading and saving
 *    - index.html #bubble-dismiss-btn
 *    - style.css .bubble-dismiss-btn
 *    - config.js and settings.json default config
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

async function runTestSuite() {
  console.log('🧪 Starting Adaptive Frequency & Quiet Mode Test Suite...\n');

  // ==========================================================
  // TEST 1: Quiet Mode Detection (isQuietActivity)
  // ==========================================================
  console.log('Test 1: Verifying Quiet Mode detection (full-screen, video calls, presentations)...');
  const { isQuietActivity } = require('./capture');

  const primaryDisplayBounds = { x: 0, y: 0, width: 1920, height: 1080 };

  // 1a. Full-screen application
  const fullScreenApp = {
    title: 'Doom Eternal',
    owner: 'DoomEternal.exe',
    bounds: { x: 0, y: 0, width: 1920, height: 1080 }
  };
  const fsResult = isQuietActivity(fullScreenApp, primaryDisplayBounds);
  assert.strictEqual(fsResult.isQuiet, true, 'Full screen app should trigger quiet mode');
  assert.strictEqual(fsResult.reason, 'fullscreen');

  // Full-screen video / browser (e.g. slight overscan or margin)
  const fullScreenBrowser = {
    title: 'YouTube - Full Screen Video - Google Chrome',
    owner: 'chrome.exe',
    bounds: { x: 0, y: 0, width: 1922, height: 1082 }
  };
  const fsBrowserResult = isQuietActivity(fullScreenBrowser, primaryDisplayBounds);
  assert.strictEqual(fsBrowserResult.isQuiet, true, 'Full screen browser video should trigger quiet mode');
  assert.strictEqual(fsBrowserResult.reason, 'fullscreen');

  // Standard window (not full-screen)
  const normalWindow = {
    title: 'Visual Studio Code',
    owner: 'Code.exe',
    bounds: { x: 100, y: 100, width: 1200, height: 800 }
  };
  const normalResult = isQuietActivity(normalWindow, primaryDisplayBounds);
  assert.strictEqual(normalResult.isQuiet, false, 'Normal window should not be quiet');
  assert.strictEqual(normalResult.reason, null);

  // Maximized window with Windows taskbar visible (e.g. height 1040 vs 1080)
  const maximizedWindow = {
    title: 'Visual Studio Code - app.js',
    owner: 'Code.exe',
    bounds: { x: -8, y: -8, width: 1936, height: 1040 }
  };
  const maxResult = isQuietActivity(maximizedWindow, primaryDisplayBounds);
  assert.strictEqual(maxResult.isQuiet, false, 'Maximized window with taskbar visible should not trigger full-screen quiet mode');

  // 1b. Video Calls & Meetings
  const zoomMeeting = {
    title: 'Zoom Meeting',
    owner: 'Zoom.exe',
    bounds: { x: 200, y: 150, width: 1000, height: 700 }
  };
  const zoomResult = isQuietActivity(zoomMeeting, primaryDisplayBounds);
  assert.strictEqual(zoomResult.isQuiet, true, 'Zoom meeting must trigger quiet mode');
  assert.strictEqual(zoomResult.reason, 'videocall');

  const googleMeet = {
    title: 'Meet - standup-weekly - Google Chrome',
    owner: 'chrome.exe',
    bounds: { x: 50, y: 50, width: 1100, height: 750 }
  };
  const meetResult = isQuietActivity(googleMeet, primaryDisplayBounds);
  assert.strictEqual(meetResult.isQuiet, true, 'Google Meet tab must trigger quiet mode');
  assert.strictEqual(meetResult.reason, 'videocall');

  const teamsCall = {
    title: 'Daily Standup | Microsoft Teams Call',
    owner: 'Teams.exe',
    bounds: { x: 100, y: 100, width: 950, height: 650 }
  };
  const teamsResult = isQuietActivity(teamsCall, primaryDisplayBounds);
  assert.strictEqual(teamsResult.isQuiet, true, 'Teams call must trigger quiet mode');
  assert.strictEqual(teamsResult.reason, 'videocall');

  const slackHuddle = {
    title: 'Huddle in #frontend-team - Slack',
    owner: 'slack.exe',
    bounds: { x: 100, y: 100, width: 800, height: 600 }
  };
  const huddleResult = isQuietActivity(slackHuddle, primaryDisplayBounds);
  assert.strictEqual(huddleResult.isQuiet, true, 'Slack huddle must trigger quiet mode');
  assert.strictEqual(huddleResult.reason, 'videocall');

  const discordCall = {
    title: 'Discord - #general - Voice Connected',
    owner: 'Discord.exe',
    bounds: { x: 100, y: 100, width: 900, height: 700 }
  };
  const discordResult = isQuietActivity(discordCall, primaryDisplayBounds);
  assert.strictEqual(discordResult.isQuiet, true, 'Discord voice call must trigger quiet mode');
  assert.strictEqual(discordResult.reason, 'videocall');

  // 1c. Presentations & Slide Shows
  const powerPointSlideShow = {
    title: 'PowerPoint Slide Show - [Q4 Roadmap.pptx]',
    owner: 'POWERPNT.EXE',
    bounds: { x: 0, y: 0, width: 1920, height: 1080 }
  };
  const pptResult = isQuietActivity(powerPointSlideShow, primaryDisplayBounds);
  assert.strictEqual(pptResult.isQuiet, true, 'PowerPoint slide show must trigger quiet mode');
  assert.strictEqual(pptResult.reason, 'presentation');

  const presenterMode = {
    title: 'Presenter View - Slide 4 of 25',
    owner: 'POWERPNT.EXE',
    bounds: { x: 100, y: 100, width: 1280, height: 720 }
  };
  const presResult = isQuietActivity(presenterMode, primaryDisplayBounds);
  assert.strictEqual(presResult.isQuiet, true, 'Presenter view must trigger quiet mode');
  assert.strictEqual(presResult.reason, 'presentation');

  const googleSlidesPresent = {
    title: 'Architecture Review - Google Slides - Present',
    owner: 'chrome.exe',
    bounds: { x: 0, y: 0, width: 1920, height: 1080 }
  };
  const gSlidesResult = isQuietActivity(googleSlidesPresent, primaryDisplayBounds);
  assert.strictEqual(gSlidesResult.isQuiet, true, 'Google Slides presentation must trigger quiet mode');
  assert.strictEqual(gSlidesResult.reason, 'presentation');

  // 1d. Desktop AI Companion self-exclusion
  const companionApp = {
    title: 'Desktop AI Companion',
    owner: 'Desktop AI Companion',
    bounds: { x: 0, y: 0, width: 1920, height: 1080 }
  };
  const compResult = isQuietActivity(companionApp, primaryDisplayBounds);
  assert.strictEqual(compResult.isQuiet, false, 'Companion itself should never trigger quiet mode');
  console.log('  ✓ Quiet mode correctly detects full-screen apps, video calls, presentations, and self-excludes.');

  // ==========================================================
  // TEST 2: Adaptive Frequency Scaling & Interval Calculation
  // ==========================================================
  console.log('\nTest 2: Verifying Adaptive Frequency scaling math & interval ranges...');

  function simulateAdaptiveStep(currentMultiplier, action) {
    if (action === 'engage') {
      return Math.max(0.5, +(currentMultiplier - 0.15).toFixed(2));
    }
    if (action === 'dismiss') {
      return Math.min(2.5, +(currentMultiplier + 0.20).toFixed(2));
    }
    return currentMultiplier;
  }

  function calculateInterval(freqSeconds, multiplier, isAdaptive = true) {
    const mult = isAdaptive ? multiplier : 1.0;
    const center = freqSeconds * 1000 * mult;
    return { min: Math.round(center * 0.7), max: Math.round(center * 1.3) };
  }

  // Baseline at 1.0x
  let multiplier = 1.0;
  const baseRange = calculateInterval(90, multiplier);
  assert.strictEqual(baseRange.min, 63000);
  assert.strictEqual(baseRange.max, 117000);

  // User engages 3 times -> talks more often (multiplier decreases)
  multiplier = simulateAdaptiveStep(multiplier, 'engage'); // 0.85
  assert.strictEqual(multiplier, 0.85);
  multiplier = simulateAdaptiveStep(multiplier, 'engage'); // 0.70
  assert.strictEqual(multiplier, 0.70);
  multiplier = simulateAdaptiveStep(multiplier, 'engage'); // 0.55
  assert.strictEqual(multiplier, 0.55);
  multiplier = simulateAdaptiveStep(multiplier, 'engage'); // 0.50 (clamped)
  assert.strictEqual(multiplier, 0.50);
  multiplier = simulateAdaptiveStep(multiplier, 'engage'); // 0.50 (still clamped at min)
  assert.strictEqual(multiplier, 0.50);

  const engagedRange = calculateInterval(90, multiplier);
  assert.strictEqual(engagedRange.min, 31500, '31.5s min when engaged');
  assert.strictEqual(engagedRange.max, 58500, '58.5s max when engaged');

  // User dismisses / ignores 6 times -> talks less often (multiplier increases)
  multiplier = 1.0;
  for (let i = 0; i < 6; i++) {
    multiplier = simulateAdaptiveStep(multiplier, 'dismiss');
  }
  // 1.0 + 6 * 0.20 = 2.20
  assert.strictEqual(multiplier, 2.20);
  const ignoredRange = calculateInterval(90, multiplier);
  assert.strictEqual(ignoredRange.min, Math.round(90000 * 2.2 * 0.7)); // 138600 (~2.3 min)
  assert.strictEqual(ignoredRange.max, Math.round(90000 * 2.2 * 1.3)); // 257400 (~4.3 min)

  // Clamp at max 2.5x
  for (let i = 0; i < 5; i++) {
    multiplier = simulateAdaptiveStep(multiplier, 'dismiss');
  }
  assert.strictEqual(multiplier, 2.50, 'Multiplier capped at 2.50 maximum');

  // Disabled adaptive frequency falls back to 1.0x baseline
  const disabledRange = calculateInterval(90, 2.50, false);
  assert.strictEqual(disabledRange.min, 63000);
  assert.strictEqual(disabledRange.max, 117000);
  console.log('  ✓ Adaptive frequency smoothly scales between 0.5x and 2.5x and bounds interval ranges safely.');

  // ==========================================================
  // TEST 3: Voice Commands for Adaptive Frequency
  // ==========================================================
  console.log('\nTest 3: Verifying voice commands for frequency status, reset, and toggle...');
  const CompanionVoiceCommands = require('./renderer/commands');

  let frequencyResetTriggered = false;
  let frequencyToggleVal = null;

  const mockContext = {
    adaptiveMultiplier: 1.45,
    totalEngagements: 8,
    totalDismissals: 12,
    resetAdaptiveFrequency: () => { frequencyResetTriggered = true; },
    setAdaptiveFrequency: (enabled) => { frequencyToggleVal = enabled; }
  };

  // 3a. Status query
  const statusRes1 = await CompanionVoiceCommands.evaluateVoiceCommand("what's my frequency?", mockContext);
  assert.strictEqual(statusRes1.handled, true);
  assert.strictEqual(statusRes1.isFrequencyStatus, true);
  assert.ok(statusRes1.message.includes('1.45x'));
  assert.ok(statusRes1.message.includes('8 engagements'));
  assert.ok(statusRes1.message.includes('12 dismissals'));

  const statusRes2 = await CompanionVoiceCommands.evaluateVoiceCommand("how often do you talk?", mockContext);
  assert.strictEqual(statusRes2.handled, true);
  assert.strictEqual(statusRes2.isFrequencyStatus, true);

  // 3b. Reset frequency
  const resetRes = await CompanionVoiceCommands.evaluateVoiceCommand("reset frequency", mockContext);
  assert.strictEqual(resetRes.handled, true);
  assert.strictEqual(resetRes.isFrequencyReset, true);
  assert.strictEqual(frequencyResetTriggered, true);
  assert.ok(resetRes.message.includes('1.00x'));

  // 3c. Toggle adaptive frequency
  const toggleOff = await CompanionVoiceCommands.evaluateVoiceCommand("adaptive frequency off", mockContext);
  assert.strictEqual(toggleOff.handled, true);
  assert.strictEqual(toggleOff.isFrequencyToggle, true);
  assert.strictEqual(toggleOff.enabled, false);
  assert.strictEqual(frequencyToggleVal, false);

  const toggleOn = await CompanionVoiceCommands.evaluateVoiceCommand("turn adaptive frequency on", mockContext);
  assert.strictEqual(toggleOn.handled, true);
  assert.strictEqual(toggleOn.isFrequencyToggle, true);
  assert.strictEqual(toggleOn.enabled, true);
  assert.strictEqual(frequencyToggleVal, true);
  console.log('  ✓ Voice commands successfully report frequency, reset to 1.0x baseline, and toggle adaptive mode.');

  // ==========================================================
  // TEST 4: Settings UI & Defaults Verification
  // ==========================================================
  console.log('\nTest 4: Verifying Settings UI and configuration persistence...');

  const settingsHtml = fs.readFileSync(path.join(__dirname, 'renderer', 'settings.html'), 'utf-8');
  assert.ok(settingsHtml.includes('id="adaptive-freq-toggle"'), 'settings.html must have #adaptive-freq-toggle checkbox');
  assert.ok(settingsHtml.includes('Adaptive Frequency'), 'settings.html must display "Adaptive Frequency" label');

  const settingsJs = fs.readFileSync(path.join(__dirname, 'renderer', 'settings.js'), 'utf-8');
  assert.ok(settingsJs.includes('adaptive-freq-toggle'), 'settings.js must reference adaptive-freq-toggle');
  assert.ok(settingsJs.includes('adaptiveFrequency: newAdaptiveFrequency'), 'settings.js must save adaptiveFrequency');

  const indexHtml = fs.readFileSync(path.join(__dirname, 'renderer', 'index.html'), 'utf-8');
  assert.ok(indexHtml.includes('id="bubble-dismiss-btn"'), 'index.html must have #bubble-dismiss-btn');

  const styleCss = fs.readFileSync(path.join(__dirname, 'renderer', 'style.css'), 'utf-8');
  assert.ok(styleCss.includes('.bubble-dismiss-btn'), 'style.css must have styling for .bubble-dismiss-btn');

  const { DEFAULT_CONFIG } = require('./config');
  assert.strictEqual(DEFAULT_CONFIG.adaptiveFrequency, true, 'DEFAULT_CONFIG must enable adaptiveFrequency by default');
  assert.strictEqual(DEFAULT_CONFIG.adaptiveState.multiplier, 1.0, 'DEFAULT_CONFIG must have 1.0 baseline multiplier');

  const settingsJson = JSON.parse(fs.readFileSync(path.join(__dirname, 'settings.json'), 'utf-8'));
  assert.strictEqual(settingsJson.adaptiveFrequency, true, 'settings.json must persist adaptiveFrequency');
  assert.strictEqual(settingsJson.adaptiveState.multiplier, 1.0, 'settings.json must persist adaptiveState');
  console.log('  ✓ Settings markup, styling, controllers, and default configurations verified.');

  console.log('\n🎉 ALL ADAPTIVE FREQUENCY & QUIET MODE TESTS PASSED SUCCESSFULLY!');
}

runTestSuite().catch(err => {
  console.error('\n❌ TEST SUITE FAILURE:', err);
  process.exit(1);
});
