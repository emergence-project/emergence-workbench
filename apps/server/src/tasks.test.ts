// 맡긴 일 (작업 탭, workbench/tasks/*.md)
import fs from 'node:fs'
import path from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import YAML from 'yaml'
import { generateStatus } from './agentStatus.js'
import { app, R, repo, useSampleApp } from './testkit.js'
import { classify } from './watcher.js'
import { Workbench } from './workbench.js'

useSampleApp()

const dir = () => path.join(repo, 'workbench', 'tasks')
beforeEach(() => fs.rmSync(dir(), { recursive: true, force: true }))
const front = (id: string) => YAML.parse(/^---\n([\s\S]*?)\n---/.exec(fs.readFileSync(path.join(dir(), `${id}.md`), 'utf8'))![1]!)
const make = (payload: object) => app.inject({ method: 'POST', url: `${R}/tasks`, payload })
const post = async (id: string, what: string, payload: object) => app.inject({ method: 'POST', url: `${R}/tasks/${id}/${what}`, payload: 'baseHash' in payload ? payload : { ...payload, baseHash: (await app.inject({ method: 'GET', url: `${R}/tasks/${id}` })).json().task?.hash ?? 'none' } })

/** 에이전트가 결과를 채운 것처럼 머리말을 덧붙인다 (주석과 본문은 그대로) */
function agentWrites(id: string, extra: string, body = '') {
  const file = path.join(dir(), `${id}.md`)
  const text = fs.readFileSync(file, 'utf8')
  fs.writeFileSync(file, text.replace(/\n---\n/, `\n${extra.trim()}\n---\n`) + body)
}

describe('맡기기', () => {
  it('제목·작업 내용으로 workbench/tasks/<날짜>-<이름>.md를 만들고, 목록에 보인다', async () => {
    const r = await make({ title: 'Coloring count 재계산', task: 'legacy와 대조한다', topic: 'model', agent: 'codex', references: ['legacy/solver.py'], avoid: '공개 함수 이름은 그대로' })
    expect(r.statusCode).toBe(200)
    const t = r.json().task
    expect(t.id).toMatch(/^\d{4}-\d{2}-\d{2}-coloring-count$/)
    expect(t).toMatchObject({ file: `workbench/tasks/${t.id}.md`, title: 'Coloring count 재계산', topic: 'model', agent: 'codex', state: 'working', task: 'legacy와 대조한다', references: ['legacy/solver.py'], avoid: '공개 함수 이름은 그대로', asks: [], issues: [], next: [] })
    expect(t.endCondition).toBeUndefined()
    expect(t.body).toContain('## 요약과 결론')
    // 한글만 있는 제목은 task, 같은 이름은 -2
    const a = (await make({ title: '유한온도 순서', task: '판정' })).json().task
    const b = (await make({ title: '유한온도 순서', task: '판정', endCondition: '세 크기에서 같다' })).json().task
    expect(a.id).toMatch(/-task$/)
    expect(b.id).toMatch(/-task-2$/)
    expect(b).toMatchObject({ agent: 'claude-code', endCondition: '세 크기에서 같다' })
    const list = (await app.inject({ method: 'GET', url: `${R}/tasks` })).json().tasks
    expect(list.map((x: { id: string }) => x.id).sort()).toEqual([t.id, a.id, b.id].sort())
    // 빈 제목·내용, 이상한 주제 id는 거절
    expect((await make({ title: ' ', task: 'x' })).statusCode).toBe(400)
    expect((await make({ title: 'x', task: '' })).statusCode).toBe(400)
    expect((await make({ title: 'x', task: 'y', topic: '../a' })).statusCode).toBe(400)
    expect((await app.inject({ method: 'GET', url: `${R}/tasks/../../x` })).statusCode).toBeGreaterThanOrEqual(400)
  })

  it('머리말이 없거나 깨진 파일은 정상 작업으로 읽지 않고 원문은 그대로 둔다', async () => {
    fs.mkdirSync(dir(), { recursive: true })
    fs.writeFileSync(path.join(dir(), '2026-10-01-plain.md'), '# 그냥 글\n')
    fs.writeFileSync(path.join(dir(), '2026-10-01-broken.md'), '---\ntitle: [\n---\n')
    expect((await app.inject({ method: 'GET', url: `${R}/tasks` })).json().tasks).toEqual([])
    expect(fs.readFileSync(path.join(dir(), '2026-10-01-plain.md'), 'utf8')).toBe('# 그냥 글\n')
  })
})

describe('결과와 판단', () => {
  const result = `
result-at: 2026-10-06 12:59
conclusion: J_Γ/J_PD가 0.01을 넘으면 대수 구간이 닫힌다.
end-check: pass
ask:
  - 이 결론을 연구노트에 반영할까요?
  - { q: 어디에 넣을까요?, options: [결론 절, 새 절, 부록] }
issues:
  - { text: L=48 미계산, impact: 결론의 숫자를 바꿀 수 있음, next: 1 }
  - 진폭 3배는 평형에 이르지 못함
next:
  - { task: L=48 한 점 더, end-condition: 오차 ±0.001 이하 }
  - 결론 절 초안
outputs: [data/results.csv]
check: { machine: 수치 대조 통과 }  # 에이전트 주석
state: result`

  it('에이전트가 채운 결과를 읽는다', async () => {
    const t = (await make({ title: 'V clock', task: '판정', endCondition: '세 크기' })).json().task
    agentWrites(t.id, result.replace('state: result', ''), '\n쉬운 말 풀이\n')
    fs.writeFileSync(path.join(dir(), `${t.id}.md`), fs.readFileSync(path.join(dir(), `${t.id}.md`), 'utf8').replace('state: working', 'state: result'))
    const got = (await app.inject({ method: 'GET', url: `${R}/tasks/${t.id}` })).json().task
    expect(got).toMatchObject({
      state: 'result', resultAt: '2026-10-06 12:59', conclusion: 'J_Γ/J_PD가 0.01을 넘으면 대수 구간이 닫힌다.', endCheck: 'pass',
      asks: [{ q: '이 결론을 연구노트에 반영할까요?', options: [] }, { q: '어디에 넣을까요?', options: ['결론 절', '새 절', '부록'] }],
      issues: [{ text: 'L=48 미계산', impact: '결론의 숫자를 바꿀 수 있음', next: 1 }, { text: '진폭 3배는 평형에 이르지 못함' }],
      next: [{ task: 'L=48 한 점 더', endCondition: '오차 ±0.001 이하' }, { task: '결론 절 초안' }],
      outputs: ['data/results.csv'], check: { machine: '수치 대조 통과' },
    })
    expect(got.body).toContain('쉬운 말 풀이')
  })

  it('승인하면 해결(done)과 사람 검증을 적고, 일지에 판단 시간을 남긴다. 주석과 본문은 그대로', async () => {
    const t = (await make({ title: 'V clock', task: '판정', endCondition: '세 크기' })).json().task
    agentWrites(t.id, result, '\n본문은 그대로\n')
    fs.writeFileSync(path.join(dir(), `${t.id}.md`), fs.readFileSync(path.join(dir(), `${t.id}.md`), 'utf8').replace('state: working\n', ''))
    const { hash } = (await app.inject({ method: 'GET', url: `${R}/tasks/${t.id}` })).json().task
    // 그새 바뀌었으면 409와 지금 해시
    const stale = await post(t.id, 'judge', { verdict: 'approve', baseHash: 'x' })
    expect(stale.statusCode).toBe(409)
    expect(stale.json().currentHash).toBe(hash)
    const r = await post(t.id, 'judge', { verdict: 'approve', seconds: 250, baseHash: hash })
    expect(r.statusCode).toBe(200)
    expect(r.json().task).toMatchObject({ state: 'done', check: { machine: '수치 대조 통과', human: expect.stringMatching(/^승인 · \d{4}-/) } })
    expect(r.json().task.judged).toEqual([expect.objectContaining({ verdict: 'approve', seconds: 250 })])
    const text = fs.readFileSync(path.join(dir(), `${t.id}.md`), 'utf8')
    expect(text).toContain('# 에이전트 주석')
    expect(text.endsWith('\n본문은 그대로\n')).toBe(true)
    const journal = (await app.inject({ method: 'GET', url: `${R}/journal` })).json().entries
    expect(journal[0]).toMatchObject({ kind: 'status', target: '연구', text: '판단 · V clock · 승인 · 4분' })
    // 끝난 일은 다시 승인하지 않는다
    expect((await post(t.id, 'judge', { verdict: 'approve' })).statusCode).toBe(409)
  })

  it('수정 요청은 고칠 것 한 줄이 필요하고 진행(working)으로 돌린다. 멈춤 · 폐기', async () => {
    const t = (await make({ title: 'V clock', task: '판정', endCondition: '세 크기' })).json().task
    expect((await post(t.id, 'judge', { verdict: 'send-back' })).statusCode).toBe(400)
    const r = await post(t.id, 'judge', { verdict: 'send-back', note: '  L=48도  넣기 ' })
    expect(r.json().task).toMatchObject({ state: 'working', judged: [{ verdict: 'send-back', note: 'L=48도 넣기' }] })
    expect((await post(t.id, 'judge', { verdict: 'pause' })).json().task.state).toBe('paused')
    expect((await post(t.id, 'judge', { verdict: 'discard' })).json().task.state).toBe('stopped')
    expect((await post(t.id, 'judge', { verdict: 'nope' })).statusCode).toBe(400)
  })

  it('종결 조건 제안을 승인하면 제안을 end-condition으로 옮기고 진행으로', async () => {
    const t = (await make({ title: 'coloring', task: '대조' })).json().task
    agentWrites(t.id, 'proposal:\n  end-condition: [띠 에너지 1e-8 이내, 바닥 에너지 1e-10 이내]\n  reason: legacy 정밀도')
    fs.writeFileSync(path.join(dir(), `${t.id}.md`), fs.readFileSync(path.join(dir(), `${t.id}.md`), 'utf8').replace('state: working', 'state: proposed'))
    const got = (await app.inject({ method: 'GET', url: `${R}/tasks/${t.id}` })).json().task
    expect(got).toMatchObject({ state: 'proposed', proposal: { endCondition: ['띠 에너지 1e-8 이내', '바닥 에너지 1e-10 이내'], reason: 'legacy 정밀도' } })
    const r = (await post(t.id, 'judge', { verdict: 'approve' })).json().task
    expect(r).toMatchObject({ state: 'working', endCondition: '1) 띠 에너지 1e-8 이내 2) 바닥 에너지 1e-10 이내' })
    expect(r.proposal).toBeUndefined()
    expect(front(t.id).proposal).toBeUndefined()
  })

  it('종결 조건 제안을 고쳐서 승인하면 고친 조건을 쓴다', async () => {
    const t = (await make({ title: 'coloring edit', task: '대조' })).json().task
    agentWrites(t.id, 'proposal:\n  end-condition: [띠 에너지 1e-8 이내]')
    fs.writeFileSync(path.join(dir(), `${t.id}.md`), fs.readFileSync(path.join(dir(), `${t.id}.md`), 'utf8').replace('state: working', 'state: proposed'))
    const r = (await post(t.id, 'judge', { verdict: 'approve', endCondition: ' 띠 에너지 1e-6 이내 ' })).json().task
    expect(r).toMatchObject({ state: 'working', endCondition: '띠 에너지 1e-6 이내' })
  })

  it('확인 요청에 답하면 answers에 적고, 같은 번호의 새 답이 앞의 답을 대신한다', async () => {
    const t = (await make({ title: 'V clock', task: '판정' })).json().task
    agentWrites(t.id, 'ask: [반영할까요?, 어디에?]')
    expect((await post(t.id, 'answer', { n: 3, answer: '예' })).statusCode).toBe(400)
    expect((await post(t.id, 'answer', { n: 1, answer: '' })).statusCode).toBe(400)
    await post(t.id, 'answer', { n: 1, answer: '예' })
    await post(t.id, 'answer', { n: 2, answer: '부록', note: '짧게' })
    const r = (await post(t.id, 'answer', { n: 1, answer: '아니요' })).json().task
    expect(r.answers.map((a: { n: number; answer: string; note?: string }) => [a.n, a.answer, a.note])).toEqual([[2, '부록', '짧게'], [1, '아니요', undefined]])
  })

  it('다음 지시: 승인하면 새 작업 파일(이 보고서가 참고 자료)을 만들고 started를, 빼기는 dropped를 적는다', async () => {
    const t = (await make({ title: 'V clock', task: '판정', topic: 'v-phase' })).json().task
    agentWrites(t.id, 'next:\n  - { task: L=48 한 점 더, end-condition: 오차 ±0.001 이하 }\n  - 결론 절 초안')
    const r = await post(t.id, 'next', { i: 1, action: 'start' })
    expect(r.statusCode).toBe(200)
    const { task, started } = r.json()
    expect(started).toMatchObject({ title: 'L=48 한 점 더', task: 'L=48 한 점 더', endCondition: '오차 ±0.001 이하', topic: 'v-phase', references: [t.file], state: 'working' })
    expect(task.next[0]).toMatchObject({ started: started.id })
    expect((await post(t.id, 'next', { i: 1, action: 'start' })).statusCode).toBe(409)
    expect((await post(t.id, 'next', { i: 2, action: 'drop' })).json().task.next[1]).toEqual({ task: '결론 절 초안', dropped: true })
    expect((await post(t.id, 'next', { i: 2, action: 'restore' })).json().task.next[1]).toEqual({ task: '결론 절 초안' })
    // 고쳐서 맡기기
    const edited = (await post(t.id, 'next', { i: 2, action: 'start', edit: { title: '결론 초안', task: '초안 파일 하나', endCondition: '본문은 고치지 않음' } })).json().started
    expect(edited).toMatchObject({ title: '결론 초안', task: '초안 파일 하나', endCondition: '본문은 고치지 않음' })
    expect((await post(t.id, 'next', { i: 9, action: 'drop' })).statusCode).toBe(400)
  })
})

describe('STATUS.md와 파일 감시', () => {
  it('끝나지 않은 맡긴 일과 할 것, 사용자 답을 적는다', async () => {
    const a = (await make({ title: 'coloring', task: '대조' })).json().task
    const b = (await make({ title: 'clock', task: '판정', endCondition: '세 크기' })).json().task
    agentWrites(b.id, 'ask: [반영할까요?]')
    await post(b.id, 'answer', { n: 1, answer: '예' })
    await post(b.id, 'judge', { verdict: 'send-back', note: 'L=48 넣기' })
    const c = (await make({ title: 'done one', task: 'x', endCondition: 'y' })).json().task
    await post(c.id, 'judge', { verdict: 'discard' })
    const md = generateStatus(new Workbench(path.join(repo, 'workbench')))
    expect(md).toMatch(/공통 규칙 `.*docs\/agent-delegated-work\.md`/)
    expect(md).toContain('## 맡긴 일 2')
    expect(md).toContain(`- \`${a.file}\` · 진행 · coloring · claude-code — 종결 조건부터 제안`)
    expect(md).toContain(`- \`${b.file}\` · 진행 · clock · claude-code — 수정 요청: L=48 넣기`)
    expect(md).toContain('  - 사용자 답: 1번 예')
    expect(md).not.toContain(c.file)
  })

  it('판단을 기다리는 맡긴 일(결과 · 종결 조건 제안)은 왼쪽 띠의 수와 첫 화면 "확인 필요"에 더한다', async () => {
    const issues = async () => (await app.inject({ method: 'GET', url: '/api/research-issues' })).json()
    const before = await issues()
    expect(before.tasks['sample-research']).toBe(0)
    const a = (await make({ title: 'coloring', task: '대조', endCondition: 'y' })).json().task
    const b = (await make({ title: 'clock', task: '판정' })).json().task
    expect((await issues()).tasks['sample-research']).toBe(0)
    fs.writeFileSync(path.join(dir(), `${a.id}.md`), fs.readFileSync(path.join(dir(), `${a.id}.md`), 'utf8').replace('state: working', 'state: result'))
    agentWrites(b.id, 'proposal: { end-condition: [세 크기] }')
    fs.writeFileSync(path.join(dir(), `${b.id}.md`), fs.readFileSync(path.join(dir(), `${b.id}.md`), 'utf8').replace('state: working', 'state: proposed'))
    const after = await issues()
    expect(after.tasks['sample-research']).toBe(2)
    expect(after.counts['sample-research']).toBe(after.notes['sample-research'] + 2)
  })

  it('workbench/tasks/의 .md가 바뀌면 알린다', () => {
    expect(classify('/r/workbench', '/r/workbench/tasks/2026-10-07-a.md')).toEqual({ type: 'tasks', id: '2026-10-07-a' })
    expect(classify('/r/workbench', '/r/workbench/tasks/x.txt')).toBeNull()
  })
})
