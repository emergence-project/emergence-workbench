import { tr } from './i18n.js'
/**
 * 날짜별 일지 파일 (workbench/log/YYYY-MM-DD.md).
 *
 *   # 2026-09-30
 *
 *   ## 09:40 · 상태 · discharging
 *   진행 중 → 막힘
 *
 *   ## 16:05 · 완료 · kempe-chains
 *   식 (3.5)의 유일성 조건 적기
 *   <!-- rw-todo: block-kempe-chains/c-20260930-1120 -->
 *
 * 일지는 있었던 일만 적는다(2026-10-16). 할 일의 지금 상태는 기록 파일(comments/)이 정본이고,
 * "완료"는 할 일을 끝냈다고 표시한 날 그날 일지에 남는 기록이다(rw-todo 줄이 그 할 일 기록을 가리킨다).
 * 한 일 달력이 "언제 끝냈는지"를 이 기록으로 안다. 예전 일지의 "할 일" 기록은 읽기만 한다.
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
  /** 할 일·완료 기록이 가리키는 기록 '<대상>/<id>' (rw-todo 줄). 인덱스 이동과 무관하다. */
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
    if ((cur.kind === 'todo' || cur.kind === 'done') && links.length === 1) entry.link = links[0]
    if (cur.kind === 'todo') {
      const m = TODO_LINE.exec(body.split('\n')[0] ?? '')
      entry.done = m ? m[1] !== ' ' : false
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
  if (e.link !== undefined && (e.kind !== 'todo' && e.kind !== 'done' || !TODO_LINK.test(`<!-- rw-todo: ${e.link} -->`))) throw new Error(tr('할 일 연결 식별자가 올바르지 않음', 'Invalid to-do link id'))
  const marker = e.link ? `${eol}<!-- rw-todo: ${e.link} -->` : ''
  const body = e.kind === 'todo' ? `- [ ] ${text.replace(/\s*\n\s*/g, ' ')}${marker}` : `${text.split('\n').join(eol)}${marker}`
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

/** 일지 파일을 머리(첫 "## " 앞)와 항목(각 "## " 줄부터 다음 "## " 앞까지)으로 나눈다. 항목 끝의 빈 줄은 뗀다 */
function journalBlocks(markdown: string): { head: string; entries: string[] } {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n')
  const at = lines.findIndex((l) => /^##\s/.test(l))
  if (at < 0) return { head: markdown.replace(/\r\n/g, '\n').trimEnd(), entries: [] }
  const entries: string[] = []
  let cur: string[] = []
  for (const l of lines.slice(at)) {
    if (/^##\s/.test(l) && cur.length) { entries.push(cur.join('\n').trimEnd()); cur = [] }
    cur.push(l)
  }
  if (cur.length) entries.push(cur.join('\n').trimEnd())
  return { head: lines.slice(0, at).join('\n').trimEnd(), entries }
}

/**
 * 일지 파일 세 갈래 합치기 (항목 단위): 한쪽이 더한 항목은 더하고, 한쪽이 지운 항목은 지운다.
 * 줄 단위 합치기(git merge-file)는 이웃한 두 항목을 양쪽에서 하나씩 지워도 부딪힌다고 본다 (10/20 점검: LSWT 10/3 일지).
 * 같은 머리 줄의 항목을 양쪽이 서로 다르게 고쳤거나, 파일 머리를 양쪽이 다르게 고쳤으면 null(사람이 합친다).
 */
export function mergeJournalText(base: string, ours: string, theirs: string): string | null {
  const [b, o, th] = [journalBlocks(base), journalBlocks(ours), journalBlocks(theirs)]
  const head = o.head === th.head ? o.head : o.head === b.head ? th.head : th.head === b.head ? o.head : null
  if (head === null) return null
  const count = (list: string[]) => { const m = new Map<string, number>(); for (const e of list) m.set(e, (m.get(e) ?? 0) + 1); return m }
  const [cb, co, ct] = [count(b.entries), count(o.entries), count(th.entries)]
  // 같은 머리 줄을 양쪽이 서로 다르게 고친 것: 고친 판이 양쪽에 다 새로 생기고 서로 다르다
  const firstLine = (e: string) => e.split('\n', 1)[0]!
  const added = (mine: Map<string, number>, other: Map<string, number>) => [...mine.keys()].filter((e) => !cb.has(e) && !other.has(e))
  const addedO = added(co, ct)
  const addedT = added(ct, co)
  for (const e of addedO) {
    const sameHead = addedT.filter((x) => firstLine(x) === firstLine(e))
    if (sameHead.length && b.entries.some((x) => firstLine(x) === firstLine(e))) return null
  }
  // 이 컴퓨터 차례대로: 양쪽에 남은 항목과 이쪽이 더한 항목. 저쪽이 지운 항목(공통 조상엔 있는데 저쪽에 없는 것)은 뺀다
  const left = new Map(ct)
  const out: string[] = []
  for (const e of o.entries) {
    const inBase = cb.get(e) ?? 0
    const inTheirs = left.get(e) ?? 0
    if (inTheirs > 0) { left.set(e, inTheirs - 1); out.push(e); continue }
    if (inBase === 0) out.push(e) // 이쪽이 더한 것
  }
  // 저쪽이 더한 항목은 저쪽에서 바로 앞에 있던 항목 뒤에, 앞에 남은 것이 없으면 바로 뒤에 있던 항목 앞에 (그것도 없으면 끝에)
  for (let i = 0; i < th.entries.length; i++) {
    const e = th.entries[i]!
    if (cb.has(e) || co.has(e)) continue
    const prev = th.entries.slice(0, i).reverse().find((x) => out.includes(x))
    const next = prev ? undefined : th.entries.slice(i + 1).find((x) => out.includes(x))
    out.splice(prev ? out.lastIndexOf(prev) + 1 : next ? out.indexOf(next) : out.length, 0, e)
  }
  return [head, ...out].filter((s, i) => i > 0 || s).join('\n\n') + '\n'
}
