import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildApp } from './app.js'
import { feedbackMergeFor } from './feedbackMerge.js'
import { tmp, useSampleApp } from './testkit.js'

useSampleApp()

describe('소개 절 확인 기록 (about.yaml, 11/11 안 C′)', () => {
  it('파일이 없으면 확인을 시작하지 않은 것, 맞아요 · 고쳐 보냄을 절마다 적는다', async () => {
    const dir = path.join(tmp, 'feedback-about')
    const fb = buildApp({ configDir: path.join(tmp, 'config-fb-about'), feedbackDir: dir })
    const first = (await fb.inject({ method: 'GET', url: '/api/about/checks' })).json()
    expect(first).toEqual({ enabled: true, exists: false, sections: {}, prDates: {} })

    const sent = await fb.inject({ method: 'PUT', url: '/api/about/checks', payload: { key: 'agents/delegated', action: 'sent', pr: 402 } })
    expect(sent.statusCode).toBe(200)
    expect(sent.json().sections['agents/delegated']).toMatchObject({ sentPr: 402 })
    const checked = (await fb.inject({ method: 'PUT', url: '/api/about/checks', payload: { key: 'agents/delegated', action: 'check', pr: 427 } })).json()
    expect(checked.exists).toBe(true)
    // 확인하면 고쳐 보낸 표시는 지운다
    expect(checked.sections['agents/delegated']).toEqual({ checked: 427, at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) })
    expect(fs.readFileSync(path.join(dir, 'about.yaml'), 'utf8')).toMatch(/^# 소개 절을 확인한 기록/)

    expect((await fb.inject({ method: 'PUT', url: '/api/about/checks', payload: { key: '../x', action: 'check', pr: 1 } })).statusCode).toBe(400)
    expect((await fb.inject({ method: 'PUT', url: '/api/about/checks', payload: { key: 'a/b', action: 'nope', pr: 1 } })).statusCode).toBe(400)
    await fb.close()
  })

  it('피드백 폴더가 없으면 기록하지 않는다', async () => {
    const app = buildApp({ configDir: path.join(tmp, 'config-fb-about-none') })
    expect((await app.inject({ method: 'GET', url: '/api/about/checks' })).json()).toMatchObject({ enabled: false, exists: false })
    expect((await app.inject({ method: 'PUT', url: '/api/about/checks', payload: { key: 'a/b', action: 'check', pr: 1 } })).statusCode).toBe(404)
    await app.close()
  })

  it('두 컴퓨터가 다른 절을 확인했으면 둘 다 남긴다', () => {
    const merge = feedbackMergeFor('feedback/about.yaml')!
    const base = 'a/x:\n  checked: 1\n'
    const out = merge(base, `${base}a/y:\n  checked: 2\n`, `${base}b/z:\n  checked: 3\n`)
    expect(out).toContain('a/y:')
    expect(out).toContain('b/z:')
  })
})
