import { describe, expect, it } from 'vitest'
import { affiliationSuggestions } from './affiliationSuggest'

describe('affiliationSuggestions', () => {
  const known = ['KIAS', 'KIST', 'KAIST Physics', 'kias', 'Seoul National University', 'POSTECH']
  it('앞에서 맞는 것 먼저, 여러 번 쓴 것 먼저', () => {
    expect(affiliationSuggestions('ki', known, [])).toEqual(['KIAS', 'KIST'])
    expect(affiliationSuggestions('s', known, [])).toEqual(['Seoul National University', 'KIAS', 'KAIST Physics', 'KIST', 'POSTECH'])
  })
  it('이미 적은 소속과 적은 글 그대로인 것은 빼고, 빈 글이면 제안하지 않는다', () => {
    expect(affiliationSuggestions('ki', known, ['KIAS'])).toEqual(['KIST'])
    expect(affiliationSuggestions('kist', known, [])).toEqual([])
    expect(affiliationSuggestions('  ', known, [])).toEqual([])
  })
})
