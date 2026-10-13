import { describe, expect, it } from 'vitest'
import { noteTarget } from './Comments'

describe('노트의 코멘트 대상', () => {
  it('주제 폴더 안 노트는 notes/의 노트와 같은 대상이라 주제를 바꿔 옮겨도 코멘트가 따라간다 (10/13)', () => {
    const inTopic = noteTarget('workbench/topics/kempe/proof/note.md', '증명')
    expect(inTopic).toEqual({ target: 'note-proof', title: '연구노트 증명', source: 'workbench/topics/kempe/proof/note.md' })
    expect(noteTarget('workbench/notes/proof/note.md')?.target).toBe(inTopic?.target)
    expect(noteTarget('workbench/calc/proof/note.md')?.target).toBe('calc-proof')
    expect(noteTarget('workbench/topics/kempe/note.md')).toBeNull()
  })
})
