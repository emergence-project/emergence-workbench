import { describe, expect, it } from 'vitest'
import { chainScore, feedbackRoute, parseUiPath } from './feedbackJump'

describe('feedback routes', () => {
  it('opens both feedback mode hashes and paths saved by about replies', () => {
    expect(feedbackRoute('#/r/sample-research/todo')).toBe('#/r/sample-research/todo')
    expect(feedbackRoute('/about/notes')).toBe('#/about/notes')
    expect(feedbackRoute('/about/design')).toBe('#/about/design')
    expect(feedbackRoute('/')).toBe('#/')
  })

  it('keeps the home fallback for missing or unsupported routes', () => {
    expect(feedbackRoute(undefined)).toBe('#/')
    expect(feedbackRoute('')).toBe('#/')
    expect(feedbackRoute('https://example.org')).toBe('#/')
  })
})

describe('feedback target path', () => {
  it('splits a ui path into names and items', () => {
    expect(parseUiPath('피드백 › 피드백 묶음 “지식” › 피드백 항목 “14:44 사이드바”')).toEqual([
      { name: '피드백' }, { name: '피드백 묶음', item: '지식' }, { name: '피드백 항목', item: '14:44 사이드바' },
    ])
    expect(parseUiPath('피드백 › 피드백 항목 “14:44 사이드바 › 개념노트 목록”')).toEqual([
      { name: '피드백' }, { name: '피드백 항목', item: '14:44 사이드바 › 개념노트 목록' },
    ])
    expect(parseUiPath('네트워킹 › 사람 페이지 › 분야 이름표').map((s) => s.name)).toEqual(['네트워킹', '사람 페이지', '분야 이름표'])
  })

  it('scores a data-ui chain from the innermost part outward', () => {
    const want = parseUiPath('네트워킹 › 사람 페이지 › 분야 이름표')
    expect(chainScore([{ name: '네트워킹' }, { name: '사람 페이지' }, { name: '분야 이름표' }], want)).toBe(3)
    // 중간에 끼어든 부위는 건너뛴다
    expect(chainScore([{ name: '네트워킹' }, { name: '목록' }, { name: '사람 페이지' }, { name: '분야 이름표' }], want)).toBe(3)
    expect(chainScore([{ name: '홈' }, { name: '분야 이름표' }], want)).toBe(1)
    expect(chainScore([{ name: '네트워킹' }, { name: '사람 페이지' }], want)).toBe(0)
  })

  it('matches items the way feedback mode clips them', () => {
    const want = [{ name: '카드', item: 'Cor 3.9.1 거리 보존' }]
    expect(chainScore([{ name: '카드', item: 'Cor 3.9.1 거리 보존' }], want)).toBe(1)
    expect(chainScore([{ name: '카드', item: '다른 카드' }], want)).toBe(0)
    const long = 'Computer Science 1 Linux&macOS terminal commands'
    expect(chainScore([{ name: '카드', item: long }], [{ name: '카드', item: `${long.slice(0, 23)}…` }])).toBe(1)
  })
})
