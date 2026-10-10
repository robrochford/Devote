import test from 'node:test'
import assert from 'node:assert/strict'
import {
  getLocalDayStr,
  parseDateString,
  getCalendarDaysDiff,
  computeStreakStatus
} from '../src/main/streak.js'

test('Streak helper - Date parsing and calendar day diff', () => {
  const d1 = '2026-10-10'
  const d2 = '2026-10-09'
  const d3 = '2026-10-08'

  assert.equal(getCalendarDaysDiff(d1, d1), 0)
  assert.equal(getCalendarDaysDiff(d1, d2), 1)
  assert.equal(getCalendarDaysDiff(d1, d3), 2)
  assert.equal(getCalendarDaysDiff(d1, null), null)
  assert.equal(getCalendarDaysDiff(d1, undefined), null)
})

test('Streak evaluation - Preserves streak when updating or restarting on the same day', () => {
  const settings = {
    currentStreak: 15,
    lastCompletedDate: '2026-10-10',
    lastOpenedDate: '2026-10-10'
  }

  // App restarts after auto-update on same day
  const result = computeStreakStatus(settings, '2026-10-10')
  assert.equal(result.currentStreak, 15)
  assert.equal(result.shouldUpdate, false)
})

test('Streak evaluation - Preserves streak on next day before user has completed today', () => {
  // User completed yesterday (2026-10-09), opens app on 2026-10-10
  const settings = {
    currentStreak: 7,
    lastCompletedDate: '2026-10-09',
    lastOpenedDate: '2026-10-09'
  }

  // Next day morning launch / update install
  const result = computeStreakStatus(settings, '2026-10-10')
  assert.equal(result.currentStreak, 7)
  assert.equal(result.shouldUpdate, false)
})

test('Streak evaluation - Does NOT reset streak if app is reopened or updated multiple times before completing', () => {
  // In the old bug, opening the app without completing reset streak on the next launch
  const settings = {
    currentStreak: 12,
    lastCompletedDate: '2026-10-09',
    lastOpenedDate: '2026-10-10' // opened today, but hasn't completed today yet
  }

  // An update installs and restarts the app again today
  const result = computeStreakStatus(settings, '2026-10-10')
  assert.equal(result.currentStreak, 12)
  assert.equal(result.shouldUpdate, false)
})

test('Streak evaluation - Resets streak to 0 if a full day was skipped', () => {
  // Last completed on Oct 8th, today is Oct 10th (skipped Oct 9th completely)
  const settings = {
    currentStreak: 20,
    lastCompletedDate: '2026-10-08',
    lastOpenedDate: '2026-10-08'
  }

  const result = computeStreakStatus(settings, '2026-10-10')
  assert.equal(result.currentStreak, 0)
  assert.equal(result.shouldUpdate, true)
})

test('Streak evaluation - Handles missing lastCompletedDate safely', () => {
  const settings = {
    currentStreak: 5,
    lastCompletedDate: null
  }

  const result = computeStreakStatus(settings, '2026-10-10')
  assert.equal(result.currentStreak, 0)
  assert.equal(result.shouldUpdate, true)
})
