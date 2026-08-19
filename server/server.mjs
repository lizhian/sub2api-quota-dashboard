import 'dotenv/config'

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import express from 'express'
import helmet from 'helmet'

import { mapAccount, summarize } from './account-mapper.mjs'
import {
  METRIC_RANGES,
  metricsFromUsageStats,
  statsRangeParams,
} from './usage-metrics.mjs'

const required = ['SUB2API_BASE_URL', 'SUB2API_ADMIN_KEY', 'VIEWER_PASSWORD', 'SESSION_SECRET']
const missing = required.filter((name) => !process.env[name])
if (missing.length) {
  throw new Error(`Missing required environment variables: ${missing.join(', ')}`)
}
if (process.env.SESSION_SECRET.length < 32) {
  throw new Error('SESSION_SECRET must contain at least 32 characters')
}

const app = express()
const port = Number(process.env.PORT || 4173)
const cacheTtlMs = Number(process.env.CACHE_TTL_SECONDS || 30) * 1000
const sessionTtlMs = Number(process.env.SESSION_DAYS || 30) * 24 * 60 * 60 * 1000
const upstreamBase = process.env.SUB2API_BASE_URL.replace(/\/+$/, '')
const production = process.env.NODE_ENV === 'production'
const directory = path.dirname(fileURLToPath(import.meta.url))
const distDirectory = path.resolve(directory, '../dist')

if (process.env.TRUST_PROXY === '1') app.set('trust proxy', 1)

app.disable('x-powered-by')
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  }),
)
app.use(express.json({ limit: '16kb' }))

function safeEqual(left, right) {
  const a = Buffer.from(String(left))
  const b = Buffer.from(String(right))
  return a.length === b.length && timingSafeEqual(a, b)
}

function cookies(request) {
  return Object.fromEntries(
    (request.headers.cookie || '')
      .split(';')
      .map((part) => part.trim().split('='))
      .filter(([key, value]) => key && value)
      .map(([key, value]) => [key, decodeURIComponent(value)]),
  )
}

function signature(payload) {
  return createHmac('sha256', process.env.SESSION_SECRET).update(payload).digest('base64url')
}

function createSession() {
  const payload = Buffer.from(
    JSON.stringify({ expiresAt: Date.now() + sessionTtlMs, nonce: randomBytes(12).toString('hex') }),
  ).toString('base64url')
  return `${payload}.${signature(payload)}`
}

function validSession(request) {
  const token = cookies(request).quota_session
  if (!token) return false
  const [payload, suppliedSignature] = token.split('.')
  if (!payload || !suppliedSignature || !safeEqual(suppliedSignature, signature(payload))) return false

  try {
    const session = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    return Number.isFinite(session.expiresAt) && session.expiresAt > Date.now()
  } catch {
    return false
  }
}

function requireViewer(request, response, next) {
  if (!validSession(request)) return response.status(401).json({ error: '需要登录' })
  next()
}

const loginAttempts = new Map()
function allowLoginAttempt(ip) {
  const now = Date.now()
  const current = loginAttempts.get(ip)
  if (!current || current.resetAt <= now) {
    loginAttempts.set(ip, { count: 1, resetAt: now + 10 * 60 * 1000 })
    return true
  }
  current.count += 1
  return current.count <= 10
}

app.get('/api/session', (request, response) => {
  response.set('Cache-Control', 'no-store').json({ authenticated: validSession(request) })
})

app.post('/api/login', (request, response) => {
  response.set('Cache-Control', 'no-store')
  if (!allowLoginAttempt(request.ip)) {
    return response.status(429).json({ error: '尝试次数过多，请稍后再试' })
  }
  if (!safeEqual(request.body?.password || '', process.env.VIEWER_PASSWORD)) {
    return response.status(401).json({ error: '查看密码不正确' })
  }

  const maxAge = Math.floor(sessionTtlMs / 1000)
  response.setHeader(
    'Set-Cookie',
    `quota_session=${createSession()}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${production ? '; Secure' : ''}`,
  )
  response.json({ ok: true })
})

app.post('/api/logout', (_request, response) => {
  response.setHeader(
    'Set-Cookie',
    `quota_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${production ? '; Secure' : ''}`,
  )
  response.json({ ok: true })
})

let cache = null
let inFlight = null
const metricsCache = new Map()
const metricsFlights = new Map()

async function fetchPage(page) {
  const url = new URL(`${upstreamBase}/api/v1/admin/accounts`)
  url.searchParams.set('page', String(page))
  url.searchParams.set('page_size', '50')
  url.searchParams.set('timezone', 'Asia/Shanghai')

  const response = await fetch(url, {
    headers: { Accept: 'application/json', 'x-api-key': process.env.SUB2API_ADMIN_KEY },
    signal: AbortSignal.timeout(12_000),
  })
  if (!response.ok) throw new Error(`Sub2API request failed with HTTP ${response.status}`)
  const envelope = await response.json()
  if (envelope.code !== 0 || !envelope.data) {
    throw new Error(envelope.message || 'Sub2API returned an invalid response')
  }
  return envelope.data
}

async function fetchUsageBatch(accountIds) {
  if (!accountIds.length) return { usage: {}, errors: {} }
  const response = await fetch(`${upstreamBase}/api/v1/admin/accounts/usage/batch`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'x-api-key': process.env.SUB2API_ADMIN_KEY,
    },
    body: JSON.stringify({ account_ids: accountIds, force: false }),
    signal: AbortSignal.timeout(20_000),
  })
  if (!response.ok) throw new Error(`Sub2API usage request failed with HTTP ${response.status}`)
  const envelope = await response.json()
  if (envelope.code !== 0 || !envelope.data) {
    throw new Error(envelope.message || 'Sub2API returned an invalid usage response')
  }
  return envelope.data
}

async function fetchAllUsage(items) {
  const usage = {}
  const errors = {}
  const accountIds = items.map((item) => Number(item.id)).filter(Number.isFinite)
  for (let index = 0; index < accountIds.length; index += 50) {
    const result = await fetchUsageBatch(accountIds.slice(index, index + 50))
    Object.assign(usage, result.usage || {})
    Object.assign(errors, result.errors || {})
  }
  return { usage, errors }
}

async function refreshAccounts() {
  const first = await fetchPage(1)
  const items = [...(first.items || [])]
  const pages = Math.min(Number(first.pages || 1), 100)
  for (let page = 2; page <= pages; page += 1) {
    const next = await fetchPage(page)
    items.push(...(next.items || []))
  }

  let usageByAccount = {}
  let usageWarning = null
  try {
    const usageResult = await fetchAllUsage(items)
    usageByAccount = usageResult.usage
    if (Object.keys(usageResult.errors).length) {
      usageWarning = '部分账号的金额统计暂时不可用'
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    usageWarning = '金额统计暂时不可用，额度百分比仍为最新数据'
  }

  const now = Date.now()
  const accounts = items
    .map((item) => mapAccount(item, usageByAccount[String(item.id)], now))
    .filter((account) => Number.isFinite(account.id))
    .sort((left, right) => left.id - right.id)
  cache = {
    accounts,
    summary: summarize(accounts),
    fetchedAt: new Date().toISOString(),
    expiresAt: Date.now() + cacheTtlMs,
    warning: usageWarning,
  }
  return cache
}

async function accountData(force) {
  if (!force && cache && cache.expiresAt > Date.now()) return { ...cache, stale: false }
  if (!inFlight) inFlight = refreshAccounts().finally(() => (inFlight = null))
  try {
    return { ...(await inFlight), stale: false }
  } catch (error) {
    if (cache) return { ...cache, stale: true, warning: '上游暂时不可用，当前显示上次成功数据' }
    throw error
  }
}

async function fetchUsers() {
  const url = new URL(`${upstreamBase}/api/v1/admin/users`)
  url.searchParams.set('page', '1')
  url.searchParams.set('page_size', '100')
  url.searchParams.set('timezone', 'Asia/Shanghai')
  const response = await fetch(url, {
    headers: { Accept: 'application/json', 'x-api-key': process.env.SUB2API_ADMIN_KEY },
    signal: AbortSignal.timeout(15_000),
  })
  if (!response.ok) throw new Error(`Sub2API users request failed with HTTP ${response.status}`)
  const envelope = await response.json()
  if (envelope.code !== 0 || !envelope.data) {
    throw new Error(envelope.message || 'Sub2API returned an invalid users response')
  }
  return envelope.data.items || []
}

async function fetchUserStats(userId, range, force, now) {
  const url = new URL(`${upstreamBase}/api/v1/admin/usage/stats`)
  url.searchParams.set('user_id', String(userId))
  url.searchParams.set('timezone', 'Asia/Shanghai')
  if (force) url.searchParams.set('nocache', '1')
  for (const [key, value] of Object.entries(statsRangeParams(range, now))) {
    url.searchParams.set(key, value)
  }

  const response = await fetch(url, {
    headers: { Accept: 'application/json', 'x-api-key': process.env.SUB2API_ADMIN_KEY },
    signal: AbortSignal.timeout(15_000),
  })
  if (!response.ok) throw new Error(`Sub2API usage stats request failed with HTTP ${response.status}`)
  const envelope = await response.json()
  if (envelope.code !== 0 || !envelope.data) {
    throw new Error(envelope.message || 'Sub2API returned an invalid usage stats response')
  }
  return metricsFromUsageStats(envelope.data)
}

async function mapWithConcurrency(items, limit, mapper) {
  const results = new Array(items.length)
  let nextIndex = 0
  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex
      nextIndex += 1
      results[index] = await mapper(items[index], index)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()))
  return results
}

async function refreshMetrics(range, force) {
  const now = Date.now()
  const users = await fetchUsers()
  const userMetrics = await mapWithConcurrency(users, 5, async (user) => {
    const identity = {
      id: Number(user.id),
      username: typeof user.username === 'string' ? user.username : '',
      email: typeof user.email === 'string' ? user.email : '',
      status: typeof user.status === 'string' ? user.status : 'unknown',
    }
    try {
      return {
        ...identity,
        available: true,
        ...(await fetchUserStats(user.id, range, force, now)),
      }
    } catch (error) {
      console.error(`Metrics unavailable for user ${user.id}:`, error instanceof Error ? error.message : error)
      return { ...identity, available: false }
    }
  })
  const warning = userMetrics.some((user) => !user.available)
    ? '部分用户的近期用量暂时不可用'
    : null
  const value = {
    range,
    generatedAt: new Date(now).toISOString(),
    users: userMetrics,
    warning,
    expiresAt: Date.now() + cacheTtlMs,
  }
  metricsCache.set(range, value)
  return value
}

async function metricsData(range, force) {
  const cached = metricsCache.get(range)
  if (!force && cached && cached.expiresAt > Date.now()) return cached
  if (!metricsFlights.has(range)) {
    metricsFlights.set(
      range,
      refreshMetrics(range, force).finally(() => metricsFlights.delete(range)),
    )
  }
  return metricsFlights.get(range)
}

app.get('/api/accounts', requireViewer, async (request, response) => {
  response.set('Cache-Control', 'private, no-store')
  try {
    response.json(await accountData(request.query.refresh === '1'))
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    response.status(502).json({ error: '暂时无法从 Sub2API 获取额度数据' })
  }
})

app.get('/api/metrics', requireViewer, async (request, response) => {
  response.set('Cache-Control', 'private, no-store')
  const range = String(request.query.range || '24h')
  if (!METRIC_RANGES.has(range)) {
    return response.status(400).json({ error: '不支持的时间范围' })
  }
  try {
    const data = await metricsData(range, request.query.refresh === '1')
    const { expiresAt: _expiresAt, ...payload } = data
    response.json(payload)
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    response.status(502).json({ error: '暂时无法获取近期用量数据' })
  }
})

app.get('/healthz', (_request, response) => response.json({ ok: true }))
app.use(express.static(distDirectory, { index: false, maxAge: production ? '1h' : 0 }))
app.get('*path', (_request, response) => response.sendFile(path.join(distDirectory, 'index.html')))

app.listen(port, '0.0.0.0', () => {
  console.log(`Quota dashboard listening on http://0.0.0.0:${port}`)
})
