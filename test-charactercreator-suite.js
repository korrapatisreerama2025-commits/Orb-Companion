/**
 * Desktop AI Companion - Character Creator & Profiles Test Suite
 * 
 * Verifies:
 * 1. Default profiles & shape configurations (orb, blob, cube, ring).
 * 2. Color palettes & glow strength definitions.
 * 3. Settings persistence and CRUD profile operations (create, read, update, delete, switch).
 * 4. Tray menu submenu with radio checkmarks.
 * 5. Prompt & persona injection in Claude & Ollama system prompts.
 * 6. Local voice commands for listing and switching character profiles.
 * 7. HTML, CSS, and UI component structures.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const {
  DEFAULT_CONFIG,
  DEFAULT_CHARACTER_PROFILES,
  CHARACTER_SHAPES,
  COLOR_PALETTES
} = require('./config');

const {
  loadConfig,
  saveConfig,
  getActiveCharacterProfile,
  switchCharacterProfile,
  saveCharacterProfile,
  deleteCharacterProfile
} = require('./settings');

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

async function runAllTests() {
  console.log('====================================================');
  console.log('CHARACTER CREATOR & PROFILES VERIFICATION TEST SUITE');
  console.log('====================================================\n');

  // ----------------------------------------------------
  // 1. Configuration & Default Profiles
  // ----------------------------------------------------
  console.log('--- 1. Configuration & Default Profiles ---');

  runTest('CHARACTER_SHAPES supports orb, blob, cube, and ring', () => {
    assert.deepStrictEqual(CHARACTER_SHAPES, ['orb', 'blob', 'cube', 'ring']);
  });

  runTest('COLOR_PALETTES contains curated palettes including custom', () => {
    assert.ok(COLOR_PALETTES['cyan-violet']);
    assert.ok(COLOR_PALETTES['emerald-matrix']);
    assert.ok(COLOR_PALETTES['sunset-blaze']);
    assert.ok(COLOR_PALETTES['rose-quartz']);
    assert.ok(COLOR_PALETTES['obsidian-gold']);
    assert.ok(COLOR_PALETTES['arctic-frost']);
    assert.ok(COLOR_PALETTES['custom']);
  });

  runTest('DEFAULT_CHARACTER_PROFILES contains built-in profiles covering all shapes', () => {
    assert.ok(Array.isArray(DEFAULT_CHARACTER_PROFILES));
    assert.ok(DEFAULT_CHARACTER_PROFILES.length >= 4);

    const shapes = DEFAULT_CHARACTER_PROFILES.map(p => p.shape);
    assert.ok(shapes.includes('orb'), 'Must include orb');
    assert.ok(shapes.includes('blob'), 'Must include blob');
    assert.ok(shapes.includes('cube'), 'Must include cube');
    assert.ok(shapes.includes('ring'), 'Must include ring');
  });

  runTest('DEFAULT_CONFIG defaults to Aura and includes character profiles', () => {
    assert.strictEqual(DEFAULT_CONFIG.characterProfileId, 'profile_aura');
    assert.ok(Array.isArray(DEFAULT_CONFIG.characterProfiles));
  });

  // ----------------------------------------------------
  // 2. Settings & Profile CRUD Operations
  // ----------------------------------------------------
  console.log('\n--- 2. Profile Management & CRUD Operations ---');

  runTest('getActiveCharacterProfile returns the active profile', () => {
    const active = getActiveCharacterProfile();
    assert.ok(active);
    assert.strictEqual(active.id, 'profile_aura');
    assert.strictEqual(active.shape, 'orb');
  });

  runTest('switchCharacterProfile switches the active profile', () => {
    const switched = switchCharacterProfile('profile_nexus');
    assert.ok(switched);
    assert.strictEqual(switched.id, 'profile_nexus');
    assert.strictEqual(switched.name, 'Nexus');
    assert.strictEqual(switched.shape, 'cube');

    const cfg = loadConfig();
    assert.strictEqual(cfg.characterProfileId, 'profile_nexus');
  });

  runTest('saveCharacterProfile creates a new custom profile', () => {
    const newProfile = {
      id: 'profile_test_sentinel',
      name: 'Sentinel',
      shape: 'ring',
      palette: 'obsidian-gold',
      primaryColor: '#EAB308',
      secondaryColor: '#64748B',
      glowStrength: 1.3,
      customSystemPrompt: 'You are Sentinel, a vigilant desktop protector.'
    };

    const res = saveCharacterProfile(newProfile);
    assert.ok(res.success);
    assert.strictEqual(res.profile.id, 'profile_test_sentinel');

    const active = getActiveCharacterProfile();
    assert.strictEqual(active.name, 'Sentinel');
    assert.strictEqual(active.shape, 'ring');
    assert.strictEqual(active.glowStrength, 1.3);
  });

  runTest('saveCharacterProfile updates an existing profile', () => {
    const res = saveCharacterProfile({
      id: 'profile_test_sentinel',
      name: 'Sentinel Prime',
      shape: 'cube',
      glowStrength: 1.5,
      customSystemPrompt: 'Upgraded sentinel instructions.'
    });

    assert.ok(res.success);
    assert.strictEqual(res.profile.name, 'Sentinel Prime');
    assert.strictEqual(res.profile.shape, 'cube');
    assert.strictEqual(res.profile.glowStrength, 1.5);
  });

  runTest('deleteCharacterProfile removes a profile and activates an alternative', () => {
    const delRes = deleteCharacterProfile('profile_test_sentinel');
    assert.ok(delRes.success);

    const active = getActiveCharacterProfile();
    assert.notStrictEqual(active.id, 'profile_test_sentinel');
  });

  runTest('deleteCharacterProfile prevents deleting when only one profile remains', () => {
    const cfg = loadConfig();
    const backupProfiles = [...cfg.characterProfiles];

    // Force one profile
    saveConfig({ characterProfiles: [backupProfiles[0]], characterProfileId: backupProfiles[0].id });
    const failDel = deleteCharacterProfile(backupProfiles[0].id);
    assert.strictEqual(failDel.success, false);
    assert.ok(failDel.error.includes('only remaining'));

    // Restore
    saveConfig({ characterProfiles: backupProfiles, characterProfileId: 'profile_aura' });
  });

  // ----------------------------------------------------
  // 3. Prompt & Persona Injection in api.js
  // ----------------------------------------------------
  console.log('\n--- 3. Prompt & Persona Injection ---');

  runTest('buildSystemPrompt injects custom character persona prompt', () => {
    const prompt = buildSystemPrompt({
      personality: 'friendly',
      characterName: 'Nexus',
      customSystemPrompt: 'You are Nexus, an analytical AI focused on high logic.'
    });

    assert.ok(prompt.includes('[CUSTOM CHARACTER PERSONA - NEXUS]'));
    assert.ok(prompt.includes('You are Nexus, an analytical AI focused on high logic.'));
    assert.ok(prompt.includes('Always respond staying completely true to this character persona'));
  });

  runTest('buildSystemPrompt injects companion identity when no custom prompt is given', () => {
    const prompt = buildSystemPrompt({
      personality: 'friendly',
      characterName: 'Sol'
    });

    assert.ok(prompt.includes('[COMPANION IDENTITY]'));
    assert.ok(prompt.includes('Your character name is Sol.'));
  });

  runTest('buildOllamaSystemPrompt injects character persona for local models', () => {
    const prompt = buildOllamaSystemPrompt({
      personality: 'friendly',
      characterName: 'Pip',
      customSystemPrompt: 'You are Pip, a bubbly bouncy companion.'
    });

    assert.ok(prompt.includes('[Character Persona - Pip: You are Pip, a bubbly bouncy companion.]'));
  });

  // ----------------------------------------------------
  // 4. Voice Commands Integration
  // ----------------------------------------------------
  console.log('\n--- 4. Voice Commands Integration ---');

  const mockProfiles = [
    { id: 'profile_aura', name: 'Aura', shape: 'orb', palette: 'cyan-violet' },
    { id: 'profile_nexus', name: 'Nexus', shape: 'cube', palette: 'emerald-matrix' },
    { id: 'profile_sol', name: 'Sol', shape: 'ring', palette: 'sunset-blaze' },
    { id: 'profile_pip', name: 'Pip', shape: 'blob', palette: 'rose-quartz' }
  ];

  let switchedName = null;
  const mockContext = {
    getCharacterProfiles: () => mockProfiles,
    getCurrentCharacter: () => mockProfiles.find(p => p.name === 'Nexus') || mockProfiles[0],
    switchCharacterByName: (name) => {
      const match = mockProfiles.find(p => p.name.toLowerCase() === name.toLowerCase());
      if (match) {
        switchedName = match.name;
        return { success: true, profile: match };
      }
      return { success: false };
    }
  };

  await runAsyncTest('Voice command: "list character profiles" lists all profiles', async () => {
    const cmd = await evaluateVoiceCommand('list character profiles', mockContext);
    assert.ok(cmd.handled);
    assert.strictEqual(cmd.badge, '🎭 Profiles');
    assert.ok(cmd.message.includes('Aura'));
    assert.ok(cmd.message.includes('Nexus'));
    assert.ok(cmd.message.includes('Sol'));
    assert.ok(cmd.message.includes('Pip'));
  });

  await runAsyncTest('Voice command: "switch character to Nexus" activates Nexus', async () => {
    const cmd = await evaluateVoiceCommand('switch character to Nexus', mockContext);
    assert.ok(cmd.handled);
    assert.strictEqual(cmd.badge, '🎭 Character Switched');
    assert.ok(cmd.message.includes('Nexus'));
    assert.strictEqual(switchedName, 'Nexus');
  });

  await runAsyncTest('Voice command: "change profile to Pip" activates Pip', async () => {
    const cmd = await evaluateVoiceCommand('change profile to Pip', mockContext);
    assert.ok(cmd.handled);
    assert.strictEqual(cmd.badge, '🎭 Character Switched');
    assert.ok(cmd.message.includes('Pip'));
    assert.strictEqual(switchedName, 'Pip');
  });

  await runAsyncTest('Voice command: "who are you?" reports current character name', async () => {
    const cmd = await evaluateVoiceCommand('who are you', mockContext);
    assert.ok(cmd.handled);
    assert.ok(cmd.message.includes("I'm Nexus!"));
  });

  // ----------------------------------------------------
  // 5. HTML, CSS, and UI Structure
  // ----------------------------------------------------
  console.log('\n--- 5. HTML, CSS, and UI Structure ---');

  runTest('renderer/settings.html contains Character Creator section and controls', () => {
    const html = fs.readFileSync(path.join(__dirname, 'renderer', 'settings.html'), 'utf-8');
    assert.ok(html.includes('id="profile-select"'), 'Missing #profile-select');
    assert.ok(html.includes('id="new-profile-btn"'), 'Missing #new-profile-btn');
    assert.ok(html.includes('id="save-profile-btn"'), 'Missing #save-profile-btn');
    assert.ok(html.includes('id="delete-profile-btn"'), 'Missing #delete-profile-btn');
    assert.ok(html.includes('id="char-name-input"'), 'Missing #char-name-input');
    assert.ok(html.includes('data-shape="orb"'), 'Missing orb shape card');
    assert.ok(html.includes('data-shape="blob"'), 'Missing blob shape card');
    assert.ok(html.includes('data-shape="cube"'), 'Missing cube shape card');
    assert.ok(html.includes('data-shape="ring"'), 'Missing ring shape card');
    assert.ok(html.includes('id="char-glow-slider"'), 'Missing glow slider');
    assert.ok(html.includes('id="custom-system-prompt-input"'), 'Missing custom prompt textarea');
    assert.ok(html.includes('id="preview-avatar-orb"'), 'Missing live avatar preview');
  });

  runTest('renderer/style.css defines all 4 shapes and dynamic glow styles', () => {
    const css = fs.readFileSync(path.join(__dirname, 'renderer', 'style.css'), 'utf-8');
    assert.ok(css.includes('.shape-orb'));
    assert.ok(css.includes('.shape-blob'));
    assert.ok(css.includes('@keyframes blobMorph'));
    assert.ok(css.includes('.shape-cube'));
    assert.ok(css.includes('.shape-ring'));
    assert.ok(css.includes('--char-glow-mult'));
    assert.ok(css.includes('--char-primary'));
  });

  runTest('renderer/settings.css defines preview card and creator layout styles', () => {
    const css = fs.readFileSync(path.join(__dirname, 'renderer', 'settings.css'), 'utf-8');
    assert.ok(css.includes('.character-preview-card'));
    assert.ok(css.includes('.shape-grid'));
    assert.ok(css.includes('.palette-grid'));
    assert.ok(css.includes('.custom-colors-row'));
  });

  runTest('preload.js exposes character profiles IPC methods', () => {
    const preload = fs.readFileSync(path.join(__dirname, 'preload.js'), 'utf-8');
    assert.ok(preload.includes('getCharacterProfiles'));
    assert.ok(preload.includes('switchCharacterProfile'));
    assert.ok(preload.includes('saveCharacterProfile'));
    assert.ok(preload.includes('deleteCharacterProfile'));
    assert.ok(preload.includes('onProfileChanged'));
  });

  runTest('settings.js updates tray menu with Character Profiles submenu', () => {
    const settingsCode = fs.readFileSync(path.join(__dirname, 'settings.js'), 'utf-8');
    assert.ok(settingsCode.includes('Character Profiles'));
    assert.ok(settingsCode.includes('profileMenuItems'));
  });

  console.log('\n====================================================');
  console.log(`TEST SUITE RESULTS: ${passedTests}/${totalTests} PASSED`);
  console.log('====================================================');

  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

runAllTests().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
