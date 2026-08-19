import assert from 'node:assert/strict'
import test from 'node:test'

import {
  aggregateUsageLogs,
  mergeUsageMetrics,
  metricsFromUsageStats,
  shanghaiDate,
  statsRangeParams,
} from '../server/usage-metrics.mjs'

test('aggregates total tokens and weighted cache hit rate inside the selected window', () => {
  const now = new Date('2026-08-18T10:00:00Z').getTime()
  const cutoff = now - 60 * 60 * 1000
  const first = aggregateUsageLogs(
    [
      {
        created_at: '2026-08-18T09:30:00Z',
        input_tokens: 100,
        output_tokens: 50,
        cache_creation_tokens: 20,
        cache_read_tokens: 80,
      },
      {
        created_at: '2026-08-18T08:59:59Z',
        input_tokens: 999,
        output_tokens: 999,
        cache_read_tokens: 999,
      },
    ],
    cutoff,
    now,
  )
  const second = aggregateUsageLogs(
    [
      {
        created_at: '2026-08-18T09:45:00Z',
        input_tokens: 50,
        output_tokens: 10,
        cache_read_tokens: 50,
      },
    ],
    cutoff,
    now,
  )

  assert.deepEqual(mergeUsageMetrics(first, second), {
    requests: 2,
    inputTokens: 150,
    outputTokens: 60,
    cacheCreationTokens: 20,
    cacheReadTokens: 130,
    promptTokens: 300,
    totalTokens: 360,
    cacheHitRate: 43.3,
  })
})

test('formats API date filters in Asia Shanghai', () => {
  assert.equal(shanghaiDate(new Date('2026-08-18T16:30:00Z')), '2026-08-19')
})

test('maps management page date ranges to usage stats parameters', () => {
  const now = new Date('2026-08-18T10:00:00+08:00').getTime()
  assert.deepEqual(statsRangeParams('today', now), { period: 'today' })
  assert.deepEqual(statsRangeParams('yesterday', now), {
    start_date: '2026-08-17',
    end_date: '2026-08-17',
  })
  assert.deepEqual(statsRangeParams('24h', now), {
    start_date: '2026-08-17',
    end_date: '2026-08-18',
  })
  assert.deepEqual(statsRangeParams('7d', now), {
    start_date: '2026-08-12',
    end_date: '2026-08-18',
  })
  assert.deepEqual(statsRangeParams('30d', now), {
    start_date: '2026-07-20',
    end_date: '2026-08-18',
  })
})

test('derives token totals and cache hit rate from usage stats', () => {
  assert.deepEqual(
    metricsFromUsageStats({
      total_requests: 2,
      total_input_tokens: 150,
      total_output_tokens: 60,
      total_cache_creation_tokens: 20,
      total_cache_read_tokens: 130,
      total_actual_cost: 1.5,
    }),
    {
      requests: 2,
      inputTokens: 150,
      outputTokens: 60,
      cacheCreationTokens: 20,
      cacheReadTokens: 130,
      promptTokens: 300,
      totalTokens: 360,
      totalSpend: 1.5,
      spendPerRequest: 0.75,
      tokensPerRequest: 180,
      cacheHitRate: 43.3,
    },
  )
})

test('uses actual cost as a fallback and leaves per-request values empty without requests', () => {
  const metrics = metricsFromUsageStats({ total_actual_cost: 2.5, total_input_tokens: 100 })
  assert.equal(metrics.totalSpend, 2.5)
  assert.equal(metrics.spendPerRequest, null)
  assert.equal(metrics.tokensPerRequest, null)
})
