# Devote Changelog

All notable changes to the Devote application will be documented in this file.

## [2026-04-11]

### Fixed
- **Auto-Updater Not Reaching Users**: Resolved a critical bug where installed clients on versions 1.2.7+ were not receiving update prompts. Root cause: `checkForUpdatesAndNotify()` registers its own internal `update-downloaded` handler that conflicts with our custom `dialog.showMessageBox` listener, causing both to race and silently stall. Switched to `checkForUpdates()` to give our handler sole ownership of the update lifecycle.
- **Concurrent Update Check Stacking**: Added an `isCheckingForUpdate` guard flag so the 4-hour `setInterval` cycle cannot queue multiple overlapping download operations.
- **Deferred Updates on Tray Apps**: Removed `autoInstallOnAppQuit` — for a tray app users rarely quit, this flag meant updates sat dormant indefinitely. The dialog now explicitly drives the install lifecycle, with `quitAndInstall(false, true)` ensuring Devote relaunches immediately after applying the update.
- **Startup Check Timing**: Added a 10-second delay to the initial update check to let the BrowserWindow fully settle before the network call fires.
- **Degraded Prefetch Experience**: Fixed a bug where `prefetchNextReading` fetched the JSON endpoint while `WordScreen` expected HTML. Cached readings now render correctly with full formatting and headers.
- **Reflection Screen Short-circuit**: Removed a `return null` that was hiding the setup message for users without an AI key.
- **Tray-App Reflection Stale State**: Rearchitected `ReflectionScreen` to track the specific day number it has fetched for. This ensures the guided reflection questions refresh automatically when the computer wakes on a new day, even if the app was never closed.
- **Audio State Desync**: Refactored `WordScreen` to drive the play/pause UI state strictly from native `<audio>` element events (`onPlay`/`onPause`). This ensures the UI icon accurately reflects the audio state when paused externally by the Electron main process (e.g., during window blur/hide).
- **Incomplete Preload Bridge**: Fixed a bug in the IPC bridge where `removeListener` failed to work because the `on` method was creating hidden anonymous wrappers. Implemented a `listenerMap` to correctly track and unregister IPC wrappers.
- **Blunt Error Recovery**: Replaced `window.location.reload()` in `WordScreen` with a scoped `retryKey` state, allowing users to retry failed fetches without nuking the entire application state.

### Added
- **Prefetch Resilience**: Added a 3-attempt retry loop with exponential backoff to the scripture prefetching engine.
- **UI Confirmation**: Added a glowing "✓ Saved" confirmation state to the Settings "Save & Close" button for better user feedback.
- **Shared Plan Logic**: Extracted the curriculum selection UI into a reusable `PlanSelector` component, significantly reducing code duplication between the Welcome and Year-End screens.
- **Onboarding UX**: Added explicit validation feedback in the "Custom Library" setup to explain why the "Next" button is disabled when no books are selected.

### Changed
- **Commentary Priority**: Swapped lookup logic so that custom/AI-generated pastoral reflections take priority over the bundled Matthew Henry Concise JSON dataset.

## [2026-04-09]

### Added
- **Scripture Prefetching Buffer**: Introduced a background buffering engine. Upon completing a daily devotion, the application automatically fetches and localizes tomorrow's passage to the `electron-store`. This ensures an instant, offline-ready experience on the next launch and completely eliminates "fetch failed" errors caused by startup network handshakes.
- **Enhanced Prop Architecture**: Refactored `App.jsx` to pass the complete `settings` object to `WordScreen`, allowing for more intelligent, reactive UIs that can seamlessly switch between cached local data and fresh API results.

## [2026-04-08]

### Added
- **Branding Refresh**: Integrated the new official logo (`Logo-trans.png`). Replaced application icons in `resources/` for the system tray and `build/` for the Windows executable/installer.
- **Background Update Strategy**: Overhauled the auto-updater logic to perform silent, periodic checks every 4 hours while the app is in the tray. Updates now check on launch, tray-open, and during idle cycles to ensure persistent users stay current.
- **Day Progression Testing**: Added a "Plan Day Progression" numeric input in the Settings modal. This allows developers and testers to immediately jump to any day in the 365-day plan and reset the completion status for instant verification.
- **Full Historical Library**: Fully populated the local `matthew_henry_concise.json` dataset by scraping 280+ missing chapters from BibleHub, providing a 100% complete offline commentary experience for the entire year.
- **Manual Update Trigger**: Added a "Check for Updates..." option directly to the system tray context menu for on-demand verification.

### Fixed
- **GitHub Action Triggering**: Resolved a conflict where `[skip ci]` in version bump messages was preventing the Release workflow from firing. 
- **Testing Logic**: Fixed a race condition in the settings panel where manual day jumping would get stuck on the "Go in Peace" screen without refreshing content.
- **Node.js 20 Deprecation**: Future-proofed all CI/CD pipelines by opting into the Node 24 runner environment ahead of the 2026 cutoff.

### Changed
- **Repository Hygiene**: Scrubbed legacy test files (`test_ai.mjs`, `fix-icon.js`, `generate_balanced.js`) and consolidated all development utilities into the `scripts/` directory.

## [2026-04-07]

### Added
- **Auto-Update Engine**: Integrated `electron-updater` with GitHub Releases. The application now automatically checks for updates on launch, downloads them in the background, and prompts the user for a single-click restart to stay current.
- **Production Asset Optimization**: Structured a `.gitignore` architecture to exclude multi-gigabyte build caches (`.eb-cache`) and installers from source control, ensuring a lean and professional repository footprint.

### Fixed
- **State Persistence Drift**: Resolved a transient "Invalid ESV Key" error by flushing local `electron-store` cache, ensuring the hardcoded fallback keys correctly re-initialize during application updates.

## [2026-04-06]

### Added
- **Custom Reading Library**: Introduced an onboarding curriculum builder that dynamically constructs a seamless, personalized 365-day queue by evenly dispersing a customized array of selected biblical books.
- **Year-End Lifecycle**: Implemented `PlanCompleteScreen` to capture 365-day completion events, automatically pausing progression and guiding users to reset and restock their library for a fresh consecutive year.
- **Dynamic Onboarding Window State**: Overhauled the Kiosk OS locking logic. The Welcome Screen now guarantees the user cannot be mistakenly frozen out of their computer by conditionally preventing overlap with the settings module and strictly managing the window dimensions internally.
- **Contextual Minimization**: Included a glowing "Minimize to Taskbar" shortcut built organically into the setup drag handle. Bound native Windows RESTORE hooks to force Devote to the physical top of the z-index to recover properly when fetching API keys off-screen.
- **Copy Refinement**: Simplified the onboarding messaging and AI engine descriptions to focus on a "distraction-free" experience and "pastoral" reflections, removing specific niche descriptors for broader user professionality.

### Changed
- **Reading Plan**: Rearchitected the chronological progression to alternate daily between the New Testament and the Psalms. 
- **Pacing**: Dispersed the four Gospels evenly throughout the reading cycle to cleanly space out narrative accounts with intervening theological epistles. 

### Fixed
- **UI State Glitch**: Resolved a bug where waking the computer on a new day would incorrectly present the `<CompletionScreen />` from the prior session. Added a reactive IPC listener to forcibly scrub UI state and refresh the local system date context.
- **Timezone Drift**: Overhauled completion date checking to generate localized string bounds (`getLocalDayStr`) rather than defaulting to UTC, which previously caused the "new day" window to incorrectly trigger at odd afternoon/evening hours.
- **Visual Assets**: Striped the opaque white matte artifacts from `icon.png`, making the Devote logo correctly appear as a sharp, standalone rounded-rectangle element.

## [2026-04-03]

### Added
- **Core Shell**: Initialized Electron.js shell with Vite and React.
- **Navigation**: Added back-arrow capability from AI Reflection Screen to the main Word Screen.
- **Paragraph Segmentation**: Added an auto-chunking algorithm in `WordScreen.jsx` to dynamically split vast legacy text blocks without natural line-breaks into distinct, readable paragraphs.
- **Soft Kiosk Mode**: Implemented a borderless, always-on-top, transparent window with frosted-glass styling.
- **Persistence**: Integrated `electron-store` for tracking streaks, completion dates, and snooze status.
- **System Tray**: Added a system tray icon for "Open Devote", "Quick Quit", and "Reset Data (Test Mode)".
- **Reading Plan**: Integrated a 365-day chronological Bible reading plan (resources/reading_plan.json).
- **ESV API Integration**: Automated fetching of daily passages (HTML for text, raw stream for audio).
- **Gemini 3 Integration**: Automated generation of deep reflection questions based on the day's text.
- **Local Audio Proxy**: Implemented a dedicated Node.js HTTP server on port `45678` to handle authenticated ESV audio streaming (bypassing CORS and Electron protocol restrictions).
- **Multi-Provider AI Engine**: Refactored the core AI logic to automatically detect and support OpenAI, Anthropic, and Google Gemini API keys.
- **Shared ESV Key**: Hardcoded a shared public ESV API key for distribution, simplifying the setup process for new users.
- **Dynamic Commentary Generation**: Built a background generator script (`scripts/generate_commentary.mjs`) to pre-populate missing Matthew Henry commentaries for all 365 days.
- **Auto-Pause Audio**: Added `executeJavaScript` calls on window `blur` and `hide` events to directly pause all audio elements in the renderer.
- **Debug Tools**: Injected an `ErrorBoundary` for real-time React crash logging during development.

### Changed
- **Architecture**: Moved all API fetching into the Main (Node) process to resolve CORS blocks in the Chromium renderer.
- **UI Lifecycle**: Refactored the screen renderer to pre-mount all screens (Prayer, Word, Reflection) in the background on startup, enabling instantaneous transitions.
- **Model Selection & Architecture**: Upgraded Gemini integration with a prioritized fallback chain: `gemini-3-flash-preview` -> `gemini-3.1-flash-lite-preview` -> `gemini-2.5-flash` -> `gemini-2.0-flash`.
- **Styling**: Shifted responsibility for desktop glassmorphism away from OS-level electron acrylic flags to frontend web tech (`bg-black/80 backdrop-blur-3xl`) to ensure cross-system compatibility.
- **Security**: Updated Preload bridge with strict allow-lists for IPC channels.

### Fixed
- **UI Overflow**: Made the AI Reflection content scrollable to ensure the "Continue" button remains pinned properly regardless of length.
- **AI Formatting Bugs**: Refined the markdown parsing regex `^[\d\.\-\*\s]+` to successfully strip numbers and rogue bullet ponts from AI question arrays.
- **API Reference Errors**: Resolved "useRef is not defined" and prop-drilling issues in `ReflectionScreen.jsx`.
- **Race Conditions**: Gated the "Mark as Complete" logic so it only fires when the completion screen is active, preventing premature completion on background mount.
- **Audio Headers**: Fixed the 401 Unauthorized errors on audio requests by injecting API tokens via the local proxy server.
