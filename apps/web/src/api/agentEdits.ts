import type { EditAction, EditAsk, EditDiscussed, EditList, EditOk, EditReviewOne } from '@rw/core/contract/agentEdits'
import { enc, json, req, send } from './http'

/** 에이전트 고침 검토 (10/8). 타입은 서버와 같은 계약에서 (packages/core/src/contract/agentEdits.ts) */
export type { EditTarget, EditReviewRow, EditAttempt, EditHunk, EditReview, EditAction, EditAsk } from '@rw/core/contract/agentEdits'

export const agentEditsApi = {
  /** scope: 프로젝트 id 또는 library. 없으면 전부 */
  list: (scope?: string) => req(`/api/agent-edits${scope ? `?scope=${enc(scope)}` : ''}`).then((r) => json<EditList>(r)),
  review: (key: string) => req(`/api/agent-edits/review?key=${enc(key)}`).then((r) => json<EditReviewOne>(r)),
  decide: (key: string, hash: string, hunk: string, action: EditAction, text?: string) =>
    req('/api/agent-edits/review', send('POST', { key, hash, hunk, action, ...(text !== undefined && { text }) })).then((r) => json<EditReviewOne>(r)),
  /** 바뀐 곳에서 묻기 (10/14): 질문 · 수정을 그 문단의 노트 기록으로 남긴다. 답은 나중에 덧붙는다 */
  discuss: (key: string, hash: string, hunk: string, ask: EditAsk, text: string) =>
    req('/api/agent-edits/discuss', send('POST', { key, hash, hunk, ask, text })).then((r) => json<EditDiscussed>(r)),
  dismissAttempt: (key: string) => req(`/api/agent-edits/attempts?key=${enc(key)}`, { method: 'DELETE' }).then((r) => json<EditOk>(r)),
}
