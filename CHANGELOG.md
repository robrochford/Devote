# Devote Changelog

All notable changes to the Devote application will be documented in this file.

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
