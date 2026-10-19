/**
 * 에이전트가 읽는 기록 목록 (MCP list_records, pnpm agent:records). 화면과 같은 기록 파일에서 같은 계산으로 거른다.
 * 기본은 짧은 줄(본문 · 마지막 답 앞부분, 답 수)이고, full이면 본문과 답을 모두 싣는다 (10/16: 에이전트가 읽는 양 줄이기).
 */
import { USER_ANSWER_BY } from '@rw/core/contract/comments'

interface Answer { by: string; at: string; body: string }
interface Entry { id: string; kind: string; by?: string; state: string | null; where: string; quote?: string; part?: string; partText?: string; edit?: string; unsorted?: true; todo?: string; body: string; answers: Answer[] }
interface Group { target: string; title: string; comments: Entry[] }

/** 사용자가 남긴, 에이전트가 답하거나 할 차례인 질문 · 지시 */
export const isUnanswered = (c: Entry) => (c.kind === '질문' || c.kind === '지시') && c.state === '대기' && !c.by
/** 에이전트가 물은 질문에 사용자가 답한 것: 그 답을 읽고 반영할 차례 (반영한 뒤 answer_record로 끝냄) */
export const isUserReply = (c: Entry) => !!c.by && c.state === '답함' && c.answers.at(-1)?.by === USER_ANSWER_BY

export interface RecordFilter {
  kind?: string
  state?: string
  /** 대상 하나, 또는 -로 끝나는 앞부분 (note-, topic- …) */
  target?: string
  unanswered?: boolean
  replied?: boolean
  /** 종류를 아직 정하지 않은(자동) 기록만 */
  unsorted?: boolean
  full?: boolean
}

const CLIP = 300
const clip = (s: string, n = CLIP) => (s.length > n ? `${s.slice(0, n)}…` : s)

export function recordRows(files: Group[], f: RecordFilter = {}): Record<string, unknown>[] {
  return files
    .filter((file) => !f.target || (f.target.endsWith('-') ? file.target.startsWith(f.target) : file.target === f.target))
    .flatMap((file) => file.comments
      .filter((c) => (!f.kind || c.kind === f.kind) && (!f.state || c.state === f.state) && (!f.unanswered || isUnanswered(c)) && (!f.replied || isUserReply(c)) && (!f.unsorted || !!c.unsorted))
      .map((c) => {
        const last = c.answers.at(-1)
        const row: Record<string, unknown> = { target: file.target, title: file.title, id: c.id, kind: c.kind }
        for (const k of ['by', 'state', 'where', 'edit', 'unsorted', 'part'] as const) if (c[k] !== undefined && c[k] !== null) row[k] = c[k]
        if (c.quote) row.quote = f.full ? c.quote : clip(c.quote, 160)
        if (c.partText) row.partText = f.full ? c.partText : clip(c.partText, 160)
        // 할 일에 대해 물은 질문 · 지시 (10/19): 그 할 일 id와 글을 함께 (에이전트가 할 일을 다시 찾지 않게)
        const todo = c.todo ? file.comments.find((x) => x.id === c.todo && x.kind === '할 일') : undefined
        if (todo) row.todo = { id: todo.id, body: f.full ? todo.body : clip(todo.body, 160) }
        row.body = f.full ? c.body : clip(c.body)
        if (f.full) row.answers = c.answers
        else if (last) Object.assign(row, { answerCount: c.answers.length, lastAnswer: { by: last.by, body: clip(last.body) } })
        return row
      }))
}
