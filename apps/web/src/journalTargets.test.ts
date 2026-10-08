import { describe, expect, it } from 'vitest'
import { isNoteTarget, journalTargetRoute } from './journalTargets'
import { href, parseRoute } from './router'

describe('일지에서 노트 열기', () => {
  it.each(['workbench/notes/증명/note.md', 'workbench/calc/수치 계산/note.md', 'workbench/calc/legacy/main.tex', 'docs/paper/intro.tex'])(
    '노트 경로 %s는 블록 id가 아닌 파일로 열고 주소를 왕복한다', (target) => {
      expect(isNoteTarget(target)).toBe(true)
      const route = journalTargetRoute('sample-research', target)
      expect(route).toEqual({ page: 'part', rid: 'sample-research', file: target })
      expect(parseRoute(href(route))).toEqual(route)
    },
  )

  it('보조 노트 id는 기존 블록 화면을 연다', () => {
    expect(isNoteTarget('kempe-chains')).toBe(false)
    expect(journalTargetRoute('sample-research', 'kempe-chains')).toEqual({ page: 'block', rid: 'sample-research', bid: 'kempe-chains' })
  })
})
