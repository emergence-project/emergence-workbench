import { describe, expect, it } from 'vitest'
import { changedFlags, onlySpacing, rangesOf, wordsOf, worthPainting } from './diffPaint'

const flagsOf = (a: string, b: string) => changedFlags(wordsOf(a).map((w) => w.key), wordsOf(b).map((w) => w.key))!

describe('바뀐 낱말 칠하기', () => {
  it('바뀐 낱말만 고르고, 붙은 낱말은 사이 빈칸까지 한 구간으로 칠한다', () => {
    const a = 'The state is approximately a Markov chain.'
    const b = 'The state is exactly a quantum Markov chain.'
    const f = flagsOf(a, b)
    const pick = (text: string, flags: boolean[]) => wordsOf(text).filter((_, k) => flags[k]).map((w) => w.key)
    expect(pick(a, f.a)).toEqual(['approximately'])
    expect(pick(b, f.b)).toEqual(['exactly', 'quantum'])
    expect(worthPainting(f)).toBe(true)
    const c = 'one two three four five'
    const g = flagsOf(c, 'one 2 3 four five')
    expect(rangesOf(wordsOf(c), g.a).map(([s, e]) => c.slice(s, e))).toEqual(['two three'])
  })
  it('한국어 어절도 나눈다', () => {
    const f = flagsOf('스핀파로 전개한다.', '스핀파로 전개하고 남긴다.')
    expect(f.a.filter(Boolean).length).toBeGreaterThan(0)
    expect(wordsOf('스핀파로 전개한다.').map((w) => w.key)).toContain('.')
  })
  it('절반 넘게 바뀌었거나 한쪽이 비면 칠하지 않는다', () => {
    expect(worthPainting(flagsOf('alpha beta gamma', 'delta epsilon gamma'))).toBe(false)
    expect(worthPainting(flagsOf('', 'new words'))).toBe(false)
  })
  it('띄어쓰기 · 줄바꿈만 바뀐 것을 안다', () => {
    expect(onlySpacing('a  b\nc', 'a b c')).toBe(true)
    expect(onlySpacing('a b', 'a b')).toBe(false)
    expect(onlySpacing('a b', 'a c')).toBe(false)
  })
})
