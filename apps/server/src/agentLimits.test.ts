// 계정마다 한도 (11/20 시안 4절): Claude의 rate_limit_event · Codex rollout의 rate_limits
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import zlib from 'node:zlib'
import { afterEach, describe, expect, it } from 'vitest'
import { claudeLimits, codexLimits, fresh, lastRateLimits, noteClaudeLimit, setLimitsFile } from './agentLimits.js'

let tmp = ''
afterEach(() => { setLimitsFile(undefined); if (tmp) fs.rmSync(tmp, { recursive: true, force: true }) })

describe('계정 한도', () => {
  it('Claude: 창마다 비율을 %로 적고, 파일에 남겨 다시 읽는다', () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rw-lim-'))
    const file = path.join(tmp, 'agent-limits.json')
    setLimitsFile(file)
    const later = Math.floor(Date.now() / 1000) + 3600
    noteClaudeLimit('/acct/a', { status: 'allowed', rateLimitType: 'five_hour', utilization: 0.42, resetsAt: later })
    noteClaudeLimit('/acct/a', { status: 'allowed_warning', rateLimitType: 'seven_day', utilization: 0.9, resetsAt: later })
    noteClaudeLimit('/acct/a', { status: 'allowed' })
    setLimitsFile(file)
    expect(claudeLimits('/acct/a')).toMatchObject({ five: { used: 42 }, week: { used: 90 } })
    expect(claudeLimits('/acct/b')).toBeUndefined()
    noteClaudeLimit('/acct/b', { status: 'allowed', unifiedWindows: { five_hour: { utilization: 0.1, resetsAt: later }, seven_day: { utilization: 0.2, resetsAt: later } } })
    expect(claudeLimits('/acct/b')).toMatchObject({ five: { used: 10 }, week: { used: 20 } })
  })

  it('Codex: 마지막 rate_limits 줄, 창 길이로 5시간 · 이번 주를 가르고, 남은 초를 시각으로', () => {
    const at = '2026-11-20T01:00:00.000Z'
    const text = [
      JSON.stringify({ timestamp: at, payload: { type: 'token_count', rate_limits: { primary: { used_percent: 5, window_minutes: 300 } } } }),
      JSON.stringify({ timestamp: at, payload: { type: 'token_count', info: null, rate_limits: { primary: { used_percent: 20, window_minutes: 10080, resets_in_seconds: 60 }, secondary: { used_percent: 3, window_minutes: 299 } } } }),
      'not json',
    ].join('\n')
    expect(lastRateLimits(text)).toEqual({ at, five: { used: 3 }, week: { used: 20, resetsAt: '2026-11-20T01:01:00.000Z' } })
    expect(lastRateLimits('{}')).toBeUndefined()
  })

  // 11/28 맥에서 본 실제 꼴: 끝난 rollout은 .jsonl.zst, 이번 주 창만 primary에(10080분), secondary는 null
  it.skipIf(typeof zlib.zstdCompressSync !== 'function')('Codex: zstd로 줄인 rollout(.jsonl.zst)도 읽는다', () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rw-lim-'))
    const day = path.join(tmp, 'sessions', '2026', '11', '10')
    fs.mkdirSync(day, { recursive: true })
    const later = Math.floor(Date.now() / 1000) + 3600
    const line = JSON.stringify({ timestamp: '2026-11-09T23:49:59.842Z', type: 'event_msg', payload: { type: 'token_count', rate_limits: { limit_id: 'codex', primary: { used_percent: 29, window_minutes: 10080, resets_at: later }, secondary: null, plan_type: 'prolite' } } })
    fs.writeFileSync(path.join(day, 'rollout-2026-11-10T08-40-01-a.jsonl.zst'), zlib.zstdCompressSync(Buffer.from(`{"type":"session_meta"}\n${line}\n`)))
    expect(codexLimits(tmp)).toMatchObject({ week: { used: 29, resetsAt: new Date(later * 1000).toISOString() } })
    expect(codexLimits(tmp)?.five).toBeUndefined()
  })

  it('다시 찬 창은 0으로', () => {
    expect(fresh({ five: { used: 70, resetsAt: '2026-11-20T01:00:00.000Z' }, week: { used: 50 }, at: 'x' }, Date.parse('2026-11-20T02:00:00Z'))).toEqual({ five: { used: 0 }, week: { used: 50 }, at: 'x' })
  })
})
