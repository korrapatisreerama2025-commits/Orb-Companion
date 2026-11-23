/**
 * Desktop AI Companion - Opt-in Clipboard Awareness & Privacy Guard (clipboard.js)
 * 
 * Monitors system clipboard changes when enabled (opt-in only), classifies copied text
 * into errors, code snippets, or long text, and offers 1-click actions in the bubble.
 * 
 * Strict Privacy Guarantee:
 * - If the active window matches the privacy blocklist (banking, password managers),
 *   clipboard inspection is completely skipped.
 * - If clipboard content resembles a credit card number (Luhn validation, card grouping)
 *   or a password/secret/API token, it is immediately discarded and never processed.
 * - Actions run ONLY if explicitly clicked by the user; zero API calls on passive offer.
 */

const { clipboard } = require('electron');
const { loadConfig } = require('./settings');
const { getActiveWindow } = require('./capture');

let clipboardMonitorInterval = null;
let lastSeenClipboardText = '';

// ==========================================================
// PRIVACY FILTER: CARD NUMBERS, PASSWORDS & TOKENS
// ==========================================================

/**
 * Validates a candidate numeric sequence using the Luhn algorithm.
 * Used to detect real credit card numbers (Visa, Mastercard, Amex, Discover, etc.).
 * 
 * @param {string} val 
 * @returns {boolean} True if passes Luhn checksum
 */
function isLuhnValid(val) {
  const clean = val.replace(/[\s-]/g, '');
  if (!/^\d{13,19}$/.test(clean)) return false;
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
 * Checks whether text contains credit cards, passwords, private keys, or secret tokens.
 * If any sensitive pattern is detected, the text is immediately rejected.
 * 
 * @param {string} text - Copied clipboard text
 * @returns {boolean} True if sensitive, false if safe to classify
 */
function isSensitiveClipboardText(text) {
  if (!text || typeof text !== 'string') return true;
  const trimmed = text.trim();
  if (!trimmed) return true;

  // 1. Credit Card Numbers
  // A. Luhn algorithm check on any 13-19 digit candidate
  const cardCandidates = trimmed.match(/\b(?:\d[ -]*?){13,19}\b/g);
  if (cardCandidates) {
    for (const cand of cardCandidates) {
      if (isLuhnValid(cand)) {
        return true; // Confirmed payment card number via Luhn
      }
    }
  }

  // B. Major Card Brand patterns (Visa, Mastercard, Amex, Discover) & standard groupings
  const digitsOnly = trimmed.replace(/[\s-]/g, '');
  const majorCardPatterns = [
    /\b4[0-9]{12}(?:[0-9]{3})?\b/,                              // Visa (13 or 16 digits)
    /\b(?:5[1-5][0-9]{2}|222[1-9]|22[3-9][0-9]|2[3-6][0-9]{2}|27[01][0-9]|2720)[0-9]{12}\b/, // Mastercard
    /\b3[47][0-9]{13}\b/,                                      // Amex (15 digits)
    /\b(?:6011|65[0-9]{2}|64[4-9][0-9])[0-9]{12}\b/,           // Discover
    /\b(?:\d{4}[ -]){3}\d{4}\b/,                               // Standard 4x4 card format
    /\b\d{4}[ -]\d{6}[ -]\d{5}\b/                              // Standard Amex format
  ];

  if (majorCardPatterns.some(pat => pat.test(trimmed) || pat.test(digitsOnly))) {
    return true;
  }

  // 2. Passwords & Credentials
  // Key-value password indicators
  if (/(?:password|passwd|pwd|secret|api[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret)\s*[:=]/i.test(trimmed)) {
    return true;
  }

  // Bearer or Basic authentication tokens
  if (/(?:bearer|basic)\s+[a-zA-Z0-9_\-\.=:]{15,}/i.test(trimmed)) {
    return true;
  }

  // Private key PEM blocks
  if (/-----BEGIN [A-Z ]*PRIVATE KEY-----/i.test(trimmed)) {
    return true;
  }

  // Common API key signatures (Anthropic, OpenAI, GitHub, GitLab, Slack, AWS, Google)
  if (/\b(?:sk-ant-[a-zA-Z0-9_\-]{20,}|sk-[a-zA-Z0-9]{20,}|ghp_[a-zA-Z0-9]{20,}|gho_[a-zA-Z0-9]{20,}|glpat-[a-zA-Z0-9_\-]{20,}|xox[baprs]-[a-zA-Z0-9]{10,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z-_]{35})\b/.test(trimmed)) {
    return true;
  }

  // JWT structure (header.payload.signature)
  if (/^ey[A-Za-z0-9_-]{10,}\.[A-Za-z0-9._-]{10,}\.[A-Za-z0-9._-]{10,}$/.test(trimmed)) {
    return true;
  }

  // High-entropy standalone token/password (single word, 12-80 chars, mix of 3+ character classes)
  if (!/\s/.test(trimmed) && trimmed.length >= 12 && trimmed.length <= 80) {
    let classes = 0;
    if (/[a-z]/.test(trimmed)) classes++;
    if (/[A-Z]/.test(trimmed)) classes++;
    if (/[0-9]/.test(trimmed)) classes++;
    if (/[^a-zA-Z0-9]/.test(trimmed)) classes++;
    if (classes >= 3) {
      return true; // Single high-entropy secret
    }
  }

  return false;
}

// ==========================================================
// CONTENT CLASSIFIER: ERROR, CODE, LONG TEXT
// ==========================================================

/**
 * Classifies safe clipboard text into actionable developer categories.
 * 
 * @param {string} text 
 * @returns {object|null} Classification descriptor or null if uninteresting
 */
function classifyClipboardContent(text) {
  if (!text || typeof text !== 'string') return null;
  const trimmed = text.trim();

  // Ignore trivial snippets (< 12 chars) or excessive dumps (> 25,000 chars)
  if (trimmed.length < 12 || trimmed.length > 25000) return null;

  // 1. Error Message / Stack Trace
  const errorKeywords = /\b(Error|Exception|Traceback|SyntaxError|TypeError|ReferenceError|RangeError|URIError|EvalError|NullPointerException|AssertionError|UnhandledPromiseRejection|FATAL|Segmentation fault|Stack trace|compilation failed|build failed|failed with exit code|npm err!|panic:)\b/i;
  const stackTracePattern = /(?:^\s*at\s+[^\n]+\([^\n]+:\d+:\d+\)|File "[^"]+", line \d+|at [a-zA-Z0-9_$.]+\([a-zA-Z0-9_$.]+:\d+\)|[a-zA-Z0-9._-]+\.(?:js|ts|py|rs|go|cpp|c|java):\d+:\d+)/m;

  if (errorKeywords.test(trimmed) || stackTracePattern.test(trimmed)) {
    return {
      type: 'error',
      badge: 'Copied Error',
      primaryAction: 'Fix it?',
      secondaryAction: 'Explain error?',
      summary: 'Copied error message'
    };
  }

  // 2. Code Snippet
  const codeKeywords = /\b(function|const|let|var|class|def|import|export|from|return|if\s*\(|else|for\s*\(|while\s*\(|async|await|public|private|interface|struct|package|namespace)\b/;
  const codeSyntax = /(=>|console\.log|printf|\bcout\b|<[a-zA-Z][^>]*>|;\s*$|\{\s*[\r\n]|\}\s*[\r\n]|SELECT\s+[\s\S]+\s+FROM)/m;
  const lines = trimmed.split('\n');
  const hasIndent = lines.length > 1 && lines.some(l => /^\s{2,}\S/.test(l));

  if (codeKeywords.test(trimmed) || codeSyntax.test(trimmed) || (lines.length >= 3 && hasIndent)) {
    return {
      type: 'code',
      badge: 'Copied Code',
      primaryAction: 'Explain this?',
      secondaryAction: 'Fix it?',
      summary: `Copied code (${lines.length} lines)`
    };
  }

  // 3. Long Text / Article
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (trimmed.length >= 120 && words.length >= 20) {
    return {
      type: 'longtext',
      badge: 'Copied Text',
      primaryAction: 'Summarize?',
      secondaryAction: null,
      summary: `Copied text (${words.length} words)`
    };
  }

  return null;
}

// ==========================================================
// BACKGROUND CLIPBOARD MONITOR
// ==========================================================

/**
 * Starts background clipboard monitoring interval.
 * Checks clipboard every 1000ms only when clipboardAwareness is opt-in enabled.
 * 
 * @param {Function} getMainWindow - Function returning the main BrowserWindow instance
 */
function startClipboardMonitor(getMainWindow) {
  stopClipboardMonitor();

  // Prime last seen text with current clipboard to prevent initial duplicate trigger
  try {
    lastSeenClipboardText = clipboard.readText() || '';
  } catch (_) {
    lastSeenClipboardText = '';
  }

  clipboardMonitorInterval = setInterval(async () => {
    try {
      const config = loadConfig();

      // OPT-IN CHECK: Completely dormant if user has not enabled clipboard awareness
      if (!config.clipboardAwareness) {
        return;
      }

      // PRIVACY SHIELD CHECK: Check active window against privacy blocklist
      const activeWin = await getActiveWindow();
      if (activeWin && activeWin.owner) {
        const blocklist = config.blocklist || [];
        const ownerLower = (activeWin.owner || '').toLowerCase();
        const titleLower = (activeWin.title || '').toLowerCase();
        const isBlocked = blocklist.some(b => ownerLower.includes(b) || titleLower.includes(b));
        if (isBlocked) {
          // Sensitive application is in foreground (e.g. 1Password, bank, etc.)
          // Strictly avoid reading or inspecting clipboard!
          return;
        }
      }

      // Read current plain text from clipboard
      const currentText = clipboard.readText();
      if (!currentText || currentText === lastSeenClipboardText) {
        return;
      }

      lastSeenClipboardText = currentText;

      // PRIVACY FILTER: Check for cards, passwords, secrets, API tokens
      if (isSensitiveClipboardText(currentText)) {
        return; // Immediately drop without logging or processing
      }

      // CLASSIFICATION: Check if text is error, code, or long text
      const classification = classifyClipboardContent(currentText);
      if (!classification) {
        return; // Short trivial text or unhandled format
      }

      // Offer action in speech bubble to user
      const mainWin = getMainWindow();
      if (mainWin && !mainWin.isDestroyed()) {
        mainWin.webContents.send('clipboard-action-offer', {
          text: currentText,
          classification
        });
      }
    } catch (err) {
      // Defensive boundary: never let monitor error crash the app
      console.warn('[Clipboard] Monitor check error:', err.message);
    }
  }, 1000);
}

/**
 * Stops background clipboard monitoring interval.
 */
function stopClipboardMonitor() {
  if (clipboardMonitorInterval) {
    clearInterval(clipboardMonitorInterval);
    clipboardMonitorInterval = null;
  }
}

module.exports = {
  isLuhnValid,
  isSensitiveClipboardText,
  classifyClipboardContent,
  startClipboardMonitor,
  stopClipboardMonitor
};
