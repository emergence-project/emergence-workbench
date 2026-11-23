import { describe, expect, it } from 'vitest'
import { shownView } from './WorkAside'

describe('shownView: 에이전트 화면 오른쪽 칸의 보기 (11/23 시안 agent-side-views)', () => {
  const all = { changes: true, terminal: true }
  it('고른 보기를 그대로 보이고, 닫았으면 칸이 없다', () => {
    expect(shownView('changes', all)).toBe('changes')
    expect(shownView('terminal', all)).toBe('terminal')
    expect(shownView(null, all)).toBeNull()
  })
  it('변경사항이 없는 대화나 터미널을 못 쓰는 화면에서는 정보로', () => {
    expect(shownView('changes', { changes: false, terminal: true })).toBe('info')
    expect(shownView('terminal', { changes: true, terminal: false })).toBe('info')
  })
})
