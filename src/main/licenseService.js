import { execSync } from 'child_process'
import { existsSync, readFileSync } from 'fs'
import { hostname, platform as getPlatform } from 'os'
import { createHash, randomUUID } from 'crypto'
let cachedSafeStorage = undefined

function getSafeStorage() {
  if (cachedSafeStorage !== undefined) return cachedSafeStorage
  try {
    // In Electron runtime, electron is available via createRequire or standard import
    const electron = typeof require !== 'undefined' ? require('electron') : null
    cachedSafeStorage = electron?.safeStorage || null
  } catch {
    cachedSafeStorage = null
  }
  return cachedSafeStorage
}

const API_BASE_DEFAULT = 'https://devote.electrodedigital.co.uk/wp-json/devote/v1'
const MAX_OFFLINE_DAYS = 14
const PAST_DUE_GRACE_DAYS = 7
const REQUEST_TIMEOUT_MS = 10000

// Base32 alphabet without 0/O and 1/I (Crockford-style / base32)
// Allowed chars: A-Z (excluding I and O), 2-9 (excluding 0 and 1)
// Notice [A-HJ-NP-Z2-9] (H, J-N, P-Z)
const LICENSE_KEY_REGEX = /^DVT-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/i

export function normalizeLicenseKey(rawKey = '') {
  if (typeof rawKey !== 'string') return ''
  // Strip whitespace, hyphens, and convert to uppercase
  const cleaned = rawKey.replace(/[^a-zA-Z0-9]/g, '').toUpperCase()
  if (cleaned.startsWith('DVT') && cleaned.length === 19) {
    const parts = [
      'DVT',
      cleaned.slice(3, 7),
      cleaned.slice(7, 11),
      cleaned.slice(11, 15),
      cleaned.slice(15, 19)
    ]
    return parts.join('-')
  }
  // If user pasted without DVT prefix (16 chars)
  if (cleaned.length === 16) {
    const parts = [
      'DVT',
      cleaned.slice(0, 4),
      cleaned.slice(4, 8),
      cleaned.slice(8, 12),
      cleaned.slice(12, 16)
    ]
    return parts.join('-')
  }
  return cleaned
}

export function validateLicenseKeyFormat(key = '') {
  const normalized = normalizeLicenseKey(key)
  return LICENSE_KEY_REGEX.test(normalized)
}

export function maskLicenseKey(key = '') {
  const norm = normalizeLicenseKey(key)
  if (!norm || norm.length < 19) return '••••-••••-••••-••••'
  const parts = norm.split('-')
  if (parts.length === 5) {
    return `${parts[0]}-••••-••••-••••-${parts[4]}`
  }
  return '••••-••••-••••-••••'
}

export function getApiBaseUrl() {
  if (process.env.DEVOTE_LICENSE_API && process.env.DEVOTE_LICENSE_API.trim()) {
    return process.env.DEVOTE_LICENSE_API.trim().replace(/\/+$/, '')
  }
  return API_BASE_DEFAULT
}

export function getPlatformName() {
  const p = getPlatform()
  if (p === 'win32') return 'windows'
  if (p === 'darwin') return 'macos'
  if (p === 'linux') return 'linux'
  if (p === 'android') return 'android'
  return p
}

export function getDeviceName() {
  try {
    return hostname() || 'Devote Desktop'
  } catch {
    return 'Devote Desktop'
  }
}

/**
 * Generates a stable machine identifier using OS hardware GUID / machine-id
 * and hashes with SHA-256 so raw hardware IDs are never transmitted or logged.
 */
export function getStableDeviceId(store) {
  if (store) {
    const stored = store.get('deviceId')
    if (stored) return stored
  }

  let rawMachineSeed = ''
  try {
    if (process.platform === 'win32') {
      // Query Windows Registry Cryptography MachineGuid
      const output = execSync('reg query HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Cryptography /v MachineGuid', {
        encoding: 'utf8',
        windowsHide: true,
        timeout: 2000
      })
      const match = output.match(/MachineGuid\s+REG_SZ\s+([A-Fa-f0-9-]+)/)
      if (match && match[1]) {
        rawMachineSeed = match[1].trim()
      }
    } else if (process.platform === 'darwin') {
      const output = execSync('ioreg -rd1 -c IOPlatformExpertDevice', {
        encoding: 'utf8',
        timeout: 2000
      })
      const match = output.match(/"IOPlatformUUID"\s*=\s*"([^"]+)"/)
      if (match && match[1]) {
        rawMachineSeed = match[1].trim()
      }
    } else if (process.platform === 'linux') {
      // Modern Linux distributions populate /etc/machine-id or /var/lib/dbus/machine-id
      if (existsSync('/etc/machine-id')) {
        rawMachineSeed = readFileSync('/etc/machine-id', 'utf8').trim()
      } else if (existsSync('/var/lib/dbus/machine-id')) {
        rawMachineSeed = readFileSync('/var/lib/dbus/machine-id', 'utf8').trim()
      }
    }
  } catch (err) {
    // Non-fatal, fallback to UUID
  }

  if (!rawMachineSeed) {
    rawMachineSeed = randomUUID()
  }

  const hashedId = createHash('sha256')
    .update(`devote-device-seed:${rawMachineSeed}`)
    .digest('hex')
    .slice(0, 32)

  if (store) {
    store.set('deviceId', hashedId)
  }

  return hashedId
}

/**
 * Storage helpers using Electron safeStorage when available
 */
function encryptData(rawObj) {
  try {
    const str = JSON.stringify(rawObj)
    const ss = getSafeStorage()
    if (ss && ss.isEncryptionAvailable()) {
      const buf = ss.encryptString(str)
      return { encrypted: true, data: buf.toString('base64') }
    }
    // Fallback if safeStorage unavailable
    return { encrypted: false, data: Buffer.from(str, 'utf8').toString('base64') }
  } catch (err) {
    return { encrypted: false, data: '' }
  }
}

function decryptData(storedWrapper) {
  if (!storedWrapper || !storedWrapper.data) return null
  try {
    const ss = getSafeStorage()
    if (storedWrapper.encrypted && ss && ss.isEncryptionAvailable()) {
      const buf = Buffer.from(storedWrapper.data, 'base64')
      const str = ss.decryptString(buf)
      return JSON.parse(str)
    }
    const str = Buffer.from(storedWrapper.data, 'base64').toString('utf8')
    return JSON.parse(str)
  } catch (err) {
    return null
  }
}

/**
 * Fetch wrapper with timeout and single retry with backoff
 */
async function fetchWithRetry(url, options = {}, retries = 1, timeoutMs = REQUEST_TIMEOUT_MS) {
  let attempt = 0
  while (attempt <= retries) {
    const controller = new AbortController()
    const id = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      })
      clearTimeout(id)
      return response
    } catch (err) {
      clearTimeout(id)
      if (attempt === retries) throw err
      await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)))
      attempt++
    }
  }
}

/**
 * LicenseService handles all license operations, caching, grace periods and offline tolerance.
 */
export class LicenseService {
  constructor(store, options = {}) {
    this.store = store
    this.apiBaseUrl = options.apiBaseUrl || getApiBaseUrl()
    this.deviceId = options.deviceId || getStableDeviceId(this.store)
    this.deviceName = options.deviceName || getDeviceName()
    this.platform = options.platform || getPlatformName()
    this.fetchFn = options.fetchFn || fetchWithRetry
  }

  getRecord() {
    const raw = this.store.get('licenseRecord')
    return decryptData(raw)
  }

  saveRecord(record) {
    const encrypted = encryptData(record)
    this.store.set('licenseRecord', encrypted)
  }

  clearRecord() {
    this.store.delete('licenseRecord')
  }

  /**
   * Evaluates the current state including offline window & past_due grace period.
   * Returns: { isLicensed, status, maskedKey, customer, reason, inGracePeriod, daysOffline }
   */
  getStatus() {
    const record = this.getRecord()
    if (!record || !record.licenseKey) {
      return {
        isLicensed: false,
        status: 'unlicensed',
        maskedKey: '',
        customer: null,
        reason: 'No license key configured'
      }
    }

    const now = Date.now()
    const lastChecked = record.lastCheckedAt ? new Date(record.lastCheckedAt).getTime() : 0
    const daysSinceCheck = lastChecked > 0 ? (now - lastChecked) / (1000 * 60 * 60 * 24) : 999

    // Check offline tolerance (14 days max)
    if (daysSinceCheck > MAX_OFFLINE_DAYS) {
      return {
        isLicensed: false,
        status: 'offline_expired',
        maskedKey: maskLicenseKey(record.licenseKey),
        customer: record.customer || null,
        lastCheckedAt: record.lastCheckedAt,
        daysOffline: Math.floor(daysSinceCheck),
        reason: `Offline limit exceeded (${Math.floor(daysSinceCheck)} days). An internet connection is required to verify your subscription.`
      }
    }

    // Check past_due grace period (7 days max from first past_due)
    if (record.status === 'past_due') {
      const pastDueSince = record.firstPastDueAt ? new Date(record.firstPastDueAt).getTime() : now
      const daysPastDue = (now - pastDueSince) / (1000 * 60 * 60 * 24)
      if (daysPastDue > PAST_DUE_GRACE_DAYS) {
        return {
          isLicensed: false,
          status: 'past_due_expired',
          maskedKey: maskLicenseKey(record.licenseKey),
          customer: record.customer || null,
          lastCheckedAt: record.lastCheckedAt,
          reason: 'Your subscription billing is past due and the 7-day grace period has ended. Please update your billing details.'
        }
      }
      return {
        isLicensed: true,
        status: 'past_due',
        inGracePeriod: true,
        daysRemainingInGrace: Math.max(0, Math.ceil(PAST_DUE_GRACE_DAYS - daysPastDue)),
        maskedKey: maskLicenseKey(record.licenseKey),
        customer: record.customer || null,
        lastCheckedAt: record.lastCheckedAt,
        reason: 'Payment issue: please update your billing.'
      }
    }

    if (record.status === 'active') {
      return {
        isLicensed: true,
        status: 'active',
        maskedKey: maskLicenseKey(record.licenseKey),
        customer: record.customer || null,
        lastCheckedAt: record.lastCheckedAt,
        devicesUsed: record.devicesUsed || 1,
        maxDevices: record.maxDevices || 3
      }
    }

    // Inactive, cancelled, or not found
    return {
      isLicensed: false,
      status: record.status || 'inactive',
      maskedKey: maskLicenseKey(record.licenseKey),
      customer: record.customer || null,
      lastCheckedAt: record.lastCheckedAt,
      reason: record.statusMessage || `Subscription is ${record.status || 'inactive'}.`
    }
  }

  /**
   * POST /license/activate
   */
  async activate(rawKey) {
    const normalizedKey = normalizeLicenseKey(rawKey)
    if (!validateLicenseKeyFormat(normalizedKey)) {
      return {
        success: false,
        code: 'INVALID_FORMAT',
        message: 'Please enter a valid license key format: DVT-XXXX-XXXX-XXXX-XXXX'
      }
    }

    const payload = {
      license_key: normalizedKey,
      device_id: this.deviceId,
      device_name: this.deviceName,
      platform: this.platform
    }

    try {
      const res = await this.fetchFn(`${this.apiBaseUrl}/license/activate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      const data = await res.json().catch(() => ({}))

      if (res.status === 200) {
        // Success (new or already activated device)
        const record = {
          licenseKey: normalizedKey,
          status: 'active',
          customer: data.customer || null,
          devicesUsed: data.devices_used || 1,
          maxDevices: data.max_devices || 3,
          lastCheckedAt: new Date().toISOString(),
          firstPastDueAt: null
        }
        this.saveRecord(record)
        return {
          success: true,
          message: data.message || 'License activated successfully.',
          status: 'active',
          customer: data.customer,
          maskedKey: maskLicenseKey(normalizedKey)
        }
      }

      if (res.status === 403) {
        // Device limit or subscription not active
        const msg = data.message || ''
        const isLimit = msg.toLowerCase().includes('device activation limit') || msg.toLowerCase().includes('devices max')
        return {
          success: false,
          code: isLimit ? 'DEVICE_LIMIT_REACHED' : 'SUBSCRIPTION_INACTIVE',
          message: isLimit
            ? 'Device activation limit reached (3 devices max). You can deactivate Devote on another device to activate this one.'
            : (data.message || 'This subscription is currently inactive.')
        }
      }

      if (res.status === 404) {
        return {
          success: false,
          code: 'KEY_NOT_FOUND',
          message: 'License key not found. Please double-check your key or order confirmation email.'
        }
      }

      return {
        success: false,
        code: 'API_ERROR',
        message: data.message || `Activation failed with status code ${res.status}.`
      }
    } catch (err) {
      return {
        success: false,
        code: 'NETWORK_ERROR',
        message: 'Could not connect to the licensing server. Please check your internet connection and try again.'
      }
    }
  }

  /**
   * POST /license/check
   */
  async check() {
    const record = this.getRecord()
    if (!record || !record.licenseKey) {
      return { success: false, status: 'unlicensed', reason: 'No license key configured' }
    }

    const payload = {
      license_key: record.licenseKey,
      device_id: this.deviceId
    }

    try {
      const res = await this.fetchFn(`${this.apiBaseUrl}/license/check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      if (res.status === 200) {
        const data = await res.json()
        const remoteStatus = data.status || (data.success ? 'active' : 'inactive')

        if (remoteStatus === 'active') {
          record.status = 'active'
          record.lastCheckedAt = new Date().toISOString()
          record.firstPastDueAt = null
          if (data.customer) record.customer = data.customer
          this.saveRecord(record)
          return { success: true, status: 'active', customer: data.customer }
        }

        if (remoteStatus === 'past_due') {
          record.status = 'past_due'
          record.lastCheckedAt = new Date().toISOString()
          if (!record.firstPastDueAt) {
            record.firstPastDueAt = new Date().toISOString()
          }
          if (data.customer) record.customer = data.customer
          this.saveRecord(record)
          return {
            success: true,
            status: 'past_due',
            inGracePeriod: true,
            customer: data.customer,
            message: 'Payment issue: please update your billing.'
          }
        }

        // inactive or cancelled
        record.status = remoteStatus
        record.statusMessage = data.message || `Subscription is ${remoteStatus}.`
        this.saveRecord(record)
        return { success: false, status: remoteStatus, message: record.statusMessage }
      }

      if (res.status === 404) {
        // Key was removed or revoked
        record.status = 'not_found'
        record.statusMessage = 'License key not found.'
        this.saveRecord(record)
        return { success: false, status: 'not_found', message: 'License key not found.' }
      }

      // 5xx or unexpected response -> do NOT lock user out immediately, rely on offline tolerance
      return {
        success: this.getStatus().isLicensed,
        offline: true,
        status: record.status,
        message: 'Server error during heartbeat check. Using cached state.'
      }
    } catch (err) {
      // Network outage / timeout -> do NOT lock user out, fallback to offline evaluation
      return {
        success: this.getStatus().isLicensed,
        offline: true,
        status: record.status,
        message: 'Network error during heartbeat check. Using cached state.'
      }
    }
  }

  /**
   * POST /license/deactivate
   */
  async deactivate() {
    const record = this.getRecord()
    if (!record || !record.licenseKey) {
      this.clearRecord()
      return { success: true, message: 'Device deactivated locally.' }
    }

    const payload = {
      license_key: record.licenseKey,
      device_id: this.deviceId
    }

    try {
      await this.fetchFn(`${this.apiBaseUrl}/license/deactivate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
    } catch (err) {
      // Even if network fails, we clear local record so this client releases state
    }

    this.clearRecord()
    return { success: true, message: 'Device deactivated.' }
  }

  /**
   * POST /license/customer-portal
   * Returns a self-service Stripe Customer Portal session URL for subscription management & cancellation
   */
  async createCustomerPortalSession() {
    const record = this.getRecord()
    if (!record || !record.licenseKey) {
      return { success: false, message: 'No active license found on this device.' }
    }

    try {
      const res = await this.fetchFn(`${this.apiBaseUrl}/license/customer-portal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ license_key: record.licenseKey })
      })

      const data = await res.json()
      if (res.ok && data.success && data.portal_url) {
        return { success: true, portalUrl: data.portal_url }
      }
      return { success: false, message: data.message || 'Could not open billing portal.' }
    } catch (err) {
      return { success: false, message: err.message || 'Network error reaching billing portal.' }
    }
  }
}
