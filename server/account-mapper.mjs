function percentage(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return null
  return Math.min(100, Math.max(0, Math.round(number * 10) / 10))
}

function text(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function amount(value) {
  const number = Number(value)
  if (!Number.isFinite(number) || number < 0) return null
  return Math.round(number * 100) / 100
}

function nonNegativeInteger(value) {
  const number = Number(value)
  return Number.isInteger(number) && number >= 0 ? number : null
}

export function calculateSafeLevel(resetAt, windowHours, now = Date.now()) {
  if (!resetAt) return null
  const resetTime = new Date(resetAt).getTime()
  if (!Number.isFinite(resetTime)) return null
  const windowMs = windowHours * 60 * 60 * 1000
  const startTime = resetTime - windowMs
  return Math.min(100, Math.max(0, Math.round(((now - startTime) / windowMs) * 1000) / 10))
}

export function calculateWeeklySafeLevel(resetAt, now = Date.now()) {
  if (!resetAt) return null
  const resetTime = new Date(resetAt).getTime()
  if (!Number.isFinite(resetTime)) return null

  const hour = 60 * 60 * 1000
  const day = 24 * hour
  const windowStart = resetTime - 7 * day
  if (now <= windowStart) return 0
  if (now >= resetTime - 12 * hour) return 100

  // Shift timestamps into a DST-free Asia/Shanghai coordinate system, then use UTC calendar APIs.
  const chinaOffset = 8 * hour
  const start = windowStart + chinaOffset
  const end = Math.min(now, resetTime) + chinaOffset
  let cursor = Math.floor(start / day) * day
  let safeLevel = 0

  while (cursor <= end) {
    const weekday = new Date(cursor).getUTCDay()
    const dailyWeight = weekday === 0 || weekday === 6 ? 5 : 18
    const workStart = cursor + 9 * hour
    const workEnd = cursor + 18 * hour
    const overlapStart = Math.max(start, workStart)
    const overlapEnd = Math.min(end, workEnd)
    if (overlapEnd > overlapStart) {
      safeLevel += dailyWeight * ((overlapEnd - overlapStart) / (9 * hour))
    }
    cursor += day
  }

  return Math.min(100, Math.max(0, Math.round(safeLevel * 10) / 10))
}

export function calculatePositionAmounts(safeLevelPercent, usedPercent, estimatedTotalAmount) {
  if (
    safeLevelPercent === null ||
    usedPercent === null ||
    estimatedTotalAmount === null
  ) {
    return { safeAmount: null, aheadAmount: null }
  }

  const differenceAmount = ((safeLevelPercent - usedPercent) / 100) * estimatedTotalAmount
  return {
    safeAmount: differenceAmount >= 0 ? amount(differenceAmount) : 0,
    aheadAmount: differenceAmount < 0 ? amount(-differenceAmount) : 0,
  }
}

function mapUsage(progress, fallback, options = {}) {
  const usedPercent = percentage(progress?.utilization ?? fallback.usedPercent)
  const resetAt = text(progress?.resets_at) ?? fallback.resetAt
  const usedAmount = amount(progress?.window_stats?.standard_cost ?? progress?.window_stats?.cost)
  const estimatedTotalAmount =
    usedAmount !== null && usedPercent !== null && usedPercent > 0
      ? amount((usedAmount * 100) / usedPercent)
      : null

  const safeLevelPercent = options.weeklySafety
    ? calculateWeeklySafeLevel(resetAt, options.now)
    : options.windowHours
      ? calculateSafeLevel(resetAt, options.windowHours, options.now)
      : null
  const positionAmounts = calculatePositionAmounts(
    safeLevelPercent,
    usedPercent,
    estimatedTotalAmount,
  )

  return {
    usedPercent,
    resetAt,
    usedAmount,
    estimatedTotalAmount,
    safeLevelPercent,
    ...positionAmounts,
  }
}

export function mapAccount(account, usage, now = Date.now()) {
  const extra = account?.extra && typeof account.extra === 'object' ? account.extra : {}
  const credentials =
    account?.credentials && typeof account.credentials === 'object' ? account.credentials : {}

  const fiveHourFallback = {
    usedPercent: percentage(extra.codex_5h_used_percent),
    resetAt: text(extra.codex_5h_reset_at),
  }
  const sevenDayFallback = {
    usedPercent: percentage(extra.codex_7d_used_percent),
    resetAt: text(extra.codex_7d_reset_at),
  }

  return {
    id: Number(account?.id),
    name: text(account?.name) ?? `账号 ${account?.id ?? '-'}`,
    platform: text(account?.platform) ?? 'unknown',
    planType: text(credentials.plan_type),
    status: text(account?.status) ?? 'unknown',
    schedulable: account?.schedulable === true,
    capacityUsed: nonNegativeInteger(account?.current_concurrency),
    capacityTotal: nonNegativeInteger(account?.concurrency),
    usage5h: mapUsage(usage?.five_hour, fiveHourFallback, { windowHours: 5, now }),
    usage7d: mapUsage(usage?.seven_day, sevenDayFallback, { weeklySafety: true, now }),
    updatedAt: text(usage?.updated_at) ?? text(extra.codex_usage_updated_at),
  }
}

export function summarize(accounts) {
  const values = (key) =>
    accounts.map((account) => account[key].usedPercent).filter((value) => value !== null)
  const average = (numbers) =>
    numbers.length
      ? Math.round((numbers.reduce((sum, value) => sum + value, 0) / numbers.length) * 10) / 10
      : null

  const fiveHour = values('usage5h')
  const weekly = values('usage7d')

  return {
    total: accounts.length,
    active: accounts.filter((account) => account.status === 'active' && account.schedulable).length,
    average5h: average(fiveHour),
    average7d: average(weekly),
    atRisk: accounts.filter((account) =>
      [account.usage5h.usedPercent, account.usage7d.usedPercent].some(
        (value) => value !== null && value >= 90,
      ),
    ).length,
  }
}
