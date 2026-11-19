import { describe, expect, it } from 'vitest'
import { mockupRefs } from './Mockups'
import { groupMockups } from './FeedbackMockups'

describe('mockupRefs (글에 나온 시안 경로)', () => {
  it('작업 폴더가 든 경로는 그 대화, 없는 경로는 이 대화의 시안', () => {
    const text = '시안: ~/.config/x/agent-worktrees/2026-11-19-abc/mockups/home-a.png 와 `mockups/home-b.html`'
    expect(mockupRefs(text, 'me')).toEqual([{ dir: '2026-11-19-abc', stem: 'home-a' }, { dir: 'me', stem: 'home-b' }])
  })
  it('.{png,html}처럼 묶어 적어도, 같은 시안을 여러 번 적어도 하나', () => {
    expect(mockupRefs('mockups/a.{png,html} 그리고 mockups/a.png, mockups/a.html', 'me')).toEqual([{ dir: 'me', stem: 'a' }])
  })
  it('시안 폴더가 아니거나 다른 종류는 고르지 않는다', () => {
    expect(mockupRefs('docs/a.png mockups/notes.md mockups/a.pngx shots/mockups.png', 'me')).toEqual([])
  })
})

describe('groupMockups (피드백 시안 묶기)', () => {
  it('같은 이름의 그림과 html은 한 시안, 이름 앞 날짜-시각-mockup-은 뺀다', () => {
    expect(groupMockups(['pictures/2026-11-19-1432-mockup-tabs.png', 'pictures/2026-11-19-1432-mockup-tabs.html', 'pictures/only.html', 'pictures/x.txt'])).toEqual([
      { stem: 'pictures/2026-11-19-1432-mockup-tabs', name: 'tabs', pic: 'pictures/2026-11-19-1432-mockup-tabs.png', html: 'pictures/2026-11-19-1432-mockup-tabs.html' },
      { stem: 'pictures/only', name: 'only', html: 'pictures/only.html' },
    ])
  })
})
