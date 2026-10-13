import { describe, expect, it } from 'vitest'
import { canonicalNoteFile, sameNoteFile } from './comment-target'

describe('주제 폴더 안 노트의 같은 이름 (10/13)', () => {
  it('workbench/topics/<주제>/<노트>/…는 workbench/notes/<노트>/…로 읽는다', () => {
    expect(canonicalNoteFile('workbench/topics/kempe/proof/note.md')).toBe('workbench/notes/proof/note.md')
    expect(canonicalNoteFile('workbench/topics/kempe/proof/fig/a.png')).toBe('workbench/notes/proof/fig/a.png')
    expect(canonicalNoteFile('workbench/topics/kempe/topic.yaml')).toBe('workbench/topics/kempe/topic.yaml')
    expect(canonicalNoteFile('workbench/calc/proof/note.md')).toBe('workbench/calc/proof/note.md')
    expect(canonicalNoteFile('docs/topics/kempe/proof/note.md')).toBe('docs/topics/kempe/proof/note.md')
  })
  it('주제 폴더 사이를 옮긴 노트는 같은 노트, 계산 노트는 다른 노트', () => {
    expect(sameNoteFile('workbench/topics/a/x/note.md', 'workbench/topics/b/x/note.md')).toBe(true)
    expect(sameNoteFile('workbench/topics/a/x/note.md', 'workbench/notes/x/note.md')).toBe(true)
    expect(sameNoteFile('workbench/notes/x/note.md', 'workbench/calc/x/note.md')).toBe(false)
  })
})
