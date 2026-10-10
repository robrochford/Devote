import test from 'node:test'
import assert from 'node:assert/strict'
import {
  LicenseService,
  normalizeLicenseKey,
  validateLicenseKeyFormat,
  maskLicenseKey,
  getPlatformName,
  getStableDeviceId
} from '../src/main/licenseService.js'

// Mock in-memory Store
class MockStore {
  constructor(initial = {}) {
    this.data = { ...initial }
  }
  get(key) {
    return this.data[key]
  }
  set(key, val) {
    if (typeof key === 'object') {
      Object.assign(this.data, key)
    } else {
      this.data[key] = val
    }
  }
  delete(key) {
    delete this.data[key]
  }
}

test('Key normalization and formatting', () => {
  // Correctly formats cleaned string
  assert.equal(normalizeLicenseKey('dvt-abcd-efgh-jklm-npqr'), 'DVT-ABCD-EFGH-JKLM-NPQR')
  // Accepts spaces or missing dashes
  assert.equal(normalizeLicenseKey('DVT ABCDEFGH JKLMNPQR'), 'DVT-ABCD-EFGH-JKLM-NPQR')
  assert.equal(normalizeLicenseKey('dvtabcdefghjklmnpqr'), 'DVT-ABCD-EFGH-JKLM-NPQR')
  // Accepts 16-char code without DVT
  assert.equal(normalizeLicenseKey('ABCDEFGHJKLMNPQR'), 'DVT-ABCD-EFGH-JKLM-NPQR')
})

test('Key format validation', () => {
  assert.equal(validateLicenseKeyFormat('DVT-ABCD-EFGH-JKLM-NPQR'), true)
  assert.equal(validateLicenseKeyFormat('dvt-abcd-efgh-jklm-npqr'), true)
  // Rejects invalid chars like I, O, 0, 1
  assert.equal(validateLicenseKeyFormat('DVT-1BCD-EFGH-JKLM-NPQR'), false)
  assert.equal(validateLicenseKeyFormat('DVT-0BCD-EFGH-JKLM-NPQR'), false)
  assert.equal(validateLicenseKeyFormat('DVT-OBCD-EFGH-JKLM-NPQR'), false)
  assert.equal(validateLicenseKeyFormat('DVT-IBCD-EFGH-JKLM-NPQR'), false)
  // Rejects wrong length
  assert.equal(validateLicenseKeyFormat('DVT-ABCD-EFGH'), false)
})

test('Masking key for UI and logs', () => {
  assert.equal(maskLicenseKey('DVT-ABCD-EFGH-JKLM-NPQR'), 'DVT-••••-••••-••••-NPQR')
  assert.equal(maskLicenseKey(''), '••••-••••-••••-••••')
})

test('Activation flow - Successful activation for new device', async () => {
  const store = new MockStore()
  const mockFetch = async (url, options) => {
    return {
      status: 200,
      json: async () => ({
        success: true,
        message: 'License activated successfully.',
        status: 'active',
        customer: { email: 'user@example.com', name: 'John Doe' },
        devices_used: 1,
        max_devices: 3
      })
    }
  }

  const service = new LicenseService(store, {
    deviceId: 'test-device-1',
    fetchFn: mockFetch
  })

  const result = await service.activate('DVT-ABCD-EFGH-JKLM-NPQR')
  assert.equal(result.success, true)
  assert.equal(result.status, 'active')
  assert.equal(result.customer.email, 'user@example.com')

  const status = service.getStatus()
  assert.equal(status.isLicensed, true)
  assert.equal(status.status, 'active')
  assert.equal(status.maskedKey, 'DVT-••••-••••-••••-NPQR')
})

test('Activation flow - Already activated device returns success', async () => {
  const store = new MockStore()
  const mockFetch = async () => ({
    status: 200,
    json: async () => ({
      success: true,
      message: 'Device already activated.',
      status: 'active',
      customer: { email: 'user@example.com' },
      max_devices: 3
    })
  })

  const service = new LicenseService(store, {
    deviceId: 'test-device-1',
    fetchFn: mockFetch
  })

  const result = await service.activate('DVT-ABCD-EFGH-JKLM-NPQR')
  assert.equal(result.success, true)
  assert.equal(result.status, 'active')
})

test('Activation flow - Device limit reached (403)', async () => {
  const store = new MockStore()
  const mockFetch = async () => ({
    status: 403,
    json: async () => ({
      success: false,
      message: 'Device activation limit reached (3 devices max).'
    })
  })

  const service = new LicenseService(store, {
    deviceId: 'test-device-4',
    fetchFn: mockFetch
  })

  const result = await service.activate('DVT-ABCD-EFGH-JKLM-NPQR')
  assert.equal(result.success, false)
  assert.equal(result.code, 'DEVICE_LIMIT_REACHED')
  assert.match(result.message, /3 devices max/)
})

test('Activation flow - Inactive subscription (403)', async () => {
  const store = new MockStore()
  const mockFetch = async () => ({
    status: 403,
    json: async () => ({
      success: false,
      status: 'inactive',
      message: 'This subscription is currently inactive.'
    })
  })

  const service = new LicenseService(store, {
    deviceId: 'test-device-1',
    fetchFn: mockFetch
  })

  const result = await service.activate('DVT-ABCD-EFGH-JKLM-NPQR')
  assert.equal(result.success, false)
  assert.equal(result.code, 'SUBSCRIPTION_INACTIVE')
})

test('Activation flow - Key not found (404)', async () => {
  const store = new MockStore()
  const mockFetch = async () => ({
    status: 404,
    json: async () => ({
      success: false,
      message: 'License key not found.'
    })
  })

  const service = new LicenseService(store, {
    deviceId: 'test-device-1',
    fetchFn: mockFetch
  })

  const result = await service.activate('DVT-ABCD-EFGH-JKLM-NPQR')
  assert.equal(result.success, false)
  assert.equal(result.code, 'KEY_NOT_FOUND')
})

test('Heartbeat check - Active status updates cache', async () => {
  const store = new MockStore()
  const service = new LicenseService(store, {
    deviceId: 'test-device-1',
    fetchFn: async () => ({
      status: 200,
      json: async () => ({ success: true, status: 'active', customer: { email: 'john@example.com' } })
    })
  })

  // Seed active license
  await service.activate('DVT-ABCD-EFGH-JKLM-NPQR')

  const checkRes = await service.check()
  assert.equal(checkRes.success, true)
  assert.equal(checkRes.status, 'active')

  const status = service.getStatus()
  assert.equal(status.isLicensed, true)
  assert.equal(status.status, 'active')
})

test('Heartbeat check - Past due triggers 7-day grace period', async () => {
  const store = new MockStore()
  const service = new LicenseService(store, {
    deviceId: 'test-device-1',
    fetchFn: async () => ({
      status: 200,
      json: async () => ({ success: false, status: 'past_due' })
    })
  })

  await service.activate('DVT-ABCD-EFGH-JKLM-NPQR')

  // Run check: sets past_due
  const checkRes = await service.check()
  assert.equal(checkRes.status, 'past_due')
  assert.equal(checkRes.inGracePeriod, true)

  const status = service.getStatus()
  // Still licensed inside grace period!
  assert.equal(status.isLicensed, true)
  assert.equal(status.inGracePeriod, true)
  assert.equal(status.daysRemainingInGrace, 7)
})

test('Heartbeat check - Past due past 7 days locks app', async () => {
  const store = new MockStore()
  const service = new LicenseService(store, {
    deviceId: 'test-device-1',
    fetchFn: async () => ({
      status: 200,
      json: async () => ({ success: false, status: 'past_due' })
    })
  })

  await service.activate('DVT-ABCD-EFGH-JKLM-NPQR')

  // Manually backdate past_due by 8 days
  const record = service.getRecord()
  record.status = 'past_due'
  record.firstPastDueAt = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString()
  service.saveRecord(record)

  const status = service.getStatus()
  assert.equal(status.isLicensed, false)
  assert.equal(status.status, 'past_due_expired')
})

test('Offline tolerance - Allows use up to 14 days without network', async () => {
  const store = new MockStore()
  const service = new LicenseService(store, {
    deviceId: 'test-device-1',
    fetchFn: async () => {
      throw new Error('Network offline')
    }
  })

  // Manually set verified 5 days ago
  const record = {
    licenseKey: 'DVT-ABCD-EFGH-JKLM-NPQR',
    status: 'active',
    lastCheckedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString()
  }
  service.saveRecord(record)

  // Network fails during check
  const checkRes = await service.check()
  assert.equal(checkRes.offline, true)

  // Still licensed because < 14 days
  const status = service.getStatus()
  assert.equal(status.isLicensed, true)
  assert.equal(status.status, 'active')
})

test('Offline tolerance - Locks app after 14 days offline', async () => {
  const store = new MockStore()
  const service = new LicenseService(store, {
    deviceId: 'test-device-1'
  })

  // Manually set verified 15 days ago
  const record = {
    licenseKey: 'DVT-ABCD-EFGH-JKLM-NPQR',
    status: 'active',
    lastCheckedAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString()
  }
  service.saveRecord(record)

  const status = service.getStatus()
  assert.equal(status.isLicensed, false)
  assert.equal(status.status, 'offline_expired')
  assert.match(status.reason, /Offline limit exceeded/)
})

test('Deactivation flow - Calls API and cleans local state', async () => {
  let deactivated = false
  const store = new MockStore()
  const service = new LicenseService(store, {
    deviceId: 'test-device-1',
    fetchFn: async (url) => {
      if (url.includes('/deactivate')) {
        deactivated = true
        return { status: 200, json: async () => ({ success: true }) }
      }
      return { status: 200, json: async () => ({ success: true, status: 'active' }) }
    }
  })

  await service.activate('DVT-ABCD-EFGH-JKLM-NPQR')
  assert.equal(service.getStatus().isLicensed, true)

  const deactRes = await service.deactivate()
  assert.equal(deactRes.success, true)
  assert.equal(deactivated, true)
  assert.equal(service.getStatus().isLicensed, false)
})

test('Platform detection and device ID generation', () => {
  const p = getPlatformName()
  assert.ok(['windows', 'macos', 'linux', 'android'].includes(p) || typeof p === 'string')

  const store = new MockStore()
  const id1 = getStableDeviceId(store)
  assert.equal(typeof id1, 'string')
  assert.equal(id1.length, 32)
  // Verify it persists in store and returns consistently
  const id2 = getStableDeviceId(store)
  assert.equal(id1, id2)
})
