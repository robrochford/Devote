# Devote Changelog

All notable changes to the Devote application will be documented in this file.

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
