/**
 * Desktop AI Companion - Application Hardening & Security Engine (security.js)
 * 
 * Provides:
 * 1. Deep auto-redaction of passwords, API keys, secrets, and credit cards before logging.
 * 2. Automatic console patching (console.log/warn/error/info) to prevent accidental secret leakage.
 * 3. Secure storage of sensitive API keys using Electron's safeStorage (DPAPI / Keychain / Secret Service).
 * 4. Migration from plain .env files to encrypted safeStorage in settings.json.
 */

const fs = require('fs');
const path = require('path');

let electron = null;
try {
  electron = require('electron');
} catch (_) {}

const safeStorage = electron && typeof electron === 'object' ? electron.safeStorage : null;

// ==========================================================
// 1. COMPREHENSIVE REDACTION ENGINE
// ==========================================================

// Credit Card Luhn Algorithm Verifier
function isValidLuhn(digits) {
  const clean = digits.replace(/\D/g, '');
  if (clean.length < 13 || clean.length > 19) return false;
  let sum = 0;
  let shouldDouble = false;
  for (let i = clean.length - 1; i >= 0; i--) {
    let digit = parseInt(clean.charAt(i), 10);
    if (shouldDouble) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    shouldDouble = !shouldDouble;
  }
  return (sum % 10) === 0;
}

/**
 * Redacts sensitive credentials, passwords, API keys, tokens, and credit cards from a string.
 * @param {string} str 
 * @returns {string} Sanitized string
 */
function redactString(str) {
  if (typeof str !== 'string' || !str) return str;

  let result = str;

  // 1. Credit Cards (Visa, Mastercard, Amex, Discover, and Luhn-valid 13-19 digit sequences)
  // Formats: 4xxx-xxxx-xxxx-xxxx, 5xxx xxxx xxxx xxxx, 37xx-xxxxxx-xxxxx, 16 contiguous digits
  const cardRegex = /\b(?:4\d{3}|5[1-5]\d{2}|2[2-7]\d{2}|6011|3[47]\d{2})[\s-]?\d{4,6}[\s-]?\d{4,5}(?:[\s-]?\d{4})?\b|\b(?:\d{4}[\s-]?){3}\d{4}\b|\b\d{15,16}\b/g;
  result = result.replace(cardRegex, (match) => {
    const raw = match.replace(/[\s-]/g, '');
    if (raw.length >= 13 && raw.length <= 19 && isValidLuhn(raw)) {
      return '[REDACTED_CARD_NUMBER]';
    }
    // Strict pattern matches for well-known prefixes even without Luhn
    if (/^(?:4\d{15}|5[1-5]\d{14}|3[47]\d{13}|6011\d{12})$/.test(raw)) {
      return '[REDACTED_CARD_NUMBER]';
    }
    return match;
  });

  // 2. Anthropic Claude API Keys (sk-ant-...)
  result = result.replace(/sk-ant-api\d{2}-[a-zA-Z0-9_\-]{20,}/g, '[REDACTED_API_KEY]');
  result = result.replace(/sk-ant-[a-zA-Z0-9_\-]{15,}/g, '[REDACTED_API_KEY]');

  // 2b. Google Gemini API Keys (AIzaSy...)
  result = result.replace(/\bAIzaSy[a-zA-Z0-9_\-]{33}\b/g, '[REDACTED_API_KEY]');

  // 3. OpenAI & Generic 'sk-' API keys
  result = result.replace(/\bsk-[a-zA-Z0-9]{20,}\b/g, '[REDACTED_API_KEY]');

  // 4. GitHub Tokens (ghp_, gho_, ghu_, ghs_, ghr_)
  result = result.replace(/\bgh[pousr]_[a-zA-Z0-9]{36,}\b/g, '[REDACTED_API_KEY]');

  // 5. AWS Access Keys (AKIA, ASIA)
  result = result.replace(/\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g, '[REDACTED_AWS_KEY]');

  // 6. JWT Tokens (eyJ...)
  result = result.replace(/\beyJ[a-zA-Z0-9_\-]{10,}\.eyJ[a-zA-Z0-9_\-]{10,}\.[a-zA-Z0-9_\-]+\b/g, '[REDACTED_JWT]');

  // 7. Authorization Bearer Tokens
  result = result.replace(/Bearer\s+[a-zA-Z0-9_\-\.]{15,}/gi, 'Bearer [REDACTED_TOKEN]');

  // 8. Key-Value API Key & Secret assignments (e.g. apiKey="...", api_key: "...", secret_key=...)
  result = result.replace(/(["']?(?:api[_-]?key|apikey|secret[_-]?key|access[_-]?token|auth[_-]?token)["']?\s*[:=]\s*["']?)[a-zA-Z0-9_\-]{16,}(["']?)/gi, '$1[REDACTED_API_KEY]$2');

  // 9. Key-Value Password assignments (e.g. password="...", pwd: "...", client_secret=...)
  result = result.replace(/(["']?(?:password|passwd|pwd|client_secret|user_password|secret)["']?\s*[:=]\s*["']?)[^'"\s,;&]{3,}(["']?)/gi, '$1[REDACTED_PASSWORD]$2');

  // 10. Passwords in Basic Auth URLs (https://user:pass@example.com)
  result = result.replace(/(https?:\/\/)[^:]+:[^@]+(@[^\s"']+)/gi, '$1***:[REDACTED_PASSWORD]$2');

  // 11. Large base64 image data strings
  result = result.replace(/data:image\/[^;]+;base64,[^"'\s]+/gi, '[BASE64_IMAGE_REDACTED]');

  return result;
}

/**
 * Deep recursive redactor for any JavaScript value (string, object, array, Error).
 * @param {*} data 
 * @returns {*} Sanitized data structure
 */
function redact(data) {
  if (data == null) return data;

  if (typeof data === 'string') {
    return redactString(data);
  }

  if (typeof data === 'number' || typeof data === 'boolean') {
    return data;
  }

  if (data instanceof Error) {
    const safeError = new Error(redactString(data.message));
    safeError.name = data.name;
    if (data.stack) {
      safeError.stack = redactString(data.stack);
    }
    return safeError;
  }

  if (Array.isArray(data)) {
    return data.map(item => redact(item));
  }

  if (typeof data === 'object') {
    const cleanObj = {};
    for (const [key, val] of Object.entries(data)) {
      const lowerKey = key.toLowerCase();
      if (/password|passwd|pwd|secret|card_num|credit_card|cvv|cvc/.test(lowerKey)) {
        cleanObj[key] = '[REDACTED_SENSITIVE]';
      } else if (/api_?key|auth_?token|access_?token/.test(lowerKey)) {
        cleanObj[key] = '[REDACTED_API_KEY]';
      } else {
        cleanObj[key] = redact(val);
      }
    }
    return cleanObj;
  }

  return data;
}

/**
 * Patches global console methods (log, info, warn, error, debug) so that anything
 * passed to console is automatically redacted before printing.
 */
let isConsolePatched = false;
function installConsoleRedactor() {
  if (isConsolePatched) return;
  isConsolePatched = true;

  const originalMethods = {
    log: console.log,
    info: console.info,
    warn: console.warn,
    error: console.error,
    debug: console.debug
  };

  ['log', 'info', 'warn', 'error', 'debug'].forEach(method => {
    if (typeof originalMethods[method] === 'function') {
      console[method] = function (...args) {
        const sanitizedArgs = args.map(arg => {
          if (typeof arg === 'string') {
            return redactString(arg);
          }
          try {
            return redact(arg);
          } catch (_) {
            return arg;
          }
        });
        originalMethods[method].apply(console, sanitizedArgs);
      };
    }
  });
}

// ==========================================================
// 2. ELECTRON SAFESTORAGE (SECURE CREDENTIAL STORAGE)
// ==========================================================

/**
 * Checks if Electron's native safeStorage is available and supported.
 * @returns {boolean}
 */
function isSafeStorageAvailable() {
  return !!(
    safeStorage &&
    typeof safeStorage.isEncryptionAvailable === 'function' &&
    safeStorage.isEncryptionAvailable()
  );
}

/**
 * Encrypts a plain text API key using Electron's safeStorage.
 * Returns a base64 encoded ciphertext string, or null if encryption is unavailable.
 * 
 * @param {string} plainKey 
 * @returns {string | null}
 */
function encryptApiKey(plainKey) {
  if (!plainKey || typeof plainKey !== 'string') return null;
  const cleanKey = plainKey.trim();
  if (!cleanKey) return null;

  if (isSafeStorageAvailable()) {
    try {
      const encryptedBuffer = safeStorage.encryptString(cleanKey);
      return encryptedBuffer.toString('base64');
    } catch (err) {
      console.warn('[Security] safeStorage encryption failed:', err.message);
    }
  }
  return null;
}

/**
 * Decrypts a base64 encoded safeStorage ciphertext back to plain text.
 * 
 * @param {string} base64Cipher 
 * @returns {string} Decrypted API key or empty string on failure
 */
function decryptApiKey(base64Cipher) {
  if (!base64Cipher || typeof base64Cipher !== 'string') return '';
  const cleanCipher = base64Cipher.trim();
  if (!cleanCipher) return '';

  if (isSafeStorageAvailable()) {
    try {
      const buffer = Buffer.from(cleanCipher, 'base64');
      return safeStorage.decryptString(buffer);
    } catch (err) {
      console.warn('[Security] safeStorage decryption failed:', err.message);
    }
  }
  return '';
}

/**
 * Automatically migrates plain .env API keys to encrypted safeStorage in settings.json.
 * Wipes sensitive raw credentials from .env to prevent accidental leakage.
 * 
 * @param {string} envFilePath 
 * @param {object} currentConfig 
 * @param {function} saveConfigFn 
 */
function migrateEnvToSafeStorage(envFilePath, currentConfig = {}, saveConfigFn = null) {
  if (!envFilePath || !fs.existsSync(envFilePath)) return;

  try {
    const content = fs.readFileSync(envFilePath, 'utf-8');
    const match = content.match(/^ANTHROPIC_API_KEY=(.+)$/m);
    if (match) {
      const rawKey = match[1].trim().replace(/^["']|["']$/g, '');
      if (rawKey && !rawKey.includes('your_anthropic_api_key_here')) {
        console.log('[Security] Migrating ANTHROPIC_API_KEY from .env to secure Electron safeStorage...');
        
        // If saveConfig is provided, persist it encrypted
        if (typeof saveConfigFn === 'function') {
          saveConfigFn({ apiKey: rawKey });
        }

        // Neutralize raw key in .env with a secure placeholder comment
        content = content.replace(
          /^ANTHROPIC_API_KEY=.+$/m,
          '# ANTHROPIC_API_KEY migrated to secure Electron safeStorage in settings.json'
        );
        fs.writeFileSync(envFilePath, content, 'utf-8');
        console.log('[Security] ANTHROPIC_API_KEY successfully sanitized.');
      }
    }

    const geminiMatch = content.match(/^GEMINI_API_KEY=(.+)$/m);
    if (geminiMatch) {
      const rawGeminiKey = geminiMatch[1].trim().replace(/^["']|["']$/g, '');
      if (rawGeminiKey && !rawGeminiKey.includes('your_gemini_api_key_here')) {
        console.log('[Security] Migrating GEMINI_API_KEY from .env to secure Electron safeStorage...');
        if (typeof saveConfigFn === 'function') {
          saveConfigFn({ geminiApiKey: rawGeminiKey });
        }
        content = content.replace(
          /^GEMINI_API_KEY=.+$/m,
          '# GEMINI_API_KEY migrated to secure Electron safeStorage in settings.json'
        );
        fs.writeFileSync(envFilePath, content, 'utf-8');
        console.log('[Security] GEMINI_API_KEY successfully sanitized.');
      }
    }
  } catch (err) {
    console.warn('[Security] Error migrating .env file:', err.message);
  }
}

module.exports = {
  isValidLuhn,
  redactString,
  redact,
  installConsoleRedactor,
  isSafeStorageAvailable,
  encryptApiKey,
  decryptApiKey,
  migrateEnvToSafeStorage
};
