/**
 * Desktop AI Companion - Mini-Reactions & Games Test Suite (test-games-suite.js)
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

async function runTestSuite() {
  console.log('🧪 Starting Mini-Reactions & Games Test Suite...\n');

  // ==========================================================
  // TEST 1: games.js Catalog & Structure
  // ==========================================================
  console.log('Test 1: Verifying games.js catalog and structure...');
  const games = require('./games');
  assert.ok(Array.isArray(games.RIDDLES), 'RIDDLES should be an array');
  assert.ok(games.RIDDLES.length >= 10, 'Should have at least 10 riddles');
  assert.ok(Array.isArray(games.TRIVIA), 'TRIVIA should be an array');
  assert.ok(games.TRIVIA.length >= 10, 'Should have at least 10 trivia questions');
  assert.ok(Array.isArray(games.WORD_GAMES), 'WORD_GAMES should be an array');
  assert.ok(games.WORD_GAMES.length >= 10, 'Should have at least 10 word games');
  assert.strictEqual(games.ALL_GAMES.length, games.RIDDLES.length + games.TRIVIA.length + games.WORD_GAMES.length, 'ALL_GAMES should contain all categories');

  // Verify each item has required properties
  for (const g of games.ALL_GAMES) {
    assert.ok(g.id, 'Game item must have an id');
    assert.ok(g.category, 'Game item must have a category');
    assert.ok(g.badge, 'Game item must have a badge');
    assert.ok(g.question, 'Game item must have a question');
    assert.ok(g.answer, 'Game item must have an answer');
    assert.ok(Array.isArray(g.acceptedAnswers), 'Game item must have acceptedAnswers array');
  }
  console.log('  ✓ Catalog contains ' + games.ALL_GAMES.length + ' verified games across riddles, trivia, and word scrambles.');

  // ==========================================================
  // TEST 2: normalizeAnswer & checkGameAnswer
  // ==========================================================
  console.log('\nTest 2: Verifying normalizeAnswer and checkGameAnswer logic...');
  
  // Normalization
  assert.strictEqual(games.normalizeAnswer("It's a map!"), 'map');
  assert.strictEqual(games.normalizeAnswer("The keyboard."), 'keyboard');
  assert.strictEqual(games.normalizeAnswer("Is it an echo?"), 'echo');

  // Answer checking on riddle
  const mapRiddle = games.RIDDLES.find(r => r.id === 'r_map');
  assert.ok(games.checkGameAnswer(mapRiddle, 'map'), 'Should accept "map"');
  assert.ok(games.checkGameAnswer(mapRiddle, 'a map'), 'Should accept "a map"');
  assert.ok(games.checkGameAnswer(mapRiddle, "It's an atlas!"), 'Should accept "It\'s an atlas!"');
  assert.strictEqual(games.checkGameAnswer(mapRiddle, 'a banana'), false, 'Should reject wrong answer "a banana"');

  // Answer checking on word game (scramble)
  const codeGame = games.WORD_GAMES.find(w => w.id === 'w_code');
  assert.ok(games.checkGameAnswer(codeGame, 'code'), 'Should accept "code"');
  assert.ok(games.checkGameAnswer(codeGame, 'CODE'), 'Should be case-insensitive');
  assert.strictEqual(games.checkGameAnswer(codeGame, 'deco'), false, 'Should reject incorrect scramble');

  // Random selection
  const randRiddle = games.getRandomGame('riddle');
  assert.strictEqual(randRiddle.category, 'riddle');
  const randTrivia = games.getRandomGame('trivia');
  assert.strictEqual(randTrivia.category, 'trivia');
  const randWord = games.getRandomGame('word');
  assert.strictEqual(randWord.category, 'word');
  console.log('  ✓ normalizeAnswer and checkGameAnswer handle exact, spoken, and variant answers correctly.');

  // ==========================================================
  // TEST 3: Voice Commands Interception for Games
  // ==========================================================
  console.log('\nTest 3: Verifying commands.js voice command integration...');
  const CompanionVoiceCommands = require('./renderer/commands');

  // Active game answer checking
  const activeGameContext = {
    activeGame: mapRiddle,
    checkGameAnswer: games.checkGameAnswer
  };

  // Skip active game
  const skipResult = await CompanionVoiceCommands.evaluateVoiceCommand('skip', activeGameContext);
  assert.strictEqual(skipResult.handled, true);
  assert.strictEqual(skipResult.isGameSkip, true);

  const giveUpResult = await CompanionVoiceCommands.evaluateVoiceCommand('I give up', activeGameContext);
  assert.strictEqual(giveUpResult.handled, true);
  assert.strictEqual(giveUpResult.isGameSkip, true);

  // Correct answer via voice
  const correctResult = await CompanionVoiceCommands.evaluateVoiceCommand("It's a map!", activeGameContext);
  assert.strictEqual(correctResult.handled, true);
  assert.strictEqual(correctResult.isGameAnswer, true);
  assert.strictEqual(correctResult.correct, true);

  // Wrong answer via voice
  const wrongResult = await CompanionVoiceCommands.evaluateVoiceCommand('spaceship', activeGameContext);
  assert.strictEqual(wrongResult.handled, true);
  assert.strictEqual(wrongResult.isGameAnswer, true);
  assert.strictEqual(wrongResult.correct, false);

  // Score inquiry command
  const scoreContext = {
    getScore: () => 5
  };
  const scoreResult = await CompanionVoiceCommands.evaluateVoiceCommand("what's my score?", scoreContext);
  assert.strictEqual(scoreResult.handled, true);
  assert.strictEqual(scoreResult.badge, '⭐ Score');
  assert.ok(scoreResult.message.includes('5 points'));

  // Trigger game voice command
  const triggerResult = await CompanionVoiceCommands.evaluateVoiceCommand('give me a riddle', {});
  assert.strictEqual(triggerResult.handled, true);
  assert.strictEqual(triggerResult.isGameTrigger, true);
  assert.strictEqual(triggerResult.category, 'riddle');

  const triviaTrigger = await CompanionVoiceCommands.evaluateVoiceCommand('ask me a trivia question', {});
  assert.strictEqual(triviaTrigger.handled, true);
  assert.strictEqual(triviaTrigger.isGameTrigger, true);
  assert.strictEqual(triviaTrigger.category, 'trivia');
  console.log('  ✓ Voice commands successfully route answers, skips, score checks, and game requests.');

  // ==========================================================
  // TEST 4: Config & Settings Persistence
  // ==========================================================
  console.log('\nTest 4: Verifying config.js & settings.json defaults...');
  const { DEFAULT_CONFIG } = require('./config');
  assert.strictEqual(DEFAULT_CONFIG.doNotDisturbGames, false, 'doNotDisturbGames default should be false');
  assert.strictEqual(DEFAULT_CONFIG.gameScore, 0, 'gameScore default should be 0');

  const settingsJson = JSON.parse(fs.readFileSync(path.join(__dirname, 'settings.json'), 'utf-8'));
  assert.strictEqual(settingsJson.doNotDisturbGames, false);
  assert.strictEqual(settingsJson.gameScore, 0);
  console.log('  ✓ config.js and settings.json properly declare doNotDisturbGames and gameScore.');

  // ==========================================================
  // TEST 5: HTML, CSS & Package Manifest
  // ==========================================================
  console.log('\nTest 5: Verifying HTML, CSS, and package.json...');
  const indexHtml = fs.readFileSync(path.join(__dirname, 'renderer', 'index.html'), 'utf-8');
  assert.ok(indexHtml.includes('id="game-score-badge"'), 'index.html should contain game-score-badge');
  assert.ok(indexHtml.includes('id="game-score-val"'), 'index.html should contain game-score-val');
  assert.ok(indexHtml.includes('id="menu-play-game"'), 'index.html should contain menu-play-game');
  assert.ok(indexHtml.includes('src="../games.js"'), 'index.html should include games.js script tag');

  const settingsHtml = fs.readFileSync(path.join(__dirname, 'renderer', 'settings.html'), 'utf-8');
  assert.ok(settingsHtml.includes('id="dnd-games-toggle"'), 'settings.html should contain dnd-games-toggle');

  const styleCss = fs.readFileSync(path.join(__dirname, 'renderer', 'style.css'), 'utf-8');
  assert.ok(styleCss.includes('.game-score-badge'), 'style.css should style game-score-badge');
  assert.ok(styleCss.includes('.speech-bubble.game-mode'), 'style.css should style game-mode speech bubble');
  assert.ok(styleCss.includes('.game-card'), 'style.css should style game-card');

  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf-8'));
  assert.ok(pkg.build.files.includes('games.js'), 'package.json files array should include games.js');
  console.log('  ✓ UI markup, styling, and electron-builder files manifest verified.');

  console.log('\n🎉 ALL MINI-REACTIONS & GAMES TESTS PASSED SUCCESSFULLY!');
}

runTestSuite().catch(err => {
  console.error('\n❌ Test suite failed:', err);
  process.exit(1);
});
