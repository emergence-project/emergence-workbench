import { describe, expect, it } from 'vitest'
import { autoProjectColor, PROJECT_COLOR_HEX, projectColor, setProjectColors } from './format'

describe('프로젝트 색', () => {
  it('고른 색은 그대로, 자동은 다른 프로젝트가 쓰는 색을 피한다', () => {
    const list = [{ id: 'a' }, { id: 'b' }, { id: 'c', color: 'teal' as const }, { id: 'd' }]
    setProjectColors(list)
    expect(projectColor('c')).toBe(PROJECT_COLOR_HEX.teal)
    const shown = list.map((r) => projectColor(r.id))
    expect(new Set(shown).size).toBe(list.length)
    expect(Object.values(PROJECT_COLOR_HEX)).toEqual(expect.arrayContaining(shown))
  })

  it('목록 순서를 바꿔도 자동 색은 그대로다', () => {
    const list = [{ id: 'eb' }, { id: 'ns' }, { id: 'sw' }, { id: 'qc' }]
    setProjectColors(list)
    const before = list.map((r) => projectColor(r.id))
    setProjectColors([...list].reverse())
    expect(list.map((r) => projectColor(r.id))).toEqual(before)
  })

  it('"자동" 점은 이 프로젝트의 고른 색을 뺀 목록으로 정한 색이고, 지금 색을 바꾸지 않는다', () => {
    const list = [{ id: 'a', color: 'pink' as const }, { id: 'b' }]
    setProjectColors(list)
    const auto = autoProjectColor('a', list)
    expect(auto).not.toBe(projectColor('b'))
    expect(projectColor('a')).toBe(PROJECT_COLOR_HEX.pink)
  })
})
