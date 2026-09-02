import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CalendarDays,
  Clock3,
  Database,
  Gauge,
  LockKeyhole,
  LogOut,
  RefreshCw,
  Search,
  ShieldCheck,
  Users,
  createIcons,
} from 'lucide'

import './styles.css'
import { resetCountdown } from './countdown.js'

const icons = {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CalendarDays,
  Clock3,
  Database,
  Gauge,
  LockKeyhole,
  LogOut,
  RefreshCw,
  Search,
  ShieldCheck,
  Users,
}

const elements = {
  loginView: document.querySelector('#login-view'),
  dashboardView: document.querySelector('#dashboard-view'),
  loginForm: document.querySelector('#login-form'),
  loginButton: document.querySelector('#login-button'),
  loginSpinner: document.querySelector('#login-spinner'),
  loginError: document.querySelector('#login-error'),
  password: document.querySelector('#password'),
  refreshButton: document.querySelector('#refresh-button'),
  logoutButton: document.querySelector('#logout-button'),
  searchInput: document.querySelector('#search-input'),
  loading: document.querySelector('#loading-state'),
  table: document.querySelector('#desktop-table'),
  body: document.querySelector('#accounts-body'),
  mobileList: document.querySelector('#mobile-list'),
  empty: document.querySelector('#empty-state'),
  warning: document.querySelector('#warning'),
  warningText: document.querySelector('#warning-text'),
  syncTime: document.querySelector('#sync-time'),
  accountCount: document.querySelector('#account-count'),
  statAccounts: document.querySelector('#stat-accounts'),
  statActive: document.querySelector('#stat-active'),
  stat5h: document.querySelector('#stat-5h'),
  stat7d: document.querySelector('#stat-7d'),
  statRisk: document.querySelector('#stat-risk'),
  metricsRange: document.querySelector('#metrics-range'),
  metricsPeriod: document.querySelector('#metrics-period'),
  metricsLoading: document.querySelector('#metrics-loading'),
  metricsTable: document.querySelector('#metrics-table'),
  metricsBody: document.querySelector('#metrics-body'),
  metricsEmpty: document.querySelector('#metrics-empty'),
}

let accounts = []
let loading = false
let metricUsers = []
let metricsLoading = false
let selectedMetricRange = '24h'
let metricsRequestId = 0
let metricSort = { key: 'totalSpend', direction: 'desc' }

const metricRangeLabels = new Map([
  ['24h', '近 24 小时'],
  ['today', '今天'],
  ['yesterday', '昨天'],
  ['7d', '近 7 天'],
  ['30d', '近 30 天'],
])

function node(tag, className, text) {
  const element = document.createElement(tag)
  if (className) element.className = className
  if (text !== undefined) element.textContent = text
  return element
}

function setVisible(element, visible, displayClass = 'block') {
  element.classList.toggle('hidden', !visible)
  if (visible) element.classList.add(displayClass)
  else element.classList.remove(displayClass)
}

function showDashboard(authenticated) {
  setVisible(elements.loginView, !authenticated, 'grid')
  setVisible(elements.dashboardView, authenticated)
}

function percent(value) {
  return value === null ? '未同步' : `${Number(value).toFixed(value % 1 ? 1 : 0)}%`
}

function currency(value) {
  if (value === null || !Number.isFinite(Number(value))) return null
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

function preciseCurrency(value) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  }).format(value)
}

function formatTokens(value) {
  if (!Number.isFinite(Number(value))) return '--'
  const number = Number(value)
  if (number >= 1e9) return `${(number / 1e9).toFixed(2)}B`
  if (number >= 1e6) return `${(number / 1e6).toFixed(2)}M`
  if (number >= 1e3) return `${(number / 1e3).toFixed(2)}K`
  return number.toFixed(2)
}

function metricPercent(value) {
  return `${Number(value).toFixed(1)}%`
}

function dateTime(value, fallback = '等待同步') {
  if (!value) return fallback
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return fallback
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)
}

function resetLabel(value, showCountdown = false) {
  if (!value) return '等待上游同步'
  const reset = new Date(value)
  if (Number.isNaN(reset.getTime())) return '等待上游同步'
  const label = reset.getTime() <= Date.now() ? '窗口已重置' : `${dateTime(value)} 重置`
  const countdown = showCountdown ? resetCountdown(value) : null
  return countdown ? `${label} · ${countdown}` : label
}

function progressClass(value) {
  if (value === null) return ''
  if (value >= 90) return 'progress-error'
  if (value >= 75) return 'progress-warning'
  return 'progress-success'
}

function quotaMeter(usage, showSafetyLine = false) {
  const wrapper = node('div', 'relative h-2 w-full')
  const progress = node(
    'progress',
    `progress absolute inset-0 h-2 w-full ${progressClass(usage.usedPercent)}`,
  )
  progress.max = 100
  progress.value = usage.usedPercent ?? 0
  progress.setAttribute('aria-label', `已使用 ${percent(usage.usedPercent)}`)
  wrapper.append(progress)

  if (showSafetyLine && usage.safeLevelPercent !== null) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svg.setAttribute('viewBox', '0 0 100 8')
    svg.setAttribute('preserveAspectRatio', 'none')
    svg.setAttribute('aria-hidden', 'true')
    svg.classList.add(
      'pointer-events-none',
      'absolute',
      'inset-0',
      'h-2',
      'w-full',
      'overflow-visible',
      'text-neutral',
    )
    const marker = document.createElementNS('http://www.w3.org/2000/svg', 'line')
    marker.setAttribute('x1', usage.safeLevelPercent)
    marker.setAttribute('x2', usage.safeLevelPercent)
    marker.setAttribute('y1', '-2')
    marker.setAttribute('y2', '10')
    marker.setAttribute('stroke', 'currentColor')
    marker.setAttribute('stroke-width', '1.5')
    marker.setAttribute('vector-effect', 'non-scaling-stroke')
    svg.append(marker)
    wrapper.append(svg)
  }
  return wrapper
}

function amountLabel(usage, estimateLabel) {
  const used = currency(usage.usedAmount)
  const estimated = currency(usage.estimatedTotalAmount)
  if (!used) return '金额待统计'
  return `已用 ${used}${estimated ? ` · ${estimateLabel} ${estimated}` : ' · 暂无额度预估'}`
}

function positionAmountLine(usage) {
  const isAhead =
    usage.safeLevelPercent !== null &&
    usage.usedPercent !== null &&
    usage.usedPercent > usage.safeLevelPercent
  const label = isAhead ? '超前额度' : '安全额度'
  const value = isAhead ? usage.aheadAmount : usage.safeAmount
  const color = isAhead ? 'text-error' : 'text-success'
  return node('div', `text-xs font-semibold tabular-nums ${color}`, `${label} ${currency(value) ?? '--'}`)
}

function statusBadge(account) {
  if (account.status === 'active' && account.schedulable) {
    return { label: '可用', className: 'badge badge-success badge-soft badge-sm' }
  }
  if (account.status === 'active') {
    return { label: '暂停调度', className: 'badge badge-warning badge-soft badge-sm' }
  }
  return { label: '停用', className: 'badge badge-ghost badge-sm' }
}

function usageCell(
  usage,
  showSafetyLine = false,
  showResetCountdown = false,
  estimateLabel = '预估额度',
) {
  const wrapper = node('div', 'space-y-2')
  const top = node('div', 'flex items-baseline justify-between gap-3')
  top.append(node('span', 'font-semibold tabular-nums', percent(usage.usedPercent)))
  top.append(
    node('span', 'text-xs text-base-content/50', resetLabel(usage.resetAt, showResetCountdown)),
  )
  const detail = node('div', 'flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs')
  detail.append(node('span', 'tabular-nums text-base-content/65', amountLabel(usage, estimateLabel)))
  if (showSafetyLine && usage.safeLevelPercent !== null) {
    detail.append(
      node('span', 'font-medium tabular-nums text-secondary', `安全线 ${percent(usage.safeLevelPercent)}`),
    )
  }
  wrapper.append(top, quotaMeter(usage, showSafetyLine), detail, positionAmountLine(usage))
  return wrapper
}

function accountIdentity(account) {
  const wrapper = node('div', 'min-w-0')
  wrapper.append(node('div', 'truncate font-medium', account.name))
  const metadata = [
    `#${account.id}`,
    account.platform === 'openai' ? 'OpenAI' : account.platform,
    account.planType?.toUpperCase(),
  ].filter(Boolean)
  wrapper.append(node('div', 'mt-0.5 truncate text-xs text-base-content/50', metadata.join(' · ')))
  return wrapper
}

function capacityLabel(account) {
  if (account.capacityUsed === null || account.capacityTotal === null) return '--'
  return `${account.capacityUsed} / ${account.capacityTotal}`
}

function capacityBadge(account) {
  return node(
    'span',
    'badge badge-ghost badge-sm whitespace-nowrap font-mono tabular-nums',
    capacityLabel(account),
  )
}

function renderDesktop(account) {
  const row = node('tr', 'hover:bg-base-200/60')
  const identity = node('td')
  identity.append(accountIdentity(account))
  const capacity = node('td')
  capacity.append(capacityBadge(account))
  const status = node('td')
  const badge = statusBadge(account)
  status.append(node('span', badge.className, badge.label))
  const fiveHour = node('td')
  fiveHour.append(usageCell(account.usage5h, true, false, '预估5小时额度'))
  const weekly = node('td')
  weekly.append(usageCell(account.usage7d, true, true, '预估周额度'))
  const updated = node('td', 'text-right text-xs text-base-content/55', dateTime(account.updatedAt, '-'))
  row.append(identity, capacity, status, fiveHour, weekly, updated)
  return row
}

function mobileUsage(
  label,
  usage,
  showSafetyLine = false,
  showResetCountdown = false,
  estimateLabel = '预估额度',
) {
  const section = node('div', 'space-y-2')
  const title = node('div', 'flex items-baseline justify-between gap-3')
  title.append(node('span', 'text-xs font-medium text-base-content/60', label))
  title.append(node('span', 'font-semibold tabular-nums', percent(usage.usedPercent)))
  const detail = node('div', 'flex flex-wrap items-start justify-between gap-x-3 gap-y-1 text-xs')
  detail.append(node('span', 'tabular-nums text-base-content/65', amountLabel(usage, estimateLabel)))
  const timing = node('span', 'ml-auto text-right text-base-content/50')
  timing.append(document.createTextNode(resetLabel(usage.resetAt, showResetCountdown)))
  if (showSafetyLine && usage.safeLevelPercent !== null) {
    timing.append(
      document.createTextNode(` · 安全线 ${percent(usage.safeLevelPercent)}`),
    )
  }
  detail.append(timing)
  section.append(title, quotaMeter(usage, showSafetyLine), detail, positionAmountLine(usage))
  return section
}

function renderMobile(account) {
  const card = node('article', 'card border border-base-300 bg-base-100 shadow-sm')
  const body = node('div', 'card-body gap-4 p-4')
  const heading = node('div', 'flex items-start justify-between gap-3')
  heading.append(accountIdentity(account))
  const badge = statusBadge(account)
  heading.append(node('span', `${badge.className} shrink-0`, badge.label))
  const capacity = node('div', 'flex items-center justify-between gap-3 text-xs')
  capacity.append(node('span', 'text-base-content/60', '容量'), capacityBadge(account))
  body.append(
    heading,
    capacity,
    mobileUsage('5 小时额度', account.usage5h, true, false, '预估5小时额度'),
    mobileUsage('周额度', account.usage7d, true, true, '预估周额度'),
  )
  card.append(body)
  return card
}

function filteredAccounts() {
  const query = elements.searchInput.value.trim().toLocaleLowerCase('zh-CN')
  if (!query) return accounts
  return accounts.filter((account) =>
    [account.name, account.platform, account.planType, String(account.id)].some((value) =>
      String(value || '').toLocaleLowerCase('zh-CN').includes(query),
    ),
  )
}

function renderAccounts() {
  const filtered = filteredAccounts()
  elements.body.replaceChildren(...filtered.map(renderDesktop))
  elements.mobileList.replaceChildren(...filtered.map(renderMobile))
  elements.accountCount.textContent = `${filtered.length} / ${accounts.length} 个账号`

  const hasAccounts = filtered.length > 0
  elements.table.classList.add('hidden')
  elements.table.classList.toggle('md:block', hasAccounts)
  setVisible(elements.mobileList, hasAccounts)
  setVisible(elements.empty, !hasAccounts, 'grid')
}

function metricUsername(user) {
  return user.username || user.email || `用户 ${user.id}`
}

function metricSortValue(user, key) {
  if (key === 'username') return metricUsername(user)
  const value = user[key]
  return Number.isFinite(Number(value)) ? Number(value) : null
}

function sortedMetricUsers() {
  const multiplier = metricSort.direction === 'asc' ? 1 : -1
  return [...metricUsers].sort((left, right) => {
    if (left.available !== right.available) return left.available ? -1 : 1
    const leftValue = metricSortValue(left, metricSort.key)
    const rightValue = metricSortValue(right, metricSort.key)
    if (leftValue === null && rightValue === null) return left.id - right.id
    if (leftValue === null) return 1
    if (rightValue === null) return -1
    const comparison =
      typeof leftValue === 'string'
        ? leftValue.localeCompare(rightValue, 'zh-CN')
        : leftValue - rightValue
    return comparison === 0 ? left.id - right.id : comparison * multiplier
  })
}

function metricCell(value, formatter) {
  return node('td', 'text-right tabular-nums', value === null ? '--' : formatter(value))
}

function renderMetricRow(user) {
  const row = node('tr', 'hover:bg-base-200/60')
  row.dataset.userId = String(user.id)
  const name = node('th', 'font-medium', metricUsername(user))
  if (!user.available) {
    row.append(name)
    for (let index = 0; index < 7; index += 1) row.append(node('td', 'text-right text-base-content/45', '--'))
    return row
  }
  row.append(
    name,
    metricCell(user.totalSpend, currency),
    metricCell(user.totalTokens, formatTokens),
    metricCell(user.spendPerMillionTokens, preciseCurrency),
    metricCell(user.cacheHitRate, metricPercent),
    metricCell(user.requests, (value) => value.toLocaleString('zh-CN')),
    metricCell(user.spendPerRequest, preciseCurrency),
    metricCell(user.tokensPerRequest, formatTokens),
  )
  return row
}

function updateMetricSortHeaders() {
  for (const button of document.querySelectorAll('[data-metric-sort]')) {
    const active = button.dataset.metricSort === metricSort.key
    const heading = button.closest('th')
    heading.setAttribute(
      'aria-sort',
      active ? (metricSort.direction === 'asc' ? 'ascending' : 'descending') : 'none',
    )
    const icon = button.querySelector('svg, i')
    if (icon) {
      icon.dataset.lucide = active
        ? metricSort.direction === 'asc'
          ? 'arrow-up'
          : 'arrow-down'
        : 'arrow-up-down'
    }
  }
}

function renderMetrics() {
  elements.metricsBody.replaceChildren(...sortedMetricUsers().map(renderMetricRow))
  const hasMetrics = metricUsers.length > 0
  elements.metricsEmpty.textContent = '暂无用户数据'
  setVisible(elements.metricsTable, hasMetrics)
  setVisible(elements.metricsEmpty, !hasMetrics && !metricsLoading, 'grid')
  updateMetricSortHeaders()
  createIcons({ icons })
}

function updateMetricRangeButtons() {
  for (const button of elements.metricsRange.querySelectorAll('[data-range]')) {
    const active = button.dataset.range === selectedMetricRange
    button.classList.toggle('btn-neutral', active)
    button.setAttribute('aria-pressed', String(active))
    button.disabled = metricsLoading
  }
  elements.metricsPeriod.textContent = metricRangeLabels.get(selectedMetricRange)
}

async function loadMetrics(range = selectedMetricRange, force = false) {
  if (metricsLoading) return
  const requestId = ++metricsRequestId
  selectedMetricRange = range
  metricsLoading = true
  updateMetricRangeButtons()
  setVisible(elements.metricsLoading, true, 'flex')
  setVisible(elements.metricsTable, false)
  setVisible(elements.metricsEmpty, false)
  try {
    const data = await request(`/api/metrics?range=${range}${force ? '&refresh=1' : ''}`)
    if (requestId !== metricsRequestId) return
    metricUsers = data.users
    renderMetrics()
  } catch {
    if (requestId !== metricsRequestId) return
    metricUsers = []
    setVisible(elements.metricsEmpty, true, 'grid')
    elements.metricsEmpty.textContent = '暂时无法加载近期用量'
  } finally {
    if (requestId !== metricsRequestId) return
    metricsLoading = false
    updateMetricRangeButtons()
    setVisible(elements.metricsLoading, false)
  }
}

function renderSummary(summary) {
  elements.statAccounts.textContent = summary.total
  elements.statActive.textContent = `${summary.active} 个正在调度`
  elements.stat5h.textContent = percent(summary.average5h)
  elements.stat7d.textContent = percent(summary.average7d)
  elements.statRisk.textContent = summary.atRisk ? `${summary.atRisk} 个账号已达 90%` : '暂无高占用账号'
}

async function request(url, options) {
  const response = await fetch(url, options)
  const body = await response.json().catch(() => ({}))
  if (response.status === 401) {
    showDashboard(false)
    throw new Error(body.error || '登录已失效')
  }
  if (!response.ok) throw new Error(body.error || '请求失败')
  return body
}

async function loadAccounts(force = false) {
  if (loading) return
  loading = true
  elements.refreshButton.disabled = true
  elements.refreshButton.classList.add('animate-spin')
  setVisible(elements.loading, accounts.length === 0, 'flex')
  setVisible(elements.warning, false)

  try {
    const data = await request(`/api/accounts${force ? '?refresh=1' : ''}`)
    accounts = data.accounts
    renderSummary(data.summary)
    renderAccounts()
    elements.syncTime.textContent = `同步于 ${dateTime(data.fetchedAt)}`
    if (data.stale || data.warning) {
      elements.warningText.textContent = data.warning || '当前显示缓存数据'
      setVisible(elements.warning, true)
    }
  } catch (error) {
    elements.warningText.textContent = error.message
    setVisible(elements.warning, true)
  } finally {
    loading = false
    elements.refreshButton.disabled = false
    elements.refreshButton.classList.remove('animate-spin')
    setVisible(elements.loading, false)
  }
}

elements.loginForm.addEventListener('submit', async (event) => {
  event.preventDefault()
  elements.loginButton.disabled = true
  setVisible(elements.loginSpinner, true)
  setVisible(elements.loginError, false)
  try {
    await request('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: elements.password.value }),
    })
    elements.password.value = ''
    showDashboard(true)
    await loadAccounts()
    await loadMetrics()
  } catch (error) {
    elements.loginError.textContent = error.message
    setVisible(elements.loginError, true)
  } finally {
    elements.loginButton.disabled = false
    setVisible(elements.loginSpinner, false)
  }
})

elements.refreshButton.addEventListener('click', () => {
  loadAccounts(true)
  loadMetrics(selectedMetricRange, true)
})
elements.searchInput.addEventListener('input', () => {
  renderAccounts()
})
elements.metricsRange.addEventListener('click', (event) => {
  const button = event.target.closest('[data-range]')
  if (!button) return
  loadMetrics(button.dataset.range)
})
document.querySelector('#metrics-table').addEventListener('click', (event) => {
  const button = event.target.closest('[data-metric-sort]')
  if (!button) return
  const key = button.dataset.metricSort
  metricSort = {
    key,
    direction:
      metricSort.key === key
        ? metricSort.direction === 'desc'
          ? 'asc'
          : 'desc'
        : key === 'username'
          ? 'asc'
          : 'desc',
  }
  renderMetrics()
})
elements.logoutButton.addEventListener('click', async () => {
  await fetch('/api/logout', { method: 'POST' })
  accounts = []
  metricUsers = []
  showDashboard(false)
})

createIcons({ icons })

const session = await request('/api/session').catch(() => ({ authenticated: false }))
showDashboard(session.authenticated)
if (session.authenticated) await loadAccounts()
if (session.authenticated) await loadMetrics()

setInterval(() => {
  if (!elements.dashboardView.classList.contains('hidden')) {
    loadAccounts()
    loadMetrics()
  }
}, 60_000)
