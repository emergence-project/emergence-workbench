import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { listComments, readComments } from './comments.js'
import { archivePlan, archiveRecords, listArchived, restoreRecords, tidyHint, TIDY_HINT_AT } from './recordArchive.js'
import { parseComments } from './comments.js'

const FILE = `# 코멘트 · 예제
<!-- rw-source: notes/x/note.md -->

> 안내문

## c-20260101-0900 · 메모 · 전체
- 상태: 끝냄

오래된 완료 메모

## c-20260102-0900 · 질문 · 전체
<!-- rw: {"by":"claude"} -->
- 상태: 대기

에이전트가 물은 것

### 답 · 사용자 · 2026-01-03 10:00

답했다

- 상태: 답함

## c-20260104-0900 · 메모 · 전체

열린 메모

## c-20260105-0900 · 할 일 · 전체
- 상태: 끝냄

끝낸 할 일

## c-20260106-0900 · 질문 · 전체
<!-- rw: {"todo":"c-20260105-0900"} -->
- 상태: 대기

그 할 일에 대해 물은 것 (아직 대기)

## c-20261120-0900 · 메모 · 전체
- 상태: 끝냄

얼마 전에 끝낸 메모
`

let root: string
const now = new Date(2026, 10, 23).getTime()
const file = () => path.join(root, 'comments', 'note-x.md')
beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'rw-archive-')); fs.mkdirSync(path.join(root, 'comments')); fs.writeFileSync(file(), FILE) })
afterEach(() => fs.rmSync(root, { recursive: true, force: true }))

describe('완료 기록 보관', () => {
  it('90일 지난 완료 기록만 고른다: 끝냄과 답한 에이전트 질문. 열린 것 · 최근 것 · 묶음이 열려 있는 할 일은 둔다', () => {
    expect(archivePlan(root, now)).toEqual([{ target: 'note-x', ids: ['c-20260101-0900', 'c-20260102-0900'] }])
  })
  it('옮긴 기록은 목록에서 빠지고 보관에서 그대로 읽힌다. 나머지 기록의 글자는 바뀌지 않는다', () => {
    const moved = archiveRecords(root, now)
    expect(moved[0]!.ids).toHaveLength(2)
    expect(readComments(root, 'note-x').comments.map((c) => c.id)).toEqual(['c-20260104-0900', 'c-20260105-0900', 'c-20260106-0900', 'c-20261120-0900'])
    expect(listComments(root)).toHaveLength(1)
    const kept = fs.readFileSync(file(), 'utf8')
    expect(kept.startsWith('# 코멘트 · 예제\n<!-- rw-source: notes/x/note.md -->\n\n> 안내문\n\n## c-20260104-0900')).toBe(true)
    expect(FILE.endsWith(kept.slice(kept.indexOf('## c-20260104-0900')))).toBe(true)
    const [a] = listArchived(root)
    expect(a).toMatchObject({ target: 'note-x', title: '예제', source: 'notes/x/note.md' })
    expect(a!.comments.map((c) => [c.id, c.state, c.body])).toEqual([['c-20260101-0900', '끝냄', '오래된 완료 메모'], ['c-20260102-0900', '답함', '에이전트가 물은 것']])
    expect(a!.comments[1]!.answers).toEqual([{ by: '사용자', at: '2026-01-03 10:00', body: '답했다' }])
  })
  it('두 번 돌려도 같고, 다음 정리는 같은 보관 파일 끝에 붙인다', () => {
    archiveRecords(root, now)
    expect(archiveRecords(root, now)).toEqual([])
    const later = new Date(2027, 5, 1).getTime()
    expect(archiveRecords(root, later)[0]!.ids).toEqual(['c-20261120-0900'])
    expect(listArchived(root)[0]!.comments.map((c) => c.id)).toEqual(['c-20260101-0900', 'c-20260102-0900', 'c-20261120-0900'])
  })
  it('되돌리면 원래 파일로 돌아오고, 빈 보관 파일은 없어진다', () => {
    const moved = archiveRecords(root, now)
    expect(restoreRecords(root, moved)).toBe(2)
    expect(readComments(root, 'note-x').comments.map((c) => c.id).sort()).toEqual(['c-20260101-0900', 'c-20260102-0900', 'c-20260104-0900', 'c-20260105-0900', 'c-20260106-0900', 'c-20261120-0900'])
    expect(listArchived(root)).toEqual([])
    expect(fs.existsSync(path.join(root, 'comments', 'archive', 'note-x.md'))).toBe(false)
  })
  it('옮기다 멈춰 두 곳에 남은 기록은 다음 정리에서 한쪽만 남는다', () => {
    archiveRecords(root, now)
    fs.writeFileSync(file(), FILE)
    archiveRecords(root, now)
    expect(listArchived(root)[0]!.comments.map((c) => c.id)).toEqual(['c-20260101-0900', 'c-20260102-0900'])
    expect(readComments(root, 'note-x').comments.map((c) => c.id)).not.toContain('c-20260101-0900')
  })
})

describe('정리 권하기', () => {
  const many = (n: number, year: number) => parseComments('project', Array.from({ length: n }, (_, i) => `## c-${year}0101-${String(1000 + i)} · 메모 · 전체\n- 상태: 끝냄\n\n메모 ${i}\n`).join('\n'))
  const now = new Date(2026, 10, 23).getTime()
  it('완료 기록이 기준을 넘고 옮길 것이 있을 때만', () => {
    expect(tidyHint([many(TIDY_HINT_AT - 1, 2025)], now)).toBeNull()
    expect(tidyHint([many(TIDY_HINT_AT, 2025)], now)).toEqual({ done: TIDY_HINT_AT, ready: TIDY_HINT_AT })
  })
})
