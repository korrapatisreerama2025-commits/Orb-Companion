/**
 * Desktop AI Companion - Security Hardening Test Suite (test-security-suite.js)
 * 
 * Verifies:
 * 1. Window Security Settings (contextIsolation: true, nodeIntegration: false across all windows).
 * 2. Strict Content Security Policy (meta tags in index.html, settings.html, snip.html, and main session header).
 * 3. Strict IPC Message Validation (ipcValidator.js: inputs, types, ranges, prototype pollution, URL/command whitelists).
 * 4. SafeStorage API Key Encryption & Migration (DPAPI/Keychain/SecretService safeStorage with plain .env migration).
 * 5. Auto-Redaction Engine (credit cards, Anthropic/OpenAI/AWS API keys, JWT/Bearer tokens, passwords, console patch).
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const {
  redactString,
  redact,
  isValidLuhn,
  isSafeStorageAvailable,
  encryptApiKey,
  decryptApiKey,
  migrateEnvToSafeStorage,
  installConsoleRedactor
} = require('./security');

const {
  isCleanObject,
  validateWindowMove,
  validateIgnoreMouseEvents,
  validateDisplayTarget,
  validateClaudeStreamParams,
  validateSaveConfig,
  validateSaveMemory,
  validateExternalUrl,
  validateAppName,
  validateNoteText,
  validateOllamaHost,
  validateCharacterProfile,
  validateProfileId,
  ALLOWED_SCREEN_MODES,
  ALLOWED_PERSONALITIES,
  ALLOWED_CHARACTER_SHAPES
} = require('./ipcValidator');

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

console.log('====================================================');
console.log(' Desktop AI Companion - Security Hardening Test Suite');
console.log('====================================================\n');

// ------------------------------------------------------------------
// 1. Window Security: contextIsolation & nodeIntegration
// ------------------------------------------------------------------
console.log('--- 1. Window Security Configuration ---');

runTest('main.js configures contextIsolation: true and nodeIntegration: false', () => {
  const code = fs.readFileSync(path.join(__dirname, 'main.js'), 'utf8');
  assert.ok(code.includes('contextIsolation: true'), 'contextIsolation not true in main.js');
  assert.ok(code.includes('nodeIntegration: false'), 'nodeIntegration not false in main.js');
});

runTest('settings.js configures contextIsolation: true and nodeIntegration: false', () => {
  const code = fs.readFileSync(path.join(__dirname, 'settings.js'), 'utf8');
  assert.ok(code.includes('contextIsolation: true'), 'contextIsolation not true in settings.js');
  assert.ok(code.includes('nodeIntegration: false'), 'nodeIntegration not false in settings.js');
});

runTest('regionFocus.js configures contextIsolation: true and nodeIntegration: false', () => {
  const code = fs.readFileSync(path.join(__dirname, 'regionFocus.js'), 'utf8');
  assert.ok(code.includes('contextIsolation: true'), 'contextIsolation not true in regionFocus.js');
  assert.ok(code.includes('nodeIntegration: false'), 'nodeIntegration not false in regionFocus.js');
});

// ------------------------------------------------------------------
// 2. Strict Content Security Policy (CSP)
// ------------------------------------------------------------------
console.log('\n--- 2. Content Security Policy (CSP) ---');

runTest('renderer/index.html defines strict Content-Security-Policy meta tag', () => {
  const html = fs.readFileSync(path.join(__dirname, 'renderer', 'index.html'), 'utf8');
  assert.ok(html.includes('http-equiv="Content-Security-Policy"'), 'Missing CSP meta tag in index.html');
  assert.ok(html.includes("default-src 'self'"), "CSP missing default-src 'self' in index.html");
  assert.ok(html.includes("object-src 'none'"), "CSP missing object-src 'none' in index.html");
});

runTest('renderer/settings.html defines strict Content-Security-Policy meta tag', () => {
  const html = fs.readFileSync(path.join(__dirname, 'renderer', 'settings.html'), 'utf8');
  assert.ok(html.includes('http-equiv="Content-Security-Policy"'), 'Missing CSP meta tag in settings.html');
  assert.ok(html.includes("default-src 'self'"), "CSP missing default-src 'self' in settings.html");
  assert.ok(html.includes("object-src 'none'"), "CSP missing object-src 'none' in settings.html");
});

runTest('renderer/snip.html defines strict Content-Security-Policy meta tag', () => {
  const html = fs.readFileSync(path.join(__dirname, 'renderer', 'snip.html'), 'utf8');
  assert.ok(html.includes('http-equiv="Content-Security-Policy"'), 'Missing CSP meta tag in snip.html');
  assert.ok(html.includes("default-src 'self'"), "CSP missing default-src 'self' in snip.html");
  assert.ok(html.includes("object-src 'none'"), "CSP missing object-src 'none' in snip.html");
});

runTest('main.js enforces Content-Security-Policy via onHeadersReceived', () => {
  const code = fs.readFileSync(path.join(__dirname, 'main.js'), 'utf8');
  assert.ok(code.includes('Content-Security-Policy'), 'main.js does not register Content-Security-Policy header');
  assert.ok(code.includes('onHeadersReceived'), 'main.js does not use onHeadersReceived for CSP enforcement');
});

// ------------------------------------------------------------------
// 3. Strict IPC Message Validation
// ------------------------------------------------------------------
console.log('\n--- 3. Strict IPC Message Validation ---');

runTest('Prototype pollution detection rejects polluted objects', () => {
  assert.strictEqual(isCleanObject({ normalKey: 123 }), true);
  const polluted = JSON.parse('{"__proto__": {"admin": true}}');
  assert.strictEqual(isCleanObject(polluted), false);
  assert.strictEqual(isCleanObject(null), false);
});

runTest('validateWindowMove bounds and sanitizes drag coordinates', () => {
  const valid = validateWindowMove({ deltaX: 12.4, deltaY: -5 });
  assert.strictEqual(valid.deltaX, 12);
  assert.strictEqual(valid.deltaY, -5);

  const clamped = validateWindowMove({ deltaX: 999999, deltaY: -999999 });
  assert.strictEqual(clamped.deltaX, 2000);
  assert.strictEqual(clamped.deltaY, -2000);

  assert.strictEqual(validateWindowMove({ deltaX: 'notANumber', deltaY: 0 }), null);
  assert.strictEqual(validateWindowMove(null), null);
});

runTest('validateIgnoreMouseEvents sanitizes forward options', () => {
  const res1 = validateIgnoreMouseEvents(true, { forward: true });
  assert.strictEqual(res1.ignore, true);
  assert.strictEqual(res1.options.forward, true);

  const res2 = validateIgnoreMouseEvents(false, null);
  assert.strictEqual(res2.ignore, false);
  assert.strictEqual(res2.options, undefined);
});

runTest('validateDisplayTarget rejects shell characters and non-numeric invalid targets', () => {
  assert.strictEqual(validateDisplayTarget('primary'), 'primary');
  assert.strictEqual(validateDisplayTarget('2548234857'), '2548234857');
  assert.strictEqual(validateDisplayTarget('active-screen'), 'active-screen');
  assert.strictEqual(validateDisplayTarget('display; rm -rf /'), null);
  assert.strictEqual(validateDisplayTarget(''), null);
});

runTest('validateClaudeStreamParams validates streamId, transcript, and bounds', () => {
  const clean = validateClaudeStreamParams({
    streamId: 'stream_12345',
    userTranscript: 'Hello companion',
    personality: 'sarcastic',
    screenMode: 'coding',
    focusedRegion: { x: 10, y: 20, width: 300, height: 200 }
  });
  assert.strictEqual(clean.streamId, 'stream_12345');
  assert.strictEqual(clean.personality, 'sarcastic');
  assert.strictEqual(clean.screenMode, 'coding');
  assert.strictEqual(clean.focusedRegion.width, 300);

  // Missing streamId should fail
  assert.strictEqual(validateClaudeStreamParams({}), null);
});

runTest('validateSaveConfig validates budget, frequency, blocklist and rejects prototype pollution', () => {
  const valid = validateSaveConfig({
    apiKey: 'sk-ant-testkey123456789',
    dailyApiBudget: 250,
    frequencySeconds: 120,
    personality: 'study-buddy',
    theme: 'neon',
    ollamaHost: 'http://127.0.0.1:11434',
    blocklist: ['Slack', 'Discord', 'Bank']
  });
  assert.strictEqual(valid.dailyApiBudget, 250);
  assert.strictEqual(valid.frequencySeconds, 120);
  assert.strictEqual(valid.personality, 'study-buddy');
  assert.strictEqual(valid.theme, 'neon');
  assert.strictEqual(valid.blocklist.length, 3);

  // Out of bounds values clamped/ignored
  const badBudget = validateSaveConfig({ dailyApiBudget: -50 });
  assert.strictEqual(badBudget.dailyApiBudget, undefined);

  // Prototype pollution rejected
  const polluted = JSON.parse('{"__proto__": {"isAdmin": true}, "dailyApiBudget": 100}');
  assert.strictEqual(validateSaveConfig(polluted), null);
});

runTest('validateExternalUrl allows only valid http/https URLs and rejects javascript/file/shell schemes', () => {
  assert.ok(validateExternalUrl('https://github.com/test').startsWith('https://'));
  assert.ok(validateExternalUrl('http://localhost:3000').startsWith('http://'));
  assert.strictEqual(validateExternalUrl('javascript:alert(1)'), null);
  assert.strictEqual(validateExternalUrl('file:///C:/Windows/System32'), null);
  assert.strictEqual(validateExternalUrl('powershell -Command evil'), null);
  assert.strictEqual(validateExternalUrl(''), null);
});

runTest('validateAppName strictly whitelists safe applications and prevents command injection', () => {
  assert.strictEqual(validateAppName('notepad'), 'notepad');
  assert.strictEqual(validateAppName('calculator'), 'calculator');
  assert.strictEqual(validateAppName('calc'), 'calc');
  assert.strictEqual(validateAppName('mspaint'), 'paint');
  assert.strictEqual(validateAppName('code'), 'code');
  assert.strictEqual(validateAppName('notepad && del /f /q C:\\*'), 'notepad');
  assert.strictEqual(validateAppName('evil_malware.exe'), null);
});

runTest('validateCharacterProfile validates shape, colors, and glow bounds', () => {
  const valid = validateCharacterProfile({
    id: 'profile_test',
    name: 'Testy',
    shape: 'cube',
    palette: 'arctic-frost',
    primaryColor: '#38BDF8',
    secondaryColor: '#818CF8',
    glowStrength: 1.2
  });
  assert.strictEqual(valid.shape, 'cube');
  assert.strictEqual(valid.primaryColor, '#38BDF8');
  assert.strictEqual(valid.glowStrength, 1.2);

  // Invalid shape defaults to orb
  const invalidShape = validateCharacterProfile({ id: 'p2', shape: 'unsupported_shape' });
  assert.strictEqual(invalidShape.shape, 'orb');
});

// ------------------------------------------------------------------
// 4. SafeStorage API Key Encryption & .env Migration
// ------------------------------------------------------------------
console.log('\n--- 4. SafeStorage Encryption & .env Migration ---');

runTest('safeStorage helpers encrypt and decrypt or provide graceful fallback', () => {
  const key = 'sk-ant-api03-testkey1234567890abcdefghijklmnopqrstuvwxyz';
  if (isSafeStorageAvailable()) {
    const encrypted = encryptApiKey(key);
    assert.ok(encrypted, 'Encryption should return base64 string');
    const decrypted = decryptApiKey(encrypted);
    assert.strictEqual(decrypted, key);
  } else {
    // When running under pure node or CI without desktop DPAPI keyring
    const encrypted = encryptApiKey(key);
    assert.strictEqual(encrypted, null);
    assert.strictEqual(decryptApiKey(''), '');
  }
});

runTest('migrateEnvToSafeStorage securely wipes raw API key from .env', () => {
  const testEnvDir = path.join(__dirname, 'test_scratch');
  if (!fs.existsSync(testEnvDir)) fs.mkdirSync(testEnvDir, { recursive: true });
  const testEnvFile = path.join(testEnvDir, '.env.test');

  fs.writeFileSync(testEnvFile, 'ANTHROPIC_API_KEY=sk-ant-api03-real_secret_key_12345\nOTHER_VAR=hello', 'utf-8');

  let savedKey = null;
  migrateEnvToSafeStorage(testEnvFile, {}, (cfg) => {
    savedKey = cfg.apiKey;
  });

  assert.strictEqual(savedKey, 'sk-ant-api03-real_secret_key_12345');
  const updatedEnv = fs.readFileSync(testEnvFile, 'utf-8');
  assert.strictEqual(updatedEnv.includes('sk-ant-api03-real_secret_key_12345'), false);
  assert.ok(updatedEnv.includes('# ANTHROPIC_API_KEY migrated to secure Electron safeStorage'));

  // Cleanup
  fs.unlinkSync(testEnvFile);
  fs.rmdirSync(testEnvDir);
});

// ------------------------------------------------------------------
// 5. Auto-Redaction Engine (Logs & Console)
// ------------------------------------------------------------------
console.log('\n--- 5. Auto-Redaction Engine ---');

runTest('Redacts credit card numbers (Visa, Mastercard, Amex, 16-digit Luhn)', () => {
  // Luhn valid test cards
  assert.strictEqual(
    redactString('Payment card: 4532-0150-1234-5678 charged.'),
    'Payment card: [REDACTED_CARD_NUMBER] charged.'
  );
  assert.strictEqual(
    redactString('Card number 4532015012345678 processed'),
    'Card number [REDACTED_CARD_NUMBER] processed'
  );
  assert.strictEqual(
    redactString('Mastercard 5425-2334-3010-9903 details'),
    'Mastercard [REDACTED_CARD_NUMBER] details'
  );
});

runTest('Redacts Anthropic, OpenAI, GitHub, and AWS API keys', () => {
  assert.strictEqual(
    redactString('Error with key sk-ant-api03-abcdef123456789012345678901234567890'),
    'Error with key [REDACTED_API_KEY]'
  );
  assert.strictEqual(
    redactString('sk-ant-shorttestkey12345 failed'),
    '[REDACTED_API_KEY] failed'
  );
  assert.strictEqual(
    redactString('OpenAI key sk-12345678901234567890123456789012 invalid'),
    'OpenAI key [REDACTED_API_KEY] invalid'
  );
  assert.strictEqual(
    redactString('GitHub token ghp_123456789012345678901234567890123456'),
    'GitHub token [REDACTED_API_KEY]'
  );
  assert.strictEqual(
    redactString('AWS key AKIAIOSFODNN7EXAMPLE used'),
    'AWS key [REDACTED_AWS_KEY] used'
  );
});

runTest('Redacts Bearer tokens and JWTs', () => {
  assert.strictEqual(
    redactString('Authorization: Bearer mySecretTokenString1234567890'),
    'Authorization: Bearer [REDACTED_TOKEN]'
  );
  assert.strictEqual(
    redactString('JWT token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.doNotLeakThisSignature1234'),
    'JWT token [REDACTED_JWT]'
  );
});

runTest('Redacts password assignments and Basic Auth in URLs', () => {
  assert.strictEqual(
    redactString('User login password="superSecretPassword!" failed'),
    'User login password="[REDACTED_PASSWORD]" failed'
  );
  assert.strictEqual(
    redactString('{"password": "myAdminPassword123"}'),
    '{"password": "[REDACTED_PASSWORD]"}'
  );
  assert.strictEqual(
    redactString('Connecting to https://admin:SuperSecret123@api.mybank.com/data'),
    'Connecting to https://***:[REDACTED_PASSWORD]@api.mybank.com/data'
  );
});

runTest('Deep redact handles nested objects, arrays, and Error instances', () => {
  const err = new Error('Failed with password=secret123 on key sk-ant-api03-abcdef12345678901234567890');
  const cleanErr = redact(err);
  assert.strictEqual(cleanErr.message.includes('secret123'), false);
  assert.ok(cleanErr.message.includes('[REDACTED_PASSWORD]'));
  assert.ok(cleanErr.message.includes('[REDACTED_API_KEY]'));

  const nestedObj = {
    user: 'Korra',
    password: 'superSecretPassword',
    card: '4532-0150-1234-5678',
    tokens: [
      'sk-ant-api03-12345678901234567890',
      'normal-data'
    ]
  };
  const cleanObj = redact(nestedObj);
  assert.strictEqual(cleanObj.password, '[REDACTED_SENSITIVE]');
  assert.strictEqual(cleanObj.card, '[REDACTED_CARD_NUMBER]');
  assert.strictEqual(cleanObj.tokens[0], '[REDACTED_API_KEY]');
  assert.strictEqual(cleanObj.tokens[1], 'normal-data');
});

runTest('installConsoleRedactor intercepts console methods', () => {
  installConsoleRedactor();
  let captured = '';
  const origStdout = process.stdout.write;
  process.stdout.write = (chunk) => {
    captured += chunk;
    return true;
  };

  try {
    console.log('Test output: password="myUnredactedSecret" on card 4532-0150-1234-5678');
  } finally {
    process.stdout.write = origStdout;
  }

  assert.strictEqual(captured.includes('myUnredactedSecret'), false);
  assert.ok(captured.includes('[REDACTED_PASSWORD]'));
  assert.ok(captured.includes('[REDACTED_CARD_NUMBER]'));
});

// ------------------------------------------------------------------
// Summary
// ------------------------------------------------------------------
console.log('\n====================================================');
console.log(` Security Suite Results: ${passedTests} / ${totalTests} passed`);
console.log('====================================================');

if (passedTests !== totalTests) {
  process.exit(1);
}
