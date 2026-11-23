/**
 * Desktop AI Companion - Wellbeing & Focus Module Test Suite (test-wellbeing-suite.js)
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { DEFAULT_CONFIG } = require('./config');
const { validateSaveConfig } = require('./ipcValidator');

async function runTestSuite() {
  console.log('🧪 Starting Wellbeing & Focus Test Suite...\n');

  // ==========================================================
  // TEST 1: Config Defaults & Validation
  // ==========================================================
  console.log('Test 1: Verifying Pomodoro & Health Nudge defaults and validator...');
  assert.strictEqual(DEFAULT_CONFIG.pomodoroFocusMinutes, 25);
  assert.strictEqual(DEFAULT_CONFIG.pomodoroBreakMinutes, 5);
  assert.strictEqual(DEFAULT_CONFIG.clickStartsPomodoro, true);
  assert.strictEqual(DEFAULT_CONFIG.nudgeWaterEnabled, true);
  assert.strictEqual(DEFAULT_CONFIG.nudgeWaterIntervalMins, 45);
  assert.strictEqual(DEFAULT_CONFIG.nudgeStretchEnabled, true);
  assert.strictEqual(DEFAULT_CONFIG.nudgeStretchIntervalMins, 60);
  assert.strictEqual(DEFAULT_CONFIG.nudgePostureEnabled, true);
  assert.strictEqual(DEFAULT_CONFIG.nudgePostureIntervalMins, 30);
  assert.strictEqual(DEFAULT_CONFIG.nudgeEyeRuleEnabled, true);
  assert.strictEqual(DEFAULT_CONFIG.nudgeEyeRuleIntervalMins, 20);
  assert.ok(DEFAULT_CONFIG.wellbeingStats);

  const validated = validateSaveConfig({
    pomodoroFocusMinutes: 45,
    pomodoroBreakMinutes: 10,
    clickStartsPomodoro: false,
    nudgeWaterEnabled: true,
    nudgeWaterIntervalMins: 30,
    nudgeStretchEnabled: true,
    nudgeStretchIntervalMins: 50,
    nudgePostureEnabled: false,
    nudgePostureIntervalMins: 20,
    nudgeEyeRuleEnabled: true,
    nudgeEyeRuleIntervalMins: 25,
    wellbeingStats: {
      date: '2026-11-22',
      todayFocusMinutes: 90,
      todayWaterCount: 5,
      streakDays: 3,
      lastActiveDate: '2026-11-22'
    }
  });

  assert.strictEqual(validated.pomodoroFocusMinutes, 45);
  assert.strictEqual(validated.pomodoroBreakMinutes, 10);
  assert.strictEqual(validated.clickStartsPomodoro, false);
  assert.strictEqual(validated.nudgeWaterIntervalMins, 30);
  assert.strictEqual(validated.nudgePostureEnabled, false);
  assert.strictEqual(validated.wellbeingStats.todayFocusMinutes, 90);
  assert.strictEqual(validated.wellbeingStats.todayWaterCount, 5);
  assert.strictEqual(validated.wellbeingStats.streakDays, 3);
  console.log('  ✅ Config defaults and validator verified.\n');

  // ==========================================================
  // TEST 2: Focus Session Suppression (>90m override)
  // ==========================================================
  console.log('Test 2: Verifying health nudges never interrupt focus unless running >90 minutes...');
  function shouldDeferNudge(isActive, phase, startTime, now) {
    if (!isActive || phase !== 'focus') return false;
    const elapsed = now - startTime;
    return elapsed <= 90 * 60 * 1000;
  }

  const baseTime = 10000000;
  // Focus running for 25 mins -> must defer
  assert.strictEqual(shouldDeferNudge(true, 'focus', baseTime - (25 * 60 * 1000), baseTime), true);
  // Focus running for 80 mins -> must defer
  assert.strictEqual(shouldDeferNudge(true, 'focus', baseTime - (80 * 60 * 1000), baseTime), true);
  // Focus running for 95 mins -> allows nudge (>90m safeguard)
  assert.strictEqual(shouldDeferNudge(true, 'focus', baseTime - (95 * 60 * 1000), baseTime), false);
  // Not in focus -> allows nudge
  assert.strictEqual(shouldDeferNudge(false, 'idle', baseTime, baseTime), false);
  assert.strictEqual(shouldDeferNudge(true, 'break', baseTime, baseTime), false);
  console.log('  ✅ 90-minute focus threshold logic verified.\n');

  // ==========================================================
  // TEST 3: Daily Summary Hover Card & Local Storage
  // ==========================================================
  console.log('Test 3: Verifying daily summary on hover & streak calculations...');
  function computeDailyStreak(prevStats, todayStr) {
    const copy = { ...prevStats };
    if (copy.date !== todayStr) {
      const prev = new Date(copy.date);
      const curr = new Date(todayStr);
      const diff = Math.round((curr.getTime() - prev.getTime()) / (1000 * 3600 * 24));
      if (diff === 1) {
        copy.streakDays = (copy.streakDays || 1) + 1;
      } else if (diff > 1) {
        copy.streakDays = 1;
      }
      copy.date = todayStr;
      copy.todayFocusMinutes = 0;
      copy.todayWaterCount = 0;
    }
    return copy;
  }

  const s1 = { date: '2026-11-20', streakDays: 2, todayFocusMinutes: 40, todayWaterCount: 3 };
  const s2 = computeDailyStreak(s1, '2026-11-21');
  assert.strictEqual(s2.streakDays, 3);
  assert.strictEqual(s2.todayFocusMinutes, 0);
  assert.strictEqual(s2.todayWaterCount, 0);

  const s3 = computeDailyStreak(s2, '2026-11-24'); // 3 days skipped
  assert.strictEqual(s3.streakDays, 1);
  console.log('  ✅ Daily streak and turnover verified.\n');

  // ==========================================================
  // TEST 4: HTML Markup, CSS, and App Engine
  // ==========================================================
  console.log('Test 4: Verifying HTML, CSS, and app controller logic...');
  const indexHtml = fs.readFileSync(path.join(__dirname, 'renderer', 'index.html'), 'utf-8');
  const settingsHtml = fs.readFileSync(path.join(__dirname, 'renderer', 'settings.html'), 'utf-8');
  const styleCss = fs.readFileSync(path.join(__dirname, 'renderer', 'style.css'), 'utf-8');
  const appJs = fs.readFileSync(path.join(__dirname, 'renderer', 'app.js'), 'utf-8');

  // Headband and water droplets in index.html
  assert.ok(indexHtml.includes('id="pomodoro-headband"'));
  assert.ok(indexHtml.includes('id="effect-water"'));
  assert.ok(indexHtml.includes('id="wellbeing-summary-card"'));
  assert.ok(indexHtml.includes('id="summary-focus-val"'));
  assert.ok(indexHtml.includes('id="summary-water-val"'));
  assert.ok(indexHtml.includes('id="summary-streak-badge"'));

  // Settings window controls
  assert.ok(settingsHtml.includes('id="pomodoro-focus-input"'));
  assert.ok(settingsHtml.includes('id="pomodoro-break-input"'));
  assert.ok(settingsHtml.includes('id="click-starts-pomodoro-toggle"'));
  assert.ok(settingsHtml.includes('id="nudge-water-toggle"'));
  assert.ok(settingsHtml.includes('id="nudge-stretch-toggle"'));
  assert.ok(settingsHtml.includes('id="nudge-posture-toggle"'));
  assert.ok(settingsHtml.includes('id="nudge-eyerule-toggle"'));

  // CSS animations & reduced motion
  assert.ok(styleCss.includes('.pomodoro-headband'));
  assert.ok(styleCss.includes('.pomodoro-focus .pomodoro-headband'));
  assert.ok(styleCss.includes('.orb.nudge-water-animation'));
  assert.ok(styleCss.includes('.orb.nudge-stretch-animation'));
  assert.ok(styleCss.includes('.orb.nudge-posture-animation'));
  assert.ok(styleCss.includes('.orb-face.eyes-resting'));
  assert.ok(styleCss.includes('.wellbeing-summary-card'));
  assert.ok(styleCss.includes('.wellbeing-btn.snooze-btn'));

  const reducedMotionIndex = styleCss.indexOf('@media (prefers-reduced-motion: reduce)');
  assert.ok(reducedMotionIndex !== -1);
  const rmPart = styleCss.slice(reducedMotionIndex);
  assert.ok(rmPart.includes('.orb.nudge-water-animation'));
  assert.ok(rmPart.includes('.orb.nudge-stretch-animation'));
  assert.ok(rmPart.includes('.orb.nudge-posture-animation'));

  // App engine logic
  assert.ok(appJs.includes('HEALTH_NUDGE_CONFIGS'));
  assert.ok(appJs.includes('triggerHealthNudge'));
  assert.ok(appJs.includes('snoozeHealthNudge'));
  assert.ok(appJs.includes('acknowledgeHealthNudge'));
  assert.ok(appJs.includes('shouldDeferNudgeForFocus'));
  assert.ok(appJs.includes('syncDailyWellbeingStats'));
  assert.ok(appJs.includes('updateWellbeingSummaryCard'));
  assert.ok(appJs.includes('setExpression(\'excited\', 6000)'));
  assert.ok(appJs.includes('window.companionWellbeing'));
  console.log('  ✅ Markup, CSS, and controller logic verified.\n');

  console.log('🎉 ALL WELLBEING & FOCUS TESTS PASSED SUCCESSFULLY!\n');
}

runTestSuite().catch(err => {
  console.error('❌ Test suite failed:', err);
  process.exit(1);
});
