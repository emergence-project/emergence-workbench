import type { NoteHighlight } from './api'

export { memoUnits, type MemoAnchor, type MemoUnit } from '@rw/core'
import { memoUnits, type MemoAnchor, type MemoUnit } from '@rw/core'

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
