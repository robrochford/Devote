/**
 * Streak Calculation Helpers
 * 
 * Calculates streaks purely based on calendar day differences between
 * the current date and the last completed date.
 * Decouples streak resets from application restarts, window focus, and background updates.
 */

export function getLocalDayStr(d = new Date()) {
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Parses YYYY-MM-DD into a UTC midnight Date object to avoid DST jitter
 * when calculating difference in calendar days.
 */
export function parseDateString(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return null
  const parts = dateStr.split('-')
  if (parts.length !== 3) return null
  const year = parseInt(parts[0], 10)
  const month = parseInt(parts[1], 10) - 1
  const day = parseInt(parts[2], 10)
  if (isNaN(year) || isNaN(month) || isNaN(day)) return null
  return new Date(Date.UTC(year, month, day))
}

/**
 * Computes calendar day difference: (currentDay - lastCompletedDay)
 * Returns null if lastCompletedDate is not set.
 */
export function getCalendarDaysDiff(todayStr, lastCompletedDateStr) {
  const todayDate = parseDateString(todayStr)
  const lastDate = parseDateString(lastCompletedDateStr)
  if (!todayDate || !lastDate) return null
  const msPerDay = 1000 * 60 * 60 * 24
  return Math.round((todayDate.getTime() - lastDate.getTime()) / msPerDay)
}

/**
 * Pure evaluation function for streak status.
 * Given store settings and today's date string:
 * - If lastCompletedDate is missing, streak is 0.
 * - If last completed today (diff === 0) or yesterday (diff === 1), streak is preserved.
 * - If diff > 1 (e.g. 2 days ago or more), streak is reset to 0.
 * - Negative diff (clock moved backwards) preserves streak safely.
 *
 * Returns { currentStreak, shouldUpdate }
 */
export function computeStreakStatus(settings, todayStr = getLocalDayStr()) {
  const currentStreak = settings?.currentStreak || 0
  const lastCompleted = settings?.lastCompletedDate

  if (!lastCompleted) {
    if (currentStreak !== 0) {
      return { currentStreak: 0, shouldUpdate: true }
    }
    return { currentStreak: 0, shouldUpdate: false }
  }

  const diff = getCalendarDaysDiff(todayStr, lastCompleted)
  if (diff === null) {
    return { currentStreak: 0, shouldUpdate: currentStreak !== 0 }
  }

  // Completed today (diff = 0) or yesterday (diff = 1): streak is intact!
  if (diff <= 1) {
    return { currentStreak, shouldUpdate: false }
  }

  // More than 1 day has passed without completing a devotion (diff >= 2): streak broken
  if (currentStreak !== 0) {
    return { currentStreak: 0, shouldUpdate: true }
  }

  return { currentStreak: 0, shouldUpdate: false }
}
