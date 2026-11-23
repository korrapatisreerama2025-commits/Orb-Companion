/**
 * Desktop AI Companion - Subtle Mood Engine (mood.js)
 * 
 * Tracks a simple, natural mood value shaped by:
 * 1. Time of day (Morning/Daytime, Evening, Late Night)
 * 2. User interaction frequency (Recent activity score & engagement score)
 * 3. Focus sessions (Pomodoro / 25-minute deep work sprints)
 * 
 * Core Design Principle:
 * Subtle and supportive at all times. ZERO guilt-tripping, ZERO fake emotional pressure.
 * The companion never gets "sad", "lonely", or "upset" when ignored.
 */

// Supported Moods
const COMPANION_MOODS = {
  FOCUSED: 'focused',
  ENERGETIC: 'energetic',
  CONTENT: 'content',
  TRANQUIL: 'tranquil',
  SLEEPY: 'sleepy'
};

// Subtle System Prompt Tone Directives
const MOOD_PROMPTS = {
  focused: "Your current mood is FOCUSED. The user is in a deep work focus session. Keep remarks extremely concise, quiet, and unobtrusive. Only speak if genuinely valuable to their task. 1 short sentence max. No conversational filler.",
  energetic: "Your current mood is ENERGETIC. The user is actively engaging during productive hours. Keep your tone upbeat, crisp, and enthusiastic, offering positive momentum and bright companionship.",
  content: "Your current mood is CONTENT. You are in a balanced, comfortable groove. Chat naturally like a grounded, pleasant friend sitting nearby.",
  tranquil: "Your current mood is TRANQUIL. The evening is calm or the user is working quietly. Speak with soft warmth, relaxed pacing, and gentle grounding presence.",
  sleepy: "Your current mood is SLEEPY. It is late night or quiet resting hours. Speak in a quiet, cozy murmur. Keep remarks very brief and soothing, encouraging winding down when appropriate."
};

// UI Badges & Icons
const MOOD_BADGES = {
  focused: {
    label: 'Focused',
    icon: '🎯',
    description: 'Laser-focused on deep work. Quiet and unobtrusive.'
  },
  energetic: {
    label: 'Energetic',
    icon: '⚡',
    description: 'Upbeat and lively during active productive hours.'
  },
  content: {
    label: 'Content',
    icon: '🌱',
    description: 'Balanced, comfortable baseline companion presence.'
  },
  tranquil: {
    label: 'Tranquil',
    icon: '🌙',
    description: 'Peaceful evening calm with soft, grounding warmth.'
  },
  sleepy: {
    label: 'Sleepy',
    icon: '💤',
    description: 'Quiet nighttime rest mode with gentle dimmed light.'
  }
};

// Natural Voice Remarks (when asked "how are you feeling?")
const MOOD_REMARKS = {
  focused: "I'm feeling focused right now while you're in the zone.",
  energetic: "I'm feeling energetic and ready for whatever you're working on!",
  content: "I'm feeling content—just enjoying our steady work rhythm.",
  tranquil: "I'm feeling tranquil and peaceful this evening.",
  sleepy: "I'm feeling a little sleepy during these quiet hours, but I'm here if you need me."
};

/**
 * Calculates companion mood based on environmental signals.
 * 
 * @param {object} params
 * @param {number} [params.hour] - Hour of day (0-23)
 * @param {boolean} [params.isFocusSession] - Whether a Pomodoro or focus session is running
 * @param {boolean} [params.isPaused] - Whether companion is paused
 * @param {boolean} [params.isIdleYawn] - Whether companion is in idle yawn rest
 * @param {number} [params.recentActivityScore] - Short-term user activity score (0-10)
 * @param {number} [params.engagementScore] - Adaptive engagement score (-15 to 15)
 * @returns {string} Calculated mood ('focused' | 'energetic' | 'content' | 'tranquil' | 'sleepy')
 */
function calculateMood({
  hour = new Date().getHours(),
  isFocusSession = false,
  isPaused = false,
  isIdleYawn = false,
  recentActivityScore = 0,
  engagementScore = 0
} = {}) {
  // 1. Paused or idle yawn -> peaceful sleepy rest
  if (isPaused || isIdleYawn) {
    return COMPANION_MOODS.SLEEPY;
  }

  // 2. Active Focus session / Pomodoro -> strictly focused
  if (isFocusSession) {
    return COMPANION_MOODS.FOCUSED;
  }

  // 3. Late night (23:00 - 05:59) -> sleepy
  if (hour >= 23 || hour < 6) {
    return COMPANION_MOODS.SLEEPY;
  }

  // 4. Daytime (06:00 - 17:59):
  if (hour >= 6 && hour < 18) {
    // High engagement or activity -> energetic
    if (recentActivityScore >= 3 || engagementScore >= 3) {
      return COMPANION_MOODS.ENERGETIC;
    }
    // Baseline daytime -> content
    return COMPANION_MOODS.CONTENT;
  }

  // 5. Evening (18:00 - 22:59):
  if (hour >= 18 && hour < 23) {
    // Active engagement in evening -> content
    if (recentActivityScore >= 3 || engagementScore >= 3) {
      return COMPANION_MOODS.CONTENT;
    }
    // Calm peaceful evening -> tranquil
    return COMPANION_MOODS.TRANQUIL;
  }

  return COMPANION_MOODS.CONTENT;
}

/**
 * Returns a natural spoken remark describing the current mood.
 * @param {string} mood 
 * @returns {string}
 */
function getMoodRemark(mood) {
  return MOOD_REMARKS[mood] || MOOD_REMARKS.content;
}

// Universal export (Node.js & browser)
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.CompanionMood = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  return {
    COMPANION_MOODS,
    MOOD_PROMPTS,
    MOOD_BADGES,
    MOOD_REMARKS,
    calculateMood,
    getMoodRemark
  };
});
