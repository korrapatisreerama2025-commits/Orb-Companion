/**
 * Desktop AI Companion - Comprehensive Clipboard Awareness Verification Test Suite
 */

const assert = require('assert');
const {
  isLuhnValid,
  isSensitiveClipboardText,
  classifyClipboardContent
} = require('./clipboard');
const { loadConfig, saveConfig } = require('./settings');
const { DEFAULT_CONFIG } = require('./config');

console.log('====================================================');
console.log('CLIPBOARD AWARENESS VERIFICATION TEST SUITE');
console.log('====================================================\n');

let passedTests = 0;
let totalTests = 0;

function test(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`[PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`[FAIL] ${name}:`, err.message);
  }
}

// ----------------------------------------------------
// 1. PRIVACY & SECURITY: REJECT CREDIT CARDS
// ----------------------------------------------------
console.log('--- 1. Credit Card Privacy Rejection ---');

test('Rejects Visa (16-digit Luhn valid)', () => {
  assert.strictEqual(isSensitiveClipboardText('4532 0150 1234 5678'), true);
});

test('Rejects Mastercard (dashed Luhn valid)', () => {
  assert.strictEqual(isSensitiveClipboardText('5425-2334-3010-9903'), true);
});

test('Rejects Amex (15-digit 4-6-5 format)', () => {
  assert.strictEqual(isSensitiveClipboardText('3782 822463 10005'), true);
});

test('Rejects contiguous 16-digit card number', () => {
  assert.strictEqual(isSensitiveClipboardText('4532015012345678'), true);
});

// ----------------------------------------------------
// 2. PRIVACY & SECURITY: REJECT PASSWORDS & SECRETS
// ----------------------------------------------------
console.log('\n--- 2. Password & Secret Rejection ---');

test('Rejects key-value password field', () => {
  assert.strictEqual(isSensitiveClipboardText('password = SuperSecretPass123!'), true);
  assert.strictEqual(isSensitiveClipboardText('passwd: MyP@ssw0rd!'), true);
  assert.strictEqual(isSensitiveClipboardText('client_secret = 99a8b7c6d5e4'), true);
});

test('Rejects Bearer auth token', () => {
  assert.strictEqual(isSensitiveClipboardText('Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.t-IDcSemACt8x4iTMCda8Yhe3iZaWbvV5XKSTbuAn0M'), true);
});

test('Rejects Anthropic API Key', () => {
  assert.strictEqual(isSensitiveClipboardText('sk-ant-api03-abcdef1234567890abcdef1234567890'), true);
});

test('Rejects GitHub Personal Access Token', () => {
  assert.strictEqual(isSensitiveClipboardText('ghp_abcdefghijklmnopqrstuvwxyz0123456789'), true);
});

test('Rejects Private Key block', () => {
  const pem = '-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA0...\n-----END RSA PRIVATE KEY-----';
  assert.strictEqual(isSensitiveClipboardText(pem), true);
});

test('Rejects High-entropy single secret token', () => {
  assert.strictEqual(isSensitiveClipboardText('K9#m$P2!wQ8&zR1'), true);
  assert.strictEqual(isSensitiveClipboardText('aB3!dE5#gH7$jK9%'), true);
});

// ----------------------------------------------------
// 3. CONTENT CLASSIFICATION: ERRORS
// ----------------------------------------------------
console.log('\n--- 3. Error Classification ---');

test('Classifies JavaScript TypeError stack trace', () => {
  const errText = `TypeError: Cannot read properties of undefined (reading 'map')
    at renderItems (C:\\Users\\Korra\\project\\index.js:52:19)
    at Object.run (C:\\Users\\Korra\\project\\index.js:80:5)`;
  const res = classifyClipboardContent(errText);
  assert.ok(res);
  assert.strictEqual(res.type, 'error');
  assert.strictEqual(res.badge, 'Copied Error');
  assert.strictEqual(res.primaryAction, 'Fix it?');
  assert.strictEqual(res.secondaryAction, 'Explain error?');
});

test('Classifies Python Exception traceback', () => {
  const pyErr = `Traceback (most recent call last):
  File "main.py", line 42, in <module>
    calculate_metrics(dataset)
ZeroDivisionError: division by zero`;
  const res = classifyClipboardContent(pyErr);
  assert.ok(res);
  assert.strictEqual(res.type, 'error');
  assert.strictEqual(res.primaryAction, 'Fix it?');
});

test('Classifies Go runtime panic', () => {
  const goErr = `panic: runtime error: index out of range [5] with length 3
goroutine 1 [running]:
main.processSlice(0xc0000a6000, 0x3, 0x3)
    /home/user/app/main.go:28 +0x3f`;
  const res = classifyClipboardContent(goErr);
  assert.ok(res);
  assert.strictEqual(res.type, 'error');
});

// ----------------------------------------------------
// 4. CONTENT CLASSIFICATION: CODE SNIPPETS
// ----------------------------------------------------
console.log('\n--- 4. Code Snippet Classification ---');

test('Classifies JavaScript function', () => {
  const code = `function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}`;
  const res = classifyClipboardContent(code);
  assert.ok(res);
  assert.strictEqual(res.type, 'code');
  assert.strictEqual(res.badge, 'Copied Code');
  assert.strictEqual(res.primaryAction, 'Explain this?');
  assert.strictEqual(res.secondaryAction, 'Fix it?');
});

test('Classifies Python class definition', () => {
  const pyCode = `class DataProcessor:
    def __init__(self, data):
        self.data = data

    def process(self):
        return [x * 2 for x in self.data if x > 0]`;
  const res = classifyClipboardContent(pyCode);
  assert.ok(res);
  assert.strictEqual(res.type, 'code');
  assert.strictEqual(res.primaryAction, 'Explain this?');
});

test('Classifies SQL query', () => {
  const sql = `SELECT user_id, count(*), sum(amount)
FROM transactions
WHERE status = 'completed' AND created_at >= '2026-01-01'
GROUP BY user_id;`;
  const res = classifyClipboardContent(sql);
  assert.ok(res);
  assert.strictEqual(res.type, 'code');
});

// ----------------------------------------------------
// 5. CONTENT CLASSIFICATION: LONG TEXT
// ----------------------------------------------------
console.log('\n--- 5. Long Text Classification ---');

test('Classifies long informative article paragraph', () => {
  const article = `The event horizon telescope collaboration has published high-resolution polarization maps of the supermassive black hole at the center of the Messier 87 galaxy, providing crucial observational constraints on magnetic field structures and relativistic plasma accretion dynamics in extreme gravitational regimes.`;
  const res = classifyClipboardContent(article);
  assert.ok(res);
  assert.strictEqual(res.type, 'longtext');
  assert.strictEqual(res.badge, 'Copied Text');
  assert.strictEqual(res.primaryAction, 'Summarize?');
  assert.strictEqual(res.secondaryAction, null);
});

// ----------------------------------------------------
// 6. TRIVIAL / SHORT TEXT IGNORED
// ----------------------------------------------------
console.log('\n--- 6. Trivial Text Ignored ---');

test('Ignores short greeting', () => {
  assert.strictEqual(classifyClipboardContent('Hello there'), null);
});

test('Ignores single file path', () => {
  assert.strictEqual(classifyClipboardContent('C:\\Users\\Korra\\file.txt'), null);
});

test('Ignores short url', () => {
  assert.strictEqual(classifyClipboardContent('https://example.com'), null);
});

// ----------------------------------------------------
// 7. OPT-IN CONFIGURATION & PERSISTENCE
// ----------------------------------------------------
console.log('\n--- 7. Configuration & Defaults ---');

test('Default configuration has clipboardAwareness disabled (opt-in)', () => {
  assert.strictEqual(DEFAULT_CONFIG.clipboardAwareness, false);
});

test('loadConfig guarantees clipboardAwareness flag', () => {
  const cfg = loadConfig();
  assert.strictEqual(typeof cfg.clipboardAwareness, 'boolean');
});

test('saveConfig updates and persists clipboardAwareness', () => {
  const initial = loadConfig().clipboardAwareness;
  
  // Toggle on
  const updated1 = saveConfig({ clipboardAwareness: true });
  assert.strictEqual(updated1.clipboardAwareness, true);
  assert.strictEqual(loadConfig().clipboardAwareness, true);

  // Restore to initial state (false)
  const updated2 = saveConfig({ clipboardAwareness: initial });
  assert.strictEqual(updated2.clipboardAwareness, initial);
  assert.strictEqual(loadConfig().clipboardAwareness, initial);
});

console.log('\n====================================================');
console.log(`TEST SUITE SUMMARY: ${passedTests} / ${totalTests} TESTS PASSED`);
console.log('====================================================');

if (passedTests !== totalTests) {
  process.exit(1);
}
