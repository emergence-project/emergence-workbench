import { describe, expect, it } from 'vitest'
import { isNoteTarget, journalTargetRoute } from './journalTargets'
import { href, parseRoute } from './router'

describe('일지에서 노트 열기', () => {
  it.each(['workbench/notes/증명/note.md', 'workbench/topics/kempe/증명/note.md', 'workbench/calc/수치 계산/note.md', 'workbench/calc/legacy/main.tex', 'docs/paper/intro.tex'])(
    '노트 경로 %s는 블록 id가 아닌 파일로 열고 주소를 왕복한다', (target) => {
      expect(isNoteTarget(target)).toBe(true)
      const route = journalTargetRoute('sample-research', target)
      expect(route).toEqual({ page: 'part', rid: 'sample-research', file: target })
      expect(parseRoute(href(route))).toEqual(route)
    },
  )

  it('옛 블록 노트 id는 같은 이름의 노트를 연다, 없으면 프로젝트 첫 화면', () => {
    expect(isNoteTarget('kempe-chains')).toBe(false)
    const file = 'workbench/topics/kempe/kempe-chains/main.tex'
    expect(journalTargetRoute('sample-research', 'kempe-chains', (id) => (id === 'kempe-chains' ? { title: 'Kempe', file } : undefined))).toEqual({ page: 'part', rid: 'sample-research', file })
    expect(journalTargetRoute('sample-research', 'gone')).toEqual({ page: 'overview', rid: 'sample-research' })
  })
})
