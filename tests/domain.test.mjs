import test from 'node:test'
import assert from 'node:assert/strict'
import {
  parseDate, todayCN, pregnancyInfo, amountToCents, expenseStats,
  filterMeals, chooseMeal, cacheKey, saveCache, readCache, clearCache,
} from '../src/lib/domain.mjs'
import { inspectText, inspectPath } from '../scripts/check-dist.mjs'

const dayAfter = (date, days) => new Date(parseDate(date) + days * 86400000).toISOString().slice(0, 10)
const memoryStorage = () => {
  const values = new Map()
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  }
}

test('strict UTC calendar dates including leap years and years below 100', () => {
  for (const date of ['2024-02-29', '2000-02-29', '0099-01-01', '2026-12-31']) {
    assert.equal(new Date(parseDate(date)).toISOString().slice(0, 10), date)
  }
  for (const date of ['2023-02-29', '1900-02-29', '2024-04-31', '2024-13-01', '2024-00-01', '2024-01-00', '2024-1-01', ' 2024-01-01', '', null, 1]) {
    assert.equal(parseDate(date), null)
  }
})

test('Shanghai today changes at UTC 16:00 and handles year rollover', () => {
  assert.equal(todayCN(new Date('2026-12-31T15:59:59Z')), '2026-12-31')
  assert.equal(todayCN(new Date('2026-12-31T16:00:00Z')), '2027-01-01')
})

test('pregnancy dates require exactly one valid LMP or EDD', () => {
  assert.equal(pregnancyInfo({}, '2024-01-01'), null)
  assert.equal(pregnancyInfo({ lmp: '2024-01-01', edd: '2024-10-07' }, '2024-01-01'), null)
  assert.equal(pregnancyInfo({ lmp: '2024-02-30' }, '2024-01-01'), null)
  assert.equal(pregnancyInfo({ lmp: '2024-01-01' }, 'bad'), null)
  const fromLmp = pregnancyInfo({ lmp: '2024-01-01' }, '2024-01-08')
  assert.equal(fromLmp.edd, '2024-10-07')
  assert.deepEqual(pregnancyInfo({ edd: fromLmp.edd }, '2024-01-08'), fromLmp)
  assert.equal(fromLmp.days, 7)
  assert.equal(fromLmp.weeks, 1)
  assert.equal(fromLmp.dayOfWeek, 0)
  assert.equal(fromLmp.remainingDays, 273)
})

test('pregnancy trimester boundaries are 14 and 28 completed weeks', () => {
  for (const [days, trimester, weeks, remainder] of [[97, 1, 13, 6], [98, 2, 14, 0], [195, 2, 27, 6], [196, 3, 28, 0]]) {
    const result = pregnancyInfo({ lmp: '2024-01-01' }, dayAfter('2024-01-01', days))
    assert.equal(result.trimester, trimester)
    assert.equal(result.weeks, weeks)
    assert.equal(result.dayOfWeek, remainder)
  }
})

test('pregnancy pre-start, due date and overdue progress stay bounded', () => {
  const before = pregnancyInfo({ lmp: '2024-01-01' }, '2023-12-31')
  assert.equal(before.status, 'before')
  assert.equal(before.days, -1)
  assert.equal(before.progress, 0)
  assert.equal(before.weeks, 0)
  assert.equal(before.remainingDays, 281)
  const due = pregnancyInfo({ lmp: '2024-01-01' }, '2024-10-07')
  assert.equal(due.status, 'active')
  assert.equal(due.progress, 1)
  assert.equal(due.remainingDays, 0)
  const overdue = pregnancyInfo({ lmp: '2024-01-01' }, '2024-10-08')
  assert.equal(overdue.status, 'overdue')
  assert.equal(overdue.progress, 1)
  assert.equal(overdue.remainingDays, 0)
})

test('cents conversion never sums floating yuan and accepts numeric DB strings', () => {
  for (const [input, cents] of [[0, 0], [0.1, 10], [0.29, 29], ['12.34', 1234], ['0001.2', 120], [' 2.00 ', 200]]) {
    assert.equal(amountToCents(input), cents)
  }
  for (const input of ['', ' ', null, undefined, true, Infinity, NaN, -1, '-2', '1.234', '1e2', 'abc', '9007199254740992']) {
    assert.equal(amountToCents(input), null)
  }
})

test('expense aggregation filters real dates/months, groups cents and skips invalid rows', () => {
  const rows = [
    { date: '2024-01-01', amount: '0.10', category: '食材' },
    { date: '2024-01-31', amount: 0.2, category: '食材' },
    { date: '2024-01-20', amount: '12.34', category: '交通' },
    { date: '2024-02-29', amount: '1', category: '' },
    { date: '2024-02-30', amount: '50', category: '食材' },
    { date: '2024-01-01', amount: 'bad', category: '食材' },
  ]
  const january = expenseStats(rows, '2024-01')
  assert.equal(january.totalCents, 1264)
  assert.equal(january.count, 3)
  assert.equal(january.byCategory['食材'], 30)
  assert.equal(january.byMonth['2024-01'], 1264)
  const all = expenseStats(rows)
  assert.equal(all.totalCents, 1364)
  assert.equal(all.byCategory['其他'], 100)
  assert.equal(all.byMonth['2024-02'], 100)
  assert.equal(expenseStats([]).totalCents, 0)
  assert.throws(() => expenseStats(rows, '2024-13'), TypeError)
  assert.throws(() => expenseStats([{ date: '2024-01-01', amount: '90071992547409.90' }, { date: '2024-01-01', amount: 1 }]), RangeError)
})

test('category names do not pollute prototypes', () => {
  const result = expenseStats([{ date: '2024-01-01', amount: '1', category: '__proto__' }])
  assert.equal(result.byCategory.__proto__, 100)
  assert.equal(Object.getPrototypeOf(result.byCategory), null)
})

test('meals use exact tag and conflict-tag matches, not substring matches', () => {
  const meals = [
    { id: 'a', tags: ['花生'], conflict_tags: [] },
    { id: 'b', tags: ['花生油'], conflict_tags: ['牛奶'] },
    { id: 'c', tags: ['蔬菜'] },
    { id: 'd' },
  ]
  assert.deepEqual(filterMeals(meals, ['花生']).map((m) => m.id), ['b', 'c', 'd'])
  assert.deepEqual(filterMeals(meals, ['牛奶']).map((m) => m.id), ['a', 'c', 'd'])
  assert.deepEqual(filterMeals(meals, ['花生', '牛奶']).map((m) => m.id), ['c', 'd'])
  assert.equal(filterMeals(meals).length, 4)
  assert.equal(chooseMeal(meals, 'a', [], () => 0).id, 'b')
  assert.equal(chooseMeal(meals, 'a', [], () => 0.999).id, 'd')
  assert.equal(chooseMeal([{ id: 'a' }, { id: 'a' }, { id: 'b' }], 'a').id, 'b')
  assert.equal(chooseMeal([{ id: 'a' }], 'a').id, 'a')
  assert.equal(chooseMeal([], null), null)
  assert.equal(chooseMeal([meals[0]], null, ['花生']), null)
})

test('cache isolation across owners/projects and anonymous reads', () => {
  const storage = memoryStorage()
  const data = { expenses: [{ amount: '1.00' }] }
  assert.equal(saveCache('project-a', 'owner-a', data, storage), true)
  assert.deepEqual(readCache('project-a', 'owner-a', storage), data)
  assert.equal(readCache('project-a', 'owner-b', storage), null)
  assert.equal(readCache('project-b', 'owner-a', storage), null)
  assert.equal(readCache('project-a', '', storage), null)
  assert.notEqual(cacheKey('a:b', 'c'), cacheKey('a', 'b:c'))
  assert.throws(() => cacheKey('a', ''), TypeError)
})

test('cache rejects tampered owner/project and corrupted JSON', () => {
  const storage = memoryStorage()
  const key = cacheKey('project', 'owner')
  for (const value of [
    JSON.stringify({ project: 'project', ownerId: 'other', data: 1 }),
    JSON.stringify({ project: 'other', ownerId: 'owner', data: 1 }),
    '{bad json', 'null',
  ]) {
    storage.setItem(key, value)
    assert.equal(readCache('project', 'owner', storage), null)
  }
})

test('logout cleanup removes only active scope and unavailable storage is safe', () => {
  const storage = memoryStorage()
  saveCache('a', 'owner', { value: 1 }, storage)
  saveCache('b', 'owner', { value: 2 }, storage)
  saveCache('a', 'other', { value: 3 }, storage)
  assert.equal(clearCache('a', 'owner', storage), true)
  assert.equal(readCache('a', 'owner', storage), null)
  assert.deepEqual(readCache('b', 'owner', storage), { value: 2 })
  assert.deepEqual(readCache('a', 'other', storage), { value: 3 })
  const blocked = {
    getItem() { throw new Error('blocked') },
    setItem() { throw new Error('blocked') },
    removeItem() { throw new Error('blocked') },
  }
  assert.equal(saveCache('a', 'owner', {}, blocked), false)
  assert.equal(readCache('a', 'owner', blocked), null)
  assert.equal(clearCache('a', 'owner', blocked), false)
  assert.equal(saveCache('a', 'owner', {}, null), false)
  assert.equal(clearCache('a', 'owner', null), false)
})

test('security scan rejects actual privileged credentials but allows public client keys', () => {
  const jwt = (role) => ['eyJhbGciOiJIUzI1NiJ9', Buffer.from(JSON.stringify({ role })).toString('base64url'), 'syntheticSignature'].join('.')
  assert.deepEqual(inspectText(jwt('service_role')), ['Privileged JWT'])
  assert.deepEqual(inspectText(jwt('supabase_admin')), ['Privileged JWT'])
  assert.deepEqual(inspectText(jwt('anon')), [])
  assert.deepEqual(inspectText('sb_publishable_syntheticAllowedPublicKey'), [])
  assert.deepEqual(inspectText('service_role is a role in the SDK; secret key documentation'), [])
  assert.deepEqual(inspectText('sb_secret_syntheticForbiddenKey'), ['Supabase secret key'])
  assert.deepEqual(inspectText('ghp_' + 'x'.repeat(30)), ['GitHub token'])
  assert.deepEqual(inspectText('github_pat_' + 'x'.repeat(30)), ['GitHub token'])
  assert.deepEqual(inspectText('SUPABASE_SERVICE_ROLE_KEY="' + 'x'.repeat(30) + '"'), ['Service-role key assignment'])
  assert.deepEqual(inspectPath('assets/index-abc.js'), [])
  assert.deepEqual(inspectPath('data/settings.json'), ['Private/data directory'])
  assert.deepEqual(inspectPath('expenses.json'), ['Public business data'])
  assert.deepEqual(inspectPath('github-writer.js'), ['Legacy GitHub writer'])
  assert.deepEqual(inspectPath('.env'), ['Private/data directory'])
})
