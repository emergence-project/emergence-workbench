/* 개념노트 메모 파서 (화면 conceptMemo.ts와 옮기기 conceptMemoMigrate.ts가 함께 쓴다, 10/18) */

/** 하이라이트 색 (contract/comments HIGHLIGHT_COLORS와 같은 값) */
export type MemoPaintColor = 'yellow' | 'green' | 'blue' | 'pink'

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
export interface MemoAnchor { id: string; color: MemoPaintColor; quote: string; line: number; prefix: string; suffix: string }

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

