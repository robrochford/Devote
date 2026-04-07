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

### 3. "Instant-Feel" UI Lifecycle
- **Innovation**: To prevent loading spinners when switching devotional screens, we **pre-mount** every screen component on app launch.
- **Gotcha**: React's `useEffect` hooks in these background-mounted components will fire immediately. 
- **Fix**: Any "one-time" logic (like marking a devotion as complete or starting a timer) must be gated by an `isActive` prop or similar state check to ensure background components don't execute actions prematurely.

## Workspace Insights: Electrode Scope Reference
- **Commonality**: Both projects use `electron-store` for user settings.
- **Learning**: `electron-store` is synchronous by default. When storing large JSON blobs (like our 365-day commentary), access is best kept in the Main process and passed to the Renderer once, rather than querying the store repeatedly during render cycles.

## Audio Pausing in Kiosk Mode

- **Problem**: Pausing audio when the user switches away (Win+Tab, Alt+Tab) is non-trivial in Electron kiosk mode.
- **Failed approaches**:
    - `document.visibilitychange` — does NOT fire on focus loss in Electron, only on actual hide/minimize.
    - IPC `window-visibility` events via `blur`/`focus` — unreliable in kiosk mode; event listener chains can silently fail.
- **The Solution**: Use `webContents.executeJavaScript('document.querySelectorAll("audio").forEach(a => a.pause())')` directly from the main process on the `blur` and `hide` window events. This bypasses the renderer's event system entirely and directly manipulates the DOM.

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
- **Strategy**: For distribution,### 3. Graceful UI Degradation
- If a user hasn't configured an AI API key yet, the `ReflectionScreen` handles this gracefully:
    - It does *not* auto-skip (which would aggressively fire the `completed-today` flag accidentally).
    - It shows a friendly prompt directing them to the Settings cog.
    - It leaves the "I have finished my devotion" button visible so they can proceed purely with the Word and audio if they wish.

### 3. Dynamic Service Detection
- **UI Logic**: Use simple string prefix checks (`startsWith`) in the settings UI to show the user exactly which service their key has activated. This builds trust and clarity during the initial setup.

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
- **Observation**: If you permanently lock Kiosk Mode down to `alwaysOnTop: true`, users might get trapped during setup phases that require grabbing third-party API keys from a browser window behind it. However, forcibly un-locking OS Kiosk mode natively using Electron methods (`setKiosk(false)` against transparent-mode bounds) is incredibly error-prone and jitter-heavy on Windows.
- **The Solution**: Rely on the native `minimize()` command instead! By adding a targeted "Minimize App" button and triggering a `minimize-window` IPC bridge, users can cleanly bounce the app right into their system tray manually or via automatic `kioskWindow.on('blur')` triggers. Combined with an explicit `.on('restore', () => kioskWindow.setAlwaysOnTop(true) ...)` intercept, the app can then bounce perfectly back to the extreme top front of the Z-index exactly when requested.
