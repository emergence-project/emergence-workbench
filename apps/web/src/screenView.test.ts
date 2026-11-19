import { describe, expect, it } from 'vitest'
import { placeOf, screenLine } from './screenView'

describe('지금 화면 한 줄 (11/19)', () => {
  it('창 제목의 위치를 앞에서부터 읽는다', () => {
    expect(placeOf('노트 ‹ 프로젝트 — Emergence Workbench')).toEqual(['프로젝트', '노트'])
    expect(placeOf('Emergence Workbench')).toEqual([])
  })

  it('화면 이름 · 프로젝트 · 파일과 주소를 한 줄로', () => {
    expect(screenLine('#/r/r1/w/notes.md', 'notes ‹ 프로젝트 — Emergence Workbench'))
      .toBe('프로젝트 › notes · project r1 · notes.md (#/r/r1/w/notes.md)')
    expect(screenLine('', 'Emergence Workbench')).toMatch(/\(#\/\)$/)
  })
})
