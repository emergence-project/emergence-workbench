import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import YAML from 'yaml'
import { BRIEF_MAX } from '@rw/core'
import { fingerprint, headCommit } from './problemFiles.js'
import { nextAttemptId, parseAttempt, parseClaim, parseProblem, problemSlug } from './problems.js'
import { R, app, repo, useSampleApp } from './testkit.js'

useSampleApp()
const P = `${R}/problems`
const CLAUDE = { 'x-rw-agent': 'claude-code' }
const CODEX = { 'x-rw-agent': 'codex' }
type Headers = Record<string, string>
const call = (method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, payload?: object, headers: Headers = {}) => app.inject({ method, url, headers, ...(payload && { payload }) })
const ok = async (method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, payload?: object, headers: Headers = {}) => {
  const r = await call(method, url, payload, headers)
  expect(r.statusCode, r.body).toBe(200)
  return r.json()
}
const file = (...parts: string[]) => path.join(repo, 'workbench', 'problems', ...parts)
/** 예제 연구에 든 문제는 두고, 이 시험이 만든 문제 하나를 연다 */
async function opened(question = 'Does the corner term survive at finite size?'): Promise<{ id: string; hash: string }> {
  const { problem: p } = await ok('POST', P, { question })
  const { problem: q } = await ok('PATCH', `${P}/${p.id}`, { baseHash: p.hash, set: { if_yes: 'The corner term is a finite-size invariant.', if_no: 'The corner term is a lattice artefact.', reader: 'People computing entanglement on a lattice' } })
  const { problem: o } = await ok('POST', `${P}/${p.id}/open`, { baseHash: q.hash })
  expect(o.state).toBe('open')
  return { id: p.id, hash: o.hash }
}

describe('flows: question, claims and attempts (workbench/problems/)', () => {
  it('opens only with the user\'s message and reader (message gate)', async () => {
    const { problem: p } = await ok('POST', P, { question: 'Is the gap closed at the M point?' })
    expect(p).toMatchObject({ id: 'is-the-gap-closed-at-the-m-point', state: 'draft', by: 'user', limit: 6, used: 0, attempts: [] })
    const early = await call('POST', `${P}/${p.id}/open`, { baseHash: p.hash })
    expect(early.statusCode).toBe(400)
    expect(early.json().error).toContain('독자')
    // 에이전트는 메시지를 쓰지 못하고, 문헌 대조 · 첫 시험 · 채점은 더한다
    expect((await call('PATCH', `${P}/${p.id}`, { baseHash: p.hash, set: { if_yes: 'x' } }, CLAUDE)).statusCode).toBe(403)
    const { problem: lit } = await ok('PATCH', `${P}/${p.id}`, { baseHash: p.hash, set: { literature: [{ ref: 'tothLinear2015', fact: 'Computes the same band at zero field.' }], grading: 'gap below 1e-6 at L = 24, 36, 48' } }, CLAUDE)
    expect(lit.literature[0]).toMatchObject({ ref: 'tothLinear2015', by: 'claude-code' })
    const { problem: q } = await ok('PATCH', `${P}/${p.id}`, { baseHash: lit.hash, set: { if_yes: 'The order is gapless.', if_no: 'The order is gapped.', reader: 'Spin-wave people' } })
    expect((await call('POST', `${P}/${p.id}/open`, { baseHash: q.hash }, CLAUDE)).statusCode).toBe(403)
    // 열기 전에는 시도를 두지 못한다
    expect((await call('POST', `${P}/${p.id}/attempts`, { attempts: [{ method: 'ED on 12 sites' }] }, CLAUDE)).statusCode).toBe(409)
    const stale = await call('POST', `${P}/${p.id}/open`, { baseHash: p.hash })
    expect(stale.statusCode).toBe(409)
    expect(stale.json().currentHash).toBe(q.hash)
    const { problem: o } = await ok('POST', `${P}/${p.id}/open`, { baseHash: q.hash })
    expect(o.state).toBe('open')
    expect(YAML.parse(fs.readFileSync(file(p.id, 'problem.yaml'), 'utf8'))).toMatchObject({ format: 1, state: 'open', if_yes: 'The order is gapless.', grading: 'gap below 1e-6 at L = 24, 36, 48' })
    // 시작한 문제의 메시지는 비우지 못한다
    expect((await call('PATCH', `${P}/${p.id}`, { baseHash: o.hash, set: { reader: '' } })).statusCode).toBe(400)
  })

  it('keeps agent-made problems as proposals with a source', async () => {
    expect((await call('POST', P, { question: 'Is there a second corner term?' }, CLAUDE)).statusCode).toBe(400)
    expect((await call('POST', P, { question: 'Is there a second corner term?', source: 'attempt c1', if_yes: 'big' }, CLAUDE)).statusCode).toBe(403)
    const { problem: p } = await ok('POST', P, { question: 'Is there a second corner term?', source: 'attempt c1 of corner problem' }, CLAUDE)
    expect(p).toMatchObject({ state: 'proposed', by: 'claude-code', source: 'attempt c1 of corner problem' })
    expect((await call('DELETE', `${P}/${p.id}?baseHash=${p.hash}`, undefined, CLAUDE)).statusCode).toBe(403)
    await ok('DELETE', `${P}/${p.id}?baseHash=${p.hash}`)
    expect(fs.existsSync(file(p.id))).toBe(false)
    expect(fs.readdirSync(file('.trash')).some((d) => d.startsWith(p.id))).toBe(true)
  })

  type Claimed = { claims: Record<string, unknown>[]; attempts: Record<string, unknown>[] }
  const C = (p: Claimed, cid: string) => p.claims.find((x) => x.id === cid) as Record<string, unknown>
  const A = (p: Claimed, aid: string) => p.attempts.find((x) => x.id === aid) as Record<string, unknown>

  it('runs a flow: claims as dots, attempts as their grounds, verdict by the other side, lessons at the root', async () => {
    const { id } = await opened()
    // 주장을 먼저 세운다: 질문 바로 아래면 받치는 쪽이 있어야 하고, 같은 진술은 두 번 세우지 않는다
    expect((await call('POST', `${P}/${id}/claims`, { statement: 'The corner term does not depend on the size.' }, CLAUDE)).statusCode).toBe(400)
    const { problem: stated } = await ok('POST', `${P}/${id}/claims`, { statement: 'The corner term does not depend on the size.', condition: 'Free fermions, L = 16 and 24', side: 'for_yes' }, CLAUDE)
    expect(stated.claims).toMatchObject([{ id: '1', state: 'candidate', side: 'for_yes', by: 'claude-code', depth: 0, attempts: [] }])
    expect((await call('POST', `${P}/${id}/claims`, { statement: 'The corner  term does not depend on the size.', side: 'for_no' }, CLAUDE)).statusCode).toBe(409)
    expect((await call('POST', `${P}/${id}/attempts`, { attempts: [{ method: 'x', claim: '9' }] }, CLAUDE)).statusCode).toBe(404)
    // 후보는 주장을 겨누거나(그 주장의 근거가 된다) 질문을 바로 겨눈다
    const { problem: listed } = await ok('POST', `${P}/${id}/attempts`, { attempts: [{ method: 'Corner transfer matrix', claim: '1' }, { method: 'Free-fermion correlation matrix', claim: '1' }, { method: 'Field theory at the Dirac point' }] }, CLAUDE)
    expect(listed.attempts.map((a: { id: string; claim?: string }) => [a.id, a.claim])).toEqual([['a', '1'], ['b', '1'], ['c', undefined]])
    expect(C(listed, '1').attempts).toEqual(['a', 'b'])
    expect(listed.next).toMatchObject({ id: 'a', label: 'A' })
    // 사용자가 순서를 정하면 에이전트는 그 첫 후보부터
    const { problem: ordered } = await ok('PATCH', `${P}/${id}`, { baseHash: listed.hash, set: { order: ['b', 'a', 'c'] } })
    expect(ordered.next.id).toBe('b')
    const wrong = await call('POST', `${P}/${id}/attempts/a/start`, undefined, CLAUDE)
    expect(wrong.statusCode).toBe(409)
    expect(wrong.json().error).toContain('B')
    await ok('POST', `${P}/${id}/attempts/b/start`, undefined, CLAUDE)
    // 다른 에이전트는 남의 시도를 보고하지 못한다
    expect((await call('POST', `${P}/${id}/attempts/b/report`, { did: 'x', result: 'y' }, CODEX)).statusCode).toBe(403)
    // 진술 없이 보고하면 겨눈 주장을 적힌 그대로 받친다. 주장의 상태는 근거에서 계산된다
    const { problem: reported } = await ok('POST', `${P}/${id}/attempts/b/report`, { did: 'Built C on L = 16, 24.', result: 'Corner term 0.118 at both sizes.', files: ['workbench/notes/corner/note.md'] }, CLAUDE)
    expect(A(reported, 'b')).toMatchObject({ state: 'reported', worker: 'claude-code', claim: '1', files: ['workbench/notes/corner/note.md'] })
    expect(reported.claims).toHaveLength(1)
    expect(C(reported, '1').state).toBe('reported')
    // 작업한 쪽은 판정하지 못하고, 성립에는 교차 검증이 있어야 한다
    expect((await call('POST', `${P}/${id}/attempts/b/verdict`, { result: 'holds', note: 'ok', check: 'L = 32' }, CLAUDE)).statusCode).toBe(403)
    expect((await call('POST', `${P}/${id}/attempts/b/verdict`, { result: 'holds', note: 'reran' }, CODEX)).statusCode).toBe(400)
    const { problem: held } = await ok('POST', `${P}/${id}/attempts/b/verdict`, { result: 'holds', note: 'Reran from the raw data.', check: 'L = 32 and an anisotropic cell: 0.118, 0.119' }, CODEX)
    expect(A(held, 'b')).toMatchObject({ state: 'holds', verdict: { by: 'codex', check: 'L = 32 and an anisotropic cell: 0.118, 0.119', claim: expect.stringMatching(/^[0-9a-f]{12}$/) } })
    expect(C(held, '1').state).toBe('holds')
    expect(held.basis).toEqual({ yes: ['1'], no: [] })
    expect((await call('POST', `${P}/${id}/attempts/b/verdict`, { result: 'dropped', note: 'again', lesson: 'x' }, CODEX)).statusCode).toBe(409)

    // 성립한 주장 아래에 주장을 달면 위 주장은 그 근거를 기다린다 (진행 + 근거 대기)
    const { problem: deeper } = await ok('POST', `${P}/${id}/claims`, { statement: 'The same holds on the honeycomb lattice.', under: '1' }, CLAUDE)
    expect(deeper.claims.map((c: { id: string; depth: number; state: string; waiting?: boolean }) => [c.id, c.depth, c.state, c.waiting ?? false])).toEqual([['1', 0, 'active', true], ['2', 1, 'candidate', false]])
    expect(deeper.basis.yes).toEqual([])
    // 폐기에는 폐기 사유가 있어야 하고 폐기 사유는 흐름 머리에 모인다. 한 시도가 폐기돼도 주장은 다른 근거로 선다
    expect((await ok('PATCH', `${P}/${id}`, { baseHash: deeper.hash, set: { order: ['a', 'b', 'c'] } })).problem.next.id).toBe('a')
    await ok('POST', `${P}/${id}/attempts/a/start`, undefined, CLAUDE)
    await ok('POST', `${P}/${id}/attempts/a/report`, { did: 'CTM up to chi = 64.', result: 'Did not converge.' }, CLAUDE)
    expect((await call('POST', `${P}/${id}/attempts/a/verdict`, { result: 'dropped', note: 'Confirmed.' }, CODEX)).statusCode).toBe(400)
    const { problem: dropped } = await ok('POST', `${P}/${id}/attempts/a/verdict`, { result: 'dropped', note: 'Confirmed: the truncation error stays above 1e-3.', lesson: 'CTM does not converge for the gapless case.', reopen: 'A gapped variant of the model' }, CODEX)
    expect(dropped.lessons).toEqual([{ id: 'a', label: 'A', lesson: 'CTM does not converge for the gapless case.', reopen: 'A gapped variant of the model' }])
    expect(dropped.counts).toEqual({ candidate: 1, active: 0, reported: 0, holds: 1, dropped: 1 })
    expect(dropped.used).toBe(2)
    expect(C(dropped, '1')).toMatchObject({ state: 'active', waiting: true, attempts: ['a', 'b'] })

    const brief = (await ok('GET', `${P}/${id}/brief`)).markdown
    expect(brief).toContain('CTM does not converge')
    expect(brief).toContain('다시 열 조건: A gapped variant')
    expect(brief).toContain('다음: C')
    expect(brief).toContain('- 1 [진행 · 근거 대기 · 예 근거] The corner term does not depend on the size. (조건: Free fermions, L = 16 and 24) ← A 폐기, B 성립')
    expect(brief).toContain('-   2 [후보 · 1의 근거] The same holds on the honeycomb lattice.')
    expect(Buffer.byteLength(brief, 'utf8')).toBeLessThanOrEqual(BRIEF_MAX)
    // 목록에도 실리고, 파일은 주장(번호)과 시도(글자)로 나뉜다. 주장 파일에는 상태를 적지 않는다
    const row = (await ok('GET', P)).problems.find((x: { id: string }) => x.id === id)
    expect(row).toMatchObject({ state: 'open', used: 2, waiting: false })
    expect(YAML.parse(fs.readFileSync(file(id, 'a.yaml'), 'utf8'))).toMatchObject({ format: 1, claim: '1', state: 'dropped', worker: 'claude-code', verdict: { by: 'codex' }, lesson: 'CTM does not converge for the gapless case.' })
    const one = YAML.parse(fs.readFileSync(file(id, '1.yaml'), 'utf8'))
    expect(one).toMatchObject({ format: 1, statement: 'The corner term does not depend on the size.', side: 'for_yes', by: 'claude-code' })
    expect(one).not.toHaveProperty('state')
    expect(YAML.parse(fs.readFileSync(file(id, '2.yaml'), 'utf8'))).toMatchObject({ under: '1' })
  })

  it('keeps the run and test of a report, asks agents for the rerun result, and marks files changed after a holds verdict', async () => {
    const { id } = await opened('Is the gap closed at the M point?')
    await ok('POST', `${P}/${id}/attempts`, { attempts: [{ method: 'LSWT on a 24x24 mesh' }] }, CLAUDE)
    await ok('POST', `${P}/${id}/attempts/a/start`, undefined, CLAUDE)
    fs.mkdirSync(path.join(repo, 'code', 'data'), { recursive: true })
    fs.writeFileSync(path.join(repo, 'code', 'gap.py'), 'print(0.0)\n')
    fs.writeFileSync(path.join(repo, 'code', 'data', 'bands.csv'), 'k,e\n0,0\n')
    // 질문을 겨눈 시도가 진술을 적어 보고하면 그 진술이 새 주장(점)이 되고 시도는 그 근거가 된다
    const { problem: reported } = await ok('POST', `${P}/${id}/attempts/a/report`, { did: 'Ran the script.', result: 'Gap 0.0 at M.', statement: 'The gap is closed at M.', side: 'for_yes', files: ['code/gap.py', 'code/data', 'code/missing.dat'], run: { command: 'python code/gap.py', commit: 'abc1234' }, test: 'pytest code/test_gap.py' }, CLAUDE)
    expect(A(reported, 'a')).toMatchObject({ claim: '1', run: { command: 'python code/gap.py', commit: 'abc1234' }, test: 'pytest code/test_gap.py' })
    expect(C(reported, '1')).toMatchObject({ statement: 'The gap is closed at M.', side: 'for_yes', from: 'a', state: 'reported', attempts: ['a'] })
    expect((await ok('GET', `${P}/${id}/brief`)).markdown).toContain('검사 `pytest code/test_gap.py`')
    // 검사 명령이 있으면 에이전트의 성립에는 다시 돌린 결과(통과)가 있어야 하고, 실패면 누구도 성립을 주지 못한다
    const bare = await call('POST', `${P}/${id}/attempts/a/verdict`, { result: 'holds', note: 'Read the code.', check: 'A 36x36 mesh' }, CODEX)
    expect(bare.statusCode).toBe(400)
    expect(bare.json().error).toContain('pytest code/test_gap.py')
    expect((await call('POST', `${P}/${id}/attempts/a/verdict`, { result: 'holds', note: 'Reran.', check: 'A 36x36 mesh', tested: 'fail' })).statusCode).toBe(400)
    const { problem: held } = await ok('POST', `${P}/${id}/attempts/a/verdict`, { result: 'holds', note: 'Reran the test.', check: 'A 36x36 mesh: 0.0', tested: 'pass' }, CODEX)
    expect(A(held, 'a').verdict).toMatchObject({ tested: 'pass', files: { 'code/gap.py': expect.stringMatching(/^[0-9a-f]{12}$/), 'code/data': expect.stringMatching(/^[0-9a-f]{12}$/), 'code/missing.dat': '-' } })
    expect(A(held, 'a').changed).toBeUndefined()
    expect(C(held, '1')).toMatchObject({ state: 'holds' })
    expect(C(held, '1').stale).toBeUndefined()
    expect(YAML.parse(fs.readFileSync(file(id, 'a.yaml'), 'utf8'))).toMatchObject({ run: { command: 'python code/gap.py', commit: 'abc1234' }, test: 'pytest code/test_gap.py', verdict: { tested: 'pass' } })
    // 판정 뒤에 파일이 바뀌면(폴더 안 파일 포함) 읽을 때 알리고, 그 시도가 받치는 주장에도 표시가 붙는다
    fs.writeFileSync(path.join(repo, 'code', 'gap.py'), 'print(0.125)\n')
    fs.writeFileSync(path.join(repo, 'code', 'data', 'bands.csv'), 'k,e\n0,0\n1,0.5\n')
    const { problem: later } = await ok('GET', `${P}/${id}`)
    expect(A(later, 'a').changed).toEqual(['code/gap.py', 'code/data'])
    expect(C(later, '1').stale).toBe(true)
    expect((await ok('GET', `${P}/${id}/brief`)).markdown).toContain('판정 후 변경 (다시 확인한다)')
    // 판정 뒤에 주장의 진술을 고치면(파일을 직접) 그것도 알린다
    const c = file(id, '1.yaml')
    fs.writeFileSync(c, fs.readFileSync(c, 'utf8').replace('The gap is closed at M.', 'The gap is closed everywhere.'))
    expect(A((await ok('GET', `${P}/${id}`)).problem, 'a').restated).toBe(true)
  })

  it('judges a claim, not a method: an attempt without a claim cannot hold, and the refusal is logged as an exception', async () => {
    const { id } = await opened('Is the claim needed for a holds verdict?')
    const X = `${R}/problem-exceptions`
    const mine = async () => (await ok('GET', X)).exceptions.filter((e: { problem?: string }) => e.problem === id)
    await ok('POST', `${P}/${id}/attempts`, { attempts: [{ method: 'Count by hand' }] }, CLAUDE)
    await ok('POST', `${P}/${id}/attempts/a/start`, undefined, CLAUDE)
    // 질문 바로 아래에 놓일 진술에는 쪽이, 쪽 · 조건에는 진술이 있어야 한다
    expect((await call('POST', `${P}/${id}/attempts/a/report`, { did: 'x', result: 'y', statement: 'It is three.' }, CLAUDE)).statusCode).toBe(400)
    expect((await call('POST', `${P}/${id}/attempts/a/report`, { did: 'x', result: 'y', side: 'for_yes' }, CLAUDE)).statusCode).toBe(400)
    const { problem: bareReport } = await ok('POST', `${P}/${id}/attempts/a/report`, { did: 'Counted.', result: 'Three.' }, CLAUDE)
    expect(bareReport.claims).toEqual([])
    const bare = await call('POST', `${P}/${id}/attempts/a/verdict`, { result: 'holds', note: 'Counted again.', check: 'Another graph' }, CODEX)
    expect(bare.statusCode).toBe(409)
    expect(bare.json().error).toContain('주장이 없는 시도')
    // 같은 날 같은 자리의 같은 거절은 한 줄만
    await call('POST', `${P}/${id}/attempts/a/verdict`, { result: 'holds', note: 'Again.', check: 'Another graph' }, CODEX)
    expect(await mine()).toMatchObject([{ kind: 'refused', rule: 'no-claim', by: 'codex', attempt: 'a' }])
    expect((await call('POST', `${P}/${id}/attempts/a/verdict`, { result: 'holds', note: 'Mine.', check: 'x' }, CLAUDE)).statusCode).toBe(403)
    expect((await mine()).map((e: { rule: string }) => e.rule).sort()).toEqual(['no-claim', 'self-verdict'])
    // 에이전트와 사용자가 적는 한 줄. 거절은 앱만 적는다
    const { exception: e } = await ok('POST', X, { kind: 'no-claim', what: 'The result is a table of twelve numbers with no single sentence.', instead: 'Reported without a statement.', problem: id, attempt: 'A' }, CLAUDE)
    expect(e).toMatchObject({ kind: 'no-claim', by: 'claude-code', problem: id, attempt: 'a', instead: 'Reported without a statement.' })
    expect(YAML.parse(fs.readFileSync(file('_exceptions', `${e.id}.yaml`), 'utf8'))).toMatchObject({ format: 1, kind: 'no-claim', problem: id })
    expect((await call('POST', X, { kind: 'refused', what: 'x' }, CLAUDE)).statusCode).toBe(400)
    expect((await call('POST', X, { kind: 'other', what: 'x', problem: 'no-such-flow' })).statusCode).toBe(400)
    expect((await ok('POST', X, { kind: 'needs-user', what: 'I wanted to accept a claim before closing.' })).exception.by).toBe('user')
    // 예외 폴더는 흐름으로 읽히지 않는다
    expect((await ok('GET', P)).problems.some((p: { id: string }) => p.id.startsWith('_'))).toBe(false)
  })

  it('closes with an answer only after the user approves every claim the answer rests on', async () => {
    const { id, hash } = await opened('Does the answer rest on approved claims?')
    const work = async (aid: string, body: object = {}) => {
      await ok('POST', `${P}/${id}/attempts/${aid}/start`, undefined, CLAUDE)
      await ok('POST', `${P}/${id}/attempts/${aid}/report`, { did: 'Did it.', result: 'Numbers.', ...body }, CLAUDE)
      return (await ok('POST', `${P}/${id}/attempts/${aid}/verdict`, { result: 'holds', note: 'Reran.', check: 'Another size' }, CODEX)).problem
    }
    // 답을 받치는 성립한 주장이 없으면 답과 함께 닫지 못한다 (거절은 예외 기록에)
    const none = await call('POST', `${P}/${id}/close`, { baseHash: hash, answer: 'yes', reviews: [] })
    expect(none.statusCode).toBe(409)
    expect((await ok('GET', `${R}/problem-exceptions`)).exceptions.find((e: { problem?: string }) => e.problem === id)).toMatchObject({ kind: 'refused', rule: 'no-basis', by: 'user' })
    await ok('POST', `${P}/${id}/attempts`, { attempts: [{ method: 'First' }, { method: 'Second' }] }, CLAUDE)
    await work('a', { statement: 'The gap is zero at L = 24.', side: 'for_yes' })
    // 주장 1 아래의 주장 2: 2가 설 때까지 1은 답을 받치지 못한다
    await ok('POST', `${P}/${id}/claims`, { statement: 'The lattice is bipartite.', under: '1' }, CLAUDE)
    const { problem: waiting } = await ok('POST', `${P}/${id}/attempts`, { attempts: [{ method: 'Deeper', claim: '2' }] }, CLAUDE)
    expect(waiting.basis).toEqual({ yes: [], no: [] })
    await work('c')
    const p = await work('b', { statement: 'The gap is finite on the torus.', side: 'for_no' })
    // 답이 기대는 것: 그 쪽을 받치는 성립한 주장과 그 아래의 성립한 주장
    expect(p.basis).toEqual({ yes: ['1', '2'], no: ['3'] })
    expect((await call('POST', `${P}/${id}/close`, { baseHash: p.hash, answer: 'yes' }, CLAUDE)).statusCode).toBe(403)
    const partial = await call('POST', `${P}/${id}/close`, { baseHash: p.hash, answer: 'yes', reviews: [{ id: '1', verdict: 'approve' }] })
    expect(partial.statusCode).toBe(400)
    expect(partial.json().error).toContain(': 2')
    expect((await call('POST', `${P}/${id}/close`, { baseHash: p.hash, answer: 'yes', reviews: [{ id: '1', verdict: 'approve' }, { id: '2', verdict: 'return' }] })).statusCode).toBe(400)
    // 수정이 있으면 닫지 않고 돌려보낸다: 그 주장의 성립한 시도가 진행으로 돌아가고, 승인은 남는다
    const { problem: back } = await ok('POST', `${P}/${id}/close`, { baseHash: p.hash, answer: 'yes', reviews: [{ id: '1', verdict: 'approve' }, { id: '2', verdict: 'return', note: 'Say which boundary condition.' }] })
    expect(back.state).toBe('open')
    expect(C(back, '1')).toMatchObject({ state: 'active', waiting: true, accepted: { by: 'user' } })
    expect(C(back, '2')).toMatchObject({ state: 'active', statement: 'The lattice is bipartite.' })
    expect(A(back, 'c')).toMatchObject({ state: 'active', claim: '2', returned: { by: 'user', note: 'Say which boundary condition.' } })
    expect(A(back, 'c').verdict).toBeUndefined()
    expect(back.basis.yes).toEqual([])
    expect((await ok('GET', `${P}/${id}/brief`)).markdown).toContain('수정 요청 (작업한 쪽이 고쳐 다시 보고한다)')
    // 돌려받은 시도가 진술을 고쳐 보고하면 새 주장을 만들지 않고 그 주장의 글을 고친다
    await ok('POST', `${P}/${id}/attempts/c/report`, { did: 'Reran with open boundaries.', result: 'Numbers.', statement: 'The lattice is bipartite with open boundaries.' }, CLAUDE)
    const { problem: again } = await ok('POST', `${P}/${id}/attempts/c/verdict`, { result: 'holds', note: 'Reran.', check: 'L = 36' }, CODEX)
    expect(again.claims.map((c: { id: string }) => c.id)).toEqual(['1', '2', '3'])
    expect(C(again, '2')).toMatchObject({ state: 'holds', statement: 'The lattice is bipartite with open boundaries.', under: '1' })
    expect(again.basis.yes).toEqual(['1', '2'])
    // 답 없이 닫으려면 사유가 있어야 한다
    expect((await call('POST', `${P}/${id}/close`, { baseHash: again.hash })).statusCode).toBe(400)
    const { problem: closed } = await ok('POST', `${P}/${id}/close`, { baseHash: again.hash, answer: 'yes', reviews: [{ id: '1', verdict: 'approve' }, { id: '2', verdict: 'approve' }] })
    expect(closed).toMatchObject({ state: 'closed', answer: 'yes', closed: { answer: 'yes', basis: ['1', '2'] } })
    expect(C(closed, '2')).toMatchObject({ accepted: { by: 'user' } })
    expect(C(closed, '3').accepted).toBeUndefined()
    expect((await ok('GET', P)).problems.find((x: { id: string }) => x.id === id)).toMatchObject({ state: 'closed', answer: 'yes' })
    expect(YAML.parse(fs.readFileSync(file(id, 'problem.yaml'), 'utf8')).closed).toMatchObject({ answer: 'yes', basis: ['1', '2'] })
    expect((await ok('GET', `${P}/${id}/brief`)).markdown).toContain('종료 · 답 예')
  })

  it('rejects a claim when closing (the dot is dropped), and closing with a pending direction report records the decision', async () => {
    const { id } = await opened('Does a reject drop the claim?')
    await ok('POST', `${P}/${id}/attempts`, { attempts: [{ method: 'Only' }] }, CLAUDE)
    await ok('POST', `${P}/${id}/attempts/a/start`, undefined, CLAUDE)
    await ok('POST', `${P}/${id}/attempts/a/report`, { did: 'Did it.', result: 'Numbers.', statement: 'No gap.', side: 'for_no' }, CLAUDE)
    const { problem: p } = await ok('POST', `${P}/${id}/attempts/a/verdict`, { result: 'holds', note: 'Reran.', check: 'Another size' }, CODEX)
    const { problem: rejected } = await ok('POST', `${P}/${id}/close`, { baseHash: p.hash, answer: 'no', reviews: [{ id: '1', verdict: 'reject', note: 'The fit window is too narrow.' }] })
    expect(rejected.state).toBe('open')
    // 기각은 주장에 남는다: 점은 폐기가 되고, 시도의 판정 기록은 그대로다
    expect(C(rejected, '1')).toMatchObject({ state: 'dropped', rejected: { by: 'user', note: 'The fit window is too narrow.' } })
    expect(A(rejected, 'a')).toMatchObject({ state: 'holds', verdict: { by: 'codex' } })
    expect(rejected.basis.no).toEqual([])
    expect((await ok('GET', `${P}/${id}/brief`)).markdown).toContain('기각: The fit window is too narrow.')
    // 기각된 주장을 겨눈 후보는 시작하지 못한다
    await ok('POST', `${P}/${id}/attempts`, { attempts: [{ method: 'Try the same claim again', claim: '1' }] }, CLAUDE)
    expect((await call('POST', `${P}/${id}/attempts/b/start`, undefined, CLAUDE)).statusCode).toBe(409)
    const { problem: asked } = await ok('POST', `${P}/${id}/report`, { neither: 'The only claim was rejected.' }, CLAUDE)
    const { problem: closed } = await ok('POST', `${P}/${id}/close`, { baseHash: asked.hash, reason: 'Nothing left to try.' })
    expect(closed).toMatchObject({ state: 'closed', waiting: false, closed: { reason: 'Nothing left to try.' } })
    expect(closed.answer).toBeUndefined()
    expect(closed.reports[0].decision).toMatchObject({ verdict: 'close', note: 'Nothing left to try.' })
  })

  it('reads the commit at report time from .git without calling git', () => {
    const top = fs.mkdtempSync(path.join(os.tmpdir(), 'rw-head-'))
    expect(headCommit(top)).toBeUndefined()
    fs.mkdirSync(path.join(top, '.git', 'refs', 'heads'), { recursive: true })
    fs.writeFileSync(path.join(top, '.git', 'HEAD'), 'ref: refs/heads/main\n')
    fs.writeFileSync(path.join(top, '.git', 'refs', 'heads', 'main'), `${'a1b2c3d4e5f6'.repeat(4).slice(0, 40)}\n`)
    expect(headCommit(top)).toBe('a1b2c3d4e5f6')
    fs.rmSync(path.join(top, '.git', 'refs', 'heads', 'main'))
    fs.writeFileSync(path.join(top, '.git', 'packed-refs'), `# pack-refs with: peeled fully-peeled sorted\n${'0f'.repeat(20)} refs/heads/main\n`)
    expect(headCommit(top)).toBe('0f0f0f0f0f0f')
    fs.writeFileSync(path.join(top, '.git', 'HEAD'), `${'9'.repeat(40)}\n`)
    expect(headCommit(top)).toBe('9'.repeat(12))
    expect(fingerprint(top, '../outside.txt')).toBe('-')
    fs.rmSync(top, { recursive: true, force: true })
  })

  it('stops at the limit until the user decides on a direction report', async () => {
    const { id, hash } = await opened('Does the limit stop the run?')
    const { problem: small } = await ok('PATCH', `${P}/${id}`, { baseHash: hash, set: { limit: 2 } })
    expect((await call('PATCH', `${P}/${id}`, { baseHash: small.hash, set: { limit: 9 } }, CLAUDE)).statusCode).toBe(403)
    await ok('POST', `${P}/${id}/attempts`, { attempts: [{ method: 'One' }, { method: 'Two' }, { method: 'Three' }] }, CLAUDE)
    for (const a of ['a', 'b']) {
      await ok('POST', `${P}/${id}/attempts/${a}/start`, undefined, CLAUDE)
      await ok('POST', `${P}/${id}/attempts/${a}/report`, { did: 'Ran it.', result: 'Inconclusive.' }, CLAUDE)
    }
    const blocked = await call('POST', `${P}/${id}/attempts/c/start`, undefined, CLAUDE)
    expect(blocked.statusCode).toBe(409)
    expect(blocked.json().error).toContain('한도')
    expect((await ok('GET', `${P}/${id}`)).problem.stop).toBe('limit')
    expect((await call('POST', `${P}/${id}/report`, {}, CLAUDE)).statusCode).toBe(400)
    const { problem: asked } = await ok('POST', `${P}/${id}/report`, { for_yes: 'Nothing yet.', neither: 'Both runs were inconclusive at L = 16.' }, CLAUDE)
    expect(asked).toMatchObject({ stop: 'decision', waiting: true })
    expect(asked.reports[0]).toMatchObject({ by: 'claude-code', why: 'limit' })
    expect((await ok('GET', `${P}/${id}/brief`)).markdown).toContain('멈춤')
    expect((await call('POST', `${P}/${id}/report`, { neither: 'again' }, CLAUDE)).statusCode).toBe(409)
    expect((await call('POST', `${P}/${id}/decide`, { baseHash: asked.hash, verdict: 'continue' }, CLAUDE)).statusCode).toBe(403)
    const { problem: more } = await ok('POST', `${P}/${id}/decide`, { baseHash: asked.hash, verdict: 'continue', note: 'Try the third.' })
    expect(more).toMatchObject({ limit: 5, waiting: false })
    expect(more.stop).toBeUndefined()
    await ok('POST', `${P}/${id}/attempts/c/start`, undefined, CLAUDE)
    // 접기: 보고가 있어야 하고, 접은 문제에서는 일하지 않는다
    const { problem: again } = await ok('POST', `${P}/${id}/report`, { for_no: 'Three runs, none supports yes.' }, CODEX)
    expect(again.reports[1].why).toBe('asked')
    const { problem: closed } = await ok('POST', `${P}/${id}/decide`, { baseHash: again.hash, verdict: 'close', note: 'Not worth more runs.' })
    expect(closed).toMatchObject({ state: 'closed', closed: { reason: 'Not worth more runs.' } })
    expect((await call('POST', `${P}/${id}/attempts`, { attempts: [{ method: 'Four' }] }, CLAUDE)).statusCode).toBe(409)
  })

  it('records past work with its day: the user\'s counts at once, an agent\'s waits for the user and is not a ground until then', async () => {
    const { id } = await opened('Can past work be recorded with its day?')
    const { problem: c } = await ok('POST', `${P}/${id}/claims`, { statement: 'The gap closes at M.', side: 'for_yes' })
    // 에이전트가 적은 지난 일: 판정 대기 + 사용자 차례, 한도에 세지 않고, 주장의 상태에 들지 않는다
    const { problem: a } = await ok('POST', `${P}/${id}/attempts/record`, { method: 'ED on 4x4', result: 'Gap 0.01 at M.', when: '2026-10-12', claim: '1' }, CLAUDE)
    const rec = a.attempts.find((x: { id: string }) => x.id === 'a')
    expect(rec).toMatchObject({ state: 'reported', origin: 'past', when: '2026-10-12', turn: true, worker: 'claude-code' })
    expect(a).toMatchObject({ used: 0, confirm: 1 })
    expect(a.claims[0]).toMatchObject({ id: '1', state: 'candidate', unconfirmed: true, when: '2026-10-12' })
    expect((await ok('GET', P)).problems.find((x: { id: string }) => x.id === id).confirm).toBe(1)
    expect(YAML.parse(fs.readFileSync(file(id, 'a.yaml'), 'utf8'))).toMatchObject({ origin: 'past', when: '2026-10-12', claim: '1' })
    expect((await ok('GET', `${P}/${id}/brief`)).markdown).toContain('확인 대기 지난 일')
    // 에이전트는 성립 · 폐기를 정하지도, 확인하지도 못한다 (다른 에이전트도)
    expect((await call('POST', `${P}/${id}/attempts/record`, { method: 'x', result: 'y', outcome: 'holds' }, CLAUDE)).statusCode).toBe(403)
    expect((await call('POST', `${P}/${id}/attempts/a/verdict`, { result: 'holds', note: 'Read it.', check: 'L=6' }, CODEX)).statusCode).toBe(403)
    // 사용자의 확인: 교차 검증 없이 성립
    const { problem: b } = await ok('POST', `${P}/${id}/attempts/a/verdict`, { result: 'holds', note: 'Matches the journal of 10/12.' })
    expect(b.attempts.find((x: { id: string }) => x.id === 'a')).toMatchObject({ state: 'holds' })
    expect(b.attempts.find((x: { id: string }) => x.id === 'a').turn).toBeUndefined()
    expect(b.claims[0]).toMatchObject({ state: 'holds' })
    expect(b.claims[0].unconfirmed).toBeUndefined()
    expect(b.confirm).toBeUndefined()
    // 사용자가 적은 지난 일: 곧바로 판정된 근거. 진술을 적으면 새 주장, 형제는 날 순
    const { problem: u } = await ok('POST', `${P}/${id}/attempts/record`, { method: 'DMRG on 6-leg', result: 'No gap at K.', when: '2026-09-30', statement: 'The gap stays open at K.', side: 'for_no' })
    const ua = u.attempts.find((x: { id: string }) => x.id === 'b')
    expect(ua).toMatchObject({ state: 'holds', origin: 'past', claim: '2', verdict: { by: 'user' } })
    expect(u.claims.map((x: { id: string }) => x.id)).toEqual(['2', '1'])
    expect(u.claims[0]).toMatchObject({ statement: 'The gap stays open at K.', side: 'for_no', state: 'holds', when: '2026-09-30' })
    expect(u.used).toBe(0)
    // 주장 없는 성립은 안 되고, 폐기는 사유가 결과로 남는다
    expect((await call('POST', `${P}/${id}/attempts/record`, { method: 'Guess', result: 'Nothing.' })).statusCode).toBe(400)
    const { problem: d } = await ok('POST', `${P}/${id}/attempts/record`, { method: 'Guess', result: 'Did not converge.', outcome: 'dropped' })
    expect(d.attempts.find((x: { id: string }) => x.id === 'c')).toMatchObject({ state: 'dropped', lesson: 'Did not converge.' })
    expect(d.stop).toBeUndefined()
    expect(c.claims).toHaveLength(1)
  })

  it('reports three dropped verdicts in a row as stuck', async () => {
    const { id } = await opened('Does a run of failures stop the run?')
    await ok('POST', `${P}/${id}/attempts`, { attempts: [{ method: 'One' }, { method: 'Two' }, { method: 'Three' }, { method: 'Four' }] }, CLAUDE)
    for (const a of ['a', 'b', 'c']) {
      await ok('POST', `${P}/${id}/attempts/${a}/start`, undefined, CLAUDE)
      await ok('POST', `${P}/${id}/attempts/${a}/report`, { did: 'Ran it.', result: 'Failed.', lesson: `${a} fails` }, CLAUDE)
      await ok('POST', `${P}/${id}/attempts/${a}/verdict`, { result: 'dropped', note: 'Confirmed.' }, CODEX)
    }
    const { problem: p } = await ok('GET', `${P}/${id}`)
    expect(p.stop).toBe('stuck')
    expect(p.lessons.map((l: { lesson: string }) => l.lesson)).toEqual(['a fails', 'b fails', 'c fails'])
    expect((await call('POST', `${P}/${id}/attempts/d/start`, undefined, CLAUDE)).statusCode).toBe(409)
    const { problem: r } = await ok('POST', `${P}/${id}/report`, { neither: 'Three methods failed for unrelated reasons.' }, CLAUDE)
    expect(r.reports[0].why).toBe('stuck')
    const { problem: go } = await ok('POST', `${P}/${id}/decide`, { baseHash: r.hash, verdict: 'narrow', limit: 8 })
    expect(go.limit).toBe(8)
    expect(go.stop).toBeUndefined()
    await ok('POST', `${P}/${id}/attempts/d/start`, undefined, CLAUDE)
  })

  it('reads hand-written files leniently: claims by number, attempts by letter', () => {
    expect(parseProblem('question: Q\nstate: wat\nlimit: 0\nliterature:\n  - ref: a\n  - {ref: b, fact: did it}\nlater: 1\n'))
      .toEqual({ question: 'Q', state: 'draft', by: 'user', literature: [{ ref: 'b', fact: 'did it' }], limit: 6, order: [], reports: [], extra: { later: 1 } })
    expect(parseProblem('state: open\n')).toBeNull()
    expect(parseProblem(': : :')).toBeNull()
    expect(parseAttempt('a', 'method: M\nstate: reported\nworker: codex\nfiles: [x.md]\nclaim: 2\n')).toMatchObject({ id: 'a', state: 'reported', by: 'user', worker: 'codex', files: ['x.md'], claim: '2' })
    expect(parseAttempt('a', 'state: holds\n')).toBeNull()
    // 옛 형식(시도에 붙은 진술 · 위 시도)의 칸은 읽지 않고 남겨 둔다
    const old = parseAttempt('b1', 'method: M\nparent: b\nstatement: S\nside: for_yes\n')
    expect(old).toMatchObject({ id: 'b1', method: 'M', extra: { parent: 'b', statement: 'S', side: 'for_yes' } })
    expect(old).not.toHaveProperty('claim')
    // 주장: 진술이 있어야 하고, 모르는 쪽은 버리며, 자기를 위 주장으로 적은 것은 읽지 않는다. 답은 참 · 거짓으로 적힌 것도 읽는다
    expect(parseClaim('1', 'condition: C\nside: for_no\n')).toBeNull()
    expect(parseClaim('1', 'statement: S\nside: sideways\nunder: 1\naccepted: {at: 2026-11-11T10:00, by: user}\n')).toEqual({ id: '1', statement: 'S', by: 'user', accepted: { at: '2026-11-11T10:00', by: 'user' }, extra: {} })
    expect(parseClaim('2', 'statement: S\nunder: 1\nfrom: e\nrejected: {at: 2026-11-11T10:00, by: user}\n')).toMatchObject({ under: '1', from: 'e', rejected: { by: 'user', note: '' } })
    expect(parseProblem('question: Q\nstate: closed\nclosed: {at: 2026-11-11T10:00, answer: true, basis: [1, 2]}\n')?.closed).toEqual({ at: '2026-11-11T10:00', answer: 'yes', basis: ['1', '2'] })
    expect(nextAttemptId(new Set(['a', 'b']))).toBe('c')
    expect(nextAttemptId(new Set('abcdefghijklmnopqrstuvwxyz'))).toBe('aa')
    expect(problemSlug('코너 항이 남는가?', new Set())).toBe('problem')
    expect(problemSlug('Corner term?', new Set(['corner-term']))).toBe('corner-term-2')
  })
})
