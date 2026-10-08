// 기록 파일이 할 일의 정본이고, 일지는 작업 목록·완료 날짜를 위한 연결 기록이다.
import fs from 'node:fs'
import path from 'node:path'
import { appendJournalEntry, editJournalEntry, parseJournal, RESEARCH_TARGET, setTodoDone, type JournalEntry } from '@rw/core'
import type { LinkedTodoFileChange } from './linkedTodoWrite.js'
import type { CommentEntry, CommentFile } from './comments.js'
import { localDate, localTime } from './fsutil.js'
import { Workbench, WorkbenchError } from './workbench.js'
import { t } from './i18n.js'

/** 일지의 대상은 기록 파일 이름 대신 실제 노트 경로 또는 보조 노트 id다. */
export function todoJournalTarget(target: string, source?: string): string {
  if (target === 'project') return RESEARCH_TARGET
  if (/^(note|calc)-/.test(target)) {
    if (!source) throw new WorkbenchError(400, t('할 일을 붙일 노트 경로가 필요함', 'The note path for the to-do is required'))
    return source
  }
  return target.startsWith('block-') ? source || target.slice('block-'.length) : target
}

// appendJournalEntry가 할 일의 여러 줄을 한 줄로 저장하는 방법과 맞춘다.
const todoText = (body: string, quote?: string) => (body.trim() || quote?.trim() || '').replace(/\r\n/g, '\n').replace(/\s*\n\s*/g, ' ')

export function appendTodoJournal(root: string, target: string, source: string | undefined, body: string, quote: string | undefined, now: Date, id?: string): string {
  const entry = new Workbench(root).appendJournal({
    date: localDate(now), time: localTime(now), kind: 'todo',
    target: todoJournalTarget(target, source), text: todoText(body, quote), ...(id ? { link: `${target}/${id}` } : {}),
  })
  return `${entry.date} ${entry.time}`
}

/** 인덱스는 바깥에서 일지를 고치면 달라진다. 날짜·시각·종류·대상·글이 모두 같아야 연결한다. */
export function matchesTodoJournal(file: CommentFile, record: CommentEntry, journal: JournalEntry): boolean {
  if (record.kind !== '할 일' || journal.kind !== 'todo' || record.journal !== `${journal.date} ${journal.time}`) return false
  if (journal.link !== undefined && journal.link !== `${file.target}/${record.id}`) return false
  if (/^(note|calc)-/.test(file.target) && !file.source) return false
  return journal.target === todoJournalTarget(file.target, file.source) && journal.text === todoText(record.body, record.quote)
}

/** 같은 분에 같은 글을 적어도 구분한다. 인덱스가 바뀌었으면 유일하게 일치하는 기록만 잇는다. */
export function linkedTodoJournal(file: CommentFile, record: CommentEntry, journals: JournalEntry[]): JournalEntry | undefined {
  const explicit = journals.filter((entry) => entry.link === `${file.target}/${record.id}`)
  // 명시된 연결이 있으면 수동 일지와 같은 글이어도 그것만 찾는다. 중복 식별자나 바깥 고침은 멈춘다.
  if (explicit.length) return explicit.length === 1 && matchesTodoJournal(file, record, explicit[0]!) ? explicit[0] : undefined
  const matches = journals.filter((entry) => matchesTodoJournal(file, record, entry))
  // 예전 중복은 추측하지 않는다.
  if (matches.length !== 1) return undefined
  const match = matches[0]!
  if (match.link) return match
  return file.comments.filter((entry) => matchesTodoJournal(file, entry, match)).length === 1 ? match : undefined
}

/** 기록 수정·삭제와 일지 수정·삭제가 함께 쓰는 계획. 아직 아무 파일도 쓰지 않는다. */
export function prepareTodoJournalChange(root: string, file: CommentFile, record: CommentEntry | undefined,
  next: CommentEntry | undefined, change: { text: boolean; state: boolean }): LinkedTodoFileChange[] {
  if (record?.kind !== '할 일' || (next && !change.text && !change.state)) return []
  const pointer = /^(\d{4}-\d{2}-\d{2}) \d{2}:\d{2}$/.exec(record.journal ?? '')
  if (!pointer) return [] // 연결 메타가 없는 손으로 쓴 할 일은 기록만 고친다.
  const date = pointer[1]!
  const wb = new Workbench(root)
  const journalFile = path.join(wb.logDir, `${date}.md`)
  const before = fs.existsSync(journalFile) ? fs.readFileSync(journalFile, 'utf8') : undefined
  const journals = parseJournal(before ?? '', date)
  const linked = linkedTodoJournal(file, record, journals)
  if (!linked) {
    const id = `${file.target}/${record.id}`
    // 상대 항목이 완전히 없어졌으면 남은 기록만 고친다. 형식이 깨진 연결 줄도 바깥 고침으로 보존한다.
    const marked = [...(before ?? '').matchAll(/<!--\s*rw-todo:\s*([^\s>]+)/g)].some((match) => match[1] === id)
    const possible = marked || journals.some((entry) => entry.link === id ||
      (entry.link === undefined && record.journal === `${entry.date} ${entry.time}` && entry.target === todoJournalTarget(file.target, file.source)))
    if (!possible) return []
    // 상태만의 기존 동작은 유지한다. 글 수정·삭제는 분리된 두 글을 더 갈라놓지 않는다.
    if (next && !change.text) return []
    throw new WorkbenchError(409, t('연결된 일지가 바뀌었거나 연결을 확정할 수 없습니다. 기록과 일지를 다시 열어 확인해 주세요.', 'The linked journal entry changed or the link is unclear. Reopen the records and the journal to check.'))
  }
  let after = before!
  if (!next) after = editJournalEntry(after, linked.index, null)
  else {
    if (change.text) after = editJournalEntry(after, linked.index, todoText(next.body, next.quote))
    if (change.state) after = setTodoDone(after, linked.index, next.state === '끝냄')
  }
  const changes: LinkedTodoFileChange[] = []
  if (after !== before) changes.push({ file: journalFile, before, after })
  if (next && change.state && next.state === '끝냄' && !linked.done) {
    const today = localDate()
    const doneFile = path.join(wb.logDir, `${today}.md`)
    const current = changes.find((c) => c.file === doneFile)
    const original = doneFile === journalFile ? before : fs.existsSync(doneFile) ? fs.readFileSync(doneFile, 'utf8') : undefined
    const content = current?.after ?? original ?? ''
    const done = appendJournalEntry(content, { date: today, time: localTime(), kind: 'done', target: linked.target, text: todoText(next.body, next.quote) })
    if (current) current.after = done
    else changes.push({ file: doneFile, before: original, after: done })
  }
  return changes
}
