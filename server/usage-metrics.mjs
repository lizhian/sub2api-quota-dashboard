export const METRIC_RANGES = new Set(['24h', 'today', 'yesterday', '7d', '30d'])

function tokenCount(value) {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? number : 0
}

export function aggregateUsageLogs(logs, cutoff, now = Date.now()) {
  const totals = {
    requests: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheCreationTokens: 0,
    cacheReadTokens: 0,
  }

  for (const log of logs) {
    const createdAt = new Date(log?.created_at).getTime()
    if (!Number.isFinite(createdAt) || createdAt < cutoff || createdAt > now) continue
    totals.requests += 1
    totals.inputTokens += tokenCount(log.input_tokens)
    totals.outputTokens += tokenCount(log.output_tokens)
    totals.cacheCreationTokens += tokenCount(log.cache_creation_tokens)
    totals.cacheReadTokens += tokenCount(log.cache_read_tokens)
  }

  const promptTokens =
    totals.inputTokens + totals.cacheCreationTokens + totals.cacheReadTokens
  const totalTokens = promptTokens + totals.outputTokens
  const cacheHitRate =
    promptTokens > 0
      ? Math.round((totals.cacheReadTokens / promptTokens) * 1000) / 10
      : null

  return { ...totals, promptTokens, totalTokens, cacheHitRate }
}

export function mergeUsageMetrics(target, source) {
  for (const key of [
    'requests',
    'inputTokens',
    'outputTokens',
    'cacheCreationTokens',
    'cacheReadTokens',
  ]) {
    target[key] += source[key]
  }
  target.promptTokens =
    target.inputTokens + target.cacheCreationTokens + target.cacheReadTokens
  target.totalTokens = target.promptTokens + target.outputTokens
  target.cacheHitRate =
    target.promptTokens > 0
      ? Math.round((target.cacheReadTokens / target.promptTokens) * 1000) / 10
      : null
  return target
}

export function emptyUsageMetrics() {
  return aggregateUsageLogs([], 0, 0)
}

export function shanghaiDate(value) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(value)
}

export function statsRangeParams(range, now = Date.now()) {
  const day = 24 * 60 * 60 * 1000
  const today = shanghaiDate(new Date(now))
  if (range === 'today') return { period: 'today' }
  if (range === 'yesterday') {
    const yesterday = shanghaiDate(new Date(now - day))
    return { start_date: yesterday, end_date: yesterday }
  }
  if (range === '24h') {
    return { start_date: shanghaiDate(new Date(now - day)), end_date: today }
  }
  const days = range === '30d' ? 29 : 6
  return { start_date: shanghaiDate(new Date(now - days * day)), end_date: today }
}

export function metricsFromUsageStats(stats) {
  const inputTokens = tokenCount(stats?.total_input_tokens)
  const outputTokens = tokenCount(stats?.total_output_tokens)
  const cacheCreationTokens = tokenCount(stats?.total_cache_creation_tokens)
  const cacheReadTokens = tokenCount(stats?.total_cache_read_tokens)
  const requests = tokenCount(stats?.total_requests)
  const totalSpend = tokenCount(stats?.total_cost ?? stats?.total_actual_cost)
  const promptTokens = inputTokens + cacheCreationTokens + cacheReadTokens
  const totalTokens = promptTokens + outputTokens
  return {
    requests,
    inputTokens,
    outputTokens,
    cacheCreationTokens,
    cacheReadTokens,
    promptTokens,
    totalTokens,
    totalSpend,
    spendPerMillionTokens: totalTokens > 0 ? (totalSpend * 1_000_000) / totalTokens : null,
    spendPerRequest: requests > 0 ? totalSpend / requests : null,
    tokensPerRequest: requests > 0 ? totalTokens / requests : null,
    cacheHitRate:
      promptTokens > 0 ? Math.round((cacheReadTokens / promptTokens) * 1000) / 10 : null,
  }
}
