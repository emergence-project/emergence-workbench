import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import YAML from 'yaml'
import { BRIEF_MAX } from '@rw/core'
import { nextAttemptId, parseAttempt, parseProblem, problemSlug } from './problems.js'
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

describe('problems and the attempt tree (workbench/problems/)', () => {
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

  it('runs the tree: candidates, start, report, verdict by the other side, lessons at the root', async () => {
    const { id } = await opened()
    const { problem: listed } = await ok('POST', `${P}/${id}/attempts`, { attempts: [{ method: 'Corner transfer matrix' }, { method: 'Free-fermion correlation matrix' }, { method: 'Field theory at the Dirac point' }] }, CLAUDE)
    expect(listed.attempts.map((a: { id: string }) => a.id)).toEqual(['a', 'b', 'c'])
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
    const { problem: reported } = await ok('POST', `${P}/${id}/attempts/b/report`, { did: 'Built C on L = 16, 24.', result: 'Corner term 0.118 at both sizes.', files: ['workbench/notes/corner/note.md'] }, CLAUDE)
    expect(reported.attempts.find((a: { id: string }) => a.id === 'b')).toMatchObject({ state: 'reported', worker: 'claude-code', files: ['workbench/notes/corner/note.md'] })
    // 일한 쪽은 판정하지 못하고, 성립에는 조건 밖의 확인이 있어야 한다
    expect((await call('POST', `${P}/${id}/attempts/b/verdict`, { result: 'holds', note: 'ok', check: 'L = 32' }, CLAUDE)).statusCode).toBe(403)
    expect((await call('POST', `${P}/${id}/attempts/b/verdict`, { result: 'holds', note: 'reran' }, CODEX)).statusCode).toBe(400)
    const { problem: held } = await ok('POST', `${P}/${id}/attempts/b/verdict`, { result: 'holds', note: 'Reran from the raw data.', check: 'L = 32 and an anisotropic cell: 0.118, 0.119' }, CODEX)
    expect(held.attempts.find((a: { id: string }) => a.id === 'b')).toMatchObject({ state: 'holds', verdict: { by: 'codex', check: 'L = 32 and an anisotropic cell: 0.118, 0.119' } })
    expect((await call('POST', `${P}/${id}/attempts/b/verdict`, { result: 'dropped', note: 'again', lesson: 'x' }, CODEX)).statusCode).toBe(409)

    // 성립한 가지 아래로 이어 간다: b1. 폐기에는 교훈이 있어야 하고 교훈은 문제 머리에 모인다
    const { problem: deeper } = await ok('POST', `${P}/${id}/attempts`, { attempts: [{ method: 'Same on the honeycomb lattice', parent: 'b' }] }, CLAUDE)
    expect(deeper.attempts.map((a: { id: string; depth: number }) => [a.id, a.depth])).toEqual([['b', 0], ['b1', 1], ['a', 0], ['c', 0]])
    // 다음은 나무에서 위에서 아래로 처음 만나는 후보다 (성립한 가지 아래가 먼저). 사용자가 순서를 바꾸면 그대로 따른다
    expect(deeper.next.id).toBe('b1')
    const skip = await call('POST', `${P}/${id}/attempts/a/start`, undefined, CLAUDE)
    expect(skip.statusCode).toBe(409)
    expect(skip.json().error).toContain('B1')
    expect((await ok('PATCH', `${P}/${id}`, { baseHash: deeper.hash, set: { order: ['a', 'b', 'c'] } })).problem.next.id).toBe('a')
    await ok('POST', `${P}/${id}/attempts/a/start`, undefined, CLAUDE)
    await ok('POST', `${P}/${id}/attempts/a/report`, { did: 'CTM up to chi = 64.', result: 'Did not converge.' }, CLAUDE)
    expect((await call('POST', `${P}/${id}/attempts/a/verdict`, { result: 'dropped', note: 'Confirmed.' }, CODEX)).statusCode).toBe(400)
    const { problem: dropped } = await ok('POST', `${P}/${id}/attempts/a/verdict`, { result: 'dropped', note: 'Confirmed: the truncation error stays above 1e-3.', lesson: 'CTM does not converge for the gapless case.', reopen: 'A gapped variant of the model' }, CODEX)
    expect(dropped.lessons).toEqual([{ id: 'a', label: 'A', lesson: 'CTM does not converge for the gapless case.', reopen: 'A gapped variant of the model' }])
    expect(dropped.counts).toEqual({ candidate: 2, active: 0, reported: 0, holds: 1, dropped: 1 })
    expect(dropped.used).toBe(2)

    const brief = (await ok('GET', `${P}/${id}/brief`)).markdown
    expect(brief).toContain('CTM does not converge')
    expect(brief).toContain('다시 열 조건: A gapped variant')
    expect(brief).toContain('다음: B1')
    expect(Buffer.byteLength(brief, 'utf8')).toBeLessThanOrEqual(BRIEF_MAX)
    // 목록과 STATUS에도 실린다
    const row = (await ok('GET', P)).problems.find((x: { id: string }) => x.id === id)
    expect(row).toMatchObject({ state: 'open', used: 2, waiting: false })
    expect(YAML.parse(fs.readFileSync(file(id, 'a.yaml'), 'utf8'))).toMatchObject({ format: 1, state: 'dropped', worker: 'claude-code', verdict: { by: 'codex' }, lesson: 'CTM does not converge for the gapless case.' })
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

  it('reads hand-written files leniently and names attempts down the tree', () => {
    expect(parseProblem('question: Q\nstate: wat\nlimit: 0\nliterature:\n  - ref: a\n  - {ref: b, fact: did it}\nlater: 1\n'))
      .toEqual({ question: 'Q', state: 'draft', by: 'user', literature: [{ ref: 'b', fact: 'did it' }], limit: 6, order: [], reports: [], extra: { later: 1 } })
    expect(parseProblem('state: open\n')).toBeNull()
    expect(parseProblem(': : :')).toBeNull()
    expect(parseAttempt('a', 'method: M\nstate: reported\nworker: codex\nfiles: [x.md]\n')).toMatchObject({ id: 'a', state: 'reported', by: 'user', worker: 'codex', files: ['x.md'] })
    expect(parseAttempt('a', 'state: holds\n')).toBeNull()
    expect(nextAttemptId(undefined, new Set(['a', 'b']))).toBe('c')
    expect(nextAttemptId('c', new Set(['c', 'c1']))).toBe('c2')
    expect(nextAttemptId('c1', new Set())).toBe('c1a')
    expect(problemSlug('코너 항이 남는가?', new Set())).toBe('problem')
    expect(problemSlug('Corner term?', new Set(['corner-term']))).toBe('corner-term-2')
  })
})
