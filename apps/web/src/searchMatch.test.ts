import { describe, expect, it } from 'vitest'
import { matchScore, rank } from './searchMatch'

describe('전역 검색의 찾기', () => {
  it('찾는 말이 모두 있어야 맞고, 이름이 그 말로 시작하면 가장 앞이다', () => {
    expect(matchScore('kempe', 'Kempe chain')).toBe(0)
    expect(matchScore('chain', 'Kempe chain')).toBe(1)
    expect(matchScore('chain kempe', 'Kempe chain')).toBe(1)
    expect(matchScore('alpha', 'Wheel graph', 'Alpha 프로젝트')).toBe(2)
    expect(matchScore('wheel chair', 'Wheel graph')).toBeNull()
    expect(matchScore('Schrodinger', 'Schrödinger equation')).toBe(0)
    expect(matchScore('보조', '보조정리 3')).toBe(0)
  })
  it('점수 순, 같은 점수는 원래 순서로 limit개', () => {
    const xs = ['the lemma', 'lemma A', 'other', 'lemma B']
    expect(rank(xs, 'lemma', (x) => [x], 2)).toEqual(['lemma A', 'lemma B'])
    expect(rank(xs, '', (x) => [x], 3)).toEqual(['the lemma', 'lemma A', 'other'])
  })
})
