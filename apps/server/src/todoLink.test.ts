import { describe, expect, it } from 'vitest'
import path from 'node:path'
import { app, R, repo, useSampleApp } from './testkit.js'
import { pendingQuestions } from './comments.js'

// 할 일에 에이전트에게 묻기 · 맡기기 (10/19 결정): 질문 · 지시를 같은 파일의 할 일에 잇는다
useSampleApp()

const add = (payload: Record<string, unknown>) => app.inject({ method: 'POST', url: `${R}/comments/project`, payload: { title: '이 프로젝트', ...payload } })

describe('할 일에 잇는 질문 · 지시', () => {
  it('지시가 할 일 id를 가지고, 에이전트 함에 할 일 글이 함께 간다', async () => {
    const todo = (await add({ kind: '할 일', text: '일괄 검토 (A1–A3)' })).json().entry
    const r = await add({ kind: '지시', text: 'B 묶음만 다시 정리해 줘', todo: todo.id })
    expect(r.statusCode).toBe(200)
    expect(r.json().entry).toMatchObject({ kind: '지시', todo: todo.id, state: '대기' })
    const file = (await app.inject({ method: 'GET', url: `${R}/comments/project` })).json()
    expect(file.comments.find((c: { kind: string }) => c.kind === '지시').todo).toBe(todo.id)
    const pending = pendingQuestions(path.join(repo, 'workbench'), '지시').find((p) => p.body === 'B 묶음만 다시 정리해 줘')
    expect(pending?.todo).toEqual({ id: todo.id, body: '일괄 검토 (A1–A3)' })
  })

  it('없는 할 일이나 메모에는 이을 수 없다', async () => {
    expect((await add({ kind: '지시', text: 'x', todo: 'c-20990101-0000' })).statusCode).toBe(400)
    const todo = (await add({ kind: '할 일', text: '다른 할 일' })).json().entry
    expect((await add({ kind: '메모', text: 'y', todo: todo.id })).statusCode).toBe(400)
  })
})
