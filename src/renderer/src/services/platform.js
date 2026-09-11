import { Capacitor, CapacitorHttp } from '@capacitor/core'
import { Preferences } from '@capacitor/preferences'
import { Filesystem, Directory } from '@capacitor/filesystem'
import { App as CapApp } from '@capacitor/app'
import { getReadingForDay, allBooksDict } from './planGenerator'
import bundledMHC from './matthew_henry_concise.json'

export const isElectron = () => typeof window !== 'undefined' && Boolean(window.electron && window.electron.ipcRenderer)
export const isCapacitor = () => typeof window !== 'undefined' && Capacitor.isNativePlatform()

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
  hasCompletedOnboarding: false,
  esvApiKey: 'd49a24d6323c36fa875b320a42e2ef0c86476c4c',
  aiApiKey: '',
  planType: 'devote',
  customBooks: [],
  currentPlanDay: 1,
  launchAtStartup: false
}

export async function getSettings() {
  if (isElectron()) {
    return window.electron.ipcRenderer.invoke('get-settings')
  }

  try {
    const { value } = await Preferences.get({ key: 'devote_settings' })
    const settings = value ? JSON.parse(value) : { ...defaultSettings }
    const todayStr = getLocalDayStr()
    return {
      ...defaultSettings,
      ...settings,
      esvApiKey: settings.esvApiKey || defaultSettings.esvApiKey,
      completedToday: settings.lastCompletedDate === todayStr
    }
  } catch (err) {
    console.error('Mobile getSettings error:', err)
    return { ...defaultSettings }
  }
}

export async function saveSettings(patch) {
  if (isElectron()) {
    return window.electron.ipcRenderer.invoke('save-settings', patch)
  }

  try {
    const current = await getSettings()
    const updated = { ...current, ...patch }
    await Preferences.set({
      key: 'devote_settings',
      value: JSON.stringify(updated)
    })
    return true
  } catch (err) {
    console.error('Mobile saveSettings error:', err)
    return false
  }
}

export async function getVersion() {
  if (isElectron()) {
    return window.electron.ipcRenderer.invoke('get-version')
  }
  return '1.2.43'
}

export async function getAllBooks() {
  if (isElectron()) {
    return window.electron.ipcRenderer.invoke('get-all-books')
  }
  return Object.keys(allBooksDict)
}

export async function getTodayReading() {
  if (isElectron()) {
    return window.electron.ipcRenderer.invoke('get-today-reading')
  }
  const s = await getSettings()
  return getReadingForDay(s.planType, s.customBooks, s.currentPlanDay || 1)
}

export async function fetchEsv({ url, apiKey }) {
  if (isElectron()) {
    return window.electron.ipcRenderer.invoke('fetch-esv', { url, apiKey })
  }

  const cleanKey = apiKey.startsWith('Token') ? apiKey : `Token ${apiKey}`
  const response = await CapacitorHttp.get({
    url,
    headers: {
      'Authorization': cleanKey
    }
  })

  if (response.status >= 200 && response.status < 300) {
    if (typeof response.data === 'string') {
      try {
        return JSON.parse(response.data)
      } catch (e) {
        return response.data
      }
    }
    return response.data
  }
  throw new Error(`ESV API request failed with status: ${response.status}`)
}

async function resolveAnthropicModels(apiKey) {
  try {
    const res = await CapacitorHttp.get({
      url: 'https://api.anthropic.com/v1/models',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      }
    })
    if (res.status === 200 && res.data) {
      const haiku = (res.data.data || res.data.models || [])
        .map(m => m.id)
        .filter(id => id.toLowerCase().includes('haiku'))
        .sort((a, b) => b.localeCompare(a))
      if (haiku.length > 0) return haiku
    }
  } catch (e) {
    console.warn('Anthropic discovery fallback:', e)
  }
  return ['claude-haiku-4-5-20251001', 'claude-3-5-haiku-20241022', 'claude-3-haiku-20240307']
}

async function resolveOpenAIModels(apiKey) {
  try {
    const res = await CapacitorHttp.get({
      url: 'https://api.openai.com/v1/models',
      headers: { 'Authorization': `Bearer ${apiKey}` }
    })
    if (res.status === 200 && res.data) {
      const preferred = ['gpt-4o-mini', 'gpt-4.1-mini', 'gpt-4-turbo']
      const available = new Set((res.data.data || []).map(m => m.id))
      const matches = preferred.filter(id => available.has(id))
      if (matches.length > 0) return matches
    }
  } catch (e) {
    console.warn('OpenAI discovery fallback:', e)
  }
  return ['gpt-4o-mini']
}

async function resolveGeminiModels(apiKey) {
  try {
    const res = await CapacitorHttp.get({
      url: `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
    })
    if (res.status === 200 && res.data) {
      const flash = (res.data.models || [])
        .filter(m =>
          m.name.toLowerCase().includes('flash') &&
          (m.supportedGenerationMethods || []).includes('generateContent')
        )
        .map(m => m.name.replace('models/', ''))
        .sort((a, b) => b.localeCompare(a))
      if (flash.length > 0) return flash
    }
  } catch (e) {
    console.warn('Gemini discovery fallback:', e)
  }
  return ['gemini-2.5-flash', 'gemini-2.0-flash']
}

export async function fetchAi({ prompt, apiKey }) {
  if (isElectron()) {
    return window.electron.ipcRenderer.invoke('fetch-ai', { prompt, apiKey })
  }

  let rawKey = apiKey
  if (!rawKey) {
    const s = await getSettings()
    rawKey = s.aiApiKey
  }
  if (!rawKey) throw new Error('No AI API Key found in settings')
  const keyToUse = rawKey.trim()

  if (keyToUse.startsWith('sk-ant')) {
    const models = await resolveAnthropicModels(keyToUse)
    for (const model of models) {
      const res = await CapacitorHttp.post({
        url: 'https://api.anthropic.com/v1/messages',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': keyToUse,
          'anthropic-version': '2023-06-01'
        },
        data: {
          model,
          max_tokens: 1024,
          messages: [{ role: 'user', content: prompt }]
        }
      })
      if (res.status === 200 && res.data?.content?.[0]?.text) {
        return res.data.content[0].text
      }
    }
    throw new Error('All discovered Anthropic models failed.')
  } else if (keyToUse.startsWith('sk-')) {
    const models = await resolveOpenAIModels(keyToUse)
    for (const model of models) {
      const res = await CapacitorHttp.post({
        url: 'https://api.openai.com/v1/chat/completions',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${keyToUse}`
        },
        data: {
          model,
          messages: [{ role: 'user', content: prompt }]
        }
      })
      if (res.status === 200 && res.data?.choices?.[0]?.message?.content) {
        return res.data.choices[0].message.content
      }
    }
    throw new Error('All discovered OpenAI models failed.')
  } else {
    const models = await resolveGeminiModels(keyToUse)
    for (const model of models) {
      const res = await CapacitorHttp.post({
        url: `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${keyToUse}`,
        headers: { 'Content-Type': 'application/json' },
        data: {
          contents: [{ parts: [{ text: prompt }] }]
        }
      })
      if (res.status === 200 && res.data?.candidates?.[0]?.content?.parts?.[0]?.text) {
        return res.data.candidates[0].content.parts[0].text
      }
    }
    throw new Error('All discovered Gemini models failed.')
  }
}

export async function getCustomCommentaries() {
  if (isElectron()) {
    return window.electron.ipcRenderer.invoke('get-custom-commentaries')
  }
  const { value } = await Preferences.get({ key: 'customCommentaries' })
  return value ? JSON.parse(value) : {}
}

export async function saveCustomCommentary({ key, text }) {
  if (isElectron()) {
    return window.electron.ipcRenderer.invoke('save-custom-commentary', { key, text })
  }
  const current = await getCustomCommentaries()
  current[key] = text
  await Preferences.set({ key: 'customCommentaries', value: JSON.stringify(current) })
  return true
}

export async function getMhcEntry(key) {
  if (isElectron()) {
    return window.electron.ipcRenderer.invoke('get-mhc-entry', key)
  }
  if (bundledMHC && bundledMHC[key]) {
    return bundledMHC[key]
  }
  const { value } = await Preferences.get({ key: 'mhcCache' })
  const cache = value ? JSON.parse(value) : {}
  return cache[key] || null
}

export async function prefetchMhcCommentaries({ customBooks, startDay = 1 }) {
  if (isElectron()) {
    return window.electron.ipcRenderer.invoke('prefetch-mhc-commentaries', { customBooks, startDay })
  }
  return true
}

export async function getAudioUrl(reference, apiKey) {
  if (isElectron()) {
    const q = encodeURIComponent(reference)
    return `http://127.0.0.1:45678/?q=${q}`
  }

  try {
    const q = encodeURIComponent(reference)
    const downloadUrl = `https://api.esv.org/v3/passage/audio/?q=${q}`
    const cleanKey = apiKey.startsWith('Token') ? apiKey : `Token ${apiKey}`

    const res = await CapacitorHttp.get({
      url: downloadUrl,
      headers: { 'Authorization': cleanKey },
      responseType: 'blob'
    })

    if (res.data) {
      const fileName = `devote_audio_${q}.mp3`
      await Filesystem.writeFile({
        path: fileName,
        data: res.data,
        directory: Directory.Cache
      })
      const uriResult = await Filesystem.getUri({
        path: fileName,
        directory: Directory.Cache
      })
      return Capacitor.convertFileSrc(uriResult.uri)
    }
  } catch (err) {
    console.error('Failed to download mobile audio:', err)
  }
  return ''
}

export async function completeDevotion() {
  if (isElectron()) {
    window.electron.ipcRenderer.send('complete-devotion')
    return
  }

  const s = await getSettings()
  const todayStr = getLocalDayStr()
  const nextDay = (s.currentPlanDay || 1) + 1

  if (s.lastCompletedDate !== todayStr) {
    await saveSettings({
      lastCompletedDate: todayStr,
      currentStreak: (s.currentStreak || 0) + 1,
      currentPlanDay: nextDay,
      snoozeUntil: null
    })
  }
}

export async function closeKiosk() {
  if (isElectron()) {
    window.electron.ipcRenderer.send('close-kiosk')
  } else if (isCapacitor()) {
    CapApp.exitApp()
  }
}

export async function snooze() {
  if (isElectron()) {
    window.electron.ipcRenderer.send('snooze')
  } else {
    const now = new Date()
    now.setHours(now.getHours() + 1)
    await saveSettings({ snoozeUntil: now.toISOString() })
    if (isCapacitor()) CapApp.exitApp()
  }
}

export async function skipToday() {
  if (isElectron()) {
    window.electron.ipcRenderer.send('skip-today')
  } else {
    await saveSettings({ lastCompletedDate: getLocalDayStr(), snoozeUntil: null })
    if (isCapacitor()) CapApp.exitApp()
  }
}

export async function minimizeWindow() {
  if (isElectron()) {
    window.electron.ipcRenderer.send('minimize-window')
  } else if (isCapacitor()) {
    CapApp.exitApp()
  }
}
