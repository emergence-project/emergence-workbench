// 피드백 맡음 (handoff.yaml): 저절로 풀림 · 화면에 보임 · 풀기 (11/9 "맡은 스레드를 잃어버리면 맡음만 남을 수 있어")
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildApp } from './app.js'
import { CLAIM_TTL_MS, claimedElsewhere, isLiveClaim, readClaims, releaseClaims, writeClaim } from './feedbackClaims.js'
import { tmp, useSampleApp } from './testkit.js'

useSampleApp()

describe('피드백 맡음', () => {
  it('세 시간이 지나거나 사용자가 그 뒤에 손대면 풀린 것으로 본다', () => {
    const now = Date.parse('2026-11-09T03:00:00Z')
    const at = (ms: number) => ({ machine: 'nightly', at: new Date(now - ms).toISOString() })
    expect(isLiveClaim(at(60_000), 0, now)).toBe(true)
    expect(isLiveClaim(at(CLAIM_TTL_MS + 1), 0, now)).toBe(false)
    expect(isLiveClaim(at(60_000), now, now)).toBe(false) // 맡은 뒤 사용자가 다시 답함
    expect(isLiveClaim({ machine: 1, at: 'x' }, 0, now)).toBe(false)
  })

  it('다른 이름의 풀리지 않은 맡음만 막고, 풀기는 고른 키 · 이름만 지운다', () => {
    const dir = path.join(tmp, 'claims')
    fs.mkdirSync(dir, { recursive: true })
    writeClaim(dir, 'a', 'nightly')
    writeClaim(dir, 'b', 'mac')
    writeClaim(dir, 'c', 'nightly', new Date(Date.now() - CLAIM_TTL_MS - 1000))
    expect(claimedElsewhere(dir, 'a', 'mac', 0)).toBe('nightly')
    expect(claimedElsewhere(dir, 'a', 'nightly', 0)).toBeNull()
    expect(claimedElsewhere(dir, 'c', 'mac', 0)).toBeNull() // 오래되어 풀림
    writeClaim(dir, 'd', 'mac') // 적을 때 풀린 줄(c)은 지우고, 풀리는 때를 함께 적는다
    expect(Object.keys(readClaims(dir)).sort()).toEqual(['a', 'b', 'd'])
    expect(Date.parse(readClaims(dir).d!.until!) - Date.parse(readClaims(dir).d!.at)).toBe(CLAIM_TTL_MS)
    releaseClaims(dir, ['d'])
    expect(releaseClaims(dir, null, 'nightly')).toBe(1)
    expect(Object.keys(readClaims(dir))).toEqual(['b'])
    expect(releaseClaims(dir, ['b'])).toBe(1)
    expect(readClaims(dir)).toEqual({})
  })

  it('피드백 화면에 맡은 이름과 풀리는 때가 보이고, DELETE로 바로 푼다', async () => {
    const dir = path.join(tmp, 'feedback-claim')
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, '2026-11-08.md'), '# 피드백 2026-11-08\n\n## 10:00 · 수정 · 홈\n\n고쳐 줘\n')
    fs.writeFileSync(path.join(dir, 'status.yaml'), '')
    const fb = buildApp({ configDir: path.join(tmp, 'config-fb-claim'), feedbackDir: dir })
    const key = '2026-11-08 10:00 홈'
    writeClaim(dir, key, 'cloud-nightly')
    const [e] = (await fb.inject({ method: 'GET', url: '/api/feedback/all' })).json().entries
    expect(e.claim.machine).toBe('cloud-nightly')
    expect(Date.parse(e.claim.until) - Date.parse(e.claim.at)).toBe(CLAIM_TTL_MS)
    expect((await fb.inject({ method: 'DELETE', url: '/api/feedback/claim', payload: { key } })).statusCode).toBe(200)
    expect((await fb.inject({ method: 'GET', url: '/api/feedback/all' })).json().entries[0].claim).toBeUndefined()
    await fb.close()
  })
})
