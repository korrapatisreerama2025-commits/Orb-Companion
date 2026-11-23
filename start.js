/**
 * Desktop AI Companion - Startup Wrapper (start.js)
 * Ensures ELECTRON_RUN_AS_NODE is stripped so Electron GUI initializes correctly.
 */

const { spawn } = require('child_process');
const electron = require('electron');

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const args = process.argv.slice(2);
if (args.length === 0) {
  args.push('.');
}

const child = spawn(electron, args, {
  stdio: 'inherit',
  env,
  windowsHide: false
});

child.on('close', code => {
  process.exit(code || 0);
});
