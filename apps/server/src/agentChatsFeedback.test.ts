// 피드백 맡기기 (2단계 나, 10/21 "앱 안 대화 + CI가 시험"): 피드백 하나를 앱 고치기 대화에 맡기고, 그 대화가 처리 기록을 앱을 거쳐 적는다
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import YAML from 'yaml'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { AgentChats, appBriefFor, feedbackPrompt, pictureImage, type AgentRunner, type RunEvent, type RunInput } from './agentChats.js'
import { buildApp } from './app.js'
import { DEFAULT_AGENT_SETTINGS, type AgentSettings } from '@rw/core'
import { sampleAppWork, type AppWork } from './appWorktree.js'
import { listAllFeedback, writeFeedbackAnswer } from './feedback.js'

const FIX = path.resolve(import.meta.dirname, '../../../fixtures/sandbox-feedback')
const REWORK = '2026-10-04 10:15 사이드바 › 목차'
const NEW = '2026-10-04 13:05 노트 화면 › 본문'
const statusOf = (dir: string) => YAML.parse(fs.readFileSync(path.join(dir, 'status.yaml'), 'utf8')) as Record<string, Record<string, unknown>>

describe('처리 기록 쓰기 (writeFeedbackAnswer)', () => {
  let dir: string
  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'rw-fbanswer-'))
    fs.cpSync(FIX, dir, { recursive: true })
  })
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }))

  it('새 항목은 처리를 적고 handled_at은 시간대 없이', () => {
    writeFeedbackAnswer(dir, NEW, { state: '동의', note: '의견에 동의 (중간)\n카드 끌기는 따로 만든다.', understood: '카드 순서를 끌어서 바꾼다.' }, 'claude', new Date(2026, 9, 21, 15, 2))
    const st = statusOf(dir)[NEW]!
    expect(st).toMatchObject({ state: '동의', understood: '카드 순서를 끌어서 바꾼다.', handled_at: '2026-10-21T15:02', by: 'claude' })
    expect(listAllFeedback(dir).find((e) => e.key === NEW)!.status!.state).toBe('동의')
  })

  it('수정 요청을 다시 처리하면 그 전 처리를 revised로 옮기고 rework를 적는다', () => {
    const before = statusOf(dir)[REWORK]!
    const at = listAllFeedback(dir).find((e) => e.key === REWORK)!.review!.at
    writeFeedbackAnswer(dir, REWORK, { state: '반영', note: '수정 완료 (#300)\n경계를 끌어 너비를 바꾼다.', miss: '덜 고침', lesson: '좁은 폭도 본다.', commit: '#300', pictures: ['pictures/a.png', 'pictures/b.png'] }, 'claude', new Date(2026, 9, 21, 15, 10))
    const st = statusOf(dir)[REWORK]!
    expect(st).toMatchObject({ state: '반영', commit: '#300', rework: at, handled_at: '2026-10-21T15:10', pictures: ['pictures/a.png', 'pictures/b.png'] })
    const last = (st.revised as Record<string, unknown>[]).at(-1)!
    expect(last).toMatchObject({ at, note: before.note, miss: '덜 고침', lesson: '좁은 폭도 본다.' })
    // 다른 항목은 그대로
    expect(statusOf(dir)['2026-10-04 09:30 홈 › 할 일']).toEqual(YAML.parse(fs.readFileSync(path.join(FIX, 'status.yaml'), 'utf8'))['2026-10-04 09:30 홈 › 할 일'])
    // 다시 처리했으니 에이전트 차례가 아니다
    const e = listAllFeedback(dir).find((x) => x.key === REWORK)!
    expect(e.status!.rework).toBe(at)
  })

  it('replies만 보내면 처리는 그대로 두고 코멘트 답만 더한다', () => {
    const r = writeFeedbackAnswer(dir, NEW, { replies: [{ to: '2026-10-04T13:30', note: '네, 그렇게 합니다.' }] }, 'claude', new Date(2026, 9, 21, 15, 20))
    expect(r).toEqual({ replies: 1 })
    const st = statusOf(dir)[NEW]!
    expect(st.state).toBe('동의')
    expect(st.replies).toEqual([{ at: '2026-10-21T15:20', to: '2026-10-04T13:30', note: '네, 그렇게 합니다.', by: 'claude' }])
  })
})

describe('피드백 맡기기 API', () => {
  let tmp: string
  let fb: string
  let app: ReturnType<typeof buildApp>
  const seen: RunInput[] = []
  let gate: (() => void) | null = null
  const runner: AgentRunner = async function* (input): AsyncIterable<RunEvent> {
    seen.push(input)
    yield { type: 'session', id: 's1' }
    if (input.prompt.includes('hold')) await new Promise<void>((r) => { gate = r })
    yield { type: 'text', text: 'ok' }
    yield { type: 'result', ok: true }
  }
  const get = async (id: string) => (await app.inject({ method: 'GET', url: `/api/agent-chats/${id}` })).json().chat

  beforeAll(() => {
    tmp = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'rw-fbhand-'))
    fb = path.join(tmp, 'feedback')
    fs.cpSync(FIX, fb, { recursive: true })
    const shots = path.join(tmp, 'shots')
    fs.mkdirSync(shots)
    fs.writeFileSync(path.join(shots, 'sidebar.png'), 'PNG')
    const work: AppWork = { ...sampleAppWork(path.join(tmp, 'wt'), shots) }
    app = buildApp({ configDir: path.join(tmp, 'config'), agentRunner: runner, agentApp: work, feedbackDir: fb })
  })
  afterAll(async () => {
    await app.close()
    fs.rmSync(tmp, { recursive: true, force: true })
  })

  it('에이전트 차례인 항목을 앱 고치기 대화에 맡기고, 그 대화가 PR · 그림과 함께 처리 기록을 적는다', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/feedback/hand-off', payload: { key: REWORK } })
    expect(res.statusCode, res.body).toBe(200)
    const id = res.json().chat.id as string
    expect(res.json().chat).toMatchObject({ rid: '_app', feedback: REWORK, scope: { kind: 'app' } })
    await vi.waitFor(async () => expect((await get(id)).state).toBe('idle'))
    const input = seen.at(-1)!
    expect(input.prompt).toContain(`- key: ${REWORK}`)
    expect(input.prompt).toContain('수정 요청')
    expect(input.brief).toContain('feedback_answer')
    // 목록에서 대화와 피드백이 이어진다
    const list = (await app.inject({ method: 'GET', url: '/api/agent-chats' })).json().chats as { id: string; feedback?: string }[]
    expect(list.find((c) => c.id === id)?.feedback).toBe(REWORK)
    // 그림은 PR을 연 뒤에만
    const early = await app.inject({ method: 'POST', url: `/api/agent-chats/${id}/feedback/answer`, payload: { state: '반영', note: '수정 완료', after: 'sidebar' } })
    expect(early.statusCode).toBe(409)
    expect((await app.inject({ method: 'POST', url: `/api/agent-chats/${id}/app/submit`, payload: { title: '목차 너비', body: '' } })).statusCode).toBe(200)
    const r = await app.inject({ method: 'POST', url: `/api/agent-chats/${id}/feedback/answer`, payload: { state: '반영', note: '수정 완료 (#234)\n끌어서 바꾼다.', miss: '덜 고침', lesson: '좁은 폭도 본다.', after: 'sidebar' } })
    expect(r.statusCode, r.body).toBe(200)
    const st = statusOf(fb)[REWORK]!
    expect(st).toMatchObject({ state: '반영', commit: '#234', by: 'claude' })
    // 이 항목은 남길 때 그림이 없어 전/후 두 장을 만들지 않는다 (후 그림만 그림 폴더에)
    expect(st.pictures).toBeUndefined()
    expect(fs.readdirSync(path.join(fb, 'pictures')).some((f) => f.endsWith('-sidebar-after.png'))).toBe(true)
    // 다시 처리했으니 더는 에이전트 차례가 아니다
    expect((await app.inject({ method: 'POST', url: '/api/feedback/hand-off', payload: { key: REWORK } })).statusCode).toBe(400)
  })

  it('같은 피드백을 맡은 대화가 도는 동안 그 항목은 다시 맡기지 않는다. 모르는 키 · 맡지 않은 대화도 거절', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/feedback/hand-off', payload: { key: NEW } })
    expect(res.statusCode, res.body).toBe(200)
    const id = res.json().chat.id as string
    // 첫 차례가 끝나기 전에 같은 대화에 이어서 지시해 붙잡아 둔다
    await app.inject({ method: 'POST', url: `/api/agent-chats/${id}/messages`, payload: { text: 'hold' } })
    await vi.waitFor(() => expect(gate).not.toBeNull())
    expect((await app.inject({ method: 'POST', url: '/api/feedback/hand-off', payload: { key: NEW } })).statusCode).toBe(409)
    gate!()
    await vi.waitFor(async () => expect((await get(id)).state).toBe('idle'))
    expect((await app.inject({ method: 'POST', url: '/api/feedback/hand-off', payload: { key: 'nope' } })).statusCode).toBe(404)
    const plain = await app.inject({ method: 'POST', url: '/api/agent-chats', payload: { rid: '_app', text: '그냥 고침' } })
    const pid = plain.json().chat.id as string
    await vi.waitFor(async () => expect((await get(pid)).state).toBe('idle'))
    expect((await app.inject({ method: 'POST', url: `/api/agent-chats/${pid}/feedback/answer`, payload: { state: '답변', note: '답변: 있음' } })).statusCode).toBe(400)
    // state 없이 note만은 받지 않는다
    expect((await app.inject({ method: 'POST', url: `/api/agent-chats/${id}/feedback/answer`, payload: { note: 'x' } })).statusCode).toBe(400)
  })

  it('맡길 때 그림은 첫 지시에 붙이고, 너무 크거나 그림이 아니면 붙이지 않는다', () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'rw-pic-'))
    fs.writeFileSync(path.join(d, 'a.png'), Buffer.from([1, 2, 3]))
    fs.writeFileSync(path.join(d, 'big.png'), Buffer.alloc(3_600_000))
    fs.writeFileSync(path.join(d, 'a.txt'), 'x')
    expect(pictureImage(path.join(d, 'a.png'))).toEqual([{ type: 'image/png', data: 'AQID' }])
    expect(pictureImage(path.join(d, 'big.png'))).toBeUndefined()
    expect(pictureImage(path.join(d, 'a.txt'))).toBeUndefined()
    fs.rmSync(d, { recursive: true, force: true })
  })

  it('첫 지시와 안내', () => {
    const e = listAllFeedback(FIX).find((x) => x.key === REWORK)!
    const p = feedbackPrompt(e, ['수정 요청'], '/fb/pictures/x.png')
    expect(p).toContain('- key: 2026-10-04 10:15 사이드바 › 목차')
    expect(p).toContain('/fb/pictures/x.png')
    expect(p).toContain(e.review!.verdict)
    expect(appBriefFor({ branch: 'b', write: 'notes' })).not.toContain('feedback_answer')
    expect(appBriefFor({ branch: 'b', write: 'notes', feedback: true })).toContain('feedback_answer')
  })
})

describe('피드백 대화 돌보기 (설정 › 에이전트 "앱 피드백")', () => {
  let tmp: string
  let fb: string
  let chats: AgentChats
  const prompts: string[] = []
  let ci: { done: boolean; ok: boolean; log?: string; link: string } = { done: false, ok: false, link: 'r1' }
  const merged: string[] = []
  let inApp: boolean | undefined
  let conflicted = false
  let settings: AgentSettings = { ...DEFAULT_AGENT_SETTINGS }
  const runner: AgentRunner = async function* (input): AsyncIterable<RunEvent> {
    prompts.push(input.prompt)
    yield { type: 'result', ok: true } as RunEvent
  }
  const idle = (id: string) => vi.waitFor(() => expect(chats.get(id).state).not.toBe('running'))

  beforeAll(() => {
    tmp = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'rw-fbtick-'))
    fb = path.join(tmp, 'feedback')
    fs.cpSync(FIX, fb, { recursive: true })
    const base = sampleAppWork(path.join(tmp, 'wt'))
    const work: AppWork = {
      ...base,
      async checks(dir, branch) {
        const r = await base.checks(dir, branch)
        return { ...r, done: ci.done, ok: ci.ok, checks: [{ name: 'check', state: ci.done ? (ci.ok ? 'SUCCESS' : 'FAILURE') : 'IN_PROGRESS', link: ci.link }], ...(ci.log ? { log: ci.log } : {}) }
      },
      async merge(_dir, branch) { merged.push(branch); return { number: 234, sha: 'abc1234def' } },
      async conflicted() { return conflicted },
    }
    chats = new AgentChats({
      dir: path.join(tmp, 'chats'), runner, limit: 2,
      project: () => ({ repo: tmp, title: 'x' }), readable: () => [], extraDirs: () => [], notify: () => {},
      app: work, feedback: { dir: fb }, settings: () => settings, inApp: async () => inApp,
    })
  })
  afterAll(() => {
    chats.stopAll()
    fs.rmSync(tmp, { recursive: true, force: true })
  })

  it('끄면 맡기지 못한다', () => {
    settings = { ...settings, feedback: 'off' }
    expect(chats.handOffOk).toBe(false)
    expect(() => chats.handOff(NEW)).toThrow()
    settings = { ...settings, feedback: 'manual' }
    expect(chats.handOffOk).toBe(true)
  })

  it('CI 빨강은 실패 기록을 대화에 다시 보내고(같은 실패는 한 번), 초록이면 설정대로 합치고(main과 부딪히면 풀라고 한 번), 앱에 들어오면 반영됨', async () => {
    const id = chats.handOff(REWORK).id
    await idle(id)
    await chats.appSubmit(id, { title: '목차', body: '' })
    await chats.tickFeedback()
    expect(merged).toEqual([])
    ci = { done: true, ok: false, log: 'test failed: a.test.ts', link: 'r1' }
    await chats.tickFeedback()
    await idle(id)
    expect(prompts.at(-1)).toContain('test failed: a.test.ts')
    const n = prompts.length
    await chats.tickFeedback()
    await idle(id)
    expect(prompts.length).toBe(n)
    ci = { done: true, ok: true, link: 'r2' }
    settings = { ...settings, merge: 'never' }
    await chats.tickFeedback()
    expect(merged).toEqual([])
    settings = { ...settings, merge: 'approved' }
    await chats.tickFeedback()
    expect(merged).toEqual([])
    settings = { ...settings, merge: 'green' }
    // main과 부딪히면 합치지 않고, 풀라고 한 번만 보낸다
    conflicted = true
    await chats.tickFeedback()
    await idle(id)
    expect(merged).toEqual([])
    expect(prompts.at(-1)).toContain('git merge origin/main')
    const m = prompts.length
    await chats.tickFeedback()
    await idle(id)
    expect(prompts.length).toBe(m)
    conflicted = false
    await chats.tickFeedback()
    expect(merged).toHaveLength(1)
    const row = chats.list().find((c) => c.id === id)!
    expect(row.merged).toBe('abc1234def')
    expect(row.shipped).toBeFalsy()
    await chats.tickFeedback()
    expect(merged).toHaveLength(1)
    inApp = true
    await chats.tickFeedback()
    expect(chats.list().find((c) => c.id === id)!.shipped).toBe(true)
  })

  it('바로 맡기기는 쉬는 동안 에이전트 차례 하나를 맡고, 맡은 뒤 바뀐 것이 없으면 다시 맡지 않는다', async () => {
    settings = { ...settings, feedback: 'instant' }
    const before = chats.list().length
    await chats.tickFeedback()
    expect(chats.list().length).toBe(before + 1)
    const made = chats.list().find((c) => c.feedback && c.feedback !== REWORK)!
    expect(made).toBeTruthy()
    await idle(made.id)
    const keys = new Set(chats.list().map((c) => c.feedback))
    await chats.tickFeedback()
    for (const c of chats.list()) expect(keys.has(c.feedback)).toBe(true)
    settings = { ...settings, feedback: 'manual' }
  })
})
