import assert from 'node:assert/strict'
import test from 'node:test'

import { resetCountdown } from '../src/countdown.js'

test('formats weekly reset countdown without leading zeroes', () => {
  const now = new Date('2026-08-18T22:00:00+08:00').getTime()
  assert.equal(resetCountdown('2026-08-20T11:33:00+08:00', now), '1天14小时')
})

test('handles expired and invalid reset times', () => {
  const now = new Date('2026-08-18T22:00:00+08:00').getTime()
  assert.equal(resetCountdown('2026-08-18T21:00:00+08:00', now), '0天0小时')
  assert.equal(resetCountdown(null, now), null)
  assert.equal(resetCountdown('invalid', now), null)
})
