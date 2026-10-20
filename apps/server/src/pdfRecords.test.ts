import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { addComment, setCommentState, readComments } from './comments.js'
import { addHighlightQuads, noteRecordMarks } from './pdfRecords.js'

const tmp = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'rw-pdfrec-'))
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }))

describe('noteRecordMarks', () => {
  const root = path.join(tmp, 'workbench')
  const note = path.join(root, 'notes/spin/note.md')
  fs.mkdirSync(path.dirname(note), { recursive: true })
  fs.writeFileSync(note, '# Spin\n\nThe lower branch softens at the boundary.\n')
  const source = 'workbench/notes/spin/note.md'
  const now = new Date('2026-10-14T01:10:00Z')
  addComment(root, 'note-spin', { kind: '질문', title: 'Spin', source, quote: 'lower branch softens', line: 3, text: '근거 그림은?' }, now)
  addComment(root, 'note-spin', { kind: '메모', title: 'Spin', source, text: '노트 전체 메모' }, new Date('2026-10-14T02:00:00Z'))
  addComment(root, 'note-spin', { kind: '할 일', title: 'Spin', source, quote: 'boundary', line: 3, text: '끝낸 일' }, new Date('2026-10-14T03:00:00Z'))
  addComment(root, 'note-other', { kind: '메모', title: 'Other', source: 'workbench/notes/other/note.md', text: '다른 노트' }, now)

  it('collects this note only, with title and text', () => {
    const marks = noteRecordMarks(root, note, 'all')
    expect(marks.map((m) => m.text)).toEqual(['근거 그림은?', '노트 전체 메모', '끝낸 일'])
    expect(marks[0]).toMatchObject({ kind: '질문', quote: 'lower branch softens', line: 3, title: expect.stringMatching(/^질문 · 사용자 · 10\/14$/) })
  })

  it('leaves out done records when only open ones are asked', () => {
    const file = readComments(root, 'note-spin')
    const done = file.comments.find((c) => c.body === '끝낸 일')!
    setCommentState(root, 'note-spin', done.id, '끝냄', file.hash)
    expect(noteRecordMarks(root, note, 'open').map((m) => m.text)).toEqual(['근거 그림은?', '노트 전체 메모'])
    expect(noteRecordMarks(root, note, 'all')).toHaveLength(3)
  })
})

describe('addHighlightQuads', () => {
  it('appends QuadPoints from Rect as an incremental update, once', () => {
    const file = path.join(tmp, 'h.pdf')
    const body = '%PDF-1.4\n1 0 obj\n<</Type/Catalog>>\nendobj\n9 0 obj\n<</Subtype/Highlight/C[1 .85 .2]/F 4/Rect[10 20 110 32]>>\nendobj\n'
    fs.writeFileSync(file, `${body}xref\n0 1\n0000000000 65535 f \ntrailer\n<</Root 1 0 R/Size 10>>\nstartxref\n${body.length}\n%%EOF\n`)
    expect(addHighlightQuads(file)).toBe(1)
    const pdf = fs.readFileSync(file, 'latin1')
    expect(pdf).toContain('9 0 obj\n<</Subtype/Highlight/C[1 .85 .2]/F 4/Rect[10 20 110 32]/QuadPoints[10 32 110 32 10 20 110 20]>>\nendobj')
    const offset = Number(/xref\n9 1\n(\d{10}) 00000 n/.exec(pdf)![1])
    expect(pdf.slice(offset, offset + 7)).toBe('9 0 obj')
    expect(pdf).toMatch(new RegExp(`<</Root 1 0 R/Size 10/Prev ${body.length}>>\\nstartxref\\n\\d+\\n%%EOF\\n$`))
    expect(addHighlightQuads(file)).toBe(0)
  })

  it('finds a highlight right after a stream object', () => {
    const file = path.join(tmp, 's.pdf')
    const body = '%PDF-1.4\n1 0 obj\n<</Type/Catalog>>\nendobj\n5 0 obj\n<</Length 10>>\nstream\nBT ET q Q\nendstream\nendobj\n9 0 obj\n<</Subtype/Highlight/Rect[10 20 110 32]>>\nendobj\n'
    fs.writeFileSync(file, `${body}xref\n0 1\n0000000000 65535 f \ntrailer\n<</Root 1 0 R/Size 10>>\nstartxref\n${body.length}\n%%EOF\n`)
    expect(addHighlightQuads(file)).toBe(1)
    const pdf = fs.readFileSync(file, 'latin1')
    expect(pdf).toContain('\nxref\n9 1\n')
    expect(pdf.slice(pdf.lastIndexOf('%%EOF\n', pdf.length - 7))).toContain('9 0 obj\n<</Subtype/Highlight/Rect[10 20 110 32]/QuadPoints[10 32 110 32 10 20 110 20]>>\nendobj')
  })
})
