/**
 * Desktop AI Companion - Cute Character Face & Expressions Test Suite (test-characterface-suite.js)
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  parseStructuredAction,
  ALLOWED_EXPRESSIONS
} = require('./actions');
const {
  buildSystemPrompt,
  buildOllamaSystemPrompt
} = require('./api');

async function runTestSuite() {
  console.log('🧪 Starting Cute Character Face & Expressions Test Suite...\n');

  // ==========================================================
  // TEST 1: Expression Whitelist & Parser
  // ==========================================================
  console.log('Test 1: Verifying Expression Whitelist & Structured Parser...');
  assert.strictEqual(ALLOWED_EXPRESSIONS.has('happy'), true);
  assert.strictEqual(ALLOWED_EXPRESSIONS.has('curious'), true);
  assert.strictEqual(ALLOWED_EXPRESSIONS.has('excited'), true);
  assert.strictEqual(ALLOWED_EXPRESSIONS.has('surprised'), true);
  assert.strictEqual(ALLOWED_EXPRESSIONS.has('worried'), true);

  // Standalone expression extraction & text stripping
  const res1 = parseStructuredAction('You are doing great work! {"expression": "happy"}');
  assert.strictEqual(res1.expression, 'happy');
  assert.strictEqual(res1.cleanText, 'You are doing great work!');
  assert.strictEqual(res1.action, null);

  // Combined with safe action
  const res2 = parseStructuredAction('Opening documentation. ```json\n{"action": "open_url", "params": {"url": "https://electronjs.org"}, "expression": "curious"}\n```');
  assert.strictEqual(res2.expression, 'curious');
  assert.strictEqual(res2.action.type, 'open_url');
  assert.strictEqual(res2.cleanText, 'Opening documentation.');

  // Disallowed expression rejection
  const res3 = parseStructuredAction('Testing disallowed. {"expression": "malicious_mode"}');
  assert.strictEqual(res3.expression, null);
  assert.strictEqual(res3.cleanText, 'Testing disallowed.');
  console.log('  ✅ Expression whitelist and parser verified successfully.\n');

  // ==========================================================
  // TEST 2: System Prompts Assembly
  // ==========================================================
  console.log('Test 2: Verifying Prompt Assembly with Expression Directives...');
  const claudePrompt = buildSystemPrompt({ personality: 'friendly', mood: 'curious', smartScreenModes: true });
  assert.ok(claudePrompt.includes('[EMOTIONAL EXPRESSIONS]'), 'Claude prompt must include [EMOTIONAL EXPRESSIONS]');
  assert.ok(claudePrompt.includes('happy, curious, excited, surprised, worried'), 'Claude prompt must list valid expressions');

  const ollamaPrompt = buildOllamaSystemPrompt({ personality: 'friendly', mood: 'curious', smartScreenModes: true });
  assert.ok(ollamaPrompt.includes('[Face Expressions: Include {"expression": "happy"|"curious"|"excited"|"surprised"|"worried"} to set your face.]'), 'Ollama prompt must include expression directive');
  console.log('  ✅ System prompts verified successfully.\n');

  // ==========================================================
  // TEST 3: SVG Character Face Markup in index.html
  // ==========================================================
  console.log('Test 3: Verifying SVG Character Face Markup in index.html...');
  const htmlPath = path.join(__dirname, 'renderer', 'index.html');
  const html = fs.readFileSync(htmlPath, 'utf-8');

  // Preserves glossy gradient body and specular highlight
  assert.ok(html.includes('<div id="orb" class="orb">'), 'Orb element must exist');
  assert.ok(html.includes('class="orb-highlight"'), 'Specular top-left highlight must be preserved');
  assert.ok(html.includes('id="orb-face"'), 'SVG #orb-face overlay must exist');
  assert.ok(html.includes('id="blush-glow"'), 'Blush glow filter must exist');
  assert.ok(html.includes('class="blush-cheek blush-left"'), 'Left blush cheek must exist');
  assert.ok(html.includes('class="blush-cheek blush-right"'), 'Right blush cheek must exist');

  // All 8 expressions elements
  assert.ok(html.includes('class="eye-state state-happy"'), 'Happy eye (^ ^) must exist');
  assert.ok(html.includes('class="mouth-state state-happy"'), 'Happy mouth must exist');

  assert.ok(html.includes('id="eyebrow-left"'), 'Curious eyebrow must exist');
  assert.ok(html.includes('class="mouth-state state-curious"'), 'Curious off-center mouth must exist');

  assert.ok(html.includes('id="mouth-talking"'), 'Talking mouth must exist');
  assert.ok(html.includes('id="effect-talking"'), 'Sound arcs must exist');

  assert.ok(html.includes('id="effect-thought"'), 'Thought dots must exist');
  assert.ok(html.includes('class="mouth-state state-thinking"'), 'Thinking wavy mouth must exist');

  assert.ok(html.includes('class="eye-state state-sleepy"'), 'Sleepy closed eyes must exist');
  assert.ok(html.includes('id="effect-sleepy"'), 'Floating Zs must exist');
  assert.ok(html.includes('class="mouth-state state-sleepy"'), 'Sleepy tiny o mouth must exist');

  assert.ok(html.includes('class="eye-state state-excited"'), 'Excited sparkly eyes must exist');
  assert.ok(html.includes('id="effect-excited"'), 'Excited sparkles must exist');
  assert.ok(html.includes('class="mouth-state state-excited"'), 'Excited open mouth must exist');

  assert.ok(html.includes('class="eye-surprised-white"'), 'Surprised wide white eyes must exist');
  assert.ok(html.includes('class="mouth-state state-surprised"'), 'Surprised o mouth must exist');

  assert.ok(html.includes('class="mouth-state state-worried"'), 'Worried frown mouth must exist');
  console.log('  ✅ SVG character face markup verified successfully.\n');

  // ==========================================================
  // TEST 4: CSS Styles, Transitions & Reduced Motion
  // ==========================================================
  console.log('Test 4: Verifying CSS Transitions & Reduced Motion in style.css...');
  const cssPath = path.join(__dirname, 'renderer', 'style.css');
  const css = fs.readFileSync(cssPath, 'utf-8');

  // Smooth 200ms transitions
  assert.ok(css.includes('transition: opacity 0.2s cubic-bezier(0.16, 1, 0.3, 1)'), 'Must include 200ms opacity transition');
  assert.ok(css.includes('transform 0.2s cubic-bezier(0.16, 1, 0.3, 1)'), 'Must include 200ms transform transition');

  // Breathing animation
  assert.ok(css.includes('@keyframes orbCharacterBreathe'), 'Must define breathing animation');
  assert.ok(css.includes('orbCharacterBreathe 3.8s ease-in-out infinite'), 'Must apply breathing animation');

  // Expression bounce
  assert.ok(css.includes('@keyframes expressionBounce'), 'Must define expression bounce animation');
  assert.ok(css.includes('.orb.expression-bouncing'), 'Must define bouncing class for orb');

  // Blinking
  assert.ok(css.includes('.orb-face.blinking .face-eyes'), 'Must define blinking eyes squeeze');
  assert.ok(css.includes('transform: scaleY(0.08)'), 'Must squeeze eyes to 0.08 on blink');

  // Cursor tracking pupils
  assert.ok(css.includes('var(--look-x, 0px) * 0.35'), 'Pupil X offset must track cursor');
  assert.ok(css.includes('var(--look-y, 0px) * 0.35'), 'Pupil Y offset must track cursor');

  // Volume-synced talking mouth
  assert.ok(css.includes('scaleY(var(--talking-mouth-scale, 1))'), 'Talking mouth must scale with audio volume');

  // Prefers reduced motion
  assert.ok(css.includes('@media (prefers-reduced-motion: reduce)'), 'Must support prefers-reduced-motion');
  assert.ok(css.includes('.orb.expression-bouncing,'), 'Must disable bounce under reduced motion');
  assert.ok(css.includes('.orb-face,'), 'Must disable breathing under reduced motion');
  console.log('  ✅ CSS styles and reduced motion safety verified successfully.\n');

  // ==========================================================
  // TEST 5: App Controller & Lifecycles in app.js
  // ==========================================================
  console.log('Test 5: Verifying Expression Controller & Lifecycle Wiring in app.js...');
  const appPath = path.join(__dirname, 'renderer', 'app.js');
  const app = fs.readFileSync(appPath, 'utf-8');

  assert.ok(app.includes('document.getElementById(\'orb-face\')'), 'Must reference #orb-face');
  assert.ok(app.includes('function setExpression('), 'Must define setExpression controller');
  assert.ok(app.includes('function scheduleNextBlink('), 'Must define blinking scheduler');
  assert.ok(app.includes('Math.floor(Math.random() * 3000) + 3000'), 'Must schedule blink every 3 to 6 seconds');
  assert.ok(app.includes('window.companionFace'), 'Must expose companionFace API');
  assert.ok(app.includes('setExpression(\'talking\')'), 'Must set talking expression when speaking');
  assert.ok(app.includes('setExpression(\'sleepy\')'), 'Must set sleepy expression when paused or idle');
  assert.ok(app.includes('setExpression(\'excited\''), 'Must set excited expression when task or Pomodoro completes');
  assert.ok(app.includes('setExpression(\'surprised\''), 'Must set surprised expression on large screen change');
  assert.ok(app.includes('setExpression(\'worried\''), 'Must set worried expression on error');
  console.log('  ✅ App controller and lifecycle wiring verified successfully.\n');

  console.log('🎉 All Cute Character Face & Expressions tests passed successfully!');
}

runTestSuite().catch(err => {
  console.error('❌ Test suite failed:', err);
  process.exit(1);
});
