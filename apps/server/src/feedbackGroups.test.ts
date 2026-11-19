// 피드백 묶어 맡기기 (11/19 "둘 다 묶기"): 같은 화면의 수정끼리, 질문 · 제안끼리 한 대화에
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { agentTurns } from '@rw/core'
import type { AgentRunner, RunEvent, RunInput } from './agentChats.js'
import { buildApp } from './app.js'
import { sampleAppWork } from './appWorktree.js'
import { listAllFeedback, type FeedbackListItem } from './feedback.js'
import { BUNDLE_MAX, bundlesOf, keysOf, needsCode, screenOf } from './feedbackGroups.js'

const FIX = path.resolve(import.meta.dirname, '../../../fixtures/sandbox-feedback')
const item = (time: string, kind: string, target: string, extra: Partial<FeedbackListItem> = {}): FeedbackListItem =>
  ({ key: `2026-11-19 ${time} ${target}`, date: '2026-11-19', time, kind, target, text: target, n: 1, ...extra }) as FeedbackListItem

describe('묶기', () => {
  it('수정은 같은 화면끼리, 질문 · 제안은 모두 한 묶음으로, 오래 기다린 것이 든 묶음부터', () => {
    const b = bundlesOf([
      item('10:00', '질문', '홈 › 할 일'),
      item('09:00', '수정', '피드백 › 머리줄'),
      item('09:30', '수정', '홈 › 프로젝트 카드'),
      item('11:00', '수정', '피드백 › 표'),
      item('12:00', '제안', '노트 화면 › 툴바'),
    ])
    expect(b.map((x) => [x.code, x.screen ?? '', x.items.map((e) => e.time)])).toEqual([
      [true, '피드백', ['09:00', '11:00']],
      [true, '홈', ['09:30']],
      [false, '', ['10:00', '12:00']],
    ])
  })
  it('진행한 제안은 고치는 쪽, 한 묶음은 BUNDLE_MAX개까지', () => {
    expect(needsCode(item('09:00', '제안', 'a', { review: { verdict: '진행', at: '2026-11-19T10:00' } } as Partial<FeedbackListItem>))).toBe(true)
    expect(needsCode(item('09:00', '제안', 'a'))).toBe(false)
    expect(screenOf(item('09:00', '수정', '노트 화면 › 본문'))).toBe('노트 화면')
    const many = Array.from({ length: BUNDLE_MAX + 2 }, (_, i) => item(`09:0${i}`, '질문', `홈 › ${i}`))
    expect(bundlesOf(many).map((x) => x.items.length)).toEqual([BUNDLE_MAX, 2])
    expect(keysOf({ feedback: 'a' })).toEqual(['a'])
    expect(keysOf({ feedback: 'a', bundle: ['a', 'b'] })).toEqual(['a', 'b'])
  })
})

describe('묶어 맡기기 API', () => {
  let tmp: string
  let fb: string
  let app: ReturnType<typeof buildApp>
  const seen: RunInput[] = []
  const runner: AgentRunner = async function* (input): AsyncIterable<RunEvent> {
    seen.push(input)
    yield { type: 'session', id: 's1' }
    yield { type: 'result', ok: true }
  }
  beforeAll(() => {
    tmp = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'rw-fbgroup-'))
    fb = path.join(tmp, 'feedback')
    fs.cpSync(FIX, fb, { recursive: true })
    app = buildApp({ configDir: path.join(tmp, 'config'), agentRunner: runner, agentApp: sampleAppWork(path.join(tmp, 'wt')), feedbackDir: fb })
  })
  afterAll(async () => {
    await app.close()
    fs.rmSync(tmp, { recursive: true, force: true })
  })

  it('여러 키를 한 대화에 맡기고, 처리 기록은 key로 항목을 고른다', async () => {
    const keys = listAllFeedback(fb).filter((e) => agentTurns(e).length).slice(0, 2).map((e) => e.key)
    expect(keys).toHaveLength(2)
    const res = await app.inject({ method: 'POST', url: '/api/feedback/hand-off', payload: { keys } })
    expect(res.statusCode, res.body).toBe(200)
    const chat = res.json().chat
    expect(chat).toMatchObject({ feedback: keys[0], bundle: keys })
    expect(chat.title).toMatch(/^피드백 2개 · /)
    await vi.waitFor(async () => expect((await app.inject({ method: 'GET', url: `/api/agent-chats/${chat.id}` })).json().chat.state).toBe('idle'))
    for (const k of keys) expect(seen.at(-1)!.prompt).toContain(`- key: ${k}`)
    expect(seen.at(-1)!.brief).toContain('pass key')
    // 묶음은 key가 있어야 하고, 맡지 않은 키는 거절
    const answer = (payload: object) => app.inject({ method: 'POST', url: `/api/agent-chats/${chat.id}/feedback/answer`, payload })
    expect((await answer({ state: '답변', note: '답변: 있음' })).statusCode).toBe(400)
    expect((await answer({ key: 'nope', state: '답변', note: '답변: 있음' })).statusCode).toBe(400)
    const r = await answer({ key: keys[1], state: '답변', note: '답변: 있음\n그렇습니다.' })
    expect(r.statusCode, r.body).toBe(200)
    expect(r.json().key).toBe(keys[1])
    expect(listAllFeedback(fb).find((e) => e.key === keys[1])!.status!.state).toBe('답변')
  })
})
