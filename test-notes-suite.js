/**
 * Unit Test Suite for Quick Notes Feature
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  getLocalDateString,
  getLocalTimeString,
  saveNote,
  getNotesForDate,
  getNotesToday,
  getNotesSummary
} = require('./notes');
const { notesPath } = require('./config');
const CompanionVoiceCommands = require('./renderer/commands');

console.log('====================================================');
console.log('QUICK NOTES VERIFICATION TEST SUITE');
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
  // Backup existing notes.md if present
  let originalNotesContent = null;
  if (fs.existsSync(notesPath)) {
    originalNotesContent = fs.readFileSync(notesPath, 'utf-8');
  }

  try {
    // ----------------------------------------------------
    // 1. DATE & TIME HELPERS
    // ----------------------------------------------------
    console.log('--- 1. Date & Time Formatting ---');

    await test('getLocalDateString returns YYYY-MM-DD', () => {
      const ds = getLocalDateString();
      assert.match(ds, /^\d{4}-\d{2}-\d{2}$/);
    });

    await test('getLocalTimeString returns HH:mm:ss', () => {
      const ts = getLocalTimeString();
      assert.match(ts, /^\d{2}:\d{2}:\d{2}$/);
    });

    // ----------------------------------------------------
    // 2. SAVING NOTES TO notes.md
    // ----------------------------------------------------
    console.log('\n--- 2. Saving Notes to notes.md ---');

    // Start with clean notes file for test
    if (fs.existsSync(notesPath)) {
      fs.unlinkSync(notesPath);
    }

    await test('saveNote creates notes.md with header and timestamp', () => {
      const res = saveNote('Buy milk and oat flour');
      assert.strictEqual(res.success, true);
      assert.strictEqual(res.text, 'Buy milk and oat flour');
      assert.ok(fs.existsSync(notesPath));
      const content = fs.readFileSync(notesPath, 'utf-8');
      assert.ok(content.includes('# Companion Quick Notes'));
      assert.ok(content.includes('Buy milk and oat flour'));
    });

    await test('saveNote appends second note under today\'s header', () => {
      const res = saveNote('Refactor capture.js module');
      assert.strictEqual(res.success, true);
      assert.strictEqual(res.text, 'Refactor capture.js module');
      const content = fs.readFileSync(notesPath, 'utf-8');
      assert.ok(content.includes('Buy milk and oat flour'));
      assert.ok(content.includes('Refactor capture.js module'));
    });

    await test('saveNote handles empty string defensively', () => {
      const res = saveNote('   ');
      assert.strictEqual(res.success, false);
    });

    // ----------------------------------------------------
    // 3. READING & RETRIEVING NOTES
    // ----------------------------------------------------
    console.log('\n--- 3. Reading Notes ---');

    await test('getNotesToday returns saved notes for today', () => {
      const notes = getNotesToday();
      assert.strictEqual(Array.isArray(notes), true);
      assert.strictEqual(notes.length >= 2, true);
      assert.strictEqual(notes[0].text, 'Buy milk and oat flour');
      assert.strictEqual(notes[1].text, 'Refactor capture.js module');
    });

    await test('getNotesForDate returns empty array for non-existent date', () => {
      const notes = getNotesForDate('1999-12-31');
      assert.deepStrictEqual(notes, []);
    });

    // ----------------------------------------------------
    // 4. SUMMARY GENERATION
    // ----------------------------------------------------
    console.log('\n--- 4. Summary Generation ---');

    await test('getNotesSummary produces formatted markdown and speak string', () => {
      const summary = getNotesSummary();
      assert.strictEqual(summary.count >= 2, true);
      assert.ok(summary.formattedText.includes('Notes for today'));
      assert.ok(summary.formattedText.includes('Buy milk and oat flour'));
      assert.ok(summary.speakText.includes('notes today'));
    });

    // ----------------------------------------------------
    // 5. VOICE COMMAND INTEGRATION
    // ----------------------------------------------------
    console.log('\n--- 5. Voice Command Integration ---');

    let mockSavedNote = null;
    const mockContext = {
      saveNote: async (txt) => {
        mockSavedNote = txt;
        return saveNote(txt);
      },
      getNotesToday: async () => {
        return getNotesSummary();
      }
    };

    await test('Voice command: "note: call dentist at 3pm"', async () => {
      const res = await CompanionVoiceCommands.evaluateVoiceCommand('note: call dentist at 3pm', mockContext);
      assert.strictEqual(res.handled, true);
      assert.strictEqual(res.badge, '📝 Note Saved');
      assert.ok(res.message.includes('call dentist at 3pm'));
      assert.strictEqual(mockSavedNote, 'call dentist at 3pm');
    });

    await test('Voice command: "take a note review pull request"', async () => {
      const res = await CompanionVoiceCommands.evaluateVoiceCommand('take a note review pull request', mockContext);
      assert.strictEqual(res.handled, true);
      assert.strictEqual(res.badge, '📝 Note Saved');
      assert.ok(res.message.includes('review pull request'));
    });

    await test('Voice command: "what were my notes today?"', async () => {
      const res = await CompanionVoiceCommands.evaluateVoiceCommand('what were my notes today?', mockContext);
      assert.strictEqual(res.handled, true);
      assert.strictEqual(res.badge, '📝 Notes Today');
      assert.strictEqual(res.isNotesSummary, true);
      assert.ok(res.message.includes('Notes for today'));
      assert.ok(res.speak.includes('notes today'));
    });

    await test('Voice command: "summarize my notes today"', async () => {
      const res = await CompanionVoiceCommands.evaluateVoiceCommand('summarize my notes today', mockContext);
      assert.strictEqual(res.handled, true);
      assert.strictEqual(res.isNotesSummary, true);
      assert.ok(res.message.includes('Notes for today'));
    });

  } finally {
    // Restore original notes.md content if it existed
    if (originalNotesContent !== null) {
      fs.writeFileSync(notesPath, originalNotesContent, 'utf-8');
    }
  }

  console.log('\n====================================================');
  console.log(`TEST SUITE SUMMARY: ${passedTests} / ${totalTests} TESTS PASSED`);
  console.log('====================================================');

  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

runAllTests();
