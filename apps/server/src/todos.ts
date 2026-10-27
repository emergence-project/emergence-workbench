// 할 일 (2026-10-16 "할 일 원본 하나"): 정본은 기록 파일(comments/<대상>.md)의 할 일 기록이다.
// 사이드바 수 · 첫 화면 · 달력 · STATUS · 한눈에 표가 모두 openTodos 하나를 읽는다.
// 예전에는 일지(log/)에도 할 일을 한 줄씩 썼다. 끝내지 않은 그 줄은 앱이 한 번 기록으로 옮기고 일지에서 뺀다(migrateJournalTodos).
import fs from 'node:fs'
import path from 'node:path'
import { compactStamp, editJournalEntry, noteRecordTarget, parseJournal, RESEARCH_TARGET, sameNoteFile, todoDue } from '@rw/core'
import type { OpenTodo } from '@rw/core/contract/research'
import { addComment, listComments } from './comments.js'
import { todoText } from './commentJournal.js'
import { writeAtomic } from './fsutil.js'
import { listNotes } from './noteList.js'
import type { Workbench } from './workbench.js'

/** 기록 id c-YYYYMMDD-HHMM… → YYYY-MM-DD */
const writtenOf = (id: string) => { const m = /^c-(\d{4})(\d{2})(\d{2})-/.exec(id); return m ? `${m[1]}-${m[2]}-${m[3]}` : '' }

/** 끝내지 않은 할 일. 마감이 이른 것부터, 마감이 없으면 먼저 적은 것부터 */
export function openTodos(root: string): OpenTodo[] {
  const out: OpenTodo[] = []
  for (const file of listComments(root)) {
    for (const c of file.comments) {
      if (c.kind !== '할 일' || c.state === '끝냄') continue
      const text = todoText(c.body, c.quote)
      const written = writtenOf(c.id)
      const due = written ? todoDue(text, written) : null
      out.push({ target: file.target, id: c.id, where: file.title, ...(file.source && { source: file.source }), text, written, ...(due && { due }) })
    }
  }
  return out.sort((a, b) => (a.due ?? '9999').localeCompare(b.due ?? '9999') || a.id.localeCompare(b.id))
}

/** 예전 일지에 남은 끝내지 않은 할 일 수 (앱이 아직 옮기지 않은 것. 클라우드의 STATUS가 알린다) */
export function legacyJournalTodos(wb: Workbench): number {
  return wb.journalDates().reduce((n, d) => n + wb.readJournal(d).filter((e) => e.kind === 'todo' && !e.done).length, 0)
}

interface Place { target: string; title: string; source?: string; suffix?: string }

/** 일지의 대상(연구 · 노트 경로)을 기록 대상으로. 기록 칸이 없는 곳은 프로젝트에 두고 글 끝에 원래 대상을 적는다 */
function placeOf(wb: Workbench, target: string, notes: ReturnType<typeof listNotes>): Place {
  const project: Place = { target: 'project', title: wb.readResearch().title }
  if (target === RESEARCH_TARGET) return project
  const note = notes.find((n) => n.file === target) ?? notes.find((n) => sameNoteFile(n.file, target))
  const noteTarget = note && noteRecordTarget(note)
  if (note && noteTarget) return { target: noteTarget, title: `노트 ${note.title || note.id}`, source: note.file }
  return { ...project, suffix: ` (${target})` }
}

/**
 * 예전 일지의 끝내지 않은 할 일을 기록으로 옮긴다 (한 번, 앱이 프로젝트를 열 때). 끝낸 할 일([x])은 있었던 일이라 일지에 둔다.
 * - 이미 기록과 이어진 줄(rw-todo, 또는 예전의 같은 시각 · 같은 글 기록)은 일지에서 빼기만 한다.
 * - 나머지는 그 대상의 기록 파일에 할 일로 덧붙이고(기록 id는 일지의 날짜 · 시각) 일지에서 뺀다.
 * 기록을 먼저 쓰고 일지를 고치므로, 중간에 멈춰도 할 일을 잃지 않는다(다시 돌면 같은 시각 · 같은 글 기록을 찾아 빼기만 한다).
 */
export function migrateJournalTodos(wb: Workbench): { moved: number; removed: number } {
  let moved = 0
  let removed = 0
  const dates = wb.journalDates()
  if (!dates.length) return { moved, removed }
  let notes: ReturnType<typeof listNotes> | null = null
  for (const date of dates) {
    const file = path.join(wb.logDir, `${date}.md`)
    if (fs.lstatSync(file).isSymbolicLink()) continue
    const before = fs.readFileSync(file, 'utf8')
    const open = parseJournal(before, date).filter((e) => e.kind === 'todo' && !e.done)
    if (!open.length) continue
    const records = listComments(wb.root).flatMap((f) => f.comments.filter((c) => c.kind === '할 일').map((c) => ({ file: f, c })))
    let after = before
    // 뒤에서부터 빼야 앞 기록의 번호가 밀리지 않는다
    for (const e of [...open].reverse()) {
      const linked = e.link
        ? records.some(({ file: f, c }) => `${f.target}/${c.id}` === e.link)
        : records.some(({ c }) => (c.journal === `${e.date} ${e.time}` || c.id.startsWith(`c-${compactStamp(date, e.time)}`)) && todoText(c.body, c.quote).startsWith(todoText(e.text)))
      if (!linked) {
        notes ??= listNotes(wb)
        const place = placeOf(wb, e.target, notes)
        const [h, m] = e.time.split(':').map(Number) as [number, number]
        const at = new Date(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)), h, m)
        addComment(wb.root, place.target, { kind: '할 일', text: `${e.text}${place.suffix ?? ''}`, title: place.title, ...(place.source && { source: place.source }) }, at)
        moved++
      }
      after = editJournalEntry(after, e.index, null)
      removed++
    }
    writeAtomic(file, after)
  }
  return { moved, removed }
}
