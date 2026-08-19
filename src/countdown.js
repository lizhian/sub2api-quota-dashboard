export function resetCountdown(resetAt, now = Date.now()) {
  const resetTime = new Date(resetAt).getTime()
  if (!resetAt || !Number.isFinite(resetTime)) return null

  const remaining = resetTime - now
  if (remaining <= 0) return '0天0小时'

  const totalHours = Math.ceil(remaining / (60 * 60 * 1000))
  const days = Math.floor(totalHours / 24)
  const hours = totalHours % 24
  return `${days}天${hours}小时`
}
