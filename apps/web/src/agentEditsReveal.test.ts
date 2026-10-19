import { describe, expect, it } from 'vitest'
import { hunkSnippet } from './AgentEditsPage'

describe('수정 검토 "노트에서 이 자리로"의 찾을 조각 (10/19)', () => {
  it('수식 · 꾸밈 기호 · 링크를 빼고 앞 낱말 몇 개', () => {
    expect(hunkSnippet('- Acceptance of the **full-position** Fourier convention with the phase $\\exp(i k r)$, which')).toBe('Acceptance of the full-position Fourier')
    expect(hunkSnippet('See [the note](a.md) for $x$.')).toBe('See the note for .')
    expect(hunkSnippet('$$a=b$$')).toBe('')
  })
})
