import { app, shell, BrowserWindow, ipcMain, Tray, Menu, nativeImage, session, protocol, net, powerMonitor, dialog } from 'electron'
import { autoUpdater } from 'electron-updater'
import { join } from 'path'
import { createServer } from 'http'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import Store from 'electron-store'

import { getReadingForDay, allBooksDict } from './planGenerator'

const store = new Store()

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
  hasCompletedOnboarding: false
}

for (const [key, value] of Object.entries(defaultSettings)) {
  if (!store.has(key)) {
    store.set(key, value)
  }
}

// Register custom scheme BEFORE app.whenReady() — required by Electron
protocol.registerSchemesAsPrivileged([{
  scheme: 'devote-audio',
  privileges: { secure: true, supportFetchAPI: true, stream: true, bypassCSP: true }
}])

// OS Startup launch settings
app.setLoginItemSettings({
  openAtLogin: true,
  path: app.getPath('exe')
})

// Configure Auto-Updater
autoUpdater.autoDownload = true
autoUpdater.autoInstallOnAppQuit = true

autoUpdater.on('update-downloaded', (info) => {
  dialog.showMessageBox({
    type: 'info',
    title: 'Update Ready',
    message: `A new version of Devote (${info.version}) is ready. Restart now to apply?`,
    buttons: ['Restart', 'Later']
  }).then((result) => {
    if (result.response === 0) autoUpdater.quitAndInstall()
  })
})

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
    kiosk: true, 
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

      // Auto-minimize perfectly out of the way if they click another app during setup
      const isSetup = store.get('hasCompletedOnboarding') || false
      if (!isSetup) {
         kioskWindow.minimize()
      }
    }
  })

  kioskWindow.on('restore', () => {
    if (kioskWindow && !kioskWindow.isDestroyed()) {
      kioskWindow.setAlwaysOnTop(true)
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
    const wasAutoLaunched = app.getLoginItemSettings().wasOpenedAtLogin
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
      if (kioskWindow) {
        kioskWindow.show()
        kioskWindow.focus()
      } else {
        createKioskWindow()
      }
    }},
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
    { label: 'Quit Devote', click: () => {
        if (kioskWindow && !kioskWindow.isDestroyed()) {
           kioskWindow.destroy()
        }
        app.quit()
    }}
  ])
  tray.setToolTip('Devote')
  tray.setContextMenu(contextMenu)

  // Explicitly destroy tray on quit to avoid "ghost icons" in Windows
  app.on('before-quit', () => {
    if (tray) {
      tray.destroy()
    }
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
      return true
    } catch (e) {
      console.error('Failed to save settings:', e)
      return false
    }
  })

  ipcMain.on('complete-devotion', () => {
    const settings = store.store
    const todayStr = getLocalDayStr()
    
    if (settings.lastCompletedDate !== todayStr) {
      store.set('lastCompletedDate', todayStr)
      store.set('currentStreak', (settings.currentStreak || 0) + 1)
      store.set('currentPlanDay', (settings.currentPlanDay || 1) + 1)
    }
    
    // reset snooze
    store.set('snoozeUntil', null)
  })

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
      const response = await fetch(url, {
        headers: {
          'Authorization': apiKey.startsWith('Token') ? apiKey : `Token ${apiKey}`
        }
      })
      if (!response.ok) throw new Error('API Error ' + response.status)
      return await response.json()
    } catch (e) {
      console.error(e)
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

  ipcMain.handle('fetch-ai', async (_, { prompt }) => {
    try {
      const apiKey = store.get('aiApiKey')
      if (!apiKey) throw new Error('No AI API Key found in settings')

      // 1. Identify Provider
      let provider = 'google'
      let url = ''
      let headers = { 'Content-Type': 'application/json' }
      let body = {}

      if (apiKey.startsWith('sk-ant')) {
        provider = 'anthropic'
        url = 'https://api.anthropic.com/v1/messages'
        headers['x-api-key'] = apiKey
        headers['anthropic-version'] = '2023-06-01'
        headers['dangerously-allow-browser'] = 'true'
        body = {
          model: 'claude-3-5-haiku-20241022',
          max_tokens: 1024,
          messages: [{ role: 'user', content: prompt }]
        }
      } else if (apiKey.startsWith('sk-')) {
        provider = 'openai'
        url = 'https://api.openai.com/v1/chat/completions'
        headers['Authorization'] = `Bearer ${apiKey}`
        body = {
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: prompt }]
        }
      } else {
        // Google Gemini — try a chain of models, falling back on 503/429
        const geminiModels = [
          'gemini-3-flash-preview',
          'gemini-3.1-flash-lite-preview',
          'gemini-2.5-flash',
          'gemini-2.0-flash',
        ]

        for (const model of geminiModels) {
          const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`
          const geminiBody = { contents: [{ parts: [{ text: prompt }] }] }

          console.log(`Trying Gemini model: ${model}`)
          const response = await fetch(geminiUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify(geminiBody)
          })

          if (response.ok) {
            const data = await response.json()
            return data.candidates[0].content.parts[0].text
          }

          const status = response.status
          if (status === 503 || status === 429) {
            // Overloaded or quota hit — try next model
            console.log(`Gemini ${model} returned ${status}, trying next...`)
            continue
          }

          // Any other error (401, 400 etc) — fail immediately
          const errorText = await response.text()
          throw new Error(`AI Provider Error (${status}): ${errorText}`)
        }

        throw new Error('All Gemini models are currently unavailable. Please try again later.')
      }

      // Non-Google providers: single attempt
      const response = await fetch(url, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(body)
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`AI Provider Error (${response.status}): ${errorText}`)
      }

      const data = await response.json()

      // 2. Normalize Response
      if (provider === 'openai') return data.choices[0].message.content
      if (provider === 'anthropic') return data.content[0].text

      throw new Error('Unknown Provider')
    } catch (e) {
      console.error(e)
      throw e
    }
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

  // Check for updates on startup
  if (app.isPackaged) {
    autoUpdater.checkForUpdatesAndNotify()
  }
})


app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
