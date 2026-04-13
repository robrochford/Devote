# Devote Changelog

All notable changes to the Devote application will be documented in this file.

## [2026-04-13]

### Added
- **Alternating Custom Book Logic**: Custom reading plans now alternate daily between books (A -> B -> A) rather than linear sequencing. Supports a rolling queue where exhausted books are replaced by the next selection.
- **MHC Background Prefetching**: Implementation of a background scraper for Matthew Henry Concise commentaries. When a custom plan is selected, the app now pulls missing chapters from BibleHub in the background and stores them in a local cache for offline use.
- **Onboarding Readiness Check**: Added a loading state during the final step of setup to ensure the first day's commentary is prefetched before the user enters the main reading screen.
- **MHC Cache Pruning**: Commentary cache is automatically trimmed to keep the app footprint minimal. Past-day entries are removed after each completed devotion. Entries for books not in the current plan are discarded whenever settings are saved.

### Changed
- **Study Panel Streamlining**: Removed the AI commentary fallback from the Study panel in `WordScreen`. The panel now prioritizes bundled or prefetched Matthew Henry commentaries and provides a graceful fallback if none exist, reducing reliance on AI keys for basic study.

### Fixed
- **Build Pipe Crash**: Resolved a syntax error in `index.js` where a function signature was inadvertently stripped during a code migration.
- **MHC Channel Error**: Fixed an "Invalid channel" error by whitelisting the new MHC prefetch and lookup channels in the preload IPC bridge.
- **Title/Passage Mismatch**: Cached reading validation now checks both `day` and `reference` — prevents a stale cached passage (from the previous plan) being displayed when the plan changes.
- **Commentary Not Loading**: Added a startup background job that automatically downloads missing Matthew Henry commentaries for all 365 days of a custom plan. This catches users who completed onboarding before the IPC whitelist fix landed.
- **Commentary Reference Stored**: `prefetchNextReading` now persists the passage `reference` alongside the cached reading so future invalidation checks can be exact.
- **Plan Reset Prefetching**: `PlanCompleteScreen` now correctly fetches the opening commentaries and displays a "Preparing..." state when setting up a new custom plan, matching `WelcomeScreen` behavior.
- **Alternating Track Reliability**: `buildAlternatingTrack` now uses a strict two-slot rolling queue strategy. This guarantees only two books are alternated at any given time, regardless of how many custom books are selected, and fixes a race condition where sequences could drop books early.
- **AI Key State Desync**: Fixed an issue where the Reflection Screen would crash with "No AI API Key found" if a user typed an API Key into the settings modal but had not yet clicked "Save & Close". The renderer now explicitly passes the live key to the main process for the fetch request.
- **Anthropic 404 Error Fallback**: Added a model fallback loop for Anthropic API keys. If a user's API tier does not yet support `claude-3-5-haiku-20241022` (returning a 404), the engine will automatically downgrade to `claude-3-haiku-20240307` to ensure reflections continue to generate without error.
- **Onboarding Skip Bug**: Fixed a logic error where any user opening the app for the second time would have their onboarding silently skipped due to an aggressive "migration" check. New users are now correctly sent through the full setup process.
- **Mac Kiosk Loop**: Removed `kiosk: true` on macOS, which was causing the app to lock the screen and fail to minimize or hide. Replaced with standard Fullscreen mode for stability.
- **Unintended Minimization**: Removed automatic 'minimize on blur' during onboarding, which was causing the app to disappear unexpectedly during screen transitions. Added a manual minimize button to the setup screens instead.
- **Missing Skip/Snooze Handlers**: Added missing IPC handlers for 'Skip Today' and 'Snooze' which were causing the app to fail to dismiss on macOS, leaving a black screen behind.

## [2026-04-11]

### Fixed
- **Auto-Updater Not Reaching Users**: Resolved a critical bug where installed clients on versions 1.2.7+ were not receiving update prompts. Root cause: `checkForUpdatesAndNotify()` registers its own internal `update-downloaded` handler that conflicts with our custom `dialog.showMessageBox` listener, causing both to race and silently stall. Switched to `checkForUpdates()` to give our handler sole ownership of the update lifecycle.
- **Concurrent Update Check Stacking**: Added an `isCheckingForUpdate` guard flag so the 1-hour `setInterval` cycle cannot queue multiple overlapping download operations.
- **Deferred Updates on Tray Apps**: Removed `autoInstallOnAppQuit` — for a tray app users rarely quit, this flag meant updates sat dormant indefinitely. The dialog now explicitly drives the install lifecycle, with `quitAndInstall(false, true)` ensuring Devote relaunches immediately after applying the update.
- **Startup Check Timing**: Added a 10-second delay to the initial update check to let the BrowserWindow fully settle before the network call fires.
- **Degraded Prefetch Experience**: Fixed a bug where `prefetchNextReading` fetched the JSON endpoint while `WordScreen` expected HTML. Cached readings now render correctly with full formatting and headers.
- **Reflection Screen Short-circuit**: Removed a `return null` that was hiding the setup message for users without an AI key.
- **Tray-App Reflection Stale State**: Rearchitected `ReflectionScreen` to track the specific day number it has fetched for. This ensures the guided reflection questions refresh automatically when the computer wakes on a new day, even if the app was never closed.
- **Audio State Desync**: Refactored `WordScreen` to drive the play/pause UI state strictly from native `<audio>` element events (`onPlay`/`onPause`). This ensures the UI icon accurately reflects the audio state when paused externally by the Electron main process (e.g., during window blur/hide).
- **Incomplete Preload Bridge**: Fixed a bug in the IPC bridge where `removeListener` failed to work because the `on` method was creating hidden anonymous wrappers. Implemented a `listenerMap` to correctly track and unregister IPC wrappers.
- **Blunt Error Recovery**: Replaced `window.location.reload()` in `WordScreen` with a scoped `retryKey` state, allowing users to retry failed fetches without nuking the entire application state.
- **Improved Windows Update Parenting**: Added `noLink: true` to the auto-updater `showMessageBox` to ensure the prompt is properly surfaced as a top-level dialog on Windows, preventing it from being buried when the app is in the tray.

### Added
- **Power-Aware Update Checks**: Added a listener for the Electron `powerMonitor` 'resume' event. Devote now automatically checks for updates 5 seconds after the computer wakes from sleep, ensuring catch-up if the machine was off during a version push.
- **UI Update Badge**: Implemented a pulsing green pill notification above the settings cog. Users are now visually notified that an update is downloaded and ready to install, even if they miss the initial system dialog.
- **Manual Update Check**: Added a "Check for updates" link in the Settings panel for manual triggers.
- **Prefetch Resilience**: Added a 3-attempt retry loop with exponential backoff to the scripture prefetching engine.
- **UI Confirmation**: Added a glowing "✓ Saved" confirmation state to the Settings "Save & Close" button for better user feedback.
- **Shared Plan Logic**: Extracted the curriculum selection UI into a reusable `PlanSelector` component, significantly reducing code duplication between the Welcome and Year-End screens.
- **Onboarding UX**: Added explicit validation feedback in the "Custom Library" setup to explain why the "Next" button is disabled when no books are selected.

### Changed
- **Update Polling Frequency**: Increased background update check frequency from every 4 hours to every 1 hour to ensure long-running tray-resident apps pick up releases faster.
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
