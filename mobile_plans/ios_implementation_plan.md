# iOS Implementation Plan: Porting Devote via Capacitor

This detailed document serves as the architectural blueprint for migrating the Devote React frontend from its current desktop shell (Electron) into a native iOS mobile application using **Capacitor**. 

Capacitor acts as a native iOS Bridge, meaning 100% of the React, Vite, and TailwindCSS design code will transplant completely cleanly, but the backend "Electron Main Process" logic must be replaced with native iOS mobile hooks.

---

## 1. Environment & Setup

**Prerequisites:**
- macOS (Required by Apple for compiling)
- Xcode (latest)
- CocoaPods (`sudo gem install cocoapods`)

**Installation Steps:**
Inside the existing root directory, install Capacitor:
```bash
npm install @capacitor/core @capacitor/ios
npm install -D @capacitor/cli
```

Initialize Capacitor in the repo:
```bash
npx cap init Devote com.electrode.devote --web-dir out/renderer
```
*(Note: Devote's Vite output directory is normally `out/renderer`)*

Add the iOS platform:
```bash
npx cap add ios
npx cap sync ios
```

---

## 2. Replacing the IPC Bridge (Settings & Data)

Electron relies on `electron-store` and `ipcRenderer` to synchronously store data. Mobile apps require asynchronous native preferences.

**Required Library:**
```bash
npm install @capacitor/preferences
```

**Implementation:**
In `App.jsx`, replace `window.electron.ipcRenderer.invoke('get-settings')` with:

```javascript
import { Preferences } from '@capacitor/preferences';

// Loading Settings
const { value } = await Preferences.get({ key: 'devote_settings' });
const settings = value ? JSON.parse(value) : {};

// Saving Settings
await Preferences.set({
  key: 'devote_settings',
  value: JSON.stringify(updatedSettings)
});
```
This entirely replaces the `src/main/index.js` IPC saving hooks.

---

## 3. Resolving Cross-Origin (CORS) External API Limits

Because Capacitor bounds the UI within `capacitor://localhost`, making standard browser `fetch()` calls to Gemini, OpenAI, or ESV APIs will trigger strict Apple WebView CORS policy rejections.

**The Fix: Enable Native HTTP intercepts**
In your `capacitor.config.ts`, forcefully enable native HTTP patching. This routes all Javascript `fetch` calls dynamically through iOS's native `NSURLSession`, completely bypassing browser CORS.

```typescript
import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.electrode.devote',
  appName: 'Devote',
  webDir: 'out/renderer',
  plugins: {
    CapacitorHttp: {
      enabled: true,
    },
  },
};
export default config;
```

---

## 4. Re-Engineering the Audio Proxy Server

Electron used an Express `localhost:45678` proxy to stream ESV Audio and inject the `Authorization: Token` headers because HTML `<audio>` tags cannot hold headers. iOS cannot run a Node.js background server natively.

**Required Libraries:**
```bash
npm install @capacitor/filesystem
```

**Implementation Strategy:**
Instead of proxying the stream, the app will *natively download* the 3MB audiobook mp3 chapter to the device cache, and mount the offline file securely to the Audio element.

```javascript
import { CapacitorHttp } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Capacitor } from '@capacitor/core';

// 1. Download internally
const download = await CapacitorHttp.request({
  url: 'https://api.esv.org/v3/passage/audio/?q=...',
  method: 'GET',
  headers: { 'Authorization': `Token ${esvApiKey}` },
  responseType: 'blob' 
});

// 2. Write to iOS Cache bounds
await Filesystem.writeFile({
  path: 'today_audio.mp3',
  data: download.data,
  directory: Directory.Cache
});

// 3. Mount Native URI to React Audio tag
const stat = await Filesystem.getUri({ path: 'today_audio.mp3', directory: Directory.Cache });
const nativeSrc = Capacitor.convertFileSrc(stat.uri);

setAudioUrl(nativeSrc); // Passed to <audio src={audioUrl} />
```

---

## 5. iOS Specific Visual Fixes

### The Dynamic Island / Notch
Because Devote uses absolute positioned overlays (`absolute inset-0`), the UI will push up directly beneath the iPhone status bar clock or Dynamic Island, completely hiding text.

Apply Apple's native safe-area CSS environment variables:
```css
/* In index.css */
.safe-padding-top {
  padding-top: env(safe-area-inset-top);
}
```
Append `safe-padding-top` to `WelcomeScreen`, `PrayerScreen`, `WordScreen`, and `ReflectionScreen`.

### Blur Fallbacks
iOS Safari handles `-webkit-backdrop-filter` exceptionally well. However, verifying the opacity of `bg-black/80 backdrop-blur-3xl` against physical test devices is highly recommended to tune the aesthetic. 

When you're ready to test, simply run:
```bash
npx cap open ios
```
Which mounts the code directly into Xcode for emulator deployment or App Store Connect distribution.
