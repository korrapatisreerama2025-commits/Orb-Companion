/**
 * Desktop AI Companion - Bond System & Outfits Engine (bond.js)
 * 
 * Manages:
 * 1. Interaction XP tracking (petting, clicking, focus sessions, daily check-ins).
 * 2. Level calculation and celebratory level-ups.
 * 3. Unlockable outfits by level:
 *    - Level 2: Bow & Bandana
 *    - Level 4: Round Glasses
 *    - Level 6: Cozy Scarf
 *    - Level 10: Tiny Crown
 * 4. Seasonal & Birthday automatic items:
 *    - Santa hat in December
 *    - Party hat on user's birthday
 *    - Festival decorations on celebration dates
 * 5. Gentle neglect handling (sleepy / lonely after 3+ days of inactivity with ZERO guilt messages and ZERO XP loss).
 * 6. Local persistence in profile.json.
 */

const fs = require('fs');
const path = require('path');
const {
  profilePath,
  BOND_LEVEL_THRESHOLDS,
  BOND_XP_REWARDS,
  ALLOWED_OUTFITS
} = require('./config');

const DEFAULT_PROFILE = {
  xp: 0,
  level: 1,
  equippedOutfit: 'none',
  birthday: '', // 'MM-DD', e.g. '11-23'
  seasonalAutoEquip: true,
  lastInteractionDate: new Date().toISOString().slice(0, 10),
  lastCheckInDate: '',
  totalPets: 0,
  totalClicks: 0,
  totalFocusSessions: 0
};

/**
 * Loads profile from local profile.json with fallback defaults.
 * @returns {object} Profile object
 */
function loadProfile() {
  try {
    if (fs.existsSync(profilePath)) {
      const raw = fs.readFileSync(profilePath, 'utf-8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        const xp = Math.max(0, Number.isFinite(parsed.xp) ? Math.round(parsed.xp) : 0);
        const level = calculateLevel(xp);
        return {
          ...DEFAULT_PROFILE,
          ...parsed,
          xp,
          level
        };
      }
    }
  } catch (err) {
    console.warn('[Bond] Failed to read profile.json, using defaults:', err.message);
  }
  return { ...DEFAULT_PROFILE };
}

/**
 * Persists profile updates to profile.json.
 * @param {object} updates 
 * @returns {object} Updated profile
 */
function saveProfile(updates) {
  try {
    const current = loadProfile();
    const cleanUpdates = {};

    if (updates && typeof updates === 'object') {
      if (Number.isFinite(updates.xp)) {
        cleanUpdates.xp = Math.max(0, Math.round(updates.xp));
        cleanUpdates.level = calculateLevel(cleanUpdates.xp);
      }
      if (typeof updates.equippedOutfit === 'string' && ALLOWED_OUTFITS.includes(updates.equippedOutfit)) {
        cleanUpdates.equippedOutfit = updates.equippedOutfit;
      }
      if (typeof updates.birthday === 'string') {
        cleanUpdates.birthday = updates.birthday.trim().slice(0, 10);
      }
      if (updates.seasonalAutoEquip != null) {
        cleanUpdates.seasonalAutoEquip = Boolean(updates.seasonalAutoEquip);
      }
      if (typeof updates.lastInteractionDate === 'string') {
        cleanUpdates.lastInteractionDate = updates.lastInteractionDate.slice(0, 32);
      }
      if (typeof updates.lastCheckInDate === 'string') {
        cleanUpdates.lastCheckInDate = updates.lastCheckInDate.slice(0, 32);
      }
      if (Number.isFinite(updates.totalPets)) cleanUpdates.totalPets = Math.max(0, Math.round(updates.totalPets));
      if (Number.isFinite(updates.totalClicks)) cleanUpdates.totalClicks = Math.max(0, Math.round(updates.totalClicks));
      if (Number.isFinite(updates.totalFocusSessions)) cleanUpdates.totalFocusSessions = Math.max(0, Math.round(updates.totalFocusSessions));
    }

    const merged = { ...current, ...cleanUpdates };
    if (!cleanUpdates.level) {
      merged.level = calculateLevel(merged.xp);
    }

    const dir = path.dirname(profilePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(profilePath, JSON.stringify(merged, null, 2), 'utf-8');
    return merged;
  } catch (err) {
    console.error('[Bond] Error writing profile.json:', err.message);
    return loadProfile();
  }
}

/**
 * Calculates current bond level from XP.
 * XP never resets or decreases.
 * @param {number} xp 
 * @returns {number} Level (1 to 10+)
 */
function calculateLevel(xp) {
  const safeXp = Math.max(0, Math.round(xp || 0));
  for (let i = BOND_LEVEL_THRESHOLDS.length - 1; i >= 0; i--) {
    if (safeXp >= BOND_LEVEL_THRESHOLDS[i].xpRequired) {
      const baseLevel = BOND_LEVEL_THRESHOLDS[i].level;
      if (baseLevel === 10) {
        const extraXp = safeXp - 1350;
        const extraLevels = Math.floor(extraXp / 300);
        return 10 + Math.max(0, extraLevels);
      }
      return baseLevel;
    }
  }
  return 1;
}

/**
 * Computes XP progress towards the next level.
 * @param {number} xp 
 * @returns {{ currentLevel: number, currentXp: number, nextLevelXp: number, progressPercent: number }}
 */
function getXpProgress(xp) {
  const currentXp = Math.max(0, Math.round(xp || 0));
  const currentLevel = calculateLevel(currentXp);

  let currentLevelBaseXp = 0;
  let nextLevelXp = 50;

  if (currentLevel < 10) {
    const curThresh = BOND_LEVEL_THRESHOLDS.find(t => t.level === currentLevel);
    const nextThresh = BOND_LEVEL_THRESHOLDS.find(t => t.level === currentLevel + 1);
    currentLevelBaseXp = curThresh ? curThresh.xpRequired : 0;
    nextLevelXp = nextThresh ? nextThresh.xpRequired : 1350;
  } else {
    currentLevelBaseXp = 1350 + (currentLevel - 10) * 300;
    nextLevelXp = currentLevelBaseXp + 300;
  }

  const range = Math.max(1, nextLevelXp - currentLevelBaseXp);
  const earned = Math.max(0, currentXp - currentLevelBaseXp);
  const progressPercent = Math.min(100, Math.round((earned / range) * 100));

  return {
    currentLevel,
    currentXp,
    currentLevelBaseXp,
    nextLevelXp,
    progressPercent
  };
}

/**
 * Returns all outfit IDs unlocked at the given level.
 * @param {number} level 
 * @returns {string[]} Unlocked outfit IDs
 */
function getUnlockedOutfits(level) {
  const safeLevel = Math.max(1, Math.round(level || 1));
  const unlocked = new Set(['none']);

  for (const t of BOND_LEVEL_THRESHOLDS) {
    if (safeLevel >= t.level && Array.isArray(t.unlocks)) {
      for (const item of t.unlocks) {
        unlocked.add(item);
      }
    }
  }
  return Array.from(unlocked);
}

/**
 * Checks whether an outfit item is unlocked for a given level.
 * Seasonal items and 'none' are always wearable when active.
 * @param {string} outfitId 
 * @param {number} level 
 * @returns {boolean}
 */
function isOutfitUnlocked(outfitId, level) {
  if (!outfitId || outfitId === 'none') return true;
  if (['santa-hat', 'party-hat', 'festival-decorations'].includes(outfitId)) {
    return true;
  }
  const unlocked = getUnlockedOutfits(level);
  return unlocked.includes(outfitId);
}

/**
 * Adds interaction XP, checks for level-ups and new item unlocks,
 * updates interaction date, and saves to profile.json.
 * 
 * @param {number} amount - XP amount to award
 * @param {string} [reason] - 'petting' | 'click' | 'focusSession' | 'dailyCheckIn'
 * @returns {{ xp: number, level: number, oldLevel: number, leveledUp: boolean, unlockedItems: string[], newProfile: object }}
 */
function addXp(amount, reason = '') {
  const profile = loadProfile();
  const safeAmount = Math.max(0, Math.round(amount || 0));
  const oldXp = profile.xp;
  const oldLevel = profile.level;

  const newXp = oldXp + safeAmount;
  const newLevel = calculateLevel(newXp);
  const leveledUp = newLevel > oldLevel;

  const unlockedItems = [];
  if (leveledUp) {
    for (let l = oldLevel + 1; l <= newLevel; l++) {
      const thresh = BOND_LEVEL_THRESHOLDS.find(t => t.level === l);
      if (thresh && Array.isArray(thresh.unlocks)) {
        unlockedItems.push(...thresh.unlocks);
      }
    }
  }

  const updates = {
    xp: newXp,
    level: newLevel,
    lastInteractionDate: new Date().toISOString().slice(0, 10)
  };

  if (reason === 'petting') updates.totalPets = (profile.totalPets || 0) + 1;
  else if (reason === 'click') updates.totalClicks = (profile.totalClicks || 0) + 1;
  else if (reason === 'focusSession') updates.totalFocusSessions = (profile.totalFocusSessions || 0) + 1;

  const saved = saveProfile(updates);

  return {
    xp: newXp,
    level: newLevel,
    oldLevel,
    leveledUp,
    unlockedItems,
    newProfile: saved
  };
}

/**
 * Checks and performs daily check-in XP reward (+20 XP).
 * Triggers once per calendar day on first interaction.
 * @returns {{ checkedIn: boolean, xpAwarded: number, profile: object }}
 */
function checkDailyCheckIn() {
  const profile = loadProfile();
  const today = new Date().toISOString().slice(0, 10);

  if (profile.lastCheckInDate === today) {
    return { checkedIn: false, xpAwarded: 0, profile };
  }

  const res = addXp(BOND_XP_REWARDS.dailyCheckIn, 'dailyCheckIn');
  const updated = saveProfile({ lastCheckInDate: today });

  return {
    checkedIn: true,
    xpAwarded: BOND_XP_REWARDS.dailyCheckIn,
    leveledUp: res.leveledUp,
    unlockedItems: res.unlockedItems,
    profile: updated
  };
}

/**
 * Checks for automatic seasonal items:
 * - Santa hat in December
 * - Party hat on user birthday
 * - Festival decorations on New Year / festive dates
 * 
 * @param {object} [profile] 
 * @param {Date} [currentDate]
 * @returns {{ activeSeasonalOutfit: string|null, isBirthday: boolean, isDecember: boolean, isFestival: boolean }}
 */
function checkSeasonalOutfit(profile = null, currentDate = new Date()) {
  const prof = profile || loadProfile();
  const d = currentDate instanceof Date ? currentDate : new Date(currentDate);

  const month = d.getMonth(); // 0 = Jan, 11 = Dec
  const date = d.getDate();
  const mm = String(month + 1).padStart(2, '0');
  const dd = String(date).padStart(2, '0');
  const todayMmDd = `${mm}-${dd}`;

  const isDecember = month === 11;
  let isBirthday = false;

  if (prof.birthday && typeof prof.birthday === 'string') {
    const cleanBday = prof.birthday.trim().replace(/^\d{4}-/, ''); // Allow YYYY-MM-DD or MM-DD
    if (cleanBday === todayMmDd) {
      isBirthday = true;
    }
  }

  // Festive New Year celebration window (Dec 31 to Jan 2)
  const isFestival = (month === 11 && date === 31) || (month === 0 && (date === 1 || date === 2));

  let activeSeasonalOutfit = null;

  if (prof.seasonalAutoEquip !== false) {
    if (isBirthday) {
      activeSeasonalOutfit = 'party-hat';
    } else if (isDecember) {
      activeSeasonalOutfit = 'santa-hat';
    } else if (isFestival) {
      activeSeasonalOutfit = 'festival-decorations';
    }
  }

  return {
    activeSeasonalOutfit,
    isBirthday,
    isDecember,
    isFestival
  };
}

/**
 * Checks inactivity / neglect status without any guilt messages or XP loss.
 * If 3+ days have elapsed without interaction, returns sleepy/lonely state.
 * 
 * @param {string} lastInteractionDate - 'YYYY-MM-DD'
 * @param {Date} [currentDate]
 * @returns {{ isNeglected: boolean, daysInactive: number, expression: 'sleepy'|'idle', quip: string }}
 */
function checkNeglectStatus(lastInteractionDate, currentDate = new Date()) {
  if (!lastInteractionDate) {
    return { isNeglected: false, daysInactive: 0, expression: 'idle', quip: '' };
  }

  const now = currentDate instanceof Date ? currentDate.getTime() : new Date(currentDate).getTime();
  const lastTime = new Date(lastInteractionDate).getTime();

  if (isNaN(lastTime)) {
    return { isNeglected: false, daysInactive: 0, expression: 'idle', quip: '' };
  }

  const diffMs = now - lastTime;
  const daysInactive = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));

  if (daysInactive >= 3) {
    // Character looks sleepy/lonely, but with ZERO guilt messages and ZERO XP loss
    return {
      isNeglected: true,
      daysInactive,
      expression: 'sleepy',
      quip: "*yawns softly and rubs its eyes* Mmm... hey there! Good to see you again. I was having a peaceful nap."
    };
  }

  return {
    isNeglected: false,
    daysInactive,
    expression: 'idle',
    quip: ''
  };
}

module.exports = {
  DEFAULT_PROFILE,
  loadProfile,
  saveProfile,
  calculateLevel,
  getXpProgress,
  getUnlockedOutfits,
  isOutfitUnlocked,
  addXp,
  checkDailyCheckIn,
  checkSeasonalOutfit,
  checkNeglectStatus
};
