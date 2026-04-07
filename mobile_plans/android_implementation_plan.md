# Android Implementation Plan: Porting Devote via Capacitor

This document outlines the specific requirements and strategies for successfully migrating the React Devote desktop shell onto native Android architecture leveraging Capacitor.

---

## 1. Environment & Setup

**Prerequisites:**
- Android Studio (Version 2023+ recommended, Iguana or Ladybug)
- Java SDK 17+ installed on the host machine.

**Installation Steps:**
From the root of your existing project, deploy Capacitor:
```bash
npm install @capacitor/core @capacitor/android
npm install -D @capacitor/cli

npx cap init Devote com.electrode.devote --web-dir out/renderer
```

Add the Android platform specifically:
```bash
npx cap add android
npx cap sync android
```

---

## 2. Global State & Local Persistence

Because standard Electron `ipcRenderer` commands rely strictly on NodeJS, they fail on Android web environments. Local Storage is highly vulnerable to being randomly cleared by the OS over periods of inactivity.

**Solution:** Use Capacitor Native Preferences.
```bash
npm install @capacitor/preferences
```

Replace `store.get()` and `store.set()` across the app with:
```javascript
import { Preferences } from '@capacitor/preferences';

// Async saves
await Preferences.set({ key: 'devote_settings', value: JSON.stringify(appState) });
const { value } = await Preferences.get({ key: 'devote_settings' });
```

---

## 3. Resolving Android CORS via Native Proxy

Connecting to the Devote ESV, Anthropic, or OpenAI APIs via browser `fetch` triggers severe CORS faults.

**Configuration Fix:**
By enabling `CapacitorHttp`, Capacitor aggressively hooks all Javascript Network requests into Android's native Java `HttpURLConnection` libraries. This circumvents the Webview CORS restriction policy entirely.

In `capacitor.config.ts`:
```typescript
import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  // ...
  plugins: {
    CapacitorHttp: {
      enabled: true,
    },
  },
};
export default config;
```

---

## 4. Replacing the Audio Proxy Workaround

Devote required a desktop proxy (`port 45678`) to embed API Authorization headers on HTML5 Audio payloads. 
Since Android runs in standard HTTP contexts natively wrapped by Capacitor, you must shift from live-streaming to native fetching.

**Required Libraries:**
```bash
npm install @capacitor/filesystem
```

**Implementation Strategy:**
1. You perform a native `byte[] / blob` download using the `Authorization: Token` header.
2. Save this directly to the Android `cacheDir`.
3. Feed the resulting file URI directly to your `<audio />` tag loop identically to standard mp3 files.

```javascript
import { CapacitorHttp, Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';

const payload = await CapacitorHttp.get({
  url: 'https://api.esv.org/v3/passage/audio/?q=...',
  headers: { 'Authorization': `Token ${esvApiKey}` },
  responseType: 'blob' 
});

await Filesystem.writeFile({
  path: 'daily_audio.mp3',
  data: payload.data,
  directory: Directory.Cache
});

const uriRaw = await Filesystem.getUri({ path: 'daily_audio.mp3', directory: Directory.Cache });
setAudioUrl(Capacitor.convertFileSrc(uriRaw.uri));
```

---

## 5. Android Specific Hardware Handlers

### Hardware Back Button Interception
Android devices rely heavily on physical bottom-chassis back navigation. If not intercepted, clicking the back button on the `ReflectionScreen` will force-terminate the application.

Import App module:
```bash
npm install @capacitor/app
```

Add event listeners inside Main app mounting components:
```javascript
import { App } from '@capacitor/app';

App.addListener('backButton', ({ canGoBack }) => {
  // e.g., if on Reflection Screen, map directly to your existing `onBack` handler.
  // if on Prayer screen, App.exitApp();
});
```

### Visual Degradation: The Blur Check
Unlike iOS Safari, Android Chromium rendering engines deeply lag when tasked with rendering intensive CSS `backdrop-filter: blur()`. If the UI begins to stutter or drop frames during transition animations, fallback immediately via standard Capacitor Device capability checks.

```css
/* Alternative Android CSS fallback where no blur is possible */
@supports not (backdrop-filter: blur(10px)) {
  .bg-glass {
    background-color: rgba(24, 24, 27, 0.95); /* Deep opaque zinc */
  }
}
```

Deploying and testing physically on an Android target is performed gracefully with:
```bash
npx cap open android
```
