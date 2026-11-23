# Desktop AI Companion

A sleek, expressive, ultra-fast desktop AI companion built with **Electron** using plain HTML, CSS, and modern JavaScript (no frontend frameworks, zero bloat). It floats in the corner of your screen as a living glowing glass orb, glances at what you are doing using Claude's vision capabilities, shifts personality presets and moods, remembers facts about you in a local memory store, listens with push-to-talk (`Ctrl+Space`), and chats like a friend sitting next to you.

---

## 🎭 Personality Presets

Switch presets directly from the right-click **Personality** submenu. Each preset activates a distinct system prompt, custom tailored fallback quips, and a subtle glowing tint on the orb:

1. **Friendly** *(Default)*:
   - **Persona**: Warm, casual, playful, and supportive.
   - **Orb Tint**: Soft warm violet and rosy blush glow (`#8B5CF6`, `#EC4899`, `#FFB3A7`).
2. **Sarcastic**:
   - **Persona**: Witty, snappy, dry humor. Teases you about your tab count, syntax errors, and procrastination like a cynical friend.
   - **Orb Tint**: Electric emerald and sharp acid cyan glow (`#10B981`, `#06B6D4`, `#14B8A6`).
3. **Study Buddy**:
   - **Persona**: Disciplined, encouraging, and focused on momentum, active recall, retention, and study sprints.
   - **Orb Tint**: Energetic golden amber and sapphire focus glow (`#F59E0B`, `#0284C7`, `#38BDF8`).
4. **Calm Mentor**:
   - **Persona**: Tranquil, grounding, and wise. Reminds you to breathe, validates your progress, and encourages deliberate patience.
   - **Orb Tint**: Celestial teal and serene indigo glow (`#0D9488`, `#6366F1`, `#38BDF8`).

---

## 💾 Local Persistence (`settings.json` & `memory.json`)

- **`settings.json`**:
  - Automatically saves and loads your **chosen personality**, **frequency preset**, **voice mute state**, **model**, and **screen position** so everything persists seamlessly between launches.
- **`memory.json`**:
  - Remembers key facts about you (e.g. your name, preferences, current projects).
  - Facts are automatically injected into Claude's prompt context so the companion naturally remembers who you are.
  - Can learn facts directly from your voice in push-to-talk (e.g., *"My name is Korra"* or *"I like clean design"*), and can also be viewed or edited in the in-app **Settings** modal.

---

## 🎙️ Push-to-Talk (`Ctrl+Space`) & Voice Commands

- **Hold `Ctrl+Space` to Speak**:
  - Hold down `Ctrl+Space` anywhere (globally or in-app) to talk back to the companion using the browser's built-in **Web Speech API** (`SpeechRecognition`).
- **Listening State**:
  - While holding, the orb immediately enters **`listening`** mode: the audio ring expands from 41px to 47px, colors brighten, and the bubble displays your speech live.
- **Local Voice Commands First (Zero Latency, Zero API Cost)**:
  - When you release `Ctrl+Space`, the companion checks your speech against local command patterns **first**.
  - Matched commands execute immediately in <50ms with a confirmation bubble and spoken acknowledgement, **never spending API tokens**:
    - **⏱️ Timers**: *"set a timer for 10 minutes"*, *"timer 5 minutes"*, *"timer for 30 seconds"*, *"cancel timer"*. When the timer completes, the orb alerts with a bounce and chime notice!
    - **🔔 Reminders**: *"remind me to drink water in an hour"*, *"remind me to stretch in 20 minutes"*, *"remind me in 10 minutes to check the oven"*.
    - **🚀 Open Apps & Websites**: *"open YouTube"*, *"open Google"*, *"open GitHub"*, *"open Notepad"*, *"open Calculator"*, *"open Spotify"*, or any URL (`open reddit.com`).
    - **💡 Screen Inspection**: *"what's on my screen?"*, *"what am I looking at?"*, *"analyze my screen"*, *"explain this error"*. Triggers immediate Help Mode analysis.
    - **🍅 Focus / Pomodoro**: *"start pomodoro"*, *"start focus session"*, *"stop pomodoro"*.
    - **🔇 Voice Controls**: *"mute voice"*, *"be quiet"*, *"unmute voice"*, *"talk to me"*.
    - **🎭 Personality Switching**: *"be sarcastic"*, *"switch to study buddy"*, *"be friendly"*, *"calm mentor"*.
    - **🕐 Time & Date**: *"what time is it?"*, *"what's today's date?"*.
    - **⏸️ Sleep / Wake**: *"go to sleep"*, *"wake up"*.
- **Unmatched Requests**:
  - Any conversational or complex question (e.g. *"what do you think of this code?"* or *"give me a funny analogy for recursion"*) is seamlessly passed to Claude with a fresh screenshot and your recent conversation context.
- **Graceful Fallback**:
  - If speech recognition fails or no speech is detected, the bubble displays a friendly `"Didn't catch that."` notice.

---

## ⚡ Speed & Latency Engine

- **`claude-haiku-5-5` with Streaming & `max_tokens: 60`**:
  - Delivers fast, punchy 1–2 sentence responses.
- **Instant First-Sentence Speech & Display**:
  - Begins speaking and streaming text the moment the first sentence boundary arrives.
- **Sentence-by-Sentence SpeechSynthesis**:
  - Sequential sentence queuing synchronized with the Web Audio `AnalyserNode` reactive ring.
- **768px Downscaled Screenshots (JPEG Quality 60)**:
  - Downscales captured screens to 768px wide at JPEG quality 60 (~2KB payload size).
- **32x32 Grayscale Screen Hash & Change Detection**:
  - Skips vision API calls when your screen has not meaningfully changed.
- **Background Pre-Generation**:
  - Silently pre-generates the next observation so it displays **instantly with 0ms latency** when the timer fires.
- **Prompt Caching**:
  - Leverages Anthropic's prompt caching on system instructions.
- **32 Curated Local One-Liner Fallbacks (< 3s Timeout)**:
  - Instant witty, warm fallback if API takes >3s or is offline.

---

## 🛡️ Active Window Awareness & Privacy Shield

- **Foreground Window & App Detection**:
  - Uses [`active-win`](https://github.com/sindresorhus/active-win) to inspect the active application name and window title (e.g., `Visual Studio Code`, `Chrome`, `Figma`) and passes them alongside the screen context to Claude.
- **60-Minute Continuous App Break Reminder**:
  - Monitors how long you have been inside the current application. If you remain in the same application for over 60 minutes, the companion will gently suggest a quick stretch or eye break.
- **Late-Night Rule (Past 1:00 AM)**:
  - If you are still active after 1:00 AM local time, the companion notices the late hour and gently nudges you to wind down or rest.
- **Privacy Shield & Blocklist**:
  - Automatically suppresses screenshots and screen commentary whenever a blocked application is active.
  - **Default Protected Categories**:
    - **Banking**: `bank`, `chase`, `wellsfargo`, `citi`, `paypal`, `fidelity`, `vanguard`, `coinbase`, `schwab`
    - **Password Managers**: `1password`, `bitwarden`, `keepass`, `lastpass`, `dashlane`, `authenticator`, `keychain`
    - **Messaging Apps**: `slack`, `discord`, `telegram`, `signal`, `whatsapp`, `messenger`, `messages`, `wechat`, `teams`
  - When a blocked application is in the foreground, **the screenshot is completely skipped** (no image is captured or sent), and the companion speaks a neutral, friendly quip without commenting on screen contents.
- **Customizable Blocklist**:
  - You can customize your blocklist in the **Settings** modal (right-click -> **Settings / API Key...**), entering comma- or newline-separated app names or title keywords. Changes are persisted in `settings.json`.

---

## 🎛️ Frosted Glass Settings Window & System Tray

- **System Tray Icon**:
  - Sits in your Windows system tray with a glowing orb icon.
  - **Click**: Focuses or restores the companion.
  - **Double-Click**: Opens the dedicated **Settings Window**.
  - **Context Menu (Right-Click)**:
    - ⏸️ / ▶️ **Pause / Resume Companion**: Instantly toggles idle sleep or wake.
    - ⚙️ **Settings...**: Opens the glass settings window.
    - 🚀 **Start on Login**: Checkbox toggle that registers or unregisters auto-startup with Windows.
    - ✕ **Quit**: Completely and cleanly shuts down the companion.

- **Dedicated Frosted Glass Settings Window**:
  - Frameless, translucent dark-glass aesthetic with `backdrop-filter: blur(28px)`, draggable header, and rounded corners matching the companion.
  - Accessible via the **System Tray** menu, double-clicking the tray icon, or the orb's **Right-Click Context Menu**.
  - **Configurable Controls**:
    1. **Anthropic Claude API Key**: Password/text input with visibility toggle; saves locally to `settings.json`.
    2. **Check-in Frequency Slider**: Smooth slider from 20s to 5m with live badge updates (`Often ~30s`, `Normal ~90s`, `Rare ~4m`) and quick preset pills.
    3. **Companion Voice Picker**: Dropdown populating available Web Speech API voices with English natural voice recommendations and a **Preview ▶** audio test button.
    4. **Personality & Orb Aura**: Interactive glass cards with custom radiant glow tints (**Friendly**, **Sarcastic**, **Study Buddy**, **Calm Mentor**).
    5. **Privacy Blocklist**: Textarea for keywords and process names that automatically engage the Zero-Vision Privacy Shield.
    6. **Screen Vision Toggle (Screenshots On/Off)**: Switch off to completely disable screen capture for pure voice/chat/random observation mode.
    7. **Start on Login Toggle**: Automatically registers the companion with Windows login settings to launch on boot.

---

## 💡 Help Mode (`Ctrl+Shift+H`)

Press **`Ctrl+Shift+H`** anytime (or select **💡 Help tip** from the right-click menu) to trigger an on-demand screen diagnostic:
- **Instant Screenshot & Analysis**: Captures your current screen and active application window.
- **Practical & Actionable Insights**:
  - **Error Diagnostics**: Explains visible compiler warnings, stack traces, or command errors and provides the exact code fix.
  - **Coding Suggestions**: Suggests the immediate next logical line, syntax correction, or clean refactoring.
  - **Page Summaries**: Distills long documentation, technical articles, or web pages into a sharp, high-yield summary.
- **Enlarged Frosted Bubble & Copy Button**:
  - Displays in a wider, comfortably sized speech bubble with a `💡 Tip` badge and radiant blue aura.
  - Includes a one-click **`📋 Copy`** button to immediately copy the tip or code snippet to your clipboard.
- **Separation from Chatty Mode**:
  - Help Mode operates completely independent of the casual companion chatter: it uses a dedicated focused system prompt, does not dilute your casual conversation history, and temporarily pauses random observations while you read the tip.

---

## 🍅 Pomodoro & Focus Guard (25m Focus / 5m Break)

Start a Pomodoro sprint anytime from the right-click menu (**🍅 Start Pomodoro**):
- **25-Minute Quiet Focus Sprint**:
  - The orb stays completely quiet (all casual chatter is silenced) and gently dims with a tranquil deep-work breathing animation.
  - The right-click menu dynamically updates to show your live remaining focus time (e.g. `Stop Pomodoro (18m focus left)`).
- **Session & Break Announcements**:
  - **Focus Start**: Announces that the 25-minute sprint has begun.
  - **Break Time**: When the 25 minutes are up, the orb brightens to a cheerful state and announces your 5-minute break so you can stretch, rest your eyes, and hydrate.
  - **Session Wrap-Up**: Announces when the 5-minute break concludes and seamlessly begins the next focus block.
- **🛡️ Focus Guard**:
  - Automatically watches for distracting applications or websites (**YouTube**, **Social Media** like X/Twitter, Reddit, Instagram, TikTok, and **Games** or launchers like Steam, Riot, Roblox, Minecraft).
  - If a distraction is detected on screen during a focus sprint, the companion delivers **one gentle, kind nudge** (at most once every 10 minutes) encouraging you to finish your sprint strong before taking a break.

---

## 🎮 Controls

- **`Ctrl+Shift+H`**: **Help Mode** (instant practical tip, code fix, or page summary with Copy button).
- **Hold `Ctrl+Space`**: Push-to-Talk (record your voice; release to send with screenshot).
- **`Ctrl+Shift+P`**: Instantly pause or resume companion.
- **Left-Click (Poke)**: Poke the orb for a bouncy ripple reaction and cheerful quip ("Boop!").
- **Drag & Snap**: Click and drag the orb anywhere; releasing snaps it to the closest screen corner.
- **Right-Click Context Menu**:
  - 💬 **Talk now**: Immediately inspect the screen or say something.
  - 💡 **Help tip** (`Ctrl+Shift+H`): Trigger Help Mode.
  - 🍅 **Start / Stop Pomodoro**: Toggle 25m focus / 5m break sprints with Focus Guard.
  - 🎭 **Personality**: Select **Friendly**, **Sarcastic**, **Study Buddy**, or **Calm Mentor**.
  - ⏸️ **Pause / Resume** (`Ctrl+Shift+P`): Put the companion to sleep or wake it up.
  - 🔊 **Mute / Unmute voice**: Toggle text-to-speech on or off.
  - ⏱️ **Frequency**: Choose between **Often (25–55s)**, **Normal (45–180s)**, or **Rare (3–6m)**.
  - ⚙️ **Settings / API Key...**: Configure your API Key, edit your name, remembered facts in `memory.json`, and privacy blocklist in `settings.json`.
  - ✕ **Quit**: Cleanly exit the companion.
- **Global Shortcuts**:
  - `Ctrl+Shift+H`: Practical screen Help mode.
  - `Ctrl+Space`: Push-to-talk to speak directly to the companion.
  - `Ctrl+Shift+P`: Instantly pause or resume.

---

## 🧱 Modular Architecture

The main Electron process is cleanly decomposed into focused, single-responsibility modules with comprehensive error boundaries:

- **[`main.js`](file:///c:/Users/Korra/companion/main.js)**:
  - Application entry point and lifecycle manager.
  - Registers top-level error boundaries (`process.on('uncaughtException')`, `process.on('unhandledRejection')`).
  - Manages primary companion window creation and crash recovery (`render-process-gone`).
- **[`config.js`](file:///c:/Users/Korra/companion/config.js)**:
  - Central repository for all tunable values, constants, system prompts, and timing thresholds.
  - Storage path resolution (`getStoragePath`) and `.env` loader.
- **[`settings.js`](file:///c:/Users/Korra/companion/settings.js)**:
  - Manages `settings.json`, `memory.json`, daily API budget counters, and auto-reset.
  - Controls the frosted glass Settings window, system tray menu, and Windows login auto-launch.
- **[`capture.js`](file:///c:/Users/Korra/companion/capture.js)**:
  - Active foreground window detection (`active-win`) and 60-minute continuous application tracking.
  - Primary display capture with 32x32 grayscale luminance hash change detection.
  - Enforces the Privacy Shield blocklist (zero image capture or transmission on sensitive apps).
- **[`api.js`](file:///c:/Users/Korra/companion/api.js)**:
  - Streaming SSE communication with Anthropic Messages API.
  - Prompt caching on system prompts, 3-attempt exponential backoff retries for rate limits and network drops.
  - Privacy-safe diagnostic error logger (`writeToErrorLog`) that strictly omits screen text, base64 data, and keys.
- **[`scheduler.js`](file:///c:/Users/Korra/companion/scheduler.js)**:
  - Global shortcuts (`Ctrl+Shift+P`, `Ctrl+Space`, `Ctrl+Shift+H`).
  - 100ms cursor tracking interval for natural orb gaze direction.
  - Smooth physics corner-snapping glide animation.
  - Centralized IPC handler dispatch with defensive try/catch error boundaries.

---

## 🚀 Getting Started

### 1. Configuration (Anthropic API Key)
You can configure your API key in either of two ways:
1. **Via UI**: Right-click the orb, select **Settings / API Key...**, paste your key, and click **Save Settings**.
2. **Via `.env` file**: Create a `.env` file in the project root:
   ```env
   ANTHROPIC_API_KEY=sk-ant-api03-...
   ```

### 2. Run in Development
```bash
npm start
```

---

## 📦 Packaging & Distribution (Windows Installer & Portable)

To build standalone Windows release packages without needing terminal/Node.js to run:

```bash
# Builds both the NSIS setup installer and the portable executable
npm run dist

# Or build individually:
npm run dist:installer
npm run dist:portable
```

The compiled binaries are generated in the [`dist/`](file:///c:/Users/Korra/companion/dist) directory:

1. **Windows Installer (`dist/Desktop AI Companion Setup 1.0.0.exe`)**:
   - Standard NSIS setup wizard with directory selection.
   - Automatically creates Desktop and Start Menu shortcuts with the app icon.
   - Installs uninstaller in Windows Add/Remove Programs.
2. **Portable Executable (`dist/Desktop AI Companion-Portable-1.0.0.exe`)**:
   - Zero-install standalone executable.
   - Run directly from any folder or USB drive with a single double-click.

---

## 📁 Where Settings & Memory Are Stored

The companion uses smart dual-mode storage so user settings persist safely across app updates:

- **When running installed / portable (`app.isPackaged`)**:
  Settings, user memory, and technical error logs are stored in your Windows user profile AppData folder:
  - **Settings (`settings.json`)**:
    `%APPDATA%\desktop-ai-companion\settings.json`
    *(e.g., `C:\Users\<Username>\AppData\Roaming\desktop-ai-companion\settings.json`)*
  - **Memory (`memory.json`)**:
    `%APPDATA%\desktop-ai-companion\memory.json`
    *(e.g., `C:\Users\<Username>\AppData\Roaming\desktop-ai-companion\memory.json`)*
  - **Error Logs (`error.log`)**:
    `%APPDATA%\desktop-ai-companion\error.log`
    *(e.g., `C:\Users\<Username>\AppData\Roaming\desktop-ai-companion\error.log`)*
  - Automatically initializes from bundled defaults on first run, and persists all personality choices, API keys, frequency settings, blocklists, daily budget, and remembered facts even when upgrading to new builds.

- **When running in development (`npm start`)**:
  Settings, memory, and error logs are stored directly in the local project root:
  - [`settings.json`](file:///c:/Users/Korra/companion/settings.json)
  - [`memory.json`](file:///c:/Users/Korra/companion/memory.json)
  - [`error.log`](file:///c:/Users/Korra/companion/error.log)

---

## 💰 Daily API Budget & Usage Counter

Keep full control over your Anthropic Claude token expenditure and call volume with built-in daily budget management:

- **Configurable Daily Budget**:
  - Set your desired maximum calls per day (default: `100`).
  - Quick preset pills: `50`, `100`, `250`, or `∞` (Unlimited / `0`).
- **Live Visual Usage Counter & Progress Bar**:
  - Displays today's count in real time: `Today: 42 / 100 calls (42%)`.
  - Colored progress bar shifts from soothing violet-cyan to amber warning at 85% and red when the daily budget is reached.
  - Automatically resets each calendar day at midnight.
- **Budget Exceeded Protection**:
  - When the daily budget is hit, outgoing calls are gracefully paused with a friendly bubble notification:
    *"We've reached today's API budget limit (100/100 calls)! Taking a rest until tomorrow, or you can adjust your budget in Settings."*
  - Local quips and offline interactions remain fully functional.

---

## 🛡️ Robust Error Handling & Backoff Retries

Never worry about dropped connections, expired keys, or API hiccups:

1. **No Internet / Network Drops**:
   - Automatically detects dropped connections or DNS failures.
   - Retries up to 3 times with exponential backoff (`1.5s`, `3.0s`, `6.0s`).
   - If offline, the companion displays and speaks a reassuring message:
     *"Looks like our internet connection dropped! I'll hang out offline with local remarks until we're back online."*
2. **Invalid or Expired API Key (HTTP 401)**:
   - Immediately halts without burning unnecessary retries.
   - Refunds the daily budget call counter.
   - Informs the user clearly:
     *"It looks like the Anthropic API key is invalid or expired. You can update it anytime in Settings!"*
3. **Rate Limits (HTTP 429)**:
   - Inspects `retry-after` response headers from Anthropic.
   - Automatically executes exponential backoff retries (`2.5s`, `5.0s`, `10.0s`).
   - If exhausted, friendly notification:
     *"Anthropic's servers are a bit overwhelmed with rate limits right now. Taking a quick breather!"*
4. **Server Errors & Overload (HTTP 5xx)**:
   - Automatically retries with exponential backoff (`2.0s`, `4.0s`).
5. **Zero-Content-Leak Error Log (`error.log`)**:
   - Writes timestamped diagnostics to local `error.log`.
   - **Absolute Privacy Guarantee**: Strictly redacts or omits any screenshots, base64 strings, user speech transcripts, prompt text, or active window titles.
   - Automatically redacts API keys (`sk-ant-***`).
   - Capped at 1MB to prevent disk bloat.
