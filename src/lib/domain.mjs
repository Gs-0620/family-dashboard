const DAY = 86400000

/** Parse a real YYYY-MM-DD calendar date as UTC milliseconds; invalid input -> null. */
export function parseDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const time = Date.parse(`${value}T00:00:00.000Z`)
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value ? time : null
}

/** Current calendar date in Asia/Shanghai, independent of browser timezone. */
export function todayCN(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now)
  const part = (type) => parts.find((item) => item.type === type).value
  return `${part('year')}-${part('month')}-${part('day')}`
}

/** Exactly one lmp/edd required. Returns lmp, edd, days, weeks, dayOfWeek, trimester, remainingDays, progress, status; invalid -> null. */
export function pregnancyInfo({ lmp = '', edd = '' } = {}, today = todayCN()) {
  if (Boolean(lmp) === Boolean(edd)) return null
  const input = parseDate(lmp || edd)
  const current = parseDate(today)
  if (input === null || current === null) return null
  const start = lmp ? input : input - 280 * DAY
  const due = start + 280 * DAY
  const days = Math.floor((current - start) / DAY)
  const weeks = Math.floor(Math.max(0, days) / 7)
  return {
    lmp: new Date(start).toISOString().slice(0, 10),
    edd: new Date(due).toISOString().slice(0, 10),
    days, weeks, dayOfWeek: Math.max(0, days) % 7,
    trimester: weeks < 14 ? 1 : weeks < 28 ? 2 : 3,
    remainingDays: Math.max(0, Math.ceil((due - current) / DAY)),
    progress: Math.min(1, Math.max(0, days / 280)),
    status: days < 0 ? 'before' : days > 280 ? 'overdue' : 'active',
  }
}

/** Decimal yuan input (including DB numeric strings) -> safe integer cents; invalid -> null. */
export function amountToCents(amount) {
  if (typeof amount !== 'number' && typeof amount !== 'string') return null
  const value = String(amount).trim()
  if (!/^\d+(?:\.\d{1,2})?$/.test(value)) return null
  const [whole, fraction = ''] = value.split('.')
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
  return Number.isSafeInteger(cents) ? cents : null
}

/** Rows {amount,date,category}; optional YYYY-MM month. Returns totalCents, byCategory, byMonth, count. */
export function expenseStats(rows, month = '') {
  if (month && !/^\d{4}-(?:0[1-9]|1[0-2])$/.test(month)) throw new TypeError('Invalid month')
  const byCategory = Object.create(null)
  const byMonth = Object.create(null)
  let totalCents = 0
  let count = 0
  for (const row of rows) {
    const cents = amountToCents(row.amount)
    if (cents === null || parseDate(row.date) === null) continue
    const rowMonth = row.date.slice(0, 7)
    if (month && rowMonth !== month) continue
    const category = typeof row.category === 'string' && row.category ? row.category : '其他'
    if (!Number.isSafeInteger(totalCents + cents)) throw new RangeError('Expense total exceeds safe integer')
    totalCents += cents
    byCategory[category] = (byCategory[category] || 0) + cents
    byMonth[rowMonth] = (byMonth[rowMonth] || 0) + cents
    count++
  }
  return { totalCents, byCategory, byMonth, count }
}

/** Exclude meals when avoid contains an exact tags/conflict_tags entry. */
export function filterMeals(meals, avoid = []) {
  const excluded = new Set(avoid)
  return meals.filter((meal) => [...(meal.tags || []), ...(meal.conflict_tags || [])]
    .every((tag) => !excluded.has(tag)))
}

/** Choose a filtered meal with a different id when possible; injectable random; empty -> null. */
export function chooseMeal(meals, previousId = '', avoid = [], random = Math.random) {
  const eligible = filterMeals(meals, avoid)
  const different = eligible.filter((meal) => meal.id !== previousId)
  const choices = different.length ? different : eligible
  if (!choices.length) return null
  const index = Math.min(choices.length - 1, Math.max(0, Math.floor(random() * choices.length)))
  return choices[index]
}

/** Stable scoped cache key. project is the Supabase project ref or URL, userId the authenticated owner. */
export function cacheKey(project, userId) {
  if (!project || !userId) throw new TypeError('Cache requires project and userId')
  return `family-dashboard:v1:${encodeURIComponent(project)}:${encodeURIComponent(userId)}`
}

/** Save JSON data with project/owner envelope; returns true or false if storage is unavailable. */
export function saveCache(project, userId, data, storage) {
  const key = cacheKey(project, userId)
  try {
    if (storage === undefined) storage = globalThis.localStorage
    if (!storage) return false
    storage.setItem(key, JSON.stringify({ project, ownerId: userId, data }))
    return true
  } catch { return false }
}

/** Read owned project cache; invalid/mismatched/unavailable -> null. No authenticated owner -> null. */
export function readCache(project, userId, storage) {
  if (!project || !userId) return null
  try {
    if (storage === undefined) storage = globalThis.localStorage
    const entry = JSON.parse(storage?.getItem(cacheKey(project, userId)) || 'null')
    return entry?.project === project && entry?.ownerId === userId ? entry.data ?? null : null
  } catch { return null }
}

/** Call before logout with the old user id; removes only this project/user cache. */
export function clearCache(project, userId, storage) {
  if (!project || !userId) return false
  try {
    if (storage === undefined) storage = globalThis.localStorage
    if (!storage) return false
    storage.removeItem(cacheKey(project, userId))
    return true
  } catch { return false }
}
