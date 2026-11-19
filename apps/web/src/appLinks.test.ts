import { describe, expect, it } from 'vitest'
import { appLinkIndex, appLinks, repoOfPr } from './appLinks'

const ix = appLinkIndex({
  chats: ['2026-11-19-10ac153f', '2026-11-18-0badcafe'],
  feedback: ['2026-11-19 12:14 에이전트', '2026-11-19 12:14 에이전트 › 대화', '2026-11-18 09:00 홈', '2026-11-18 09:00 노트'],
  repo: 'https://github.com/o/r/',
})

describe('appLinks', () => {
  it('대화 id: 전체 꼴과 아는 짧은 꼴', () => {
    expect(appLinks('하위 대화 10ac153f에서', ix)).toEqual([
      { kind: 'text', text: '하위 대화 ' }, { kind: 'agent', id: '2026-11-19-10ac153f', text: '10ac153f' }, { kind: 'text', text: '에서' },
    ])
    expect(appLinks('2026-11-17-deadbeef 끝남', ix)[0]).toEqual({ kind: 'agent', id: '2026-11-17-deadbeef', text: '2026-11-17-deadbeef' })
    // 모르는 짧은 꼴 · 더 긴 hex(커밋)는 그대로
    expect(appLinks('커밋 deadbeef · 7185126abc', ix)).toEqual([{ kind: 'text', text: '커밋 deadbeef · 7185126abc' }])
  })
  it('피드백 키: 가장 긴 키 · 시각이 한 항목뿐이면 시각만으로', () => {
    expect(appLinks('「2026-11-19 12:14 에이전트 › 대화」 처리', ix)[1]).toEqual({ kind: 'feedback', key: '2026-11-19 12:14 에이전트 › 대화', text: '2026-11-19 12:14 에이전트 › 대화' })
    expect(appLinks('2026-11-19 12:14 에이전트에 답', ix)[0]).toMatchObject({ kind: 'feedback', key: '2026-11-19 12:14 에이전트' })
    // 같은 시각이 둘이면 고르지 않는다
    expect(appLinks('2026-11-18 09:00 건', ix)).toEqual([{ kind: 'text', text: '2026-11-18 09:00 건' }])
  })
  it('PR 번호: 저장소를 알 때만, #/ 주소 · 색 값은 아님', () => {
    expect(appLinks('PR #488 합침', ix)[1]).toEqual({ kind: 'pr', n: 488, url: 'https://github.com/o/r/pull/488', text: '#488' })
    expect(appLinks('(#12)', ix)[1]).toMatchObject({ kind: 'pr', n: 12 })
    expect(appLinks('색 #fff · #/agent', ix)).toEqual([{ kind: 'text', text: '색 #fff · #/agent' }])
    expect(appLinks('PR #488', appLinkIndex({ chats: [], feedback: [] }))).toEqual([{ kind: 'text', text: 'PR #488' }])
  })
  it('PR 주소에서 저장소', () => {
    expect(repoOfPr('https://github.com/o/r/pull/3')).toBe('https://github.com/o/r')
    expect(repoOfPr(undefined)).toBeUndefined()
  })
})
