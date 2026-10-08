import type { NoteHighlight, PaintColor } from './api'

/**
 * 개념노트 메모(concepts/<id>.memo.md)를 작업 단위로 나눈다 (10/4 19:17 "메모와 할일별로 네모 박스로").
 * - 할 일: `- [ ] …` 한 줄(과 그 아래 들여 쓴 줄)이 하나
 * - 메모: 맨 앞 목록 항목 `- …` 하나(들여 쓴 줄 포함, 글머리표는 뗀다), 또는 빈 줄로 나뉜 문단 하나
 * 제목 줄(# …)부터 다음 제목·할 일까지는 한 단위로 둔다 (긴 "Study 원문" 같은 절이 문단마다 쪼개지지 않게). 할 일의 line은 원문 줄 번호(체크할 때 그 줄을 바꾼다).
 * from·to는 그 단위의 원문 줄 범위(to는 들지 않음): 하나씩 고치고 지울 때 그 줄만 바꾼다 (10/8 11:47).
 */
export type MemoUnit =
  | { kind: 'task'; line: number; done: boolean; text: string; more: string; from: number; to: number }
  | { kind: 'note'; text: string; from: number; to: number; anchor?: MemoAnchor }

/**
 * 본문 글을 골라 단 메모 · 하이라이트 (10/8 11:47 "끌어 고르기와 그 엔진은 연구노트와 같아야 한다").
 * 연구노트 기록(workbench/comments/)과 같은 앵커를 같은 memo.md 안에 적는다 (10/8 사용자 결정 "기록은 그 대상 옆에"):
 *
 *   > "고른 글"
 *   <!-- rw: {"id":"m-20261008-0521","color":"yellow","quote":"고른 글","line":12,"prefix":"앞 ","suffix":" 뒤"} -->
 *   메모 글 (없으면 하이라이트만)
 *
 * 인용 줄은 사람이 읽는 사본이고, 하이라이트는 meta의 quote · line · prefix · suffix로 본문(머리말 뺀 글)에서 다시 찾는다.
 */
export interface MemoAnchor { id: string; color: PaintColor; quote: string; line: number; prefix: string; suffix: string }

const ANCHORED = /^((?:>.*\n)+)<!-- rw: (\{.*\}) -->(?:\n([\s\S]*))?$/

function readAnchor(text: string): { anchor: MemoAnchor; body: string } | null {
  const m = ANCHORED.exec(text)
  if (!m) return null
  try {
    const a = JSON.parse(m[2]!) as Partial<MemoAnchor>
    if (typeof a.id !== 'string' || typeof a.quote !== 'string') return null
    return { anchor: { id: a.id, color: a.color ?? 'yellow', quote: a.quote, line: a.line ?? 0, prefix: a.prefix ?? '', suffix: a.suffix ?? '' }, body: (m[3] ?? '').trim() }
  } catch { return null }
}

const TASK = /^\s*[-*] \[( |x|X)\] (.*)$/
const ITEM = /^[-*+] |^\d+[.)] /
const ITEM_MARK = /^[-*+] /

export function memoUnits(memo: string): MemoUnit[] {
  const lines = memo.split('\n')
  const out: MemoUnit[] = []
  let note: string[] = []
  let noteFrom = 0
  let noteTo = 0
  let task: Extract<MemoUnit, { kind: 'task' }> | null = null
  let more: string[] = []
  /** 제목 아래의 절 안인가: 빈 줄·목록 항목에서 나누지 않는다 */
  let section = false
  const flushNote = () => {
    let t = note.join('\n').trim()
    // 상자 하나가 목록 항목 하나이면 글머리표는 떼고 그 아래 줄을 내어 쓴다
    if (!section && ITEM_MARK.test(t)) t = t.replace(ITEM_MARK, '').split('\n').map((l, k) => (k ? l.replace(/^ {1,3}/, '') : l)).join('\n')
    const anchored = !section && readAnchor(t)
    if (anchored) out.push({ kind: 'note', text: anchored.body, from: noteFrom, to: noteTo, anchor: anchored.anchor })
    else if (t) out.push({ kind: 'note', text: t, from: noteFrom, to: noteTo })
    note = []; section = false
  }
  const flushTask = () => {
    if (task) { task.more = more.join('\n').trim(); task.to = task.line + 1 + more.length; out.push(task) }
    task = null; more = []
  }
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]!
    const indented = /^\s+\S/.test(l)
    const t = TASK.exec(l)
    if (t) {
      flushNote(); flushTask()
      task = { kind: 'task', line: i, done: t[1] !== ' ', text: t[2]!, more: '', from: i, to: i + 1 }
      continue
    }
    if (task) {
      if (indented) { more.push(l.replace(/^\s{1,4}/, '')); continue }
      flushTask()
    }
    const add = () => { if (!note.length) noteFrom = i; note.push(l); if (l.trim()) noteTo = i + 1 }
    if (/^#{1,6} /.test(l)) { flushNote(); add(); section = true; continue }
    if (section) { add(); continue }
    if (!l.trim()) { flushNote(); continue }
    // 맨 앞 목록 항목마다 새 단위 (들여 쓴 줄은 그 항목에 붙는다)
    // 고른 글 메모의 글이 목록으로 시작해도 그 메모에 붙인다
    if (ITEM.test(l) && !note.some((n) => n.startsWith('<!-- rw: '))) flushNote()
    add()
  }
  flushNote(); flushTask()
  return out
}

/** 단위 하나의 원문 (고치기 창에 그대로 보인다) */
export function unitSource(memo: string, u: MemoUnit): string {
  return memo.split('\n').slice(u.from, u.to).join('\n')
}

/**
 * 단위 하나만 바꾸거나(next) 지운다(null). 나머지 줄은 바이트 그대로 둔다.
 * 지울 때 앞뒤로 빈 줄이 겹치면 하나만 남긴다.
 */
export function replaceUnit(memo: string, u: MemoUnit, next: string | null): string {
  const lines = memo.split('\n')
  const body = next === null ? [] : next.replace(/\s+$/, '').split('\n')
  if (next !== null && body.length === 1 && !body[0]) return replaceUnit(memo, u, null)
  let { from, to } = u
  if (!body.length && (from === 0 || !lines[from - 1]!.trim()) && to < lines.length && !lines[to]!.trim()) to++
  return [...lines.slice(0, from), ...body, ...lines.slice(to)].join('\n')
}

/** 새 할 일 · 메모를 맨 끝에 더한다 (메모는 빈 줄로 나눠 단위 하나가 되게) */
export function appendUnit(memo: string, kind: MemoUnit['kind'], text: string): string {
  const body = text.trim()
  if (!body) return memo
  const item = kind === 'task' && !/^\s*[-*] \[( |x|X)\] /.test(body) ? `- [ ] ${body}` : body
  // 제목 아래 절은 다음 제목까지 한 단위라, 새 메모는 첫 제목 앞에 둔다
  const lines = memo.split('\n')
  const heading = kind === 'note' ? lines.findIndex((l) => /^#{1,6} /.test(l)) : -1
  if (heading >= 0) {
    const before = lines.slice(0, heading).join('\n').replace(/\s+$/, '')
    return `${before ? `${before}\n\n` : ''}${item}\n\n${lines.slice(heading).join('\n')}`
  }
  const head = memo.replace(/\s+$/, '')
  return head ? `${head}\n\n${item}\n` : `${item}\n`
}

/** 고른 글 메모 한 단위의 원문. 메모 글의 빈 줄은 한 줄로 줄인다 (빈 줄이 단위를 나누므로) */
export function anchoredUnit(anchor: MemoAnchor, body: string): string {
  const meta = JSON.stringify(anchor).replace(/</g, '\\u003c').replace(/>/g, '\\u003e')
  const quote = anchor.quote.replace(/\s+/g, ' ').trim()
  const text = body.replace(/\r\n?/g, '\n').replace(/\n\s*\n/g, '\n').trim()
  return [`> "${quote}"`, `<!-- rw: ${meta} -->`, ...(text ? [text] : [])].join('\n')
}

/** 새 고른 글 메모의 이름: 연구노트 기록처럼 시각으로, 같은 분에 겹치면 뒤에 -2, -3 */
export function newAnchorId(memo: string, now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  const base = `m-${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}`
  const used = new Set(memoUnits(memo).flatMap((u) => (u.kind === 'note' && u.anchor ? [u.anchor.id] : [])))
  let id = base
  for (let k = 2; used.has(id); k++) id = `${base}-${k}`
  return id
}

/** 본문에 칠할 하이라이트 (고른 글 메모 모두) */
export function memoHighlights(memo: string): NoteHighlight[] {
  return memoUnits(memo).flatMap((u) => u.kind === 'note' && u.anchor
    ? [{ id: u.anchor.id, rects: [], color: u.anchor.color, quote: u.anchor.quote, line: u.anchor.line, prefix: u.anchor.prefix, suffix: u.anchor.suffix, ...(u.text && { body: u.text }) }]
    : [])
}

export function anchoredById(memo: string, id: string): Extract<MemoUnit, { kind: 'note' }> | undefined {
  return memoUnits(memo).find((u): u is Extract<MemoUnit, { kind: 'note' }> => u.kind === 'note' && u.anchor?.id === id)
}
