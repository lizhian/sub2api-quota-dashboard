import assert from 'node:assert/strict'
import test from 'node:test'

import {
  calculateSafeLevel,
  calculatePositionAmounts,
  calculateWeeklySafeLevel,
  mapAccount,
  summarize,
} from '../server/account-mapper.mjs'

test('maps only dashboard-safe account fields', () => {
  const mapped = mapAccount(
    {
      id: 7,
      name: 'Codex A',
      platform: 'openai',
      status: 'active',
      schedulable: true,
      current_concurrency: 3,
      concurrency: 50,
      credentials: { access_token: 'secret', email: 'hidden@example.com', plan_type: 'pro' },
      extra: {
        codex_5h_used_percent: 22.56,
        codex_5h_reset_at: '2026-08-18T22:00:00+08:00',
        codex_7d_used_percent: 104,
        codex_usage_updated_at: '2026-08-18T21:00:00+08:00',
      },
    },
    {
      updated_at: '2026-08-18T21:05:00+08:00',
      five_hour: {
        utilization: 25,
        resets_at: '2026-08-19T01:00:00+08:00',
        window_stats: { standard_cost: 125 },
      },
      seven_day: {
        utilization: 50,
        resets_at: '2026-08-20T21:00:00+08:00',
        window_stats: { standard_cost: 1385.84 },
      },
    },
    new Date('2026-08-18T21:00:00+08:00').getTime(),
  )

  assert.deepEqual(mapped, {
    id: 7,
    name: 'Codex A',
    platform: 'openai',
    planType: 'pro',
    status: 'active',
    schedulable: true,
    capacityUsed: 3,
    capacityTotal: 50,
    usage5h: {
      usedPercent: 25,
      resetAt: '2026-08-19T01:00:00+08:00',
      usedAmount: 125,
      estimatedTotalAmount: 500,
      safeLevelPercent: 20,
      safeAmount: 0,
      aheadAmount: 25,
    },
    usage7d: {
      usedPercent: 50,
      resetAt: '2026-08-20T21:00:00+08:00',
      usedAmount: 1385.84,
      estimatedTotalAmount: 2771.68,
      safeLevelPercent: 64,
      safeAmount: 388.04,
      aheadAmount: 0,
    },
    updatedAt: '2026-08-18T21:05:00+08:00',
  })
  assert.equal(JSON.stringify(mapped).includes('secret'), false)
  assert.equal(JSON.stringify(mapped).includes('hidden@example.com'), false)
})

test('rejects invalid account capacity values', () => {
  const mapped = mapAccount({
    id: 8,
    current_concurrency: -1,
    concurrency: 'invalid',
  })
  assert.equal(mapped.capacityUsed, null)
  assert.equal(mapped.capacityTotal, null)
})

test('calculates a 20 percent safety line after one hour of a five hour window', () => {
  const now = new Date('2026-08-18T10:00:00Z').getTime()
  assert.equal(calculateSafeLevel('2026-08-18T14:00:00Z', 5, now), 20)
  assert.equal(calculateSafeLevel('2026-08-18T10:00:00Z', 5, now), 100)
  assert.equal(calculateSafeLevel(null, 5, now), null)
})

test('calculates weekly safety only during weighted Shanghai working hours', () => {
  const resetAt = '2026-08-24T00:00:00+08:00'

  assert.equal(calculateWeeklySafeLevel(resetAt, new Date('2026-08-17T09:00:00+08:00').getTime()), 0)
  assert.equal(calculateWeeklySafeLevel(resetAt, new Date('2026-08-17T13:30:00+08:00').getTime()), 9)
  assert.equal(calculateWeeklySafeLevel(resetAt, new Date('2026-08-17T18:00:00+08:00').getTime()), 18)
  assert.equal(calculateWeeklySafeLevel(resetAt, new Date('2026-08-22T13:30:00+08:00').getTime()), 92.5)
})

test('prorates a shortened first calendar day against the standard nine-hour schedule', () => {
  const resetAt = '2026-08-20T11:33:00+08:00'
  assert.equal(
    calculateWeeklySafeLevel(resetAt, new Date('2026-08-18T22:00:00+08:00').getTime()),
    76.9,
  )
})

test('raises weekly safety to 100 percent for the final twelve hours', () => {
  const resetAt = '2026-08-24T00:00:00+08:00'
  assert.equal(calculateWeeklySafeLevel(resetAt, new Date('2026-08-23T11:59:00+08:00').getTime()), 96.7)
  assert.equal(calculateWeeklySafeLevel(resetAt, new Date('2026-08-23T12:00:00+08:00').getTime()), 100)
})

test('splits quota position into safe and ahead amounts', () => {
  assert.deepEqual(calculatePositionAmounts(60, 40, 2000), {
    safeAmount: 400,
    aheadAmount: 0,
  })
  assert.deepEqual(calculatePositionAmounts(40, 60, 2000), {
    safeAmount: 0,
    aheadAmount: 400,
  })
  assert.deepEqual(calculatePositionAmounts(40, 60, null), {
    safeAmount: null,
    aheadAmount: null,
  })
})

test('summarizes available quota data', () => {
  const accounts = [
    mapAccount({ id: 1, status: 'active', schedulable: true, extra: { codex_5h_used_percent: 50, codex_7d_used_percent: 90 } }),
    mapAccount({ id: 2, status: 'inactive', schedulable: false, extra: { codex_5h_used_percent: 20, codex_7d_used_percent: 50 } }),
  ]
  assert.deepEqual(summarize(accounts), {
    total: 2,
    active: 1,
    average5h: 35,
    average7d: 70,
    atRisk: 1,
  })
})
