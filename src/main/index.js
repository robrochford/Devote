import { app, shell, BrowserWindow, ipcMain, Tray, Menu, nativeImage, session, protocol, net, powerMonitor, dialog } from 'electron'
import { autoUpdater } from 'electron-updater'
import { join } from 'path'
import { createServer } from 'http'
import { tmpdir } from 'os'
import { writeFileSync, readFileSync } from 'fs'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import Store from 'electron-store'

import { getReadingForDay, allBooksDict } from './planGenerator'

const store = new Store()

let bundledMHC = {}
try {
  const mhcPath = join(__dirname, '../../resources/matthew_henry_concise.json')
  bundledMHC = JSON.parse(readFileSync(mhcPath, 'utf8'))
} catch (e) {
  console.error("Failed to load bundled MHC", e)
}

function getMhcEntry(key) {
  if (bundledMHC[key]) return bundledMHC[key];
  const cache = store.get('mhcCache') || {};
  return cache[key] || null;
}

// Prune the local MHC cache to only keep entries still needed:
// - Only chapters from currentPlanDay to 365
// - Only chapters belonging to the current customBooks selection
// Called after completing a devotion and after saving settings (plan changes)
function pruneCache() {
  const cache = store.get('mhcCache') || {}
  if (Object.keys(cache).length === 0) return

  const s = store.store

  // If not on a custom plan, there's nothing to keep — wipe it all
  if (s.planType !== 'custom' || !s.customBooks || s.customBooks.length === 0) {
    store.set('mhcCache', {})
    console.log('Pruned entire MHC cache (no custom plan active)')
    return
  }

  // Build the set of keys still needed from currentPlanDay onwards
  const currentDay = s.currentPlanDay || 1
  const needed = new Set()
  for (let day = currentDay; day <= 365; day++) {
    const p = getReadingForDay('custom', s.customBooks, day)
    const key = `${p.book} ${p.startChapter}`
    needed.add(key)
  }

  const pruned = {}
  for (const [key, val] of Object.entries(cache)) {
    if (needed.has(key)) pruned[key] = val
  }

  const removed = Object.keys(cache).length - Object.keys(pruned).length
  if (removed > 0) {
    store.set('mhcCache', pruned)
    console.log(`Pruned ${removed} stale MHC cache entries`)
  }
}

function getLocalDayStr(d = new Date()) {
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const defaultSettings = {
  lastCompletedDate: null,
  currentStreak: 0,
  snoozeUntil: null,
  aiApiKey: '',
  esvApiKey: 'd49a24d6323c36fa875b320a42e2ef0c86476c4c', // Shared default key for friends
  planType: 'devote',
  customBooks: [],
  currentPlanDay: 1,
  hasCompletedOnboarding: false,
  cachedReading: null // { day: number, data: object }
}

for (const [key, value] of Object.entries(defaultSettings)) {
  if (!store.has(key) || store.get(key) === '') {
    store.set(key, value)
  }
}

// Register custom scheme BEFORE app.whenReady() — required by Electron
protocol.registerSchemesAsPrivileged([{
  scheme: 'devote-audio',
  privileges: { secure: true, supportFetchAPI: true, stream: true, bypassCSP: true }
}])

// OS Startup launch settings — initialized based on store preference
const isStartupEnabled = store.get('launchAtStartup') !== false // default to true
app.setLoginItemSettings({
  openAtLogin: isStartupEnabled,
  path: app.getPath('exe'),
  args: ['--autostart']
})

// Configure Auto-Updater
// NOTE: We use checkForUpdates() (NOT checkForUpdatesAndNotify()) because we
// have our own update-downloaded handler. Using checkForUpdatesAndNotify()
// registers a second internal handler that races with ours and causes updates
// to silently stall — especially in tray apps where the app is never quit.
autoUpdater.autoDownload = true
// autoInstallOnAppQuit is intentionally NOT set — we use our own dialog to
// prompt the user immediately so updates aren't silently deferred forever.

let isCheckingForUpdate = false

autoUpdater.on('update-downloaded', (info) => {
  isCheckingForUpdate = false
  
  // Notify any open renderer windows that an update is ready (for UI badges)
  if (kioskWindow && !kioskWindow.isDestroyed()) {
    kioskWindow.webContents.send('update-ready', info.version)
  }

  // Ensure the dialog is visible and top-level even if the app is in the tray
  dialog.showMessageBox({
    type: 'info',
    title: 'Devote Update Ready',
    message: `Version ${info.version} is ready to install.`,
    detail: 'Restart now to apply the update, or it will install automatically the next time Devote starts.',
    buttons: ['Restart Now', 'Later'],
    defaultId: 0,
    cancelId: 1,
    noLink: true // Windows specific: prevents common UI issues with dialog parenting
  }).then((result) => {
    if (result.response === 0) {
      autoUpdater.quitAndInstall(false, true)
    }
  })
})

autoUpdater.on('update-not-available', () => {
  isCheckingForUpdate = false
})

autoUpdater.on('error', (err) => {
  isCheckingForUpdate = false
  console.error('Update check error:', err)
})

function checkForUpdates() {
  if (!app.isPackaged) return
  if (isCheckingForUpdate) return // Prevent concurrent checks stacking up
  isCheckingForUpdate = true
  autoUpdater.checkForUpdates().catch(err => {
    isCheckingForUpdate = false
    console.error('Update check failed:', err)
  })
}


// Single instance lock — prevents EADDRINUSE crashes and ensures exe click shows existing window
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  // Another instance is already running — quit this new one immediately
  app.quit()
  process.exit(0)
} else {
  // When a second instance tries to launch, show and focus the existing window
  app.on('second-instance', () => {
    evaluateStreak()
    checkForUpdates()
    if (kioskWindow) {
      if (kioskWindow.isMinimized()) kioskWindow.restore()
      kioskWindow.show()
      kioskWindow.focus()
    }
  })
}

let kioskWindow = null
let tray = null

function shouldShowKiosk() {
  const settings = store.store
  const now = new Date()

  // 1. Is it snoozed?
  if (settings.snoozeUntil && new Date(settings.snoozeUntil) > now) {
    return false
  }

  // 2. Is it past 4:00 AM?
  const triggerTime = new Date()
  triggerTime.setHours(4, 0, 0, 0)
  if (now < triggerTime) {
    return false // Too early
  }

  // 3. Did we already do it today?
  const todayStr = getLocalDayStr(now)
  if (settings.lastCompletedDate === todayStr) {
    return false
  }

  return true
}

function createKioskWindow() {
  evaluateStreak()

  const isSetup = store.get('hasCompletedOnboarding') || false

  kioskWindow = new BrowserWindow({
    show: false,
    frame: false,
    alwaysOnTop: true,
    // kiosk: true causes issues on macOS — it locks the screen and can't be
    // minimized or hidden, leaving a black screen after Skip Today / Snooze.
    // fullscreen achieves the same immersive feel without those restrictions.
    fullscreen: !is.dev,
    transparent: true,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      webviewTag: true // explicitly turning this on for the NLT/NKJV fallbacks
    }
  })

  // Prevent closing the window easily unless actioned internally.
  // Note: Standard OS emergency shortcuts remain out of scope for strict prevention in soft-kiosk mode.
  kioskWindow.on('close', (e) => {
    if (kioskWindow.isVisible()) {
       e.preventDefault()
       kioskWindow.hide()
    }
  })

  kioskWindow.on('hide', () => {
    if (kioskWindow && !kioskWindow.isDestroyed()) {
      kioskWindow.webContents.executeJavaScript(
        'document.querySelectorAll("audio").forEach(a => a.pause())'
      ).catch(() => {})
    }
  })

  // Directly pause all audio elements when user switches away (Win+Tab, Alt+Tab, etc)
  kioskWindow.on('blur', () => {
    if (kioskWindow && !kioskWindow.isDestroyed()) {
      kioskWindow.webContents.executeJavaScript(
        'document.querySelectorAll("audio").forEach(a => a.pause())'
      ).catch(() => {})
    }
  })

  kioskWindow.on('restore', () => {
    if (kioskWindow && !kioskWindow.isDestroyed()) {
      kioskWindow.setAlwaysOnTop(true)
      if (!is.dev) kioskWindow.setFullScreen(true)
      kioskWindow.show()
      kioskWindow.focus()
      
      const isSetup = store.get('hasCompletedOnboarding') || false
      if (!isSetup) {
         // Release the top lock immediately after pulling to front
         kioskWindow.setAlwaysOnTop(false)
      }
    }
  })

  kioskWindow.on('ready-to-show', () => {
    const wasAutoLaunched = app.getLoginItemSettings().wasOpenedAtLogin || process.argv.includes('--autostart')
    // Always show if manually launched
    // On auto-launch, only show if the daily conditions are met
    if (!wasAutoLaunched || shouldShowKiosk()) {
      kioskWindow.show()
    }
  })

  kioskWindow.on('show', () => {
    kioskWindow.webContents.send('window-show')
  })

  kioskWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    kioskWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    kioskWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function evaluateStreak() {
  const settings = store.store
  const todayStr = getLocalDayStr()
  const lastOpened = settings.lastOpenedDate

  if (lastOpened && lastOpened !== todayStr) {
    // It's a new day since the app was last opened.
    // Did they complete it on the specific day they last opened it?
    if (settings.lastCompletedDate !== lastOpened) {
      // They started the computer/app that day, but didn't finish the devotion. Break it.
      store.set('currentStreak', 0)
    }
  }
  
  // Record that the app was launched/run today
  if (lastOpened !== todayStr) {
    store.set('lastOpenedDate', todayStr)
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.devote.app')
  evaluateStreak()

  // On startup, if the user has a custom plan, kick off a background MHC download
  // for any chapters not yet cached. This catches users who set up before the 
  // preload whitelist fix landed.
  setTimeout(async () => {
    const s = store.store
    if (s.planType === 'custom' && s.customBooks && s.customBooks.length > 0) {
      const missing = []
      const seen = new Set()
      for (let day = 1; day <= 365; day++) {
        const p = getReadingForDay('custom', s.customBooks, day)
        const key = `${p.book} ${p.startChapter}`
        if (!getMhcEntry(key) && !seen.has(key)) {
          missing.push({ key, book: p.book, chapter: p.startChapter })
          seen.add(key)
        }
      }
      if (missing.length > 0) {
        console.log(`Startup MHC background job: ${missing.length} chapters to fetch`)
        for (const item of missing) {
          if (getMhcEntry(item.key)) continue
          try {
            const text = await scrapeBibleHub(item.book, item.chapter)
            const cache = store.get('mhcCache') || {}
            cache[item.key] = text
            store.set('mhcCache', cache)
            console.log(`Startup MHC: cached ${item.key}`)
          } catch (e) {
            console.error(`Startup MHC: failed ${item.key}:`, e.message)
          }
          await new Promise(r => setTimeout(r, 200))
        }
        console.log('Startup MHC background job complete')
      }
    }
  }, 5000) // 5s delay — let the window settle before network starts

  // Local HTTP proxy server for authenticated ESV audio — guaranteed to work in all contexts
  const audioServer = createServer(async (req, res) => {
    try {
      const apiKey = store.get('esvApiKey') || ''
      const auth = apiKey.startsWith('Token') ? apiKey : `Token ${apiKey}`
      const q = new URL(req.url, 'http://localhost').searchParams.get('q') || ''
      const esvUrl = `https://api.esv.org/v3/passage/audio/?q=${q}`
      
      const upstream = await fetch(esvUrl, { headers: { 'Authorization': auth } })
      if (!upstream.ok) { res.writeHead(upstream.status); res.end(); return }
      
      res.writeHead(200, {
        'Content-Type': 'audio/mpeg',
        'Access-Control-Allow-Origin': '*',
        'Transfer-Encoding': 'chunked'
      })
      
      const reader = upstream.body.getReader()
      const pump = async () => {
        const { done, value } = await reader.read()
        if (done) { res.end(); return }
        res.write(Buffer.from(value))
        pump()
      }
      pump()
    } catch (e) {
      console.error('Audio proxy error:', e)
      res.writeHead(500); res.end()
    }
  })
  // Handle port conflicts gracefully
  audioServer.on('error', (e) => {
    if (e.code === 'EADDRINUSE') {
      console.log('Port 45678 is in use, trying alternate...')
      setTimeout(() => {
        audioServer.close()
        audioServer.listen(0, '127.0.0.1') // Let OS pick an open port as a fallback
      }, 1000)
    }
  })

  try {
    audioServer.listen(45678, '127.0.0.1', () => console.log('Audio proxy running on :45678'))
  } catch (err) {
    console.error('Failed to bind to main port, falling back:', err)
  }
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // Hook into Windows wake from sleep/hibernation
  powerMonitor.on('resume', () => {
    // Re-evaluate streak directly upon wake
    evaluateStreak()
    
    // Automatically present the devotion if it qualifies for today
    if (kioskWindow && shouldShowKiosk()) {
      kioskWindow.show()
    }
  })

  // Intercept Chromium's native network requests to the ESV Audio API 
  // and silently inject the Authorization header! This allows standard <audio> tags to work perfectly.
  session.defaultSession.webRequest.onBeforeSendHeaders(
    { urls: ['https://api.esv.org/v3/passage/audio/*'] },
    (details, callback) => {
      const apiKey = store.get('esvApiKey') || ''
      details.requestHeaders['Authorization'] = apiKey.startsWith('Token') ? apiKey : `Token ${apiKey}`
      callback({ requestHeaders: details.requestHeaders })
    }
  )

  createKioskWindow()

  // Create Tray Icon
  const iconPath = join(__dirname, '../../resources/icon.png')
  const iconImage = nativeImage.createFromPath(iconPath)
  tray = new Tray(iconImage)
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Open Devote', click: () => {
      evaluateStreak()
      checkForUpdates()
      if (kioskWindow) {
        kioskWindow.show()
        kioskWindow.focus()
      } else {
        createKioskWindow()
      }
    }},
    { label: 'Check for Updates...', click: () => checkForUpdates() },
    { label: 'Snooze 1 Hour', click: () => {
      const now = new Date()
      now.setHours(now.getHours() + 1)
      store.set('snoozeUntil', now.toISOString())
      if (kioskWindow) kioskWindow.hide()
    }},
    { label: 'Reset Data (Test Mode)', click: () => {
        store.set('lastCompletedDate', null)
        store.set('snoozeUntil', null)
        store.set('currentPlanDay', 1)
        store.set('hasCompletedOnboarding', false)
        if (kioskWindow) {
          kioskWindow.webContents.send('reset-ui')
          kioskWindow.show()
        }
    }},
    { type: 'separator' },
    { label: 'Quit Devote', click: async () => {
        const { response } = await dialog.showMessageBox({
          type: 'warning',
          title: 'Quit Devote',
          message: 'Are you sure you want to quit Devote?',
          detail: 'If you quit now, the app will not run until you start it manually or restart your computer.',
          buttons: ['Quit', 'Cancel'],
          defaultId: 1,
          cancelId: 1,
          noLink: true
        })
        if (response === 0) {
          if (kioskWindow && !kioskWindow.isDestroyed()) {
             kioskWindow.destroy()
          }
          app.quit()
        }
    }}
  ])
  tray.setToolTip('Devote')
  tray.setContextMenu(contextMenu)

  // Feedback: Single click to open
  tray.on('click', () => {
    evaluateStreak()
    checkForUpdates()
    if (kioskWindow) {
      kioskWindow.show()
      kioskWindow.focus()
    } else {
      createKioskWindow()
    }
  })

  // Explicitly destroy tray on quit to avoid "ghost icons" in Windows
  app.on('before-quit', () => {
    if (tray) {
      tray.destroy()
    }
  })

  ipcMain.handle('get-version', () => app.getVersion())

  const hideKiosk = () => {
    if (!kioskWindow || kioskWindow.isDestroyed()) return
    // On Mac, must exit fullscreen before hiding — otherwise a black frame
    // is left behind with no way to dismiss it.
    if (process.platform === 'darwin' && kioskWindow.isFullScreen()) {
      kioskWindow.setFullScreen(false)
      // Small delay to let macOS complete the fullscreen exit animation
      setTimeout(() => kioskWindow.hide(), 300)
    } else {
      kioskWindow.hide()
    }
  }

  ipcMain.on('close-kiosk', () => hideKiosk())

  ipcMain.on('snooze', () => {
    const now = new Date()
    now.setHours(now.getHours() + 1)
    store.set('snoozeUntil', now.toISOString())
    hideKiosk()
  })

  ipcMain.on('skip-today', () => {
    store.set('lastCompletedDate', getLocalDayStr())
    store.set('snoozeUntil', null)
    hideKiosk()
  })

  // IPC Handlers
  ipcMain.handle('get-settings', () => {
    const s = store.store
    const todayStr = getLocalDayStr()
    return { ...s, completedToday: s.lastCompletedDate === todayStr }
  })

  ipcMain.handle('get-all-books', () => {
    return Object.keys(allBooksDict)
  })

  ipcMain.handle('get-today-reading', () => {
    const s = store.store
    return getReadingForDay(s.planType, s.customBooks, s.currentPlanDay || 1)
  })

  ipcMain.handle('save-settings', (_, newSettings) => {
    try {
      store.set(newSettings)
      // Prune stale MHC cache in case the plan or day changed
      pruneCache()
      return true
    } catch (e) {
      console.error('Failed to save settings:', e)
      return false
    }
  })

  ipcMain.on('complete-devotion', () => {
    const settings = store.store
    const todayStr = getLocalDayStr()
    const nextDay = (settings.currentPlanDay || 1) + 1
    
    if (settings.lastCompletedDate !== todayStr) {
      store.set('lastCompletedDate', todayStr)
      store.set('currentStreak', (settings.currentStreak || 0) + 1)
      store.set('currentPlanDay', nextDay)

      // Remove commentaries for past days now they are no longer needed
      pruneCache()

      // Prefetch tomorrow's reading while internet is active
      prefetchNextReading(nextDay)
    }
    
    // reset snooze
    store.set('snoozeUntil', null)
  })

  async function prefetchNextReading(nextDay, attempt = 1) {
    try {
      const s = store.store
      const apiKey = s.esvApiKey
      const reading = getReadingForDay(s.planType, s.customBooks, nextDay)
      
      const query = encodeURIComponent(reading.reference)
      // IMPORTANT: Must fetch /html/ (not /json/) to match what WordScreen renders via dangerouslySetInnerHTML
      const url = `https://api.esv.org/v3/passage/html/?q=${query}&include-headings=true&include-footnotes=false&include-audio-link=false`
      
      const response = await fetch(url, {
        headers: {
          'Authorization': apiKey.startsWith('Token') ? apiKey : `Token ${apiKey}`
        }
      })
      
      if (response.ok) {
        const data = await response.json()
        store.set('cachedReading', { day: nextDay, reference: reading.reference, data: data })
        console.log(`Successfully prefetched reading for day ${nextDay}`)
      }
    } catch (e) {
      console.error(`Prefetch failed (attempt ${attempt}):`, e)
      // Retry up to 3 times with exponential backoff — handles offline-at-completion scenarios
      if (attempt < 3) {
        setTimeout(() => prefetchNextReading(nextDay, attempt + 1), 30000 * attempt)
      }
    }
  }

  ipcMain.on('close-kiosk', () => {
    if (kioskWindow) kioskWindow.hide()
  })

  ipcMain.on('minimize-window', () => {
    if (kioskWindow) kioskWindow.minimize()
  })

  ipcMain.on('snooze', () => {
    const now = new Date()
    now.setHours(now.getHours() + 1) // Snooze for 1 hour
    store.set('snoozeUntil', now.toISOString())
    if (kioskWindow) kioskWindow.hide()
  })

  ipcMain.on('skip-today', () => {
    const settings = store.store
    const todayStr = getLocalDayStr()
    store.set('lastCompletedDate', todayStr) // Mark as done without increasing streak
    store.set('currentStreak', 0) // reset streak
    store.set('currentPlanDay', (settings.currentPlanDay || 1) + 1) // still move day forward so plan progresses
    if (kioskWindow) kioskWindow.hide()
  })

  ipcMain.handle('fetch-esv', async (_, { url, apiKey }) => {
    try {
      if (!apiKey) throw new Error('Missing ESV API Key')
      const response = await fetch(url, {
        headers: {
          'Authorization': apiKey.startsWith('Token') ? apiKey : `Token ${apiKey}`
        }
      })
      if (!response.ok) {
        if (response.status === 401) throw new Error('Unauthorized: Your ESV API key is invalid.')
        if (response.status === 403) throw new Error('Forbidden: Your ESV API key does not have access to this resource.')
        throw new Error(`API Error ${response.status}`)
      }
      return await response.json()
    } catch (e) {
      console.error('fetch-esv error:', e)
      throw e
    }
  })

  ipcMain.handle('fetch-esv-audio', async (_, { url, apiKey }) => {
    try {
      const response = await fetch(url, {
        headers: {
          'Authorization': apiKey.startsWith('Token') ? apiKey : `Token ${apiKey}`
        }
      })
      if (!response.ok) throw new Error('API Error ' + response.status)
      const arrayBuffer = await response.arrayBuffer()
      // Write to a temp file and return the file:// path — avoids IPC binary transfer issues
      const tmpFile = join(tmpdir(), `devote_audio_${Date.now()}.mp3`)
      writeFileSync(tmpFile, Buffer.from(arrayBuffer))
      return `file://${tmpFile.replace(/\\/g, '/')}`
    } catch (e) {
      console.error(e)
      throw e
    }
  })

  // ---------------------------------------------------------------------------
  // Dynamic Model Discovery
  // Hits each provider's models endpoint once per 24 hours and caches the
  // result in electron-store.  Falls back to a hardcoded list if the endpoint
  // is unreachable so the app never hard-fails due to a network blip.
  // ---------------------------------------------------------------------------
  const MODEL_CACHE_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours

  async function resolveAnthropicModels(apiKey) {
    const cacheKey = 'modelCache_anthropic'
    const cached = store.get(cacheKey)
    if (cached && (Date.now() - cached.fetchedAt) < MODEL_CACHE_TTL_MS) {
      console.log('Anthropic models (cached):', cached.models)
      return cached.models
    }
    try {
      const res = await fetch('https://api.anthropic.com/v1/models', {
        headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' }
      })
      if (res.ok) {
        const data = await res.json()
        // data.data is the array per Anthropic's envelope schema
        const haiku = (data.data || data.models || [])
          .map(m => m.id)
          .filter(id => id.toLowerCase().includes('haiku'))
          .sort((a, b) => b.localeCompare(a)) // lexicographic desc → newest date suffix first
        if (haiku.length > 0) {
          store.set(cacheKey, { models: haiku, fetchedAt: Date.now() })
          console.log('Anthropic models (discovered):', haiku)
          return haiku
        }
      }
    } catch (e) {
      console.warn('Anthropic model discovery failed, using fallback:', e.message)
    }
    return ['claude-haiku-4-5-20251001', 'claude-3-5-haiku-20241022', 'claude-3-haiku-20240307']
  }

  async function resolveGeminiModels(apiKey) {
    const cacheKey = 'modelCache_gemini'
    const cached = store.get(cacheKey)
    if (cached && (Date.now() - cached.fetchedAt) < MODEL_CACHE_TTL_MS) {
      console.log('Gemini models (cached):', cached.models)
      return cached.models
    }
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`)
      if (res.ok) {
        const data = await res.json()
        const flash = (data.models || [])
          .filter(m =>
            m.name.toLowerCase().includes('flash') &&
            (m.supportedGenerationMethods || []).includes('generateContent')
          )
          .map(m => m.name.replace('models/', ''))
          .sort((a, b) => b.localeCompare(a))
        if (flash.length > 0) {
          store.set(cacheKey, { models: flash, fetchedAt: Date.now() })
          console.log('Gemini models (discovered):', flash)
          return flash
        }
      }
    } catch (e) {
      console.warn('Gemini model discovery failed, using fallback:', e.message)
    }
    return ['gemini-2.5-flash', 'gemini-2.0-flash']
  }

  async function resolveOpenAIModels(apiKey) {
    const cacheKey = 'modelCache_openai'
    const cached = store.get(cacheKey)
    if (cached && (Date.now() - cached.fetchedAt) < MODEL_CACHE_TTL_MS) {
      console.log('OpenAI models (cached):', cached.models)
      return cached.models
    }
    try {
      const res = await fetch('https://api.openai.com/v1/models', {
        headers: { 'Authorization': `Bearer ${apiKey}` }
      })
      if (res.ok) {
        const data = await res.json()
        // Prefer cheapest/fastest mini models; filter against the live list
        const preferred = ['gpt-4o-mini', 'gpt-4.1-mini', 'gpt-4-turbo']
        const available = new Set((data.data || []).map(m => m.id))
        const matches = preferred.filter(id => available.has(id))
        if (matches.length > 0) {
          store.set(cacheKey, { models: matches, fetchedAt: Date.now() })
          console.log('OpenAI models (discovered):', matches)
          return matches
        }
      }
    } catch (e) {
      console.warn('OpenAI model discovery failed, using fallback:', e.message)
    }
    return ['gpt-4o-mini']
  }

  ipcMain.handle('fetch-ai', async (_, { prompt, apiKey }) => {
    try {
      let rawKey = apiKey || store.get('aiApiKey')
      if (!rawKey) throw new Error('No AI API Key found in settings')
      
      const keyToUse = rawKey.trim()

      // 1. Identify Provider and Fetch
      if (keyToUse.startsWith('sk-ant')) {
        // Resolve model list dynamically (cached 24h; falls back to hardcoded list)
        const anthropicModels = await resolveAnthropicModels(keyToUse)
        const anthropicHeaders = {
          'Content-Type': 'application/json',
          'x-api-key': keyToUse,
          'anthropic-version': '2023-06-01',
          'dangerously-allow-browser': 'true'
        }

        for (const model of anthropicModels) {
          console.log(`Trying Anthropic model: ${model}`)
          const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: anthropicHeaders,
            body: JSON.stringify({
              model: model,
              max_tokens: 1024,
              messages: [{ role: 'user', content: prompt }]
            })
          })

          if (response.ok) {
            const data = await response.json()
            return data.content[0].text
          }

          const status = response.status
          if (status === 404 || status === 503 || status === 429) {
            // Clear cached model list so next call re-discovers (model may be gone)
            if (status === 404) store.delete('modelCache_anthropic')
            console.log(`Anthropic ${model} returned ${status}, trying next...`)
            continue
          }

          const errorText = await response.text()
          throw new Error(`AI Provider Error (${status}): ${errorText}`)
        }
        throw new Error('All discovered Anthropic models are currently unavailable. Please try again later.')

      } else if (keyToUse.startsWith('sk-')) {
        const openAIModels = await resolveOpenAIModels(keyToUse)
        for (const model of openAIModels) {
          console.log(`Trying OpenAI model: ${model}`)
          const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${keyToUse}`
            },
            body: JSON.stringify({
              model: model,
              messages: [{ role: 'user', content: prompt }]
            })
          })

          if (response.ok) {
            const data = await response.json()
            return data.choices[0].message.content
          }

          const status = response.status
          if (status === 404 || status === 429 || status === 503) {
            if (status === 404) store.delete('modelCache_openai')
            console.log(`OpenAI ${model} returned ${status}, trying next...`)
            continue
          }

          const errorText = await response.text()
          throw new Error(`AI Provider Error (${response.status}): ${errorText}`)
        }
        throw new Error('All discovered OpenAI models are currently unavailable. Please try again later.')

      } else {
        // Google Gemini — resolve model list dynamically (cached 24h)
        const geminiModels = await resolveGeminiModels(keyToUse)

        for (const model of geminiModels) {
          console.log(`Trying Gemini model: ${model}`)
          const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${keyToUse}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }]
            })
          })

          if (response.ok) {
            const data = await response.json()
            return data.candidates[0].content.parts[0].text
          }

          const status = response.status
          if (status === 503 || status === 429 || status === 404) {
            if (status === 404) store.delete('modelCache_gemini')
            console.log(`Gemini ${model} returned ${status}, trying next...`)
            continue
          }

          const errorText = await response.text()
          throw new Error(`AI Provider Error (${status}): ${errorText}`)
        }

        throw new Error('All discovered Gemini models are currently unavailable. Please try again later.')
      }
    } catch (e) {
      console.error(e)
      throw e
    }
  })

  ipcMain.handle('check-for-updates', () => {
    checkForUpdates()
    return true
  })

  ipcMain.handle('get-custom-commentaries', () => {
    return store.get('customCommentaries') || {}
  })

  ipcMain.handle('save-custom-commentary', (_, { key, text }) => {
    const current = store.get('customCommentaries') || {}
    current[key] = text
    store.set('customCommentaries', current)
    return true
  })

  async function scrapeBibleHub(book, chapter) {
    const formattedBook = book.toLowerCase().replace(/\s+/g, '_')
    const url = `https://biblehub.com/commentaries/mhc/${formattedBook}/${chapter}.htm`
    
    const res = await fetch(url)
    if (!res.ok) throw new Error(`${res.status}`)
    
    const html = await res.text()
    
    const matches = [...html.matchAll(/class="comm">([\s\S]*?)<\/div>/ig)]
    if (!matches || matches.length === 0) throw new Error('Could not find text block')
    
    let text = matches.map(m => m[1]).join('\n\n')
    
    text = text.replace(/<br\s*\/?>/gi, '\n')
    text = text.replace(/<p[\s\S]*?>/gi, '\n\n')
    text = text.replace(/<[^>]*>?/gm, '') // Strip tags
    text = text.replace(/&#\d+;/g, "'") // Decode simple entities
    text = text.replace(/&quot;/g, '"')
    text = text.replace(/\n\s*\n/g, '\n\n') // Collapse newlines
    
    return text.trim()
  }

  ipcMain.handle('prefetch-mhc-commentaries', async (_, { customBooks, startDay = 1 }) => {
    try {
      const missing = [];
      const seen = new Set();
      
      for (let day = startDay; day <= 365; day++) {
        const p = getReadingForDay('custom', customBooks, day);
        const key = `${p.book} ${p.startChapter}`;
        if (!getMhcEntry(key) && !seen.has(key)) {
          missing.push({ key, book: p.book, chapter: p.startChapter });
          seen.add(key);
        }
      }

      if (missing.length === 0) return true;

      // Fetch first immediately
      const first = missing.shift();
      try {
        const text = await scrapeBibleHub(first.book, first.chapter);
        const cache = store.get('mhcCache') || {};
        cache[first.key] = text;
        store.set('mhcCache', cache);
        console.log(`Prefetched initial MHC for ${first.key}`);
      } catch (e) {
        console.error(`Failed Initial MHC fetch for ${first.key}:`, e);
      }

      // Background remainder
      if (missing.length > 0) {
        (async () => {
          for (const item of missing) {
            if (getMhcEntry(item.key)) continue;
            try {
              const text = await scrapeBibleHub(item.book, item.chapter);
              const cache = store.get('mhcCache') || {};
              cache[item.key] = text;
              store.set('mhcCache', cache);
              console.log(`Background prefetched MHC for ${item.key}`);
            } catch (e) {
              console.error(`Failed Background MHC ${item.key}:`, e);
            }
            await new Promise(r => setTimeout(r, 200));
          }
        })();
      }

      return true;
    } catch (err) {
      console.error('prefetch error', err);
      return false;
    }
  })

  ipcMain.handle('get-mhc-entry', (_, key) => {
    return getMhcEntry(key);
  })

  ipcMain.handle('get-startup-status', () => {
    return app.getLoginItemSettings().openAtLogin
  })

  ipcMain.handle('set-startup-status', (_, enabled) => {
    store.set('launchAtStartup', enabled)
    app.setLoginItemSettings({
      openAtLogin: enabled,
      path: app.getPath('exe'),
      args: ['--autostart']
    })
    return true
  })

  // Initial check on startup — short delay to let the window settle first
  setTimeout(() => checkForUpdates(), 10000)

  // Background update check cycle (every hour) — guard prevents concurrent stacking
  // Switched from 4h to 1h to ensure updates are caught "straight away" for long-running tray apps
  setInterval(() => checkForUpdates(), 1 * 60 * 60 * 1000)

  // Check for updates when the computer wakes up from sleep
  powerMonitor.on('resume', () => {
    console.log('Power resumed, checking for updates...')
    setTimeout(() => checkForUpdates(), 5000) // 5s delay to let network reconnect
    
    // Also re-check if we should show the kiosk immediately upon wake
    if (kioskWindow && shouldShowKiosk()) {
      kioskWindow.show()
    }
  })

  // Background trigger cycle: Check every 15 minutes if the devotion should be presented.
  // This catches day transitions (4:00 AM) or snooze expirations while the computer stays on.
  setInterval(() => {
    if (kioskWindow && shouldShowKiosk()) {
      kioskWindow.show()
    }
  }, 15 * 60 * 1000)
})


app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
