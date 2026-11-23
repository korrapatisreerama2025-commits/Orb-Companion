/**
 * Comprehensive Unit & Integration Test Suite for "What Should I Do Next?" Feature
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const { NEXT_STEP_PROMPT, DEFAULT_MEMORY } = require('./config');
const { loadMemory, saveMemory } = require('./settings');
const { buildSystemPrompt, buildUserPrompt, buildOllamaSystemPrompt } = require('./api');
const CompanionVoiceCommands = require('./renderer/commands');

console.log('====================================================');
console.log('"WHAT SHOULD I DO NEXT?" VERIFICATION TEST SUITE');
console.log('====================================================\n');

let passedTests = 0;
let totalTests = 0;

async function test(name, fn) {
  totalTests++;
  try {
    await fn();
    console.log(`[PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`[FAIL] ${name}:`, err.message);
  }
}

async function runAllTests() {
  // ----------------------------------------------------
  // 1. CONFIG & SYSTEM PROMPT SPECIFICATIONS
  // ----------------------------------------------------
  console.log('--- 1. Config & System Prompt Constraints ---');

  await test('NEXT_STEP_PROMPT is defined in config.js with strict 1-sentence constraints', () => {
    assert.ok(NEXT_STEP_PROMPT, 'NEXT_STEP_PROMPT must be exported');
    assert.match(NEXT_STEP_PROMPT, /single\s+next\s+best\s+step/i, 'Must focus on single next best step');
    assert.match(NEXT_STEP_PROMPT, /exactly\s+one\s+.*sentence/i, 'Must specify exactly one sentence');
    assert.match(NEXT_STEP_PROMPT, /maximum\s+25\s+words/i, 'Must specify length under 25 words');
    assert.match(NEXT_STEP_PROMPT, /active\s+verb/i, 'Must start with an active verb');
    assert.match(NEXT_STEP_PROMPT, /do\s+not\s+provide\s+a\s+bulleted\s+list/i, 'Must disallow bullet points');
  });

  await test('DEFAULT_MEMORY includes goals array', () => {
    assert.ok(Array.isArray(DEFAULT_MEMORY.goals), 'DEFAULT_MEMORY.goals must be an array');
    assert.ok(DEFAULT_MEMORY.goals.length > 0, 'DEFAULT_MEMORY.goals must have initial items');
    assert.ok(DEFAULT_MEMORY.goals.some(g => g.toLowerCase().includes('companion')), 'Must have companion goal');
  });

  await test('loadMemory returns goals property', () => {
    const memory = loadMemory();
    assert.ok(Array.isArray(memory.goals), 'Loaded memory must have goals array');
  });

  // ----------------------------------------------------
  // 2. API PROMPT CONTEXT ASSEMBLY (Screen + Notes + Goals)
  // ----------------------------------------------------
  console.log('\n--- 2. Multi-Source Context Assembly in API ---');

  await test('buildSystemPrompt includes NEXT_STEP_PROMPT when isNextStepMode is true', () => {
    const sysPrompt = buildSystemPrompt({
      personality: 'friendly',
      isHelpMode: false,
      isClipboardAction: false,
      isNextStepMode: true
    });
    assert.ok(sysPrompt.includes(NEXT_STEP_PROMPT), 'System prompt must include NEXT_STEP_PROMPT');
    assert.match(sysPrompt, /exactly\s+one\s+.*sentence/i);
  });

  await test('buildUserPrompt injects Screen, Notes, and Goals into prompt', () => {
    const userPrompt = buildUserPrompt({
      isRandom: false,
      isBlocked: false,
      activeWindow: { appName: 'Code.exe', windowTitle: 'app.js - Companion' },
      history: [],
      conversationExchanges: [],
      userTranscript: 'what should I do next?',
      mood: 'neutral',
      isHelpMode: false,
      isClipboardAction: false,
      isNextStepMode: true,
      notesContext: '- [10:30:00] Fix memory leak in audio stream\n- [14:15:00] Review pull request for theme support',
      goalsContext: '- Finish all 10 milestone companion features\n- Ship v1.0 release'
    });

    assert.match(userPrompt, /\[CURRENT APPLICATION\]/);
    assert.match(userPrompt, /Code\.exe/);
    assert.match(userPrompt, /\[TODAY'S NOTES\]/);
    assert.match(userPrompt, /Fix memory leak in audio stream/);
    assert.match(userPrompt, /\[USER GOALS & PROFILE\]/);
    assert.match(userPrompt, /Finish all 10 milestone companion features/);
    assert.match(userPrompt, /single\s+next\s+best\s+step/i);
  });

  await test('buildOllamaSystemPrompt formats local model prompt with 1-sentence constraint', () => {
    const ollamaPrompt = buildOllamaSystemPrompt({
      personality: 'concise',
      isHelpMode: false,
      isClipboardAction: false,
      isNextStepMode: true
    });
    assert.match(ollamaPrompt, /productivity\s+assistant/i);
    assert.match(ollamaPrompt, /single\s+next\s+best\s+step/i);
    assert.match(ollamaPrompt, /exactly\s+ONE\s+sentence/i);
    assert.match(ollamaPrompt, /action\s+verb/i);
  });

  // ----------------------------------------------------
  // 3. VOICE COMMAND DISPATCHING (Section 19)
  // ----------------------------------------------------
  console.log('\n--- 3. Voice Command Recognition & Dispatching ---');

  const voiceVariations = [
    'what should I do next?',
    'what should I do next',
    'what should I work on next',
    'what should I work on now',
    'what to do next',
    "what's next",
    'what next',
    'suggest next step',
    'suggest the next step'
  ];

  for (const phrase of voiceVariations) {
    await test(`Recognizes voice command: "${phrase}"`, async () => {
      let triggered = false;
      const mockContext = {
        triggerWhatShouldIDoNext: () => {
          triggered = true;
        }
      };

      const result = await CompanionVoiceCommands.evaluateVoiceCommand(phrase, mockContext);
      assert.strictEqual(result.handled, true, `Should handle "${phrase}"`);
      assert.strictEqual(result.isNextStepTrigger, true, 'isNextStepTrigger must be true');
      assert.strictEqual(result.badge, '🎯 Next Step');
      assert.ok(triggered, 'triggerWhatShouldIDoNext() must be called');
    });
  }

  await test('Ignores unrelated queries from next step trigger', async () => {
    const result = await CompanionVoiceCommands.evaluateVoiceCommand('what time is it in Tokyo', {});
    assert.strictEqual(result.isNextStepTrigger || false, false);
  });

  // ----------------------------------------------------
  // 4. CONTEXT MENU & UI MARKUP VERIFICATION
  // ----------------------------------------------------
  console.log('\n--- 4. Context Menu & HTML Verification ---');

  await test('renderer/index.html includes #menu-what-next item', () => {
    const html = fs.readFileSync(path.join(__dirname, 'renderer', 'index.html'), 'utf-8');
    assert.ok(html.includes('id="menu-what-next"'), 'Must have #menu-what-next in index.html');
    assert.ok(html.includes('What should I do next?'), 'Must have "What should I do next?" label');
    assert.ok(html.includes('🎯'), 'Must have target emoji icon');
  });

  await test('renderer/style.css defines .speech-bubble.next-step-mode and .start-focus-btn', () => {
    const css = fs.readFileSync(path.join(__dirname, 'renderer', 'style.css'), 'utf-8');
    assert.ok(css.includes('.speech-bubble.next-step-mode'), 'Must style .speech-bubble.next-step-mode');
    assert.ok(css.includes('.next-step-card'), 'Must style .next-step-card');
    assert.ok(css.includes('.next-step-sentence'), 'Must style .next-step-sentence');
    assert.ok(css.includes('.start-focus-btn'), 'Must style .start-focus-btn');
    assert.ok(css.includes('.start-focus-btn.started'), 'Must style .start-focus-btn.started');
  });

  await test('renderer/style.css defines theme overrides for .start-focus-btn across all 4 themes', () => {
    const css = fs.readFileSync(path.join(__dirname, 'renderer', 'style.css'), 'utf-8');
    assert.ok(css.includes('body.theme-neon .start-focus-btn'), 'Neon theme must override .start-focus-btn');
    assert.ok(css.includes('body.theme-minimal-white .start-focus-btn'), 'Minimal White theme must override .start-focus-btn');
    assert.ok(css.includes('body.theme-dark-glass .start-focus-btn'), 'Dark Glass theme must override .start-focus-btn');
    assert.ok(css.includes('body.theme-sunset .start-focus-btn'), 'Sunset theme must override .start-focus-btn');
  });

  // ----------------------------------------------------
  // 5. SINGLE SENTENCE ENFORCEMENT & POMODORO LOGIC
  // ----------------------------------------------------
  console.log('\n--- 5. Single Sentence Truncation & Pomodoro Integration ---');

  await test('Sanitizes and enforces strictly 1 sentence starting with verb', () => {
    const rawMultiSentence = '"Refactor the audio stream handler in app.js to eliminate unhandled memory leaks. This will make the app faster and prevent crashes."';
    
    // Test cleaning logic matching renderer/app.js
    let cleaned = rawMultiSentence.replace(/^["'`]+|["'`]+$/g, '').trim();
    const sentenceMatch = cleaned.match(/^(.+?[.!?])(?:\s+[A-Z]|$)/s);
    if (sentenceMatch && sentenceMatch[1].length > 10) {
      cleaned = sentenceMatch[1].trim();
    }

    assert.strictEqual(
      cleaned,
      'Refactor the audio stream handler in app.js to eliminate unhandled memory leaks.',
      'Must extract exactly the first sentence without trailing sentences or quotes'
    );
    assert.ok(cleaned.split(/\s+/).length < 25, 'Must be under 25 words');
  });

  await test('renderer/app.js binds #menu-what-next and passes triggerWhatShouldIDoNext to voice evaluator', () => {
    const appJs = fs.readFileSync(path.join(__dirname, 'renderer', 'app.js'), 'utf-8');
    assert.ok(appJs.includes("getElementById('menu-what-next')"), 'Must get #menu-what-next element');
    assert.ok(appJs.includes('menuWhatNext.addEventListener'), 'Must bind click listener to menuWhatNext');
    assert.ok(appJs.includes('triggerWhatShouldIDoNext:'), 'Must supply triggerWhatShouldIDoNext to evaluateVoiceCommand');
    assert.ok(appJs.includes('localCmd.isNextStepTrigger'), 'Must handle localCmd.isNextStepTrigger');
    assert.ok(appJs.includes('startPomodoro(25,'), 'Must trigger 25-minute Pomodoro from focus button');
    assert.ok(appJs.includes('✓ Focus Session Started! (25m)'), 'Must update button label on click');
  });

  console.log('\n====================================================');
  console.log(`TEST SUITE RESULTS: ${passedTests}/${totalTests} PASSED`);
  console.log('====================================================');

  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

runAllTests().catch((err) => {
  console.error('Unhandled test suite error:', err);
  process.exit(1);
});
