const { contextBridge, ipcRenderer } = require('electron');

let parseStructuredAction = (text) => ({ cleanText: text, action: null });
try {
  const actionsMod = require('./actions');
  if (actionsMod && typeof actionsMod.parseStructuredAction === 'function') {
    parseStructuredAction = actionsMod.parseStructuredAction;
  }
} catch (err) {
  console.warn('[Preload] Failed to require ./actions in preload:', err.message);
}

contextBridge.exposeInMainWorld('companionAPI', {
  captureScreenWithHash: () => ipcRenderer.invoke('capture-screen-with-hash'),
  startClaudeStream: (params) => ipcRenderer.send('start-claude-stream', params),
  onClaudeStreamDelta: (callback) => ipcRenderer.on('claude-stream-delta', (e, data) => callback(data)),
  onClaudeStreamEnd: (callback) => ipcRenderer.on('claude-stream-end', (e, data) => callback(data)),
  onClaudeStreamError: (callback) => ipcRenderer.on('claude-stream-error', (e, data) => callback(data)),
  getConfig: () => ipcRenderer.invoke('get-config'),
  saveConfig: (newConfig) => ipcRenderer.invoke('save-config', newConfig),
  getMemory: () => ipcRenderer.invoke('get-memory'),
  saveMemory: (newMemory) => ipcRenderer.invoke('save-memory', newMemory),
  setIgnoreMouseEvents: (ignore, options) => ipcRenderer.send('set-ignore-mouse-events', ignore, options),
  moveWindow: (deltaX, deltaY) => ipcRenderer.send('window-move', { deltaX, deltaY }),
  snapToCorner: (reduceMotion) => ipcRenderer.invoke('snap-window-to-corner', reduceMotion),
  openSettingsWindow: () => ipcRenderer.send('open-settings-window'),
  closeSettingsWindow: () => ipcRenderer.send('close-settings-window'),
  getLoginItemSettings: () => ipcRenderer.invoke('get-login-item-settings'),
  setLoginItemSettings: (openAtLogin) => ipcRenderer.invoke('set-login-item-settings', openAtLogin),
  onConfigUpdated: (callback) => ipcRenderer.on('config-updated', (e, data) => callback(data)),
  quitApp: () => ipcRenderer.send('quit-app'),
  onTogglePause: (callback) => {
    ipcRenderer.on('shortcut-toggle-pause', () => callback());
  },
  onGlobalPttDown: (callback) => {
    ipcRenderer.on('global-ptt-down', () => callback());
  },
  onTriggerHelpMode: (callback) => {
    ipcRenderer.on('trigger-help-mode', () => callback());
  },
  onTriggerQuickNote: (callback) => {
    ipcRenderer.on('trigger-quick-note', () => callback());
  },
  saveNote: (noteText) => ipcRenderer.invoke('save-note', noteText),
  getNotesToday: () => ipcRenderer.invoke('get-notes-today'),
  getActiveWindow: () => ipcRenderer.invoke('get-active-window'),
  onClipboardActionOffer: (callback) => {
    ipcRenderer.on('clipboard-action-offer', (e, data) => callback(data));
  },
  onCursorTrack: (callback) => {
    ipcRenderer.on('cursor-track', (e, data) => callback(data));
  },
  onApiUsageUpdated: (callback) => {
    ipcRenderer.on('api-usage-updated', (e, data) => callback(data));
  },
  onWaveGoodbye: (callback) => {
    ipcRenderer.on('companion-wave-goodbye', (e, data) => callback(data));
  },
  getDisplays: () => ipcRenderer.invoke('get-displays'),
  moveToDisplay: (displayId) => ipcRenderer.invoke('move-to-display', displayId),
  onDisplayChanged: (callback) => {
    ipcRenderer.on('display-changed', (e, data) => callback(data));
  },
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  openApp: (appName) => ipcRenderer.invoke('open-app', appName),
  testOllamaConnection: (host) => ipcRenderer.invoke('test-ollama-connection', host),
  setLocalOnly: (enabled) => ipcRenderer.invoke('set-local-only', enabled),
  getScreenMode: () => ipcRenderer.invoke('get-screen-mode'),
  setScreenMode: (mode) => ipcRenderer.invoke('set-screen-mode', mode),
  setSmartScreenModes: (enabled) => ipcRenderer.invoke('set-smart-screen-modes', enabled),
  triggerRegionFocus: () => ipcRenderer.send('start-region-focus'),
  cancelRegionFocus: () => ipcRenderer.send('cancel-region-focus'),
  getFocusedRegion: () => ipcRenderer.invoke('get-focused-region'),
  clearFocusedRegion: () => ipcRenderer.invoke('clear-focused-region'),
  consumeFocusedRegion: () => ipcRenderer.invoke('consume-focused-region'),
  onRegionFocusChanged: (callback) => {
    ipcRenderer.on('region-focus-changed', (e, data) => callback(data));
  },
  onTriggerRegionFocus: (callback) => {
    ipcRenderer.on('trigger-region-focus', () => callback());
  },
  snipComplete: (rect) => ipcRenderer.send('snip-complete', rect),
  snipCancel: () => ipcRenderer.send('snip-cancel'),
  getCharacterProfiles: () => ipcRenderer.invoke('get-character-profiles'),
  switchCharacterProfile: (profileId) => ipcRenderer.invoke('switch-character-profile', profileId),
  saveCharacterProfile: (profile) => ipcRenderer.invoke('save-character-profile', profile),
  deleteCharacterProfile: (profileId) => ipcRenderer.invoke('delete-character-profile', profileId),
  onProfileChanged: (callback) => {
    ipcRenderer.on('profile-changed', (e, data) => callback(data));
  },
  parseStructuredAction: (text) => parseStructuredAction(text),
  executeSafeAction: (action) => ipcRenderer.invoke('execute-safe-action', action),
  onReminderTrigger: (callback) => {
    ipcRenderer.on('companion-reminder-trigger', (e, data) => callback(data));
  },
  onPowerStateChanged: (callback) => {
    ipcRenderer.on('power-state-changed', (e, data) => callback(data));
  },
  getCompanionFolderPath: () => ipcRenderer.invoke('get-companion-folder-path'),
  getAllowedSafeActions: () => ipcRenderer.invoke('get-allowed-safe-actions'),
  onSelectToAskOffer: (callback) => {
    ipcRenderer.on('select-to-ask-offer', (e, data) => callback(data));
  },
  triggerSelectToAsk: (overrideText) => ipcRenderer.invoke('trigger-select-to-ask', overrideText),
  getBondProfile: () => ipcRenderer.invoke('get-bond-profile'),
  saveBondProfile: (profile) => ipcRenderer.invoke('save-bond-profile', profile),
  addBondXp: (amount, reason) => ipcRenderer.invoke('add-bond-xp', amount, reason),
  equipOutfit: (outfitId) => ipcRenderer.invoke('equip-outfit', outfitId),
  checkDailyCheckIn: () => ipcRenderer.invoke('check-daily-checkin'),
  checkNeglect: (lastDate) => ipcRenderer.invoke('check-neglect', lastDate),
  onBondUpdated: (callback) => {
    ipcRenderer.on('bond-updated', (e, data) => callback(data));
  }
});
