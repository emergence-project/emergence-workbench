import { describe, expect, it } from 'vitest'
import { sectionAt } from './conceptRecordPlace'

describe('sectionAt', () => {
  const src = ['', '', '', '# Planar graph', '', '## Definition', '', 'A graph is planar.', '```', '# not a heading', '```', '## **Properties**', '1. Euler'].join('\n')
  it('그 줄 위의 가장 가까운 제목', () => {
    expect(sectionAt(src, 8)).toBe('Definition')
    expect(sectionAt(src, 6)).toBe('Definition')
    expect(sectionAt(src, 13)).toBe('Properties')
  })
  it('코드 묶음 안의 # 줄은 건너뛴다', () => expect(sectionAt(src, 10)).toBe('Definition'))
  it('제목 앞이면 없음', () => expect(sectionAt(src, 2)).toBeUndefined())
})
