// 시작 기록 · 반영 기록 (10/23, agent:start · agent:integrate)
import fs from 'node:fs'
import path from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { repo, useSampleApp } from './testkit.js'
import { withLang } from './i18n.js'
import { readFlowNode } from './flow.js'
import { integrateFlow, startFlow } from './flowStart.js'
import { Workbench } from './workbench.js'

useSampleApp()

const dir = () => path.join(repo, 'workbench', 'flow')
const put = (id: string, text: string) => fs.writeFileSync(path.join(dir(), `${id}.yaml`), text.trim() + '\n')
const wb = () => new Workbench(path.join(repo, 'workbench'))
const err = (f: () => unknown) => { try { withLang('ko', f); return '' } catch (e) { return (e as Error).message } }
const now = new Date('2026-10-23T09:00:00')
beforeEach(() => {
  fs.rmSync(dir(), { recursive: true, force: true })
  fs.mkdirSync(dir(), { recursive: true })
  put('dirac-q', 'format: 1\nkind: question\nprogress: done\nresult: solved\ntitle: Dirac 점에서도 상보 관계가 성립하는가\ndate: 2026-10-06\nfields:\n  question: Dirac 점에서 상보 관계?')
  put('zeng-lit', 'format: 1\nkind: literature\nprogress: done\nresult: solved\ntitle: Zeng 반사 논증\ndate: 2026-10-05\nfields:\n  reading: Zeng 2608.26078\n  gain: Dirac 점의 반사 대칭')
})

describe('시작 기록', () => {
  it('선행 찾기에 걸리면 가장 가까운 점이나 왜 다른지, 그리고 판정 기준이 있어야 시작한다', () => {
    const base = { kind: 'question' as const, short: 'Dirac 점의 J', fields: { question: 'Dirac 점에서 J는?' }, by: 'claude' }
    const m = err(() => startFlow(wb(), base, now))
    expect(m).toContain('선행 찾기에 2개가 걸렸습니다')
    expect(m).toContain('판정 기준')
    expect(err(() => startFlow(wb(), { ...base, prior: ['없음'], adds: 'x', criterion: 'c' }, now))).toContain('없는 점: 없음')
    expect(err(() => startFlow(wb(), { ...base, prior: ['dirac-q'], criterion: 'c' }, now))).toContain('이번에 더할 것')
    expect(fs.readdirSync(dir()).length).toBe(2) // 문을 못 지나면 아무것도 쓰지 않는다

    const { node, hits } = withLang('ko', () => startFlow(wb(), { ...base, prior: ['dirac-q'], adds: 'J 자체를 잰다', criterion: 'J ≠ 0이면 예', stop: '하루', topics: ['dirac'] }, now))
    expect(hits.map((h) => h.id).sort()).toEqual(['dirac-q', 'zeng-lit'])
    expect(node).toMatchObject({ kind: 'question', progress: 'active', by: 'claude', topics: ['dirac'], fields: { question: 'Dirac 점에서 J는?', criterion: 'J ≠ 0이면 예' } })
    expect(node.start).toEqual({ at: '2026-10-23T09:00', by: 'claude', query: 'Dirac 점의 J Dirac 점에서 J는?', hits: hits.map((h) => h.id), prior: ['dirac-q'], adds: 'J 자체를 잰다', stop: '하루' })
  })

  it('걸린 것이 없으면 왜 새로운지 한 줄. 판정 기준 칸이 없는 종류는 시작 기록에 적는다', () => {
    const base = { kind: 'proof' as const, short: 'Hall 전도도 상한', fields: { goal: '상한을 보인다' }, by: 'codex' }
    expect(err(() => startFlow(wb(), { ...base, criterion: 'c' }, now))).toContain('걸린 점이 없습니다')
    const { node } = startFlow(wb(), { ...base, novel: '흐름에 상한을 다룬 점이 없음', criterion: '부등식이 닫히면 해결' }, now)
    expect(node.fields).toEqual({ goal: '상한을 보인다' })
    expect(node.start).toMatchObject({ novel: '흐름에 상한을 다룬 점이 없음', criterion: '부등식이 닫히면 해결', hits: [], prior: [] })
  })

  it('있는 점에 붙이고, 이미 끝난 점이면 사후 기록이다. 시작 기록은 한 번', () => {
    put('calc-a', 'format: 1\nkind: calc\nprogress: done\nresult: solved\ntitle: 분기점 계산\nby: claude\nfields:\n  goal: 잰다\n  criterion: 1 % 안')
    const { node } = startFlow(wb(), { dot: 'calc-a', novel: '처음', by: 'claude' }, now)
    expect(node.progress).toBe('done')
    expect(node.start).toMatchObject({ late: true, novel: '처음' })
    put('calc-b', 'format: 1\nkind: calc\nprogress: open\ntitle: 다음 계산')
    const b = startFlow(wb(), { dot: 'calc-b', novel: '처음', criterion: '부호가 바뀌면 반증', by: 'claude' }, now).node
    expect(b).toMatchObject({ progress: 'active', fields: { criterion: '부호가 바뀌면 반증' } })
    expect(b.start?.late).toBeUndefined()
    expect(err(() => startFlow(wb(), { dot: 'calc-b', novel: '또', criterion: 'c', by: 'claude' }, now))).toContain('시작 기록이 이미 있습니다')
  })
})

describe('반영 기록', () => {
  it('이해 문서가 점 id를 가리켜야 하고, 아니면 반영하지 않는 이유', () => {
    fs.mkdirSync(path.join(repo, 'workbench/notes/overview'), { recursive: true })
    const doc = path.join(repo, 'workbench/notes/overview/note.md')
    fs.writeFileSync(doc, '# 개요\n\n## Dirac 점\n\n아직 없음\n')
    const into = 'workbench/notes/overview/note.md'
    expect(err(() => integrateFlow(wb(), { dot: 'dirac-q', by: 'claude' }, now))).toContain('가운데 하나')
    expect(err(() => integrateFlow(wb(), { dot: 'dirac-q', into, by: 'claude' }, now))).toContain('점 id "dirac-q"가 적혀 있지 않습니다')
    expect(err(() => integrateFlow(wb(), { dot: 'dirac-q', into, section: '없는 절', by: 'claude' }, now))).toContain('반영한 절이 없습니다')
    expect(err(() => integrateFlow(wb(), { dot: 'dirac-q', into: '../x.md', by: 'claude' }, now))).toContain('문서가 없습니다')
    fs.writeFileSync(doc, '# 개요\n\n## Dirac 점\n\n상보 관계가 성립한다 (flow-dirac-q).\n')
    const n = integrateFlow(wb(), { dot: 'dirac-q', into, section: 'Dirac 점', by: 'claude' }, now)
    expect(n.integration).toEqual({ at: '2026-10-23T09:00', by: 'claude', into, section: 'Dirac 점' })
    expect(integrateFlow(wb(), { dot: 'zeng-lit', skip: '문헌 점이라 개요에 넣지 않음', by: 'claude' }, now).integration).toMatchObject({ skip: '문헌 점이라 개요에 넣지 않음' })
    expect(readFlowNode(wb(), 'dirac-q').integration?.into).toBe(into)
  })
})
