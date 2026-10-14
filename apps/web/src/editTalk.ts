import type { CommentEntry } from './api'
import type { EditHunk } from './api'

/**
 * 고침 검토의 바뀐 곳에서 묻기 (10/14): 노트 기록 가운데 그 바뀐 곳에서 물은 것(edit 표시)을 고른다.
 * 물을 때의 지금 글(quote)이 아직 그 바뀐 곳에 있거나, 다시 고쳐 글이 바뀌었어도 고치기 전 글(editBase)이 같으면 같은 바뀐 곳이다.
 */
export function talksOf(h: Pick<EditHunk, 'base' | 'current'>, records: CommentEntry[]): CommentEntry[] {
  return records.filter((c) => c.edit && (
    (!!c.quote?.trim() && !!h.current && h.current.includes(c.quote.trim()))
    || (!!c.editBase && !!h.base && h.base.startsWith(c.editBase))))
}

/** 사용자 차례: 마지막으로 물은 것에 답이 왔다 (주황 수). 에이전트 차례: 마지막 것이 아직 대기 */
export function talkTurn(talks: CommentEntry[]): 'user' | 'agent' | null {
  const last = talks[talks.length - 1]
  if (!last) return null
  return last.state === '대기' ? 'agent' : last.state === '답함' ? 'user' : null
}

/** 기록 id(c-YYYYMMDD-HHMM)와 답 시각(YYYY-MM-DD HH:MM)을 "10/14 13:37"로 */
export function talkWhen(s: string): string {
  const id = /^c-\d{4}(\d{2})(\d{2})-(\d{2})(\d{2})/.exec(s)
  if (id) return `${id[1]}/${id[2]} ${id[3]}:${id[4]}`
  const at = /^\d{4}-(\d{2})-(\d{2})[ T](\d{2}:\d{2})/.exec(s)
  return at ? `${at[1]}/${at[2]} ${at[3]}` : s
}
