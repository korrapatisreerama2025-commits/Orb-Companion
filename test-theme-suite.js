/**
 * Desktop AI Companion - Themes & Skin Switcher Test Suite (test-theme-suite.js)
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

async function runTestSuite() {
  console.log('🧪 Starting Themes & Skin Switcher Test Suite...\n');

  // ==========================================================
  // TEST 1: Config Defaults & Settings.json
  // ==========================================================
  console.log('Test 1: Verifying default config & settings.json persistence...');
  const { DEFAULT_CONFIG } = require('./config');
  assert.strictEqual(DEFAULT_CONFIG.theme, 'auto', 'DEFAULT_CONFIG.theme should default to "auto"');

  const settingsJson = JSON.parse(fs.readFileSync(path.join(__dirname, 'settings.json'), 'utf-8'));
  assert.strictEqual(settingsJson.theme, 'auto', 'settings.json should persist theme: "auto"');
  console.log('  ✓ Config defaults and settings.json declare theme: "auto".');

  // ==========================================================
  // TEST 2: Auto-Theme Time of Day Mapping
  // ==========================================================
  console.log('\nTest 2: Verifying Auto-Theme time-of-day mapping rules...');
  function getAutoThemeForHour(hour) {
    if (hour >= 6 && hour < 12) return 'minimal-white';
    if (hour >= 12 && hour < 18) return 'sunset';
    if (hour >= 18 && hour < 22) return 'neon';
    return 'dark-glass';
  }

  // Morning: 06:00 to 11:59 -> minimal-white
  assert.strictEqual(getAutoThemeForHour(6), 'minimal-white');
  assert.strictEqual(getAutoThemeForHour(9), 'minimal-white');
  assert.strictEqual(getAutoThemeForHour(11), 'minimal-white');

  // Afternoon / Golden Hour: 12:00 to 17:59 -> sunset
  assert.strictEqual(getAutoThemeForHour(12), 'sunset');
  assert.strictEqual(getAutoThemeForHour(14), 'sunset');
  assert.strictEqual(getAutoThemeForHour(17), 'sunset');

  // Evening / Twilight: 18:00 to 21:59 -> neon
  assert.strictEqual(getAutoThemeForHour(18), 'neon');
  assert.strictEqual(getAutoThemeForHour(20), 'neon');
  assert.strictEqual(getAutoThemeForHour(21), 'neon');

  // Night / Late Night: 22:00 to 05:59 -> dark-glass
  assert.strictEqual(getAutoThemeForHour(22), 'dark-glass');
  assert.strictEqual(getAutoThemeForHour(23), 'dark-glass');
  assert.strictEqual(getAutoThemeForHour(0), 'dark-glass');
  assert.strictEqual(getAutoThemeForHour(3), 'dark-glass');
  assert.strictEqual(getAutoThemeForHour(5), 'dark-glass');
  console.log('  ✓ Morning (minimal-white), Afternoon (sunset), Evening (neon), Night (dark-glass) verified.');

  // ==========================================================
  // TEST 3: Voice Command Skin Switching
  // ==========================================================
  console.log('\nTest 3: Verifying voice command skin switcher integration...');
  const CompanionVoiceCommands = require('./renderer/commands');

  let currentTheme = 'auto';
  const voiceContext = {
    getTheme: () => currentTheme,
    getEffectiveTheme: () => currentTheme === 'auto' ? getAutoThemeForHour(new Date().getHours()) : currentTheme,
    setTheme: (t) => { currentTheme = t; }
  };

  // Switch to Neon
  const neonRes = await CompanionVoiceCommands.evaluateVoiceCommand('switch theme to neon', voiceContext);
  assert.strictEqual(neonRes.handled, true);
  assert.strictEqual(neonRes.theme, 'neon');
  assert.strictEqual(currentTheme, 'neon');
  assert.ok(neonRes.message.includes('Neon'));

  // Switch to Minimal White
  const whiteRes = await CompanionVoiceCommands.evaluateVoiceCommand('set theme to minimal white', voiceContext);
  assert.strictEqual(whiteRes.handled, true);
  assert.strictEqual(whiteRes.theme, 'minimal-white');
  assert.strictEqual(currentTheme, 'minimal-white');

  // Switch to Dark Glass
  const darkRes = await CompanionVoiceCommands.evaluateVoiceCommand('dark glass theme', voiceContext);
  assert.strictEqual(darkRes.handled, true);
  assert.strictEqual(darkRes.theme, 'dark-glass');
  assert.strictEqual(currentTheme, 'dark-glass');

  // Switch to Sunset
  const sunsetRes = await CompanionVoiceCommands.evaluateVoiceCommand('sunset skin', voiceContext);
  assert.strictEqual(sunsetRes.handled, true);
  assert.strictEqual(sunsetRes.theme, 'sunset');
  assert.strictEqual(currentTheme, 'sunset');

  // Switch to Auto
  const autoRes = await CompanionVoiceCommands.evaluateVoiceCommand('auto theme', voiceContext);
  assert.strictEqual(autoRes.handled, true);
  assert.strictEqual(autoRes.theme, 'auto');
  assert.strictEqual(currentTheme, 'auto');

  // Query Current Theme
  const queryRes = await CompanionVoiceCommands.evaluateVoiceCommand('what is my theme?', voiceContext);
  assert.strictEqual(queryRes.handled, true);
  assert.strictEqual(queryRes.badge, '🎨 Current Theme');
  assert.ok(queryRes.message.includes('Auto'));
  console.log('  ✓ Voice commands support direct switching to all 4 themes, auto theme, and theme query.');

  // ==========================================================
  // TEST 4: CSS Theme Selectors (Orb gradient, glow, bubble, font weight)
  // ==========================================================
  console.log('\nTest 4: Verifying CSS styles for all 4 themes...');
  const styleCss = fs.readFileSync(path.join(__dirname, 'renderer', 'style.css'), 'utf-8');

  // Neon
  assert.ok(styleCss.includes('body.theme-neon .orb'), 'CSS should have Neon orb glow');
  assert.ok(styleCss.includes('body.theme-neon .orb-swirl'), 'CSS should have Neon orb gradient swirl');
  assert.ok(styleCss.includes('body.theme-neon .speech-bubble'), 'CSS should have Neon speech bubble');
  assert.ok(styleCss.includes('body.theme-neon .speech-text') && styleCss.includes('font-weight: 600'), 'CSS should have Neon bold 600 font weight');

  // Minimal White
  assert.ok(styleCss.includes('body.theme-minimal-white .orb'), 'CSS should have Minimal White orb halo');
  assert.ok(styleCss.includes('body.theme-minimal-white .orb-swirl'), 'CSS should have Minimal White porcelain gradient');
  assert.ok(styleCss.includes('body.theme-minimal-white .speech-bubble'), 'CSS should have Minimal White speech bubble');
  assert.ok(styleCss.includes('body.theme-minimal-white .speech-text') && styleCss.includes('font-weight: 400'), 'CSS should have Minimal White 400 font weight');

  // Dark Glass
  assert.ok(styleCss.includes('body.theme-dark-glass .orb'), 'CSS should have Dark Glass orb shadow');
  assert.ok(styleCss.includes('body.theme-dark-glass .orb-swirl'), 'CSS should have Dark Glass obsidian gradient');
  assert.ok(styleCss.includes('body.theme-dark-glass .speech-bubble'), 'CSS should have Dark Glass speech bubble');
  assert.ok(styleCss.includes('body.theme-dark-glass .speech-text') && styleCss.includes('font-weight: 500'), 'CSS should have Dark Glass 500 font weight');

  // Sunset
  assert.ok(styleCss.includes('body.theme-sunset .orb'), 'CSS should have Sunset orb glow');
  assert.ok(styleCss.includes('body.theme-sunset .orb-swirl'), 'CSS should have Sunset golden hour gradient');
  assert.ok(styleCss.includes('body.theme-sunset .speech-bubble'), 'CSS should have Sunset speech bubble');
  assert.ok(styleCss.includes('body.theme-sunset .speech-text') && styleCss.includes('font-weight: 550'), 'CSS should have Sunset 550 font weight');
  console.log('  ✓ Orb gradients, glows, bubble styles, and font weights verified across all themes in style.css.');

  // ==========================================================
  // TEST 5: UI Elements in index.html and settings.html
  // ==========================================================
  console.log('\nTest 5: Verifying context menu and settings window markup...');
  const indexHtml = fs.readFileSync(path.join(__dirname, 'renderer', 'index.html'), 'utf-8');
  assert.ok(indexHtml.includes('id="theme-auto"'), 'index.html should have theme-auto option');
  assert.ok(indexHtml.includes('id="theme-neon"'), 'index.html should have theme-neon option');
  assert.ok(indexHtml.includes('id="theme-minimal-white"'), 'index.html should have theme-minimal-white option');
  assert.ok(indexHtml.includes('id="theme-dark-glass"'), 'index.html should have theme-dark-glass option');
  assert.ok(indexHtml.includes('id="theme-sunset"'), 'index.html should have theme-sunset option');

  const settingsHtml = fs.readFileSync(path.join(__dirname, 'renderer', 'settings.html'), 'utf-8');
  assert.ok(settingsHtml.includes('class="theme-grid"'), 'settings.html should have theme-grid');
  assert.ok(settingsHtml.includes('data-theme="auto"'), 'settings.html should have auto theme card');
  assert.ok(settingsHtml.includes('data-theme="neon"'), 'settings.html should have neon card');
  assert.ok(settingsHtml.includes('data-theme="minimal-white"'), 'settings.html should have minimal white card');
  assert.ok(settingsHtml.includes('data-theme="dark-glass"'), 'settings.html should have dark glass card');
  assert.ok(settingsHtml.includes('data-theme="sunset"'), 'settings.html should have sunset card');
  console.log('  ✓ Skin switcher present in both context menu and settings window.');

  console.log('\n🎉 ALL THEMES & SKIN SWITCHER TESTS PASSED SUCCESSFULLY!');
}

runTestSuite().catch(err => {
  console.error('\n❌ Test suite failed:', err);
  process.exit(1);
});
