import { tr } from './i18n.js'
/**
 * 날짜별 일지 파일 (workbench/log/YYYY-MM-DD.md).
 *
 *   # 2026-09-30
 *
 *   ## 09:40 · 상태 · discharging
 *   진행 중 → 막힘
 *
 *   ## 11:20 · 할 일 · kempe-chains
 *   - [ ] 식 (3.5)의 유일성 조건 적기
 *
 *   ## 16:05 · 완료 · kempe-chains
 *   식 (3.5)의 유일성 조건 적기
 *
 * "완료"는 할 일을 끝냈다고 표시한 날 그날 일지에 남는 기록이다(할 일 자체는 적은 날 파일에서 [x]로 바뀐다).
 * 한 일 달력이 "언제 끝냈는지"를 이 기록으로 안다.
 *
 * 새 기록은 파일 끝에 덧붙인다(시간순). 사람과 에이전트가 손으로 써도 같은 형식이면 읽힌다.
 */

export type JournalKind = 'memo' | 'todo' | 'status' | 'done'

export const JOURNAL_LABEL: Record<JournalKind, string> = { memo: '메모', todo: '할 일', status: '상태', done: '완료' }
const LABEL_TO_KIND: Record<string, JournalKind> = { 메모: 'memo', '할 일': 'todo', 상태: 'status', 완료: 'done' }

/** 연구 전체에 붙는 기록의 대상 이름 */
export const RESEARCH_TARGET = '연구'

export interface JournalEntry {
  date: string
  time: string
  kind: JournalKind
  /** 블록 id 또는 RESEARCH_TARGET */
  target: string
  text: string
  /** 할 일일 때만 */
  done?: boolean
  /** 파일 안에서 몇 번째 기록인지 (0부터). 할 일 완료 표시에 쓴다 */
  index: number
  /** 앱에서 만든 할 일과 정본 기록을 잇는 숨은 식별자. 인덱스 이동과 무관하다. */
  link?: string
}

const HEADING = /^##\s+(\d{1,2}:\d{2})\s+·\s+(메모|할 일|상태|완료)\s+·\s+(.+?)\s*$/
const TODO_LINE = /^\s*[-*]\s+\[( |x|X)\]\s?(.*)$/
const TODO_LINK = /^<!-- rw-todo: ([a-z]+(?:-[A-Za-z0-9._-]{1,160})?\/c-[\w-]+) -->$/

export function parseJournal(markdown: string, date: string): JournalEntry[] {
  const entries: JournalEntry[] = []
  let cur: { time: string; kind: JournalKind; target: string; body: string[] } | null = null
  const flush = () => {
    if (!cur) return
    const links = cur.body.flatMap((line) => TODO_LINK.exec(line)?.[1] ?? [])
    const body = cur.body.filter((line) => !TODO_LINK.test(line)).join('\n').trim()
    const entry: JournalEntry = { date, time: cur.time.padStart(5, '0'), kind: cur.kind, target: cur.target, text: body, index: entries.length }
    if (cur.kind === 'todo') {
      const m = TODO_LINE.exec(body.split('\n')[0] ?? '')
      entry.done = m ? m[1] !== ' ' : false
      if (links.length === 1) entry.link = links[0]
      if (m) entry.text = [m[2] ?? '', ...body.split('\n').slice(1)].join('\n').trim()
    }
    entries.push(entry)
    cur = null
  }
  for (const line of markdown.split(/\r?\n/)) {
    const h = HEADING.exec(line)
    if (h) {
      flush()
      cur = { time: h[1]!, kind: LABEL_TO_KIND[h[2]!]!, target: h[3]!, body: [] }
    } else if (/^#{1,2}\s/.test(line)) {
      flush()
    } else if (cur) {
      cur.body.push(line)
    }
  }
  flush()
  return entries
}

export interface NewJournalEntry {
  date: string
  time: string
  kind: JournalKind
  target: string
  text: string
  link?: string
}

export function appendJournalEntry(markdown: string, e: NewJournalEntry): string {
  const eol = /\r\n/.test(markdown) ? '\r\n' : '\n'
  const target = e.target.replace(/[\r\n]+/g, ' ').trim() || RESEARCH_TARGET
  const text = e.text.replace(/\r\n/g, '\n').trim()
  if (!text) throw new Error(tr('빈 기록은 남기지 않는다', 'An empty entry is not saved'))
  if (e.link !== undefined && (e.kind !== 'todo' || !TODO_LINK.test(`<!-- rw-todo: ${e.link} -->`))) throw new Error(tr('할 일 연결 식별자가 올바르지 않음', 'Invalid to-do link id'))
  const marker = e.link ? `${eol}<!-- rw-todo: ${e.link} -->` : ''
  const body = e.kind === 'todo' ? `- [ ] ${text.replace(/\s*\n\s*/g, ' ')}${marker}` : text.split('\n').join(eol)
  let base = markdown
  if (base.trim() === '') base = `# ${e.date}${eol}`
  else if (!base.endsWith('\n')) base += eol
  return `${base}${eol}## ${e.time} · ${JOURNAL_LABEL[e.kind]} · ${target}${eol}${body}${eol}`
}

/** index번째 기록이 할 일이면 완료 표시를 바꾼다. 다른 글자는 건드리지 않는다. */
export function setTodoDone(markdown: string, index: number, done: boolean): string {
  const lines = markdown.split(/(?<=\n)/)
  let n = -1
  let inTarget = false
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.replace(/\r?\n$/, '')
    const h = HEADING.exec(line)
    if (h) { n++; inTarget = n === index && h[2] === JOURNAL_LABEL.todo; continue }
    if (/^#{1,2}\s/.test(line)) { inTarget = false; continue }
    if (inTarget && TODO_LINE.test(line)) {
      lines[i] = lines[i]!.replace(/\[( |x|X)\]/, done ? '[x]' : '[ ]')
      return lines.join('')
    }
  }
  throw new Error(tr(`${index}번째 기록은 할 일이 아님`, `Entry ${index} is not a to-do`))
}

/**
 * index번째 기록(메모·할 일)의 글을 바꾸거나(text) 기록째 지운다(null). 완료 기록은 지우기만 한다.
 * 다른 기록의 글자는 건드리지 않는다. 할 일은 완료 표시를 그대로 두고 글만 바꾼다. 상태 기록은 고치거나 지우지 않는다.
 */
export function editJournalEntry(markdown: string, index: number, text: string | null): string {
  const lines = markdown.split(/(?<=\n)/)
  const eol = /\r\n/.test(markdown) ? '\r\n' : '\n'
  let n = -1
  let start = -1
  let kind: JournalKind | null = null
  let end = lines.length
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.replace(/\r?\n$/, '')
    const h = HEADING.exec(line)
    if (start !== -1 && /^#{1,2}\s/.test(line)) { end = i; break }
    if (h && ++n === index) { start = i; kind = LABEL_TO_KIND[h[2]!]! }
  }
  if (start === -1 || !kind) throw new Error(tr(`${index}번째 기록이 없음`, `No entry ${index}`))
  if (kind === 'status') throw new Error(tr('상태 기록은 고치거나 지울 수 없음', 'Status entries cannot be edited or deleted'))
  if (kind === 'done' && text !== null) throw new Error(tr('완료 기록은 고칠 수 없음', 'Done entries cannot be edited'))
  if (text === null) {
    // 기록 사이의 빈 줄은 하나만 남긴다: 마지막 기록이면 앞의 빈 줄을 함께 지운다 (아니면 이 기록 끝의 빈 줄이 함께 빠진다)
    const from = end === lines.length && start > 0 && lines[start - 1]!.trim() === '' ? start - 1 : start
    return [...lines.slice(0, from), ...lines.slice(end)].join('')
  }
  const t = text.replace(/\r\n/g, '\n').trim()
  if (!t) throw new Error(tr('빈 기록은 남기지 않는다', 'An empty entry is not saved'))
  const body = lines.slice(start + 1, end)
  const box = kind === 'todo' ? /\[( |x|X)\]/.exec(body.find((l) => TODO_LINE.test(l.replace(/\r?\n$/, ''))) ?? '')?.[1] ?? ' ' : null
  const next = box !== null ? `- [${box}] ${t.replace(/\s*\n\s*/g, ' ')}` : t.split('\n').join(eol)
  const links = body.filter((line) => TODO_LINK.test(line.replace(/\r?\n$/, ''))).map((line) => line.replace(/\r?\n$/, ''))
  const markers = links.length ? `${eol}${links.join(eol)}` : ''
  const trail = end < lines.length ? eol : ''
  return [...lines.slice(0, start + 1), `${next}${markers}${eol}${trail}`, ...lines.slice(end)].join('')
}

/**
 * 할 일 글 맨 앞의 마감 날짜. "10/20까지 — …", "12/8 — …", "2027-01-15까지 …"
 * 연도가 없으면 적은 날(written, YYYY-MM-DD) 기준으로 같은 해, 그보다 이른 날짜면 다음 해로 본다.
 * 마감이 없거나 날짜가 아니면 null.
 */
export function todoDue(text: string, written: string): string | null {
  const m = /^\s*(?:(\d{4})-(\d{1,2})-(\d{1,2})|(\d{1,2})\/(\d{1,2}))(?=\s|까지|$|[—–:·,)])/.exec(text)
  if (!m) return null
  const explicitYear = m[1] !== undefined
  const month = Number(explicitYear ? m[2] : m[4])
  const day = Number(explicitYear ? m[3] : m[5])
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  const pad = (n: number) => String(n).padStart(2, '0')
  let year = explicitYear ? Number(m[1]) : Number(written.slice(0, 4))
  if (!explicitYear && `${pad(month)}-${pad(day)}` < written.slice(5, 10)) year += 1
  const d = new Date(Date.UTC(year, month - 1, day))
  if (d.getUTCMonth() !== month - 1) return null
  return `${year}-${pad(month)}-${pad(day)}`
}
