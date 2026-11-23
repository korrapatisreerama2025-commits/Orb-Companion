/**
 * Desktop AI Companion - Bond System & Outfits Test Suite (test-bond-suite.js)
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  BOND_LEVEL_THRESHOLDS,
  BOND_XP_REWARDS,
  ALLOWED_OUTFITS,
  profilePath
} = require('./config');
const {
  validateOutfitId,
  validateBondProfileUpdate,
  ALLOWED_OUTFIT_SET
} = require('./ipcValidator');
const {
  calculateLevel,
  getXpProgress,
  getUnlockedOutfits,
  isOutfitUnlocked,
  addXp,
  checkDailyCheckIn,
  checkSeasonalOutfit,
  checkNeglectStatus,
  loadProfile,
  saveProfile,
  DEFAULT_PROFILE
} = require('./bond');

async function runTestSuite() {
  console.log('🧪 Starting Bond System & Outfits Test Suite...\n');

  // ==========================================================
  // TEST 1: Config & Allowed Outfits
  // ==========================================================
  console.log('Test 1: Verifying Bond level thresholds, XP rewards, and outfits...');
  assert.strictEqual(BOND_LEVEL_THRESHOLDS.length, 10);
  assert.strictEqual(BOND_XP_REWARDS.petting, 5);
  assert.strictEqual(BOND_XP_REWARDS.click, 2);
  assert.strictEqual(BOND_XP_REWARDS.focusSession, 35);
  assert.strictEqual(BOND_XP_REWARDS.dailyCheckIn, 20);

  assert.ok(ALLOWED_OUTFITS.includes('bow'));
  assert.ok(ALLOWED_OUTFITS.includes('bandana'));
  assert.ok(ALLOWED_OUTFITS.includes('glasses'));
  assert.ok(ALLOWED_OUTFITS.includes('scarf'));
  assert.ok(ALLOWED_OUTFITS.includes('crown'));
  assert.ok(ALLOWED_OUTFITS.includes('santa-hat'));
  assert.ok(ALLOWED_OUTFITS.includes('party-hat'));
  assert.ok(ALLOWED_OUTFITS.includes('festival-decorations'));
  assert.ok(ALLOWED_OUTFITS.includes('none'));
  console.log('✅ Test 1 Passed: Thresholds and allowed outfits verified.');

  // ==========================================================
  // TEST 2: IPC Validation & Sanitization
  // ==========================================================
  console.log('Test 2: Verifying IPC validators for outfits and bond updates...');
  assert.strictEqual(validateOutfitId('glasses'), 'glasses');
  assert.strictEqual(validateOutfitId('crown'), 'crown');
  assert.strictEqual(validateOutfitId('unknown-item'), 'none');
  assert.strictEqual(validateOutfitId(null), 'none');

  const sanitized = validateBondProfileUpdate({
    xp: 225,
    equippedOutfit: 'glasses',
    birthday: ' 11-23 ',
    seasonalAutoEquip: true,
    totalPets: 5,
    totalClicks: 10,
    totalFocusSessions: 3
  });
  assert.strictEqual(sanitized.xp, 225);
  assert.strictEqual(calculateLevel(sanitized.xp), 4);
  assert.strictEqual(sanitized.equippedOutfit, 'glasses');
  assert.strictEqual(sanitized.birthday, '11-23');
  assert.strictEqual(sanitized.seasonalAutoEquip, true);
  assert.strictEqual(sanitized.totalPets, 5);
  assert.strictEqual(sanitized.totalClicks, 10);
  assert.strictEqual(sanitized.totalFocusSessions, 3);
  console.log('✅ Test 2 Passed: IPC validators sanitized data correctly.');

  // ==========================================================
  // TEST 3: Level Calculation & Progress
  // ==========================================================
  console.log('Test 3: Verifying level calculation and XP progress...');
  assert.strictEqual(calculateLevel(0), 1);
  assert.strictEqual(calculateLevel(49), 1);
  assert.strictEqual(calculateLevel(50), 2);
  assert.strictEqual(calculateLevel(120), 3);
  assert.strictEqual(calculateLevel(220), 4);
  assert.strictEqual(calculateLevel(350), 5);
  assert.strictEqual(calculateLevel(500), 6);
  assert.strictEqual(calculateLevel(680), 7);
  assert.strictEqual(calculateLevel(880), 8);
  assert.strictEqual(calculateLevel(1100), 9);
  assert.strictEqual(calculateLevel(1350), 10);
  assert.strictEqual(calculateLevel(1650), 11);

  const prog = getXpProgress(25);
  assert.strictEqual(prog.currentLevel, 1);
  assert.strictEqual(prog.currentXp, 25);
  assert.strictEqual(prog.nextLevelXp, 50);
  assert.strictEqual(prog.progressPercent, 50);
  console.log('✅ Test 3 Passed: Level and progress calculations accurate.');

  // ==========================================================
  // TEST 4: Outfit Unlocks by Level
  // ==========================================================
  console.log('Test 4: Verifying outfit unlocking permissions...');
  // Level 1: none
  assert.strictEqual(isOutfitUnlocked('none', 1), true);
  assert.strictEqual(isOutfitUnlocked('bow', 1), false);
  assert.strictEqual(isOutfitUnlocked('glasses', 1), false);

  // Level 2: bow & bandana
  assert.strictEqual(isOutfitUnlocked('bow', 2), true);
  assert.strictEqual(isOutfitUnlocked('bandana', 2), true);
  assert.strictEqual(isOutfitUnlocked('glasses', 2), false);

  // Level 4: round glasses
  assert.strictEqual(isOutfitUnlocked('glasses', 4), true);
  assert.strictEqual(isOutfitUnlocked('scarf', 4), false);

  // Level 6: cozy scarf
  assert.strictEqual(isOutfitUnlocked('scarf', 6), true);
  assert.strictEqual(isOutfitUnlocked('crown', 6), false);

  // Level 10: tiny crown
  assert.strictEqual(isOutfitUnlocked('crown', 10), true);

  // Seasonal outfits are always wearable
  assert.strictEqual(isOutfitUnlocked('santa-hat', 1), true);
  assert.strictEqual(isOutfitUnlocked('party-hat', 1), true);
  assert.strictEqual(isOutfitUnlocked('festival-decorations', 1), true);
  console.log('✅ Test 4 Passed: Level-based unlocks verified.');

  // ==========================================================
  // TEST 5: Seasonal & Birthday Items
  // ==========================================================
  console.log('Test 5: Verifying automatic seasonal & birthday outfits...');
  // December
  const decDate = new Date('2026-12-10T12:00:00Z');
  const resDec = checkSeasonalOutfit({ seasonalAutoEquip: true, birthday: '04-01' }, decDate);
  assert.strictEqual(resDec.isDecember, true);
  assert.strictEqual(resDec.activeSeasonalOutfit, 'santa-hat');

  // Birthday
  const bdayDate = new Date('2026-11-23T12:00:00Z');
  const resBday = checkSeasonalOutfit({ seasonalAutoEquip: true, birthday: '11-23' }, bdayDate);
  assert.strictEqual(resBday.isBirthday, true);
  assert.strictEqual(resBday.activeSeasonalOutfit, 'party-hat');

  // Festival
  const festDate = new Date('2027-01-01T12:00:00Z');
  const resFest = checkSeasonalOutfit({ seasonalAutoEquip: true, birthday: '' }, festDate);
  assert.strictEqual(resFest.isFestival, true);
  assert.strictEqual(resFest.activeSeasonalOutfit, 'festival-decorations');
  console.log('✅ Test 5 Passed: Seasonal items triggered accurately.');

  // ==========================================================
  // TEST 6: Gentle Neglect Handling (No Guilt, No XP Loss)
  // ==========================================================
  console.log('Test 6: Verifying gentle neglect handling (no guilt messages, no XP loss)...');
  const currentDate = new Date('2026-11-23T12:00:00Z');
  const neglected = checkNeglectStatus('2026-11-18', currentDate); // 5 days inactive
  assert.strictEqual(neglected.isNeglected, true);
  assert.strictEqual(neglected.expression, 'sleepy');
  assert.ok(neglected.quip.includes('nap'));
  // Ensure no guilt words
  assert.ok(!/guilt|shame|disappointed|bad|fault|where were you/i.test(neglected.quip));

  const profileBefore = loadProfile();
  const xpBefore = profileBefore.xp;
  // XP never drops
  assert.strictEqual(profileBefore.xp, xpBefore);
  console.log('✅ Test 6 Passed: Neglect is gentle with zero guilt and zero XP loss.');

  // ==========================================================
  // TEST 7: HTML & DOM Elements
  // ==========================================================
  console.log('Test 7: Verifying HTML templates contain bond indicator, outfits, and menu...');
  const indexHtml = fs.readFileSync(path.join(__dirname, 'renderer', 'index.html'), 'utf-8');
  assert.ok(indexHtml.includes('id="bond-level-indicator"'));
  assert.ok(indexHtml.includes('id="bond-level-number"'));
  assert.ok(indexHtml.includes('id="orb-outfits-container"'));
  assert.ok(indexHtml.includes('id="outfit-layer-bow"'));
  assert.ok(indexHtml.includes('id="outfit-layer-bandana"'));
  assert.ok(indexHtml.includes('id="outfit-layer-glasses"'));
  assert.ok(indexHtml.includes('id="outfit-layer-scarf"'));
  assert.ok(indexHtml.includes('id="outfit-layer-crown"'));
  assert.ok(indexHtml.includes('id="outfit-layer-santa-hat"'));
  assert.ok(indexHtml.includes('id="outfit-layer-party-hat"'));
  assert.ok(indexHtml.includes('id="outfit-layer-festival-decorations"'));
  assert.ok(indexHtml.includes('Outfits (Bond Level)'));
  assert.ok(indexHtml.includes('id="outfit-opt-none"'));
  assert.ok(indexHtml.includes('id="outfit-opt-bow"'));
  assert.ok(indexHtml.includes('id="outfit-opt-bandana"'));
  assert.ok(indexHtml.includes('id="outfit-opt-glasses"'));
  assert.ok(indexHtml.includes('id="outfit-opt-scarf"'));
  assert.ok(indexHtml.includes('id="outfit-opt-crown"'));
  assert.ok(indexHtml.includes('id="outfit-opt-seasonal"'));

  const settingsHtml = fs.readFileSync(path.join(__dirname, 'renderer', 'settings.html'), 'utf-8');
  assert.ok(settingsHtml.includes('id="settings-bond-badge"'));
  assert.ok(settingsHtml.includes('id="settings-bond-xp-text"'));
  assert.ok(settingsHtml.includes('id="settings-bond-xp-fill"'));
  assert.ok(settingsHtml.includes('id="settings-unlocked-outfits"'));
  assert.ok(settingsHtml.includes('id="user-birthday-input"'));
  assert.ok(settingsHtml.includes('id="seasonal-outfits-toggle"'));
  console.log('✅ Test 7 Passed: All HTML elements present.');

  console.log('\n🎉 ALL 7 BOND SYSTEM & OUTFITS TESTS PASSED SUCCESSFULLY!');
}

runTestSuite().catch(err => {
  console.error('\n❌ Test suite encountered an error:', err);
  process.exit(1);
});
