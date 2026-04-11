# Devote Knowledge Base

A repository of technical learnings, architectural decisions, and workspace insights gathered during the development of the Devote application.

## Core Learnings: Electron & Chromium

### 1. The Media Auth Problem
- **Observation**: Standard `<audio>` and `<video>` tags in Chromium do not allow custom headers (like `Authorization: Token ...`).
- **Failed Approaches**:
    - *IPC Buffer Transfer*: Sending 3MB binary buffers over Electron IPC is slow and requires careful conversion from `ArrayBuffer` to Node `Buffer`.
    - *file:// Protocol*: Modern Electron security policies restrict renderers from playing media from local file paths directly.
    - *Custom Schemes*: `protocol.registerSchemesAsPrivileged` must be called before `app.whenReady()` and often requires complex streaming code.
- **The Solution**: Running a tiny **Local HTTP Proxy (Port 45678)** within the Main process. The renderer requests `http://127.0.0.1:45678/?q=...`, and Node's `http.createServer` fetches from the real API (injecting the header) and pipes the stream directly back. This is the most robust way to handle authenticated media in Electron.

### 2. CORS in Electron
- **Learning**: Even with `webSecurity: false`, some external APIs (like ESV) reject requests from `localhost` or `null` origins if CORS headers aren't explicitly provided by the server. 
- **Pattern**: Always perform external API fetches (especially those requiring secret keys) from the **Main process (Node)** and proxy the data to the renderer via `ipcRenderer.invoke`. This protects API keys and bypasses all browser CORS restrictions.

#### 3. "Instant-Feel" UI Lifecycle
- **Innovation**: To prevent loading spinners when switching devotional screens, we **pre-mount** every screen component on app launch.
- **Gotcha**: React's `useEffect` hooks in these background-mounted components will fire immediately on launch.
- **The Solution**: 
    1. Any "one-time" logic (like marking a devotion as complete or starting a timer) must be gated by an `isActive` prop or similar state check to ensure background components don't execute actions prematurely.
    2. For components that track completion across day boundaries (like reflections), use a `useRef` to store the **day number** rather than a boolean. This ensures the component correctly "resets" its state when the day changes, even if it stays mounted in the system tray.

## Workspace Insights: Electrode Scope Reference
- **Commonality**: Both projects use `electron-store` for user settings.
- **Learning**: `electron-store` is synchronous by default. When storing large JSON blobs (like our 365-day commentary), access is best kept in the Main process and passed to the Renderer once, rather than querying the store repeatedly during render cycles.

## Media & UI State Synchronization

### 1. Audio Pausing in Kiosk Mode
- **Problem**: Pausing audio when the user switches away (Win+Tab, Alt+Tab) is non-trivial in Electron kiosk mode.
- **Failed approaches**:
    - `document.visibilitychange` — does NOT fire on focus loss in Electron, only on actual hide/minimize.
    - IPC `window-visibility` events via `blur`/`focus` — unreliable in kiosk mode; event listener chains can silently fail.
- **The Solution**: Use `webContents.executeJavaScript('document.querySelectorAll("audio").forEach(a => a.pause())')` directly from the main process on the `blur` and `hide` window events. This bypasses the renderer's event system entirely and directly manipulates the DOM.

### 2. Event-Driven Media State
- **Problem**: When audio is paused externally (via `executeJavaScript`), the React state (`isPlaying`) can get out of sync with the actual DOM element, causing buttons to show "Playing" while silent.
- **The Solution**: Never drive media UI state via local `toggle()` flags alone. Bind React state to the native `onPlay` and `onPause` events of the `<audio>` tag. This ensures the UI remains the "source of truth" for the actual hardware state regardless of how the pause was triggered.

## Background Process Architecture

- **Single Instance Lock**: We use `app.requestSingleInstanceLock()` to prevent the user from spawning multiple `.exe` instances that fight over port `45678`.
    - **CRITICAL detail**: If another instance is detected, you *must* call `process.exit(0)` instead of just `app.quit()`. `app.quit()` enters an async teardown sequence, meaning the background script will continue to execute and crash out attempting to bind the audio proxy port.
- **Port Fallbacks**: The ESV Audio Proxy server listens on `45678`. If that port is locked, it automatically falls back to listening on `0` (any available OS port) to prevent hard crashes.

## AI Architecture & Multi-Provider Support

### 1. Unified AI Fetcher
- **Observation**: To share the app with others, hardcoding a single AI provider (like Gemini) is too restrictive.
- **Implementation**: We use a unified `fetch-ai` IPC channel in the Main process that accepts a raw prompt and automatically detects the provider based on the key prefix:
    - `sk-ant...`: Anthropic (Claude 3.5 Haiku)
    - `sk-...`: OpenAI (GPT-4o mini)
    - `AIza...` (default): Google (Gemini 3 Flash)
- **Benefit**: This allows the renderer to remain completely agnostic of the AI backend, making the app much easier to distribute.

### 2. Shared Registry Keys
- **Strategy**: For distribution, simplify the onboarding process by hardcoding a shared public ESV API key for distribution, while allowing users to override it in settings.

### 3. Secure IPC Listener Mapping
- **The Problem**: Electron's `contextBridge` often requires wrapping `ipcRenderer.on` calls in anonymous closures to strip the `event` object for security. This makes `removeListener` impossible to use, as the renderer has no reference to the anonymous wrapper function.
- **The Solution**: Implement a `listenerMap` (Map) inside the preload script. Store the original callback as the key and the wrapped closure as the value. When the renderer calls `removeListener`, look up the wrapper in the map and unregister it correctly. This prevents "ghost" listeners from stacking up in long-running tray applications.

### 4. Graceful UI Degradation
- If a user hasn't configured an AI API key yet, the `ReflectionScreen` handles this gracefully:
    - It does *not* auto-skip (which would aggressively fire the `completed-today` flag accidentally).
    - It shows a friendly prompt directing them to the Settings cog.
    - It leaves the "I have finished my devotion" button visible so they can proceed purely with the Word and audio if they wish.

### 5. Dynamic Service Detection
- **UI Logic**: Use simple string prefix checks (`startsWith`) in the settings UI should show the user exactly which service their key has activated. This builds trust and clarity during the initial setup.

## Styling & Typography

### 1. Window Transparency (Windows OS)
- **Observation**: Using Electron's `BrowserWindow.setBackgroundMaterial('acrylic')` fails and produces opaque gray backgrounds on some un-updated Windows 11 systems or those with unsupported drivers.
- **The Solution**: Avoid native acrylic entirely. Use a simple 100% transparent BrowserWindow (`transparent: true`, `backgroundColor: '#00000000'`) and perform the blurring via web technologies: apply `backdrop-filter: blur(x)` (or Tailwind's `backdrop-blur`) directly to the `<body>` or root elements holding an `rgba(0,0,0,0.8)` background. This guarantees an identical cross-platform glassmorphism effect.

### 2. Legacy Text Parsing natively in React
- **Observation**: Older Bible commentary formats (like the concise Matthew Henry JSON) do not include `\n` carriage returns; they store entire chapter blocks as huge, unbroken strings. Overloading the UI with these "walls of text" destroys the reading experience.
- **The Solution**: Check for `\n`. If missing, apply a sentence-parsing chunker regex natively in the React map function to dynamically chop it up:
  `const sentences = rawText.match(/[^.!?]+[.!?]+[\])'"\`’”]*\s*/g)`
  We can iterate over these sentences and group them every ~3–4 sentences into a single output `<p>` tag, creating artificial but structurally sound paragraphs on the fly.

### 3. Robust AI Fallback Chaining
- **Observation**: Over-reliance on a single bleeding-edge AI model (like `gemini-3-flash-preview`) invites sudden 503 Overloaded or 429 Rate Limit errors, causing catastrophic task failures for users executing synchronous code blocks.
- **The Solution**: Implement an intelligent fallback array in your IPC handlers. If a model catches a specific error `if (err.status === 503 || err.status === 429)`, immediately recurse using the next model in the list (`['gemini-3-flash-preview', 'gemini-3.1-flash-lite-preview', 'gemini-2.5-flash']`) to maintain 99.9% uptime.

## Timezones and Persistent Application State

### 1. The React Stale Closure on App Sleep
- **Observation**: For apps that sit in the system tray and rarely completely close, any `useEffect` block run on mount will never re-execute when a computer wakes from sleep the succeeding day. Thus, the component closure holds onto its state (e.g. `currentScreen === 'complete'`) infinitely.
- **The Solution**: Main/Renderer pinging. When `electron` detects a window show event (or OS `resume`), the main process should explicitly dispatch an IPC event like `window-show` to the renderer. The renderer listens for this, re-requests its latest `store.json` settings, and forcibly updates its component tree to evaluate if it should be resetting to the start screen.

### 2. UTC Timezone Drift
- **Observation**: Generating string bounds for "today" natively using `new Date().toISOString().split('T')[0]` is highly prevalent, but deeply problematic. Since `toISOString` collapses local time directly into UTC, the "new day" threshold for an application can drift into standard waking hours (e.g., 10 PM in the UK, or early morning in Australia).
- **The Solution**: For applications tracking *daily* user interactions (streaks, habits, devotions), always compile localized ISO-like strings strictly bound to the user's computer via standard `d.getFullYear()`, `d.getMonth() + 1`, and `d.getDate()` methods appended together.

## Advanced Window & UI Orchestration

### 1. Transparent Windows and Dynamic Sizing Collapses
- **Observation**: When you possess an Electron `BrowserWindow` with Kiosk and transparent aesthetics relying on fixed HTML container elements to provide the "borders", dynamically unmounting children inside the container (e.g., hiding a React Router route) can accidentally remove the intrinsic `height` constraint, completely collapsing the entire visual container into a 0-pixel flat sliver dynamically.
- **The Solution**: Ensure the outermost visual React wrapper housing absolute-positioned overlay components (like setup wizard screens) is strictly clamped with a fixed minimum sizing constraint (e.g., `min-h-[750px]`) that perfectly correlates to the original dimensions.

### 2. Kiosk Overlaps and Modal Interactions
- **Observation**: Overlapping UI modules—like an onboarding Wizard and an in-app Settings panel—can inadvertently trigger and stack together inside a transparent window space if complex navigation logic allows it.
- **The Solution**: Structurally limit interactions contextually. Specifically, forcefully hide global entry points (like Settings Cogs) directly inside the React tree `settings.hasCompletedOnboarding && (<Settings />)` to completely quarantine the setup phase from the core app functionalities.

### 3. Graceful Kiosk Mitigation
- **Observation**: If you permanently lock Kiosk Mode down to `alwaysOnTop: true`, users might get trapped during setup phases that require grabbing third-party API keys from a browser window behind it. However, forcefully un-locking OS Kiosk mode natively using Electron methods (`setKiosk(false)` against transparent-mode bounds) is incredibly error-prone and jitter-heavy on Windows.
- **The Solution**: Rely on the native `minimize()` command instead! By adding a targeted "Minimize App" button and triggering a `minimize-window` IPC bridge, users can cleanly bounce the app right into their system tray manually or via automatic `kioskWindow.on('blur')` triggers. Combined with an explicit `.on('restore', () => kioskWindow.setAlwaysOnTop(true) ...)` intercept, the app can then bounce perfectly back to the extreme top front of the Z-index exactly when requested.

## Distribution & Repository Management

### 1. GitHub Auto-Update CI
- **Strategy**: Use the `github` provider in `electron-builder.yml`. This allows the application to leverage the GitHub API as a free version-checking server.
- **Requirement**: The application version in `package.json` must be strictly incremented for the update engine to trigger.
- **The "Release" Trigger**: Running `electron-builder --win -p always` (with a valid `GH_TOKEN`) automatically creates a draft Release on GitHub and uploads the required `.exe` and `latest.yml` manifests needed for the client apps to detect the change.

### 2. Large File Management
- **Learning**: GitHub has a strict 100MB file limit for standard pushes. Compiled Electron `.exe` files and `node_modules` folders frequently exceed this.
- **Best Practice**: Always maintain a robust `.gitignore`. Never track `dist/`, `out/`, or `.eb-cache/`. This keeps the repository focused purely on source code, while the `dist/` artifacts are handled separately as GitHub Release attachments.

## Update Lifecycle for Tray Apps

### 1. The Tray-Stale Problem
- **Observation**: Users of "Soft Kiosk" and tray applications rarely quit the app. This creates a "stale app" scenario where `autoUpdater.checkForUpdatesAndNotify()`—typically called once on launch—is never triggered again.
- **The Solution**: A multi-pronged update trigger:
    1. **Startup Check**: Standard check when the app boots.
    2. **Interaction Trigger**: Trigger a check whenever the user brings the app window to the front (Tray Click or Re-launching from desktop).
    3. **Background Interval**: Implement a `setInterval` in the Main process (e.g., every 1 hour) to silently probe for updates while the app is idling in the tray. Longer intervals (4h+) often cause updates to be deferred indefinitely if the machine goes to sleep.

### 4. Power-State Awareness (Wake Check)
- **The Problem**: If a release is pushed while a user's computer is asleep, the `setInterval` logic might drift or skip, causing the update to wait hours before being detected.
- **The Solution**: Listen to Electron `powerMonitor` 'resume' event. Re-trigger `checkForUpdates()` with a 5-10 second delay (to allow the network interface to reconnect) immediately upon wake.

### 5. UI-Bound Update Notifications
- **The Problem**: OS-level dialogs (`showMessageBox`) are easily buried or accidentally dismissed.
- **The Solution**: When `update-downloaded` fires in Main, send an IPC message (`update-ready`) to the Renderer. The UI should display a persistent, non-blocking notification (e.g., a pulsing badge near the settings cog) to ensure the user knows an update is pending without forcing an immediate restart.

### 2. The `checkForUpdatesAndNotify()` Trap
- **Observation**: `electron-updater` provides two update check methods: `checkForUpdates()` and `checkForUpdatesAndNotify()`. The second one registers its **own internal `update-downloaded` event handler** that shows a system notification and silently queues installation.
- **The Conflict**: If you *also* have a custom `autoUpdater.on('update-downloaded', ...)` listener, you now have **two handlers** racing for the same event. The result is non-deterministic: in practice, updates are downloaded but the user prompt is never reliably shown — especially on Windows where the two mechanisms interfere.
- **The Solution**: Always use `checkForUpdates()` when you want full control of the update UX. This method fires the events but leaves all UI to you. Never mix custom `update-downloaded` handlers with `checkForUpdatesAndNotify()`.
- **Companion Fix**: Remove `autoUpdater.autoInstallOnAppQuit = true`. For tray apps users rarely quit, this flag keeps updates in a permanent deferred state. Your custom dialog — using `autoUpdater.quitAndInstall(false, true)` — is the sole install driver.
- **Guard Pattern**: Always use an `isCheckingForUpdate` boolean flag. A `setInterval` update check cycle will spawn concurrent downloads without it, leading to corrupted download state.

### 3. Version Bump Race Conditions
- **Observation**: If using automated versioning (like a GitHub Action that bumps `package.json` on push), manual pushes that *already* contain a version bump can trigger the automation twice, leading to jumped version numbers (e.g., `1.2.6` -> `1.2.7`).
- **Best Practice**: Trust the automation. If a repository has `autobump.yml` active, developers should focus on pushing clean commits to `main` and let the runner handle the `v*` tagging and release lifecycle.

### 6. Prefetch Consistency
- **The Pitfall**: ESV's `/json/` and `/html/` endpoints return data formatted differently. Caching from one while rendering from another leads to broken layouts (e.g., raw text vs formatted HTML).
- **The Solution**: Ensure the prefetching engine (server-side) and reading screen (client-side) hit the exact same endpoint with identical parameters to ensure local cache parity.

## Large-Scale Local Data Scraping

### 1. Rate Limiting for Politeness
- **Observation**: Scraped data (like Matthew Henry's commentary from BibleHub) should be processed with respect for the host servers.
- **Implementation**: In `scripts/scrape_mhc.mjs`, we use an `async delay(200)` function inside the loop. At ~5 requests per second, this is fast enough to finish 300 chapters in under a minute but gentle enough to avoid IP blacklisting or server strain.

### 2. Local JSON Deduplication
- **Strategy**: When building a large local dataset incrementally, always load the existing JSON first. Use a `missing` array filter: `!existing[key] && !seen.has(key)`. This allows you to resume interrupted scrapes and prevents overwriting manually verified entries.

## Networking and Perceived Performance

### 1. The Startup Race
- **Observation**: Applications that launch immediately on OS startup or wake (like Devote) often encounter `TypeError: fetch failed` exceptions. This happens because the application's code executes a few milliseconds before the system's DNS or WiFi handshake has been completed.
- **The Solution: Prefetching Buffer**: Do not wait for the next session to fetch data. When the user signals that they are finished with *today*, the app assumes they have a stable connection and immediately fetches *tomorrow's* metadata in the background. Storing this payload locally turns a high-risk network dependency into a zero-latency disk read on the next launch.
