/**
 * Desktop AI Companion - Mini-Reactions & Games Engine (games.js)
 * 
 * Provides interactive quick riddles, trivia questions, and word games
 * that the companion occasionally offers in the speech bubble.
 * 
 * Supports:
 * - Riddles: Clever lateral-thinking riddles
 * - Trivia: Tech, science, and general knowledge questions
 * - Word Games: Anagram unscrambling and word teasers
 * - Fuzzy normalization and multi-variation answer evaluation
 */

const RIDDLES = [
  {
    id: 'r_map',
    category: 'riddle',
    badge: '🧩 Quick Riddle',
    question: 'I have cities, but no houses. I have mountains, but no trees. I have water, but no fish. What am I?',
    answer: 'a map',
    acceptedAnswers: ['map', 'a map', 'the map', 'world map', 'an atlas', 'atlas']
  },
  {
    id: 'r_keyboard',
    category: 'riddle',
    badge: '🧩 Quick Riddle',
    question: 'What has keys but no locks, space but no room, and you can enter but never go inside?',
    answer: 'a keyboard',
    acceptedAnswers: ['keyboard', 'a keyboard', 'the keyboard', 'computer keyboard']
  },
  {
    id: 'r_echo',
    category: 'riddle',
    badge: '🧩 Quick Riddle',
    question: 'I speak without a mouth and hear without ears. I have no body, but I come alive with wind. What am I?',
    answer: 'an echo',
    acceptedAnswers: ['echo', 'an echo', 'the echo']
  },
  {
    id: 'r_footsteps',
    category: 'riddle',
    badge: '🧩 Quick Riddle',
    question: 'The more you take, the more you leave behind. What am I?',
    answer: 'footsteps',
    acceptedAnswers: ['footsteps', 'footstep', 'steps', 'foot prints', 'footprints']
  },
  {
    id: 'r_stamp',
    category: 'riddle',
    badge: '🧩 Quick Riddle',
    question: 'What can travel all around the world while remaining tucked in a corner?',
    answer: 'a stamp',
    acceptedAnswers: ['stamp', 'a stamp', 'postage stamp', 'a postage stamp']
  },
  {
    id: 'r_battery',
    category: 'riddle',
    badge: '🧩 Quick Riddle',
    question: 'I have no life, but I can die. What am I?',
    answer: 'a battery',
    acceptedAnswers: ['battery', 'a battery', 'the battery']
  },
  {
    id: 'r_coin',
    category: 'riddle',
    badge: '🧩 Quick Riddle',
    question: 'What has a head and a tail, but has no body?',
    answer: 'a coin',
    acceptedAnswers: ['coin', 'a coin', 'penny', 'quarter', 'nickel', 'dime']
  },
  {
    id: 'r_comb',
    category: 'riddle',
    badge: '🧩 Quick Riddle',
    question: 'What has many teeth, but cannot bite?',
    answer: 'a comb',
    acceptedAnswers: ['comb', 'a comb', 'hair comb']
  },
  {
    id: 'r_m',
    category: 'riddle',
    badge: '🧩 Quick Riddle',
    question: 'What comes once in a minute, twice in a moment, but never in a thousand years?',
    answer: 'the letter M',
    acceptedAnswers: ['m', 'the letter m', 'letter m']
  },
  {
    id: 'r_promise',
    category: 'riddle',
    badge: '🧩 Quick Riddle',
    question: 'What can you break, even if you never pick it up or touch it?',
    answer: 'a promise',
    acceptedAnswers: ['promise', 'a promise', 'silence', 'trust']
  },
  {
    id: 'r_candle',
    category: 'riddle',
    badge: '🧩 Quick Riddle',
    question: 'I am tall when I am young, and I am short when I am old. What am I?',
    answer: 'a candle',
    acceptedAnswers: ['candle', 'a candle', 'pencil', 'a pencil']
  }
];

const TRIVIA = [
  {
    id: 't_java',
    category: 'trivia',
    badge: '🧠 Quick Trivia',
    question: 'What programming language was originally called Oak before being renamed in 1995?',
    answer: 'Java',
    acceptedAnswers: ['java']
  },
  {
    id: 't_http',
    category: 'trivia',
    badge: '🧠 Quick Trivia',
    question: 'In computer networking, what does the letter "P" in HTTP stand for?',
    answer: 'Protocol',
    acceptedAnswers: ['protocol', 'protocols']
  },
  {
    id: 't_saturn',
    category: 'trivia',
    badge: '🧠 Quick Trivia',
    question: 'Which planet in our solar system is famous for its prominent, extensive planetary rings?',
    answer: 'Saturn',
    acceptedAnswers: ['saturn']
  },
  {
    id: 't_wood_mouse',
    category: 'trivia',
    badge: '🧠 Quick Trivia',
    question: 'What natural material was the first computer mouse invented by Douglas Engelbart made of?',
    answer: 'Wood',
    acceptedAnswers: ['wood', 'wooden', 'lumber']
  },
  {
    id: 't_css',
    category: 'trivia',
    badge: '🧠 Quick Trivia',
    question: 'In web styling, what does the first "C" in CSS stand for?',
    answer: 'Cascading',
    acceptedAnswers: ['cascading', 'cascade']
  },
  {
    id: 't_venus',
    category: 'trivia',
    badge: '🧠 Quick Trivia',
    question: 'Which planet is the hottest in our solar system due to a dense greenhouse atmosphere?',
    answer: 'Venus',
    acceptedAnswers: ['venus']
  },
  {
    id: 't_linux',
    category: 'trivia',
    badge: '🧠 Quick Trivia',
    question: 'What is the first name of the Finnish programmer who created the Linux operating system kernel?',
    answer: 'Linus',
    acceptedAnswers: ['linus', 'linus torvalds', 'torvalds']
  },
  {
    id: 't_bump',
    category: 'trivia',
    badge: '🧠 Quick Trivia',
    question: 'On standard QWERTY keyboards, which two letter keys have physical tactile bumps for home row navigation?',
    answer: 'F and J',
    acceptedAnswers: ['f and j', 'f, j', 'f j', 'j and f', 'j, f', 'j f']
  },
  {
    id: 't_binary',
    category: 'trivia',
    badge: '🧠 Quick Trivia',
    question: 'How many distinct states or values can a single computer bit represent?',
    answer: 'Two (0 and 1)',
    acceptedAnswers: ['two', '2', '0 and 1', 'binary', 'two states']
  },
  {
    id: 't_carbon',
    category: 'trivia',
    badge: '🧠 Quick Trivia',
    question: 'What is the atomic number of Carbon on the periodic table?',
    answer: '6',
    acceptedAnswers: ['6', 'six']
  }
];

const WORD_GAMES = [
  {
    id: 'w_function',
    category: 'word',
    badge: '🔤 Word Scramble',
    question: 'Unscramble this coding keyword: F N U C O I T N',
    answer: 'function',
    acceptedAnswers: ['function']
  },
  {
    id: 'w_browser',
    category: 'word',
    badge: '🔤 Word Scramble',
    question: 'Unscramble this web tool: B O R W E S R',
    answer: 'browser',
    acceptedAnswers: ['browser']
  },
  {
    id: 'w_widget',
    category: 'word',
    badge: '🔤 Word Scramble',
    question: 'Unscramble this desktop element: W E I D G T',
    answer: 'widget',
    acceptedAnswers: ['widget']
  },
  {
    id: 'w_pixel',
    category: 'word',
    badge: '🔤 Word Scramble',
    question: 'Unscramble this display element: P I E X L',
    answer: 'pixel',
    acceptedAnswers: ['pixel']
  },
  {
    id: 'w_laptop',
    category: 'word',
    badge: '🔤 Word Scramble',
    question: 'Unscramble this hardware device: P T P O A L',
    answer: 'laptop',
    acceptedAnswers: ['laptop']
  },
  {
    id: 'w_server',
    category: 'word',
    badge: '🔤 Word Scramble',
    question: 'Unscramble this network machine: S R R V E E',
    answer: 'server',
    acceptedAnswers: ['server']
  },
  {
    id: 'w_companion',
    category: 'word',
    badge: '🔤 Word Scramble',
    question: 'Unscramble this friendly partner: C O M P O N I A N',
    answer: 'companion',
    acceptedAnswers: ['companion']
  },
  {
    id: 'w_package',
    category: 'word',
    badge: '🔤 Word Scramble',
    question: 'Unscramble this npm bundle: P K A C A E G',
    answer: 'package',
    acceptedAnswers: ['package']
  },
  {
    id: 'w_token',
    category: 'word',
    badge: '🔤 Word Scramble',
    question: 'Unscramble this auth secret: T O N E K',
    answer: 'token',
    acceptedAnswers: ['token']
  },
  {
    id: 'w_code',
    category: 'word',
    badge: '🔤 Word Scramble',
    question: 'Unscramble this programmer text: O C E D',
    answer: 'code',
    acceptedAnswers: ['code']
  },
  {
    id: 'w_electron',
    category: 'word',
    badge: '🔤 Word Scramble',
    question: 'Unscramble our framework: E C T O R E N L',
    answer: 'electron',
    acceptedAnswers: ['electron']
  },
  {
    id: 'w_matrix',
    category: 'word',
    badge: '🔤 Word Scramble',
    question: 'Unscramble this 2D grid: M X I T R A',
    answer: 'matrix',
    acceptedAnswers: ['matrix']
  },
  {
    id: 'w_binary',
    category: 'word',
    badge: '🔤 Word Scramble',
    question: 'Unscramble this base-2 language: B N R Y A I',
    answer: 'binary',
    acceptedAnswers: ['binary']
  }
];

const ALL_GAMES = [...RIDDLES, ...TRIVIA, ...WORD_GAMES];

/**
 * Normalizes user input by trimming, lowercasing, stripping punctuation,
 * and removing conversational prefixes ("it's a...", "the...", "is it...").
 * 
 * @param {string} text 
 * @returns {string} Normalized token
 */
function normalizeAnswer(text) {
  if (!text || typeof text !== 'string') return '';
  let clean = text.toLowerCase().trim();
  // Strip trailing punctuation
  clean = clean.replace(/[.,!?;:'"“”]+$/, '').trim();
  // Remove conversational leading prefixes
  clean = clean.replace(/^(?:it(?:'s|\s+is)\s+(?:an?|the)?|is\s+it\s+(?:an?|the)?|i\s+think\s+it(?:'s|\s+is)\s+|the\s+|an?\s+)/i, '').trim();
  // Remove extra whitespace
  clean = clean.replace(/\s+/g, ' ');
  return clean;
}

/**
 * Evaluates whether the user's submitted answer matches the game's answer.
 * 
 * @param {object} game - Game definition object
 * @param {string} userAnswer - Text entered or spoken by user
 * @returns {boolean} True if answer matches
 */
function checkGameAnswer(game, userAnswer) {
  if (!game || !userAnswer) return false;

  const userNorm = normalizeAnswer(userAnswer);
  if (!userNorm) return false;

  const targetNorm = normalizeAnswer(game.answer);
  if (userNorm === targetNorm) return true;

  // Check against accepted answer variants
  const candidates = game.acceptedAnswers || [game.answer];
  for (const cand of candidates) {
    const candNorm = normalizeAnswer(cand);
    if (userNorm === candNorm) {
      return true;
    }
  }

  // Check if candidate is exact isolated word in user speech (e.g. user said "I think it is an echo")
  const words = userNorm.split(' ');
  for (const cand of candidates) {
    const candNorm = normalizeAnswer(cand);
    if (candNorm && (words.includes(candNorm) || userNorm.endsWith(candNorm))) {
      return true;
    }
  }

  return false;
}

/**
 * Returns a random game from the catalog, optionally filtered by category.
 * 
 * @param {'riddle' | 'trivia' | 'word'} [category] 
 * @param {Array<string>} [excludeIds=[]] - IDs to avoid repeating in a session
 * @returns {object} Random game item
 */
function getRandomGame(category, excludeIds = []) {
  let pool = ALL_GAMES;
  if (category === 'riddle') pool = RIDDLES;
  else if (category === 'trivia') pool = TRIVIA;
  else if (category === 'word') pool = WORD_GAMES;

  const filtered = pool.filter(g => !excludeIds.includes(g.id));
  const activePool = filtered.length > 0 ? filtered : pool;
  const choice = activePool[Math.floor(Math.random() * activePool.length)];
  return { ...choice };
}

// UMD / CommonJS export
if (typeof module === 'object' && module.exports) {
  module.exports = {
    RIDDLES,
    TRIVIA,
    WORD_GAMES,
    ALL_GAMES,
    normalizeAnswer,
    checkGameAnswer,
    getRandomGame
  };
} else if (typeof root !== 'undefined') {
  root.CompanionGames = {
    RIDDLES,
    TRIVIA,
    WORD_GAMES,
    ALL_GAMES,
    normalizeAnswer,
    checkGameAnswer,
    getRandomGame
  };
} else if (typeof window !== 'undefined') {
  window.CompanionGames = {
    RIDDLES,
    TRIVIA,
    WORD_GAMES,
    ALL_GAMES,
    normalizeAnswer,
    checkGameAnswer,
    getRandomGame
  };
}
