// 맡긴 일 ↔ 흐름 점 잇기와 결과 승인 (10/27 결정 "맡긴 일과 흐름 점 잇기")
import fs from 'node:fs'
import path from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import YAML from 'yaml'
import { pairSuggestions } from '@rw/core'
import { app, R, repo, useSampleApp } from './testkit.js'

useSampleApp()

const flowDir = () => path.join(repo, 'workbench', 'flow')
const taskDir = () => path.join(repo, 'workbench', 'tasks')
const put = (id: string, text: string) => fs.writeFileSync(path.join(flowDir(), `${id}.yaml`), text.trim() + '\n')
const dot = (id: string) => YAML.parse(fs.readFileSync(path.join(flowDir(), `${id}.yaml`), 'utf8'))
const taskText = (id: string) => fs.readFileSync(path.join(taskDir(), `${id}.md`), 'utf8')
const getTask = async (id: string) => (await app.inject({ method: 'GET', url: `${R}/tasks/${id}` })).json().task
const post = async (id: string, what: string, payload: object) => app.inject({ method: 'POST', url: `${R}/tasks/${id}/${what}`, payload: { ...payload, baseHash: (await getTask(id)).hash } })
const make = async (payload: object) => (await app.inject({ method: 'POST', url: `${R}/tasks`, payload })).json().task
/** 에이전트가 결과를 낸 것처럼 */
function result(id: string, conclusion: string) {
  const file = path.join(taskDir(), `${id}.md`)
  fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('state: working', `state: result\nresult-at: 2026-10-27 10:00\nconclusion: ${conclusion}\nend-check: pass`))
}

beforeEach(() => {
  for (const d of [flowDir(), taskDir()]) { fs.rmSync(d, { recursive: true, force: true }); fs.mkdirSync(d, { recursive: true }) }
  put('q', 'format: 1\nkind: question\nprogress: active\nshort: 되나\ntitle: 다섯 색이면 되나\ntopics: [coloring]\ndate: 2026-10-20\nfields:\n  question: 다섯 색이면 되나?')
  put('c', 'format: 1\nkind: calc\nprogress: active\nshort: 수치\ntitle: 무작위 그래프\ndate: 2026-10-21\nfrom: [{ id: q, type: origin }]\nfields:\n  goal: 세어 본다')
  put('f', 'format: 1\nkind: finding\nprogress: done\nresult: solved\nshort: 명제\ntitle: 이미 있는 명제\ndate: 2026-10-22\nfields:\n  statement: 된다')
})

describe('잇기 (사용자가 누를 때만)', () => {
  it('글에 적힌 점 이름은 짝 제안일 뿐 파일을 고치지 않고, 잇기를 누르면 topic 뒤에 flow 한 줄을 쓴다', async () => {
    const t = await make({ title: '세어 보기', task: '흐름 점 c를 끝낸다', topic: 'coloring' })
    const before = taskText(t.id)
    const nodes = (await app.inject({ method: 'GET', url: `${R}/flow` })).json().nodes
    expect(pairSuggestions(nodes, [await getTask(t.id)]).map((p) => p.dots)).toEqual([['c']])
    expect(taskText(t.id)).toBe(before)
    const r = await post(t.id, 'flow', { flow: 'c' })
    expect(r.statusCode).toBe(200)
    expect(r.json().task.flow).toBe('c')
    expect(taskText(t.id)).toMatch(/\ntopic: coloring\nflow: c\n/)
    // 이은 일은 더 제안하지 않는다
    expect(pairSuggestions(nodes, [r.json().task])).toEqual([])
    // 없는 점 · 모양이 틀린 id는 400, 풀기(null)는 줄을 지운다
    expect((await post(t.id, 'flow', { flow: 'nope' })).statusCode).toBe(400)
    expect((await post(t.id, 'flow', { flow: '../x' })).statusCode).toBe(400)
    expect((await post(t.id, 'flow', { flow: null })).json().task.flow).toBeUndefined()
    expect(taskText(t.id)).not.toContain('flow:')
    // 그새 바뀌었으면 409
    expect((await app.inject({ method: 'POST', url: `${R}/tasks/${t.id}/flow`, payload: { flow: 'c', baseHash: 'x' } })).statusCode).toBe(409)
  })
})

describe('결과 승인 → 흐름', () => {
  it('이은 질문 점은 끝남 · 해결, 결론은 새 닫는 점(승인한 명제)이 된다', async () => {
    const t = await make({ title: '다섯 색 수치 확인', task: '판정', topic: 'coloring' })
    await post(t.id, 'flow', { flow: 'q' })
    result(t.id, '1000개 모두 다섯 색 안에 들었다.')
    const r = await post(t.id, 'judge', { verdict: 'approve' })
    expect(r.statusCode).toBe(200)
    const { task, flow } = r.json()
    expect(task.state).toBe('done')
    expect(flow.closed).toBe('q')
    expect(dot('q')).toMatchObject({ progress: 'done', result: 'solved' })
    const made = dot(flow.added)
    expect(made).toMatchObject({ kind: 'finding', progress: 'done', short: '다섯 색 수치 확인', from: [{ id: 'q', type: 'origin' }], task: t.id, by: 'claude-code', topics: ['coloring'], fields: { statement: '1000개 모두 다섯 색 안에 들었다.' } })
    expect(made.evidence[0]).toMatchObject({ kind: 'other', file: task.file })
    expect(made.judgments).toEqual([expect.objectContaining({ by: 'user', verdict: 'approve' })])
    // 새 명제는 판단 대기열에 오르지 않는다
    const nodes = (await app.inject({ method: 'GET', url: `${R}/flow` })).json().nodes
    expect(nodes.find((n: { id: string }) => n.id === flow.added).queued).toBeFalsy()
  })

  it('이은 작업 점은 결과 칸이 비었으면 결론으로 채운다. 근거가 이어진 선은 support', async () => {
    const t = await make({ title: '세어 보기', task: '판정' })
    await post(t.id, 'flow', { flow: 'c' })
    result(t.id, '한계 안에 들었다.')
    const { flow } = (await post(t.id, 'judge', { verdict: 'approve' })).json()
    expect(dot('c')).toMatchObject({ progress: 'done', result: 'solved', fields: { goal: '세어 본다', result: '한계 안에 들었다.' } })
    expect(dot(flow.added).from).toEqual([{ id: 'c', type: 'support' }])
  })

  it('잇지 않았거나, 이은 점이 이미 끝났거나 명제면 흐름은 그대로', async () => {
    const before = fs.readFileSync(path.join(flowDir(), 'f.yaml'), 'utf8')
    const a = await make({ title: '안 이음', task: '흐름 점 q를 본다' })
    result(a.id, '된다.')
    expect((await post(a.id, 'judge', { verdict: 'approve' })).json().flow).toBeUndefined()
    expect(dot('q').progress).toBe('active')
    const b = await make({ title: '명제에 이음', task: '판정' })
    await post(b.id, 'flow', { flow: 'f' })
    result(b.id, '된다.')
    expect((await post(b.id, 'judge', { verdict: 'approve' })).json().flow).toBeUndefined()
    expect(fs.readFileSync(path.join(flowDir(), 'f.yaml'), 'utf8')).toBe(before)
    expect(fs.readdirSync(flowDir()).filter((x) => x.endsWith('.yaml'))).toHaveLength(3)
  })

  it('수정 요청은 흐름을 바꾸지 않는다', async () => {
    const t = await make({ title: '세어 보기', task: '판정' })
    await post(t.id, 'flow', { flow: 'c' })
    result(t.id, '된다.')
    expect((await post(t.id, 'judge', { verdict: 'send-back', note: '다시' })).json().flow).toBeUndefined()
    expect(dot('c').progress).toBe('active')
  })
})
