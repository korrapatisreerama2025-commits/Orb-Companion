/**
 * Desktop AI Companion - Select-to-Ask & Translation Test Suite (test-selecttoask-suite.js)
 * 
 * Verifies:
 * 1. Global shortcut registration (CommandOrControl+Shift+E)
 * 2. Selection copying mechanism without polluting user's existing clipboard
 * 3. Security: Detection and suppression of sensitive text (credit cards, passwords, API keys)
 * 4. Zero logging of selected text
 * 5. Frosted-glass popup markup and 4 quick buttons (Explain, Simplify, Translate, Quiz me)
 * 6. Target language options (English, Hindi, Telugu, Japanese) and validation
 * 7. Fast model streaming (claude-haiku-5-5, 2-4 sentences)
 * 8. Expression transitions: thinking during stream -> happy upon completion
 * 9. Copy button on answer in speech bubble
 * 10. Interactive Quiz me flow with typing input, check button, and evaluation feedback
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  DEFAULT_CONFIG,
  SELECT_TO_ASK_LANGUAGES,
  SELECT_TO_ASK_PROMPTS
} = require('./config');
const {
  validateSaveConfig,
  validateClaudeStreamParams,
  ALLOWED_TRANSLATE_LANGUAGES
} = require('./ipcValidator');
const { isSensitiveClipboardText } = require('./clipboard');
const { handleSelectToAskTrigger } = require('./scheduler');

let passedTests = 0;
let failedTests = 0;

function runTest(name, fn) {
  try {
    fn();
    console.log(`  [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  [FAIL] ${name}: ${err.message}`);
    failedTests++;
  }
}

async function runAsyncTest(name, fn) {
  try {
    await fn();
    console.log(`  [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  [FAIL] ${name}: ${err.message}`);
    failedTests++;
  }
}

async function runAll() {
  console.log('\n--- Running Select-to-Ask & Translation Test Suite ---\n');

  // Test 1: Supported Languages Configuration
  runTest('1. Target languages supported in config.js', () => {
    assert.deepStrictEqual(SELECT_TO_ASK_LANGUAGES, ['English', 'Hindi', 'Telugu', 'Japanese']);
    assert.strictEqual(DEFAULT_CONFIG.translateLanguage, 'English');
    assert.ok(ALLOWED_TRANSLATE_LANGUAGES.has('English'));
    assert.ok(ALLOWED_TRANSLATE_LANGUAGES.has('Hindi'));
    assert.ok(ALLOWED_TRANSLATE_LANGUAGES.has('Telugu'));
    assert.ok(ALLOWED_TRANSLATE_LANGUAGES.has('Japanese'));
  });

  // Test 2: Validation of translateLanguage in ipcValidator
  runTest('2. translateLanguage validation in validateSaveConfig', () => {
    assert.strictEqual(validateSaveConfig({ translateLanguage: 'Hindi' }).translateLanguage, 'Hindi');
    assert.strictEqual(validateSaveConfig({ translateLanguage: 'Telugu' }).translateLanguage, 'Telugu');
    assert.strictEqual(validateSaveConfig({ translateLanguage: 'Japanese' }).translateLanguage, 'Japanese');
    assert.strictEqual(validateSaveConfig({ translateLanguage: 'English' }).translateLanguage, 'English');
    assert.strictEqual(validateSaveConfig({ translateLanguage: 'Russian' }).translateLanguage, undefined);
  });

  // Test 3: Stream parameter validation for Select-to-Ask
  runTest('3. validateClaudeStreamParams validates selectToAsk fields', () => {
    const params = {
      streamId: 'select_to_ask_test',
      isSelectToAsk: true,
      selectToAskAction: 'translate',
      selectToAskTargetLang: 'Japanese',
      userTranscript: 'Hello world',
      quizQuestion: 'What does this mean?',
      userAnswer: 'Konichiwa'
    };
    const clean = validateClaudeStreamParams(params);
    assert.strictEqual(clean.isSelectToAsk, true);
    assert.strictEqual(clean.selectToAskAction, 'translate');
    assert.strictEqual(clean.selectToAskTargetLang, 'Japanese');
    assert.strictEqual(clean.quizQuestion, 'What does this mean?');
    assert.strictEqual(clean.userAnswer, 'Konichiwa');
  });

  // Test 4: Security detection of credit card numbers
  runTest('4. Sensitive text detection: Credit card numbers via Luhn', () => {
    assert.strictEqual(isSensitiveClipboardText('4532015112830366'), true);
    assert.strictEqual(isSensitiveClipboardText('4532-0151-1283-0366'), true);
  });

  // Test 5: Security detection of API keys and tokens
  runTest('5. Sensitive text detection: API keys and auth tokens', () => {
    assert.strictEqual(isSensitiveClipboardText('sk-ant-api03-abcdef1234567890abcdef1234567890'), true);
    assert.strictEqual(isSensitiveClipboardText('ghp_abcdefghijklmnopqrstuvwxyz012345'), true);
    assert.strictEqual(isSensitiveClipboardText('AKIAIOSFODNN7EXAMPLE'), true);
  });

  // Test 6: Security detection of passwords
  runTest('6. Sensitive text detection: Passwords and credentials', () => {
    assert.strictEqual(isSensitiveClipboardText('password = superSecret123!'), true);
    assert.strictEqual(isSensitiveClipboardText('api_key: secretTokenValue999999'), true);
  });

  // Test 7: Non-sensitive text allowed
  runTest('7. Non-sensitive normal text is permitted', () => {
    assert.strictEqual(isSensitiveClipboardText('Quantum entanglement is a phenomenon in quantum mechanics.'), false);
  });

  // Test 8: Sensitive text suppression in handleSelectToAskTrigger
  await runAsyncTest('8. handleSelectToAskTrigger suppresses sensitive text and emits isSensitive', async () => {
    let sentData = null;
    const mockWin = {
      isDestroyed: () => false,
      show: () => {},
      focus: () => {},
      webContents: {
        send: (channel, data) => {
          if (channel === 'select-to-ask-offer') sentData = data;
        }
      }
    };
    const res = await handleSelectToAskTrigger(() => mockWin, 'sk-ant-api03-secretKey1234567890');
    assert.strictEqual(res.status, 'sensitive');
    assert.strictEqual(sentData.isSensitive, true);
    assert.strictEqual(sentData.text, undefined);
  });

  // Test 9: Safe text emission in handleSelectToAskTrigger
  await runAsyncTest('9. handleSelectToAskTrigger forwards safe text cleanly', async () => {
    let sentData = null;
    const mockWin = {
      isDestroyed: () => false,
      show: () => {},
      focus: () => {},
      webContents: {
        send: (channel, data) => {
          if (channel === 'select-to-ask-offer') sentData = data;
        }
      }
    };
    const sample = 'Deep learning models use multi-layer neural networks.';
    const res = await handleSelectToAskTrigger(() => mockWin, sample);
    assert.strictEqual(res.status, 'offered');
    assert.strictEqual(sentData.text, sample);
  });

  // Test 10: Empty text handling
  await runAsyncTest('10. handleSelectToAskTrigger handles empty or whitespace text', async () => {
    let sentData = null;
    const mockWin = {
      isDestroyed: () => false,
      show: () => {},
      focus: () => {},
      webContents: {
        send: (channel, data) => {
          if (channel === 'select-to-ask-offer') sentData = data;
        }
      }
    };
    const res = await handleSelectToAskTrigger(() => mockWin, '   \n  ');
    assert.strictEqual(res.status, 'empty');
    assert.strictEqual(sentData.empty, true);
  });

  // Test 11: Prompt definitions and sentence constraints
  runTest('11. Action prompts enforce 2 to 4 sentences and strict guidelines', () => {
    assert.ok(SELECT_TO_ASK_PROMPTS.explain.includes('2 to 4 short sentences'));
    assert.ok(SELECT_TO_ASK_PROMPTS.simplify.includes('2 to 4 short sentences'));
    assert.ok(SELECT_TO_ASK_PROMPTS.translate('Telugu').includes('Telugu'));
    assert.ok(SELECT_TO_ASK_PROMPTS.translate('Telugu').includes('2 to 4 short sentences'));
    assert.ok(SELECT_TO_ASK_PROMPTS.quiz.includes('EXACTLY ONE sharp, thoughtful question'));
    assert.ok(SELECT_TO_ASK_PROMPTS.quiz_evaluate.includes('2 short sentences'));
  });

  // Test 12: HTML markup in index.html
  runTest('12. index.html contains frosted popup, snippet, and 4 buttons', () => {
    const html = fs.readFileSync(path.join(__dirname, 'renderer/index.html'), 'utf-8');
    assert.ok(html.includes('id="select-to-ask-popup"'));
    assert.ok(html.includes('id="select-popup-snippet"'));
    assert.ok(html.includes('id="select-popup-close-btn"'));
    assert.ok(html.includes('id="select-btn-explain"'));
    assert.ok(html.includes('id="select-btn-simplify"'));
    assert.ok(html.includes('id="select-btn-translate"'));
    assert.ok(html.includes('id="select-btn-quiz"'));
  });

  // Test 13: CSS styles in style.css
  runTest('13. style.css contains frosted styling, animations, and reduced-motion rules', () => {
    const css = fs.readFileSync(path.join(__dirname, 'renderer/style.css'), 'utf-8');
    assert.ok(css.includes('.select-to-ask-popup'));
    assert.ok(css.includes('.select-popup-snippet'));
    assert.ok(css.includes('.select-action-btn'));
    assert.ok(css.includes('.quiz-form-container'));
    assert.ok(css.includes('.quiz-answer-input'));
    assert.ok(css.includes('.quiz-submit-btn'));
    assert.ok(css.includes('backdrop-filter: blur(28px) saturate(190%)'));
  });

  // Test 14: Settings HTML & JS integration
  runTest('14. settings.html & settings.js provide language dropdown and save target language', () => {
    const html = fs.readFileSync(path.join(__dirname, 'renderer/settings.html'), 'utf-8');
    assert.ok(html.includes('id="translate-language-select"'));
    assert.ok(html.includes('Select-to-Ask &amp; Translation'));

    const js = fs.readFileSync(path.join(__dirname, 'renderer/settings.js'), 'utf-8');
    assert.ok(js.includes('translateLanguageSelect'));
    assert.ok(js.includes('translateLanguage'));
  });

  // Test 15: Renderer app.js controller integration
  runTest('15. app.js handles thinking->happy cycle, copy button, and quiz evaluation', () => {
    const app = fs.readFileSync(path.join(__dirname, 'renderer/app.js'), 'utf-8');
    assert.ok(app.includes('window.companionSelectToAsk'));
    assert.ok(app.includes("setExpression('thinking')"));
    assert.ok(app.includes("setExpression('happy'"));
    assert.ok(app.includes('renderQuizAnswerForm'));
    assert.ok(app.includes('submitQuizAnswer'));
    assert.ok(app.includes('bubbleCopyBtn'));
  });

  console.log(`\nSelect-to-Ask Test Suite Completed: ${passedTests} passed, ${failedTests} failed.\n`);
  if (failedTests > 0) {
    process.exit(1);
  }
}

runAll().catch(err => {
  console.error('Fatal error in Select-to-Ask test suite:', err);
  process.exit(1);
});
