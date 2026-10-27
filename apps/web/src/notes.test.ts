import { describe, expect, it } from 'vitest'
import type { NoteRow, Statement } from './api'
import { paperOrder, proofState, shortLabel, statementGroup } from './notes'

const st = (id: string, kind: string, label?: string, more: Partial<Statement> = {}): Statement =>
  ({ id, kind, label, uses: [], proofs: [], file: `${id}.md`, mtime: 0, hash: '', ...more })
const note = (id: string, status: string) => ({ id, status }) as unknown as NoteRow
const ctx = (statements: Statement[], notes: NoteRow[]) => ({ statements, notes })

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
    const s = st('s', 'proposition', undefined, { proofs: ['b1', 'b2'] })
    expect(proofState(ctx([s], [note('b1', 'blocked')]), s)).toBe('blocked')
    expect(proofState(ctx([s], [note('b1', 'blocked'), note('b2', 'in-progress')]), s)).toBe('in-progress')
    expect(proofState(ctx([s], [note('b1', 'solved'), note('b2', 'in-progress')]), s)).toBe('solved')
    expect(proofState(ctx([s], [note('b3', 'solved')]), s)).toBe('none')
    expect(proofState(ctx([], []), st('d', 'definition'))).toBe('given')
  })
})
