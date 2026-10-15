// 기록의 쓴 이(by)와 이어 쓰기 (10/15): 에이전트가 쓴 질문은 사용자 차례, 사용자가 이어 쓰면 대화로 덧붙는다
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { addComment, isUserTurnRecord, parseComments, pendingQuestions, readComments, userTurnRecords } from './comments.js'
import { replyToRecord } from './ask.js'
import { app, R, useSampleApp } from './testkit.js'

useSampleApp()

let root: string
let repository: string
beforeEach(() => {
  repository = fs.mkdtempSync(path.join(os.tmpdir(), 'rw-record-by-'))
  root = path.join(repository, 'workbench')
  fs.mkdirSync(root)
})
afterEach(() => fs.rmSync(repository, { recursive: true, force: true }))

const at = new Date(2026, 9, 15, 14, 20)
const file = (t: string) => fs.readFileSync(path.join(root, 'comments', `${t}.md`), 'utf8')

describe('기록의 쓴 이 (by)', () => {
  it('정보 줄에 by를 쓰고 읽는다. 없으면 사용자가 쓴 것', () => {
    const { entry } = addComment(root, 'project', { kind: '질문', title: '프로젝트', text: '이 정의로 괜찮을까요?', by: 'claude' }, at)
    expect(entry.by).toBe('claude')
    expect(file('project')).toContain('<!-- rw: {"by":"claude"} -->\n- 상태: 대기')
    const mine = addComment(root, 'project', { kind: '질문', title: '프로젝트', text: '내 질문' }, at).entry
    expect(mine.by).toBeUndefined()
    expect(isUserTurnRecord(entry)).toBe(true)
    expect(isUserTurnRecord(mine)).toBe(false)
  })

  it('규칙에 맞지 않는 손으로 쓴 by는 읽지 않는다', () => {
    const f = parseComments('project', '# 코멘트 · p\n\n## c-1 · 질문 · 전체\n<!-- rw: {"by":"Claude Code!"} -->\n- 상태: 대기\n\n물음\n')
    expect(f.comments[0]!.by).toBeUndefined()
  })

  it('에이전트가 물은 질문은 에이전트 함에 들지 않고 사용자 차례로 센다', () => {
    addComment(root, 'project', { kind: '질문', title: '프로젝트', text: '확인 부탁', by: 'codex' }, at)
    addComment(root, 'project', { kind: '질문', title: '프로젝트', text: '내 질문' }, at)
    addComment(root, 'project', { kind: '메모', title: '프로젝트', text: '에이전트 메모', by: 'codex' }, at)
    expect(pendingQuestions(root).map((q) => q.body)).toEqual(['내 질문'])
    expect(userTurnRecords(root)).toBe(1)
  })
})

describe('이어 쓰기', () => {
  it('사용자가 쓴 질문에 이어 쓰면 사용자 답을 덧붙이고 다시 대기(에이전트 차례)', () => {
    const { entry } = addComment(root, 'project', { kind: '질문', title: '프로젝트', text: '왜?' }, at)
    const after = replyToRecord(root, 'project', entry.id, '식 (3) 말고 (4)도요', new Date(2026, 9, 15, 14, 30))
    const q = after.comments[0]!
    expect(q.state).toBe('대기')
    expect(q.answers).toEqual([{ by: '사용자', at: '2026-10-15 14:30', body: '식 (3) 말고 (4)도요' }])
    expect(file('project')).toContain('### 답 · 사용자 · 2026-10-15 14:30\n\n식 (3) 말고 (4)도요\n\n- 상태: 대기')
  })

  it('에이전트가 물은 질문에 이어 쓰면 답함, 사용자 차례가 끝난다', () => {
    const { entry } = addComment(root, 'project', { kind: '질문', title: '프로젝트', text: '이 부호가 맞나요?', by: 'claude' }, at)
    const q = replyToRecord(root, 'project', entry.id, '맞아요').comments[0]!
    expect(q.state).toBe('답함')
    expect(isUserTurnRecord(q)).toBe(false)
    expect(userTurnRecords(root)).toBe(0)
  })

  it('메모에는 이어 쓰지 않고, 빈 글은 받지 않는다', () => {
    const memo = addComment(root, 'project', { kind: '메모', title: '프로젝트', text: '메모' }, at).entry
    expect(() => replyToRecord(root, 'project', memo.id, '더')).toThrow(/질문이나 지시가 없음|No such question/)
    const q = addComment(root, 'project', { kind: '지시', title: '프로젝트', text: '그림 그려 줘' }, at).entry
    expect(() => replyToRecord(root, 'project', q.id, '  ')).toThrow()
    expect(readComments(root, 'project').comments.find((c) => c.id === q.id)!.answers).toEqual([])
  })
})

describe('기록 API: by와 이어 쓰기 (계약 검사 포함)', () => {
  it('덧붙이기는 by를 받고, 규칙에 맞지 않으면 400', async () => {
    const ok = await app.inject({ method: 'POST', url: `${R}/comments/project`, payload: { kind: '질문', title: '프로젝트', text: '봐 주세요', by: 'claude-code' } })
    expect(ok.statusCode).toBe(200)
    expect(ok.json().entry).toMatchObject({ by: 'claude-code', state: '대기' })
    const bad = await app.inject({ method: 'POST', url: `${R}/comments/project`, payload: { kind: '질문', title: '프로젝트', text: 'x', by: 'Claude Code' } })
    expect(bad.statusCode).toBe(400)
  })

  it('이어 쓰기 뒤 에이전트가 다시 답하면 대화가 차례로 쌓이고 답함이 된다', async () => {
    const id = (await app.inject({ method: 'POST', url: `${R}/comments/project`, payload: { kind: '질문', title: '프로젝트', text: '처음 물음' } })).json().entry.id as string
    await app.inject({ method: 'POST', url: `${R}/comments/project/${id}/answers`, payload: { by: 'claude-code', body: '첫 답' } })
    const replied = await app.inject({ method: 'POST', url: `${R}/comments/project/${id}/reply`, payload: { text: '이어 물음' } })
    expect(replied.statusCode).toBe(200)
    expect(replied.json().comments.find((c: { id: string }) => c.id === id)).toMatchObject({ state: '대기', answers: [{ by: 'claude-code' }, { by: '사용자', body: '이어 물음' }] })
    const again = await app.inject({ method: 'POST', url: `${R}/comments/project/${id}/answers`, payload: { by: 'claude-code', body: '둘째 답' } })
    expect(again.json().comments.find((c: { id: string }) => c.id === id)).toMatchObject({ state: '답함', answers: [{ body: '첫 답' }, { body: '이어 물음' }, { body: '둘째 답' }] })
    expect((await app.inject({ method: 'POST', url: `${R}/comments/project/${id}/reply`, payload: {} })).statusCode).toBe(400)
    expect((await app.inject({ method: 'POST', url: `${R}/comments/project/c-nope/reply`, payload: { text: 'x' } })).statusCode).toBe(404)
  })

  it('에이전트가 물은 질문은 왼쪽 띠의 수(research-issues)에 들고, 답하면 빠진다', async () => {
    const rid = R.split('/').pop()!
    const before = (await app.inject({ method: 'GET', url: '/api/research-issues' })).json()
    const id = (await app.inject({ method: 'POST', url: `${R}/comments/project`, payload: { kind: '질문', title: '프로젝트', text: '확인해 주세요', by: 'claude' } })).json().entry.id as string
    const asked = (await app.inject({ method: 'GET', url: '/api/research-issues' })).json()
    expect(asked.records[rid]).toBe((before.records[rid] ?? 0) + 1)
    expect(asked.counts[rid]).toBe((before.counts[rid] ?? 0) + 1)
    await app.inject({ method: 'POST', url: `${R}/comments/project/${id}/reply`, payload: { text: '확인했어요' } })
    expect((await app.inject({ method: 'GET', url: '/api/research-issues' })).json().records[rid]).toBe(before.records[rid] ?? 0)
  })
})
