/**
 * Desktop AI Companion - Quick Notes Engine (notes.js)
 * 
 * Manages quick user notes stored in a local Markdown file (notes.md) with timestamps.
 * Supports adding notes via voice ("note: ...") or keyboard shortcut (Ctrl+Shift+N),
 * and summarizing/retrieving notes taken today.
 */

const fs = require('fs');
const path = require('path');
const { notesPath } = require('./config');

/**
 * Returns the local date string in YYYY-MM-DD format.
 * 
 * @param {Date} [d=new Date()]
 * @returns {string} e.g. "2026-11-22"
 */
function getLocalDateString(d = new Date()) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Returns the local time string in HH:mm:ss format.
 * 
 * @param {Date} [d=new Date()]
 * @returns {string} e.g. "13:55:32"
 */
function getLocalTimeString(d = new Date()) {
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const seconds = String(d.getSeconds()).padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
}

/**
 * Appends a new timestamped note entry to notes.md.
 * 
 * @param {string} noteText - The note content
 * @returns {{ success: boolean, date: string, time: string, timestamp: string, text: string, filePath: string }}
 */
function saveNote(noteText) {
  try {
    if (!noteText || typeof noteText !== 'string' || !noteText.trim()) {
      return { success: false, error: 'Empty note content' };
    }

    const cleanText = noteText.trim();
    const now = new Date();
    const dateStr = getLocalDateString(now);
    const timeStr = getLocalTimeString(now);
    const shortTime = timeStr.slice(0, 5); // HH:mm

    let content = '';
    const fileExists = fs.existsSync(notesPath);

    if (fileExists) {
      try {
        content = fs.readFileSync(notesPath, 'utf-8');
      } catch (e) {
        content = '';
      }
    }

    if (!content.trim()) {
      content = '# Companion Quick Notes\n\n';
    }

    // Check if section header for today exists
    const dateHeader = `## ${dateStr}`;
    const entryLine = `- **[${shortTime}]** ${cleanText}`;

    if (!content.includes(dateHeader)) {
      // Append new date section header + entry
      if (!content.endsWith('\n\n') && !content.endsWith('\r\n\r\n')) {
        content = content.trimEnd() + '\n\n';
      }
      content += `${dateHeader}\n${entryLine}\n`;
    } else {
      // Date section already exists: append entry under the corresponding date section
      const headerIndex = content.indexOf(dateHeader);
      // Find the next header starting with ## after this one, if any
      const nextHeaderMatch = content.slice(headerIndex + dateHeader.length).search(/\n##\s+/);

      if (nextHeaderMatch === -1) {
        // This is the last section in the file
        if (!content.endsWith('\n')) content += '\n';
        content += `${entryLine}\n`;
      } else {
        // Insert right before next section
        const insertionIndex = headerIndex + dateHeader.length + nextHeaderMatch;
        content = content.slice(0, insertionIndex) + `${entryLine}\n` + content.slice(insertionIndex);
      }
    }

    // Ensure target directory exists
    const dir = path.dirname(notesPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(notesPath, content, 'utf-8');

    return {
      success: true,
      date: dateStr,
      time: shortTime,
      timestamp: `${dateStr} ${timeStr}`,
      text: cleanText,
      filePath: notesPath
    };
  } catch (err) {
    console.error('[Notes] Error saving note:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Parses and returns all notes from notes.md for a given date (YYYY-MM-DD).
 * 
 * @param {string} [targetDate] - Target date string (defaults to today's local date)
 * @returns {Array<{ date: string, time: string, text: string }>}
 */
function getNotesForDate(targetDate) {
  try {
    const dateStr = targetDate || getLocalDateString();
    if (!fs.existsSync(notesPath)) {
      return [];
    }

    const content = fs.readFileSync(notesPath, 'utf-8');
    const lines = content.split('\n');

    const results = [];
    let currentDate = null;

    for (let rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;

      // Check for section header: e.g. ## 2026-11-22
      const headerMatch = line.match(/^##\s+(\d{4}-\d{2}-\d{2})/);
      if (headerMatch) {
        currentDate = headerMatch[1];
        continue;
      }

      // Check for bullet entry: e.g. - **[13:55]** Note text
      // Or full timestamp entry: e.g. - **[2026-11-22 13:55:32]** Note text
      const fullTimestampMatch = line.match(/^-\s*\*\*\[(\d{4}-\d{2}-\d{2})\s+(\d{1,2}:\d{2}(?::\d{2})?)\]\*\*\s*(.+)$/);
      if (fullTimestampMatch) {
        const itemDate = fullTimestampMatch[1];
        const itemTime = fullTimestampMatch[2];
        const itemText = fullTimestampMatch[3].trim();
        if (itemDate === dateStr) {
          results.push({ date: itemDate, time: itemTime, text: itemText });
        }
        continue;
      }

      const shortTimeMatch = line.match(/^-\s*\*\*\[(\d{1,2}:\d{2}(?::\d{2})?)\]\*\*\s*(.+)$/);
      if (shortTimeMatch && currentDate === dateStr) {
        results.push({
          date: currentDate,
          time: shortTimeMatch[1],
          text: shortTimeMatch[2].trim()
        });
        continue;
      }

      // Also support plain bullet format under the date header: e.g. - Buy groceries
      const plainBulletMatch = line.match(/^-\s+([^\[*].+)$/);
      if (plainBulletMatch && currentDate === dateStr) {
        results.push({
          date: currentDate,
          time: '',
          text: plainBulletMatch[1].trim()
        });
      }
    }

    return results;
  } catch (err) {
    console.error('[Notes] Error reading notes for date:', err.message);
    return [];
  }
}

/**
 * Returns today's notes.
 * 
 * @returns {Array<{ date: string, time: string, text: string }>}
 */
function getNotesToday() {
  return getNotesForDate(getLocalDateString());
}

/**
 * Generates a clean human-readable summary of notes for a given date.
 * 
 * @param {string} [targetDate]
 * @returns {{ count: number, date: string, formattedText: string, speakText: string, notes: Array }}
 */
function getNotesSummary(targetDate) {
  const dateStr = targetDate || getLocalDateString();
  const notes = getNotesForDate(dateStr);

  if (notes.length === 0) {
    return {
      count: 0,
      date: dateStr,
      formattedText: 'You have no notes saved for today.',
      speakText: "You haven't saved any notes today.",
      notes: []
    };
  }

  // Build clean markdown display list
  const lines = notes.map((n, idx) => {
    const timePrefix = n.time ? `**[${n.time}]** ` : '';
    return `${idx + 1}. ${timePrefix}${n.text}`;
  });

  const formattedText = `**Notes for today (${notes.length}):**\n` + lines.join('\n');

  // Build natural speech summary
  let speakText = '';
  if (notes.length === 1) {
    speakText = `You have one note today: ${notes[0].text}.`;
  } else if (notes.length <= 3) {
    const noteTexts = notes.map(n => n.text);
    const lastNote = noteTexts.pop();
    speakText = `You have ${notes.length} notes today: ${noteTexts.join(', ')} and ${lastNote}.`;
  } else {
    speakText = `You have ${notes.length} notes today. The latest ones are: ${notes[notes.length - 2].text}, and ${notes[notes.length - 1].text}.`;
  }

  return {
    count: notes.length,
    date: dateStr,
    formattedText,
    speakText,
    notes
  };
}

module.exports = {
  getLocalDateString,
  getLocalTimeString,
  saveNote,
  getNotesForDate,
  getNotesToday,
  getNotesSummary
};
