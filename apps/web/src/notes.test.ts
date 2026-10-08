import { describe, expect, it } from 'vitest'
import type { BlockRow, ResearchSummary, Statement } from './api'
import { paperOrder, proofState, shortLabel, statementGroup } from './notes'

const st = (id: string, kind: string, label?: string, more: Partial<Statement> = {}): Statement =>
  ({ id, kind, label, uses: [], proofs: [], file: `${id}.md`, mtime: 0, hash: '', ...more })
const block = (id: string, status: string, proves?: string) => ({ id, status, ...(proves && { extra: { proves } }) }) as unknown as BlockRow
const summary = (statements: Statement[], blocks: BlockRow[]) => ({ statements, blocks }) as unknown as ResearchSummary

describe('notes', () => {
  it('논문 순서: 바탕 → 공리 → 본문 → 부록, 묶음 안은 번호 순', () => {
    const list = [
      st('a2', 'proposition', 'Proposition A.2'),
      st('p10', 'proposition', 'Proposition 3.10'),
      st('ax', 'axiom', 'Axiom 1'),
      st('p9', 'proposition', 'Proposition 3.9'),
      st('ext', 'theorem', 'SSA'),
    ]
    expect(paperOrder(list).map((s) => s.id)).toEqual(['ext', 'ax', 'p9', 'p10', 'a2'])
    expect(statementGroup(st('x', 'lemma'))).toBe('바탕')
  })

  it('짧은 이름', () => {
    expect(shortLabel(st('x', 'proposition', 'Proposition 3.9, of SKK'))).toBe('Prop 3.9')
    expect(shortLabel(st('x', 'lemma', undefined, { title: '제목' }))).toBe('제목')
    expect(shortLabel(st('x', 'lemma'))).toBe('x')
  })

  it('증명 상태: 해결 > 진행 > 막힘 > 없음, 공리·정의는 따로', () => {
    const s = st('s', 'proposition', undefined, { proofs: ['b1'] })
    expect(proofState(summary([s], [block('b1', 'blocked')]), s)).toBe('blocked')
    expect(proofState(summary([s], [block('b1', 'blocked'), block('b2', 'in-progress', 's')]), s)).toBe('in-progress')
    expect(proofState(summary([s], [block('b1', 'solved'), block('b2', 'in-progress', 's')]), s)).toBe('solved')
    expect(proofState(summary([s], []), s)).toBe('none')
    expect(proofState(summary([], []), st('d', 'definition'))).toBe('given')
  })
})
