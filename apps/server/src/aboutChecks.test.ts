import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildApp } from './app.js'
import { feedbackMergeFor } from './feedbackMerge.js'
import { changedSentences, summaryLines } from './aboutChecks.js'
import { tmp, useSampleApp } from './testkit.js'

useSampleApp()

describe('소개 절 확인 기록 (about.yaml, 11/11 안 C′)', () => {
  it('파일이 없으면 확인을 시작하지 않은 것, 맞아요 · 고쳐 보냄을 절마다 적는다', async () => {
    const dir = path.join(tmp, 'feedback-about')
    const fb = buildApp({ configDir: path.join(tmp, 'config-fb-about'), feedbackDir: dir })
    const first = (await fb.inject({ method: 'GET', url: '/api/about/checks' })).json()
    expect(first).toEqual({ enabled: true, exists: false, sections: {}, prDates: {}, prTitles: {} })

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

  it('업데이트 줄마다 맞아요: ok에 PR과 날짜를 더하고 절 확인은 그대로 둔다 (11/20 시안 2절)', async () => {
    const dir = path.join(tmp, 'feedback-about-ok')
    const fb = buildApp({ configDir: path.join(tmp, 'config-fb-about-ok'), feedbackDir: dir })
    await fb.inject({ method: 'PUT', url: '/api/about/checks', payload: { key: 'a/b', action: 'check', pr: 100 } })
    const r = (await fb.inject({ method: 'PUT', url: '/api/about/checks', payload: { key: 'a/b', action: 'ok', pr: 300 } })).json()
    expect(r.sections['a/b']).toEqual({ checked: 100, at: expect.any(String), ok: { 300: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) } })
    expect((await fb.inject({ method: 'GET', url: '/api/about/changes?pr=x' })).statusCode).toBe(400)
    await fb.close()
  })

  it('업데이트가 바꾼 소개 문장: 더한 줄의 문장 중 지운 줄에 없던 것, 요약은 서명을 뺀 앞 줄', () => {
    const diff = [
      '--- a/apps/web/src/about/x/y.tsx', '+++ b/apps/web/src/about/x/y.tsx',
      "-    { text: <>확인은 절 하나씩 합니다. 맞아요를 누릅니다.</> },",
      "+    { text: <>확인은 절 하나씩 합니다. 줄마다 <b>맞아요</b>를 누릅니다.</> },",
      "-  title: 'This About page', prs: [1],",
      "+  title: 'This About page', prs: [1, 2],",
    ].join('\n')
    expect(changedSentences(diff)).toEqual(['줄마다 맞아요 를 누릅니다.'])
    expect(summaryLines('* 소개 이력 표\n\n* 고치기 탭\n\nCo-Authored-By: X <x@y>\nhttps://claude.ai/code/1')).toEqual(['소개 이력 표', '고치기 탭'])
  })
})
