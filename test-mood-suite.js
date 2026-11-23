/**
 * Desktop AI Companion - Mood System Test Suite (test-mood-suite.js)
 * 
 * Verifies:
 * 1. Mood State Engine (calculateMood across time of day, focus sessions, engagement frequency, pauses).
 * 2. Absolute Subtlety & Zero Guilt-Tripping (zero fake emotional pressure, no manipulative language).
 * 3. Tone Shaping in AI System Prompts (Claude & Ollama local prompt injection).
 * 4. Visual Animations & Styles (.mood-focused, .mood-energetic, .mood-content, .mood-tranquil, .mood-sleepy).
 * 5. UI Elements & Menu Integration (index.html, context menu, settings window, scripts).
 * 6. Local Voice Commands ("how are you feeling?", "what's your mood?", "mood status").
 * 7. Packaging configuration in package.json.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const {
  COMPANION_MOODS,
  MOOD_PROMPTS,
  MOOD_BADGES,
  MOOD_REMARKS,
  calculateMood,
  getMoodRemark
} = require('./mood');

const {
  buildSystemPrompt,
  buildOllamaSystemPrompt
} = require('./api');

const {
  evaluateVoiceCommand
} = require('./renderer/commands');

let totalTests = 0;
let passedTests = 0;

function runTest(description, testFn) {
  totalTests++;
  try {
    testFn();
    passedTests++;
    console.log(`[PASS] ${description}`);
  } catch (err) {
    console.error(`[FAIL] ${description}`);
    console.error(`       Error: ${err.message}`);
  }
}

async function runAsyncTest(description, testFn) {
  totalTests++;
  try {
    await testFn();
    passedTests++;
    console.log(`[PASS] ${description}`);
  } catch (err) {
    console.error(`[FAIL] ${description}`);
    console.error(`       Error: ${err.message}`);
  }
}

console.log('====================================================');
console.log(' Desktop AI Companion - Mood System Test Suite');
console.log('====================================================\n');

// ------------------------------------------------------------------
// 1. Mood Engine Calculations
// ------------------------------------------------------------------
console.log('--- 1. Mood State Engine Calculations ---');

runTest('Active Pomodoro / Focus session always produces "focused" mood', () => {
  assert.strictEqual(calculateMood({ isFocusSession: true, hour: 14 }), COMPANION_MOODS.FOCUSED);
  assert.strictEqual(calculateMood({ isFocusSession: true, hour: 23 }), COMPANION_MOODS.FOCUSED);
  assert.strictEqual(calculateMood({ isFocusSession: true, hour: 4, engagementScore: 10 }), COMPANION_MOODS.FOCUSED);
});

runTest('Paused companion produces "sleepy" mood', () => {
  assert.strictEqual(calculateMood({ isPaused: true, hour: 14 }), COMPANION_MOODS.SLEEPY);
});

runTest('Idle yawn rest state produces "sleepy" mood', () => {
  assert.strictEqual(calculateMood({ isIdleYawn: true, hour: 10 }), COMPANION_MOODS.SLEEPY);
});

runTest('Late night hours (23:00 - 05:59) produce "sleepy" mood', () => {
  assert.strictEqual(calculateMood({ hour: 23 }), COMPANION_MOODS.SLEEPY);
  assert.strictEqual(calculateMood({ hour: 0 }), COMPANION_MOODS.SLEEPY);
  assert.strictEqual(calculateMood({ hour: 3 }), COMPANION_MOODS.SLEEPY);
  assert.strictEqual(calculateMood({ hour: 5 }), COMPANION_MOODS.SLEEPY);
});

runTest('Daytime hours (06:00 - 17:59) with high engagement produce "energetic" mood', () => {
  assert.strictEqual(calculateMood({ hour: 9, engagementScore: 5 }), COMPANION_MOODS.ENERGETIC);
  assert.strictEqual(calculateMood({ hour: 14, recentActivityScore: 4 }), COMPANION_MOODS.ENERGETIC);
});

runTest('Daytime hours (06:00 - 17:59) with baseline activity produce "content" mood', () => {
  assert.strictEqual(calculateMood({ hour: 10, engagementScore: 0, recentActivityScore: 0 }), COMPANION_MOODS.CONTENT);
  assert.strictEqual(calculateMood({ hour: 16, engagementScore: 1, recentActivityScore: 1 }), COMPANION_MOODS.CONTENT);
});

runTest('Evening hours (18:00 - 22:59) with high engagement produce "content" mood', () => {
  assert.strictEqual(calculateMood({ hour: 19, engagementScore: 4 }), COMPANION_MOODS.CONTENT);
  assert.strictEqual(calculateMood({ hour: 21, recentActivityScore: 3 }), COMPANION_MOODS.CONTENT);
});

runTest('Evening hours (18:00 - 22:59) with quiet rhythm produce "tranquil" mood', () => {
  assert.strictEqual(calculateMood({ hour: 19, engagementScore: 0, recentActivityScore: 0 }), COMPANION_MOODS.TRANQUIL);
  assert.strictEqual(calculateMood({ hour: 22, engagementScore: 1, recentActivityScore: 0 }), COMPANION_MOODS.TRANQUIL);
});

// ------------------------------------------------------------------
// 2. Absolute Subtlety & Zero Guilt-Tripping
// ------------------------------------------------------------------
console.log('\n--- 2. Subtlety & Zero Guilt-Tripping Verification ---');

runTest('All mood prompts & remarks contain ZERO guilt-tripping or manipulative words', () => {
  const guiltWords = [
    'sad', 'unhappy', 'lonely', 'miss you', 'guilt', 'ignoring me', 'ignore me',
    'why did you leave', 'abandoned', 'hurt', 'neglected', 'crying', 'depressed',
    'disappointed', 'upset with you', 'mad at you'
  ];

  const allStrings = [
    ...Object.values(MOOD_PROMPTS),
    ...Object.values(MOOD_REMARKS),
    ...Object.values(MOOD_BADGES).map(b => b.description)
  ];

  for (const str of allStrings) {
    const lower = str.toLowerCase();
    for (const gw of guiltWords) {
      assert.strictEqual(
        lower.includes(gw),
        false,
        `Forbidden guilt word "${gw}" found in text: "${str}"`
      );
    }
  }
});

runTest('MOOD_BADGES covers all 5 moods with icons and labels', () => {
  const moods = [
    COMPANION_MOODS.FOCUSED,
    COMPANION_MOODS.ENERGETIC,
    COMPANION_MOODS.CONTENT,
    COMPANION_MOODS.TRANQUIL,
    COMPANION_MOODS.SLEEPY
  ];
  for (const m of moods) {
    assert.ok(MOOD_BADGES[m], `Missing badge for mood ${m}`);
    assert.ok(MOOD_BADGES[m].label, `Missing label for mood ${m}`);
    assert.ok(MOOD_BADGES[m].icon, `Missing icon for mood ${m}`);
  }
});

runTest('getMoodRemark returns appropriate comforting spoken remark', () => {
  const remark = getMoodRemark('focused');
  assert.ok(remark.includes('focused'));
  const remarkSleepy = getMoodRemark('sleepy');
  assert.ok(remarkSleepy.includes('sleepy'));
});

// ------------------------------------------------------------------
// 3. Tone Shaping in System Prompts (Claude & Ollama)
// ------------------------------------------------------------------
console.log('\n--- 3. AI System Prompt Tone Directives ---');

runTest('buildSystemPrompt injects subtle mood directive for Claude', () => {
  const promptFocused = buildSystemPrompt({
    personality: 'friendly',
    mood: 'focused'
  });
  assert.ok(promptFocused.includes('[COMPANION MOOD - FOCUSED]'));
  assert.ok(promptFocused.includes('Your current mood is FOCUSED'));

  const promptEnergetic = buildSystemPrompt({
    personality: 'friendly',
    mood: 'energetic'
  });
  assert.ok(promptEnergetic.includes('[COMPANION MOOD - ENERGETIC]'));

  const promptTranquil = buildSystemPrompt({
    personality: 'friendly',
    mood: 'tranquil'
  });
  assert.ok(promptTranquil.includes('[COMPANION MOOD - TRANQUIL]'));
});

runTest('buildOllamaSystemPrompt injects subtle mood directive for Ollama', () => {
  const promptSleepy = buildOllamaSystemPrompt({
    personality: 'friendly',
    mood: 'sleepy'
  });
  assert.ok(promptSleepy.includes('[Mood: sleepy - Your current mood is SLEEPY'));

  const promptContent = buildOllamaSystemPrompt({
    personality: 'friendly',
    mood: 'content'
  });
  assert.ok(promptContent.includes('[Mood: content - Your current mood is CONTENT'));
});

// ------------------------------------------------------------------
// 4. Visual Styles & Keyframe Animations in style.css
// ------------------------------------------------------------------
console.log('\n--- 4. Visual Animations in style.css ---');

runTest('style.css contains all mood CSS classes and unique breathing animations', () => {
  const css = fs.readFileSync(path.join(__dirname, 'renderer', 'style.css'), 'utf8');

  assert.ok(css.includes('.mood-focused'), 'Missing .mood-focused in style.css');
  assert.ok(css.includes('.mood-energetic'), 'Missing .mood-energetic in style.css');
  assert.ok(css.includes('.mood-content'), 'Missing .mood-content in style.css');
  assert.ok(css.includes('.mood-tranquil'), 'Missing .mood-tranquil in style.css');
  assert.ok(css.includes('.mood-sleepy'), 'Missing .mood-sleepy in style.css');

  assert.ok(css.includes('@keyframes orbFocusedPulse'), 'Missing @keyframes orbFocusedPulse');
  assert.ok(css.includes('@keyframes orbEnergeticPulse'), 'Missing @keyframes orbEnergeticPulse');
  assert.ok(css.includes('@keyframes orbContentBreathe'), 'Missing @keyframes orbContentBreathe');
  assert.ok(css.includes('@keyframes orbTranquilFloat'), 'Missing @keyframes orbTranquilFloat');
  assert.ok(css.includes('@keyframes orbSleepyBreathe'), 'Missing @keyframes orbSleepyBreathe');
});

// ------------------------------------------------------------------
// 5. UI Elements & Integration
// ------------------------------------------------------------------
console.log('\n--- 5. UI Elements & Integration ---');

runTest('index.html contains mood script and context menu item', () => {
  const html = fs.readFileSync(path.join(__dirname, 'renderer', 'index.html'), 'utf8');
  assert.ok(html.includes('<script src="../mood.js"></script>'), 'Missing mood.js script in index.html');
  assert.ok(html.includes('id="menu-companion-mood"'), 'Missing #menu-companion-mood in index.html');
  assert.ok(html.includes('id="menu-mood-icon"'), 'Missing #menu-mood-icon in index.html');
  assert.ok(html.includes('id="menu-mood-text"'), 'Missing #menu-mood-text in index.html');
});

runTest('settings.html contains mood script and status indicators', () => {
  const html = fs.readFileSync(path.join(__dirname, 'renderer', 'settings.html'), 'utf8');
  assert.ok(html.includes('<script src="../mood.js"></script>'), 'Missing mood.js script in settings.html');
  assert.ok(html.includes('id="companion-mood-badge"'), 'Missing #companion-mood-badge in settings.html');
  assert.ok(html.includes('id="companion-mood-icon"'), 'Missing #companion-mood-icon in settings.html');
  assert.ok(html.includes('id="companion-mood-name"'), 'Missing #companion-mood-name in settings.html');
  assert.ok(html.includes('id="companion-mood-desc"'), 'Missing #companion-mood-desc in settings.html');
});

// ------------------------------------------------------------------
// 6. Local Voice Commands
// ------------------------------------------------------------------
console.log('\n--- 6. Voice Commands for Mood ---');

(async () => {
  await runAsyncTest('Voice command: "how are you feeling?" returns mood status', async () => {
    const res = await evaluateVoiceCommand('how are you feeling?', {
      getMoodInfo: () => ({
        mood: 'content',
        label: 'Content',
        icon: '🌱',
        remark: "I'm feeling content—just enjoying our steady work rhythm."
      })
    });
    assert.strictEqual(res.handled, true);
    assert.ok(res.badge.includes('Content'));
    assert.ok(res.message.includes('content'));
  });

  await runAsyncTest('Voice command: "what\'s your mood?" returns mood status', async () => {
    const res = await evaluateVoiceCommand("what's your mood?", {
      getMoodInfo: () => ({
        mood: 'focused',
        label: 'Focused',
        icon: '🎯',
        remark: "I'm feeling focused right now while you're in the zone."
      })
    });
    assert.strictEqual(res.handled, true);
    assert.ok(res.badge.includes('Focused'));
    assert.ok(res.message.includes('focused'));
  });

  await runAsyncTest('Voice command: "mood status" returns mood status', async () => {
    const res = await evaluateVoiceCommand('mood status', {
      getMoodInfo: () => ({
        mood: 'tranquil',
        label: 'Tranquil',
        icon: '🌙',
        remark: 'I\'m feeling tranquil and peaceful this evening.'
      })
    });
    assert.strictEqual(res.handled, true);
    assert.ok(res.badge.includes('Tranquil'));
  });

  await runAsyncTest('Voice command: "how are things going?" returns mood status', async () => {
    const res = await evaluateVoiceCommand('how are things going?', {
      getMoodInfo: () => ({
        mood: 'energetic',
        label: 'Energetic',
        icon: '⚡',
        remark: "I'm feeling energetic and ready for whatever you're working on!"
      })
    });
    assert.strictEqual(res.handled, true);
    assert.ok(res.badge.includes('Energetic'));
  });

  // ------------------------------------------------------------------
  // 7. Packaging Configuration
  // ------------------------------------------------------------------
  console.log('\n--- 7. Packaging Configuration ---');

  runTest('package.json includes mood.js in electron-builder build files', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
    assert.ok(pkg.build && pkg.build.files && pkg.build.files.includes('mood.js'), 'mood.js not in package.json build.files');
  });

  console.log('\n====================================================');
  console.log(` Results: ${passedTests} / ${totalTests} passed`);
  console.log('====================================================');

  if (passedTests !== totalTests) {
    process.exit(1);
  }
})();
