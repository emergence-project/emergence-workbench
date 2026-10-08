import { enc, json, req, send } from './http'

/** 에이전트 고침 검토 (10/8): 고친 대상 */
export type EditTarget = { kind: 'concept'; id: string } | { kind: 'note'; rid: string; file: string }

/** 검토를 기다리는 노트 한 줄 (changes = 바뀐 곳 수) */
export interface EditReviewRow { key: string; target: EditTarget; title: string; since: string; updated: string; agents: string[]; changes: number }
/** 확인된 노트에 대한 에이전트 쓰기 시도 (사용자 차례) */
export interface EditAttempt { key: string; target: EditTarget; title: string; at: string; agent?: string; summary?: string }
export interface EditHunk { id: string; base: string; current: string }
export interface EditReview { key: string; target: EditTarget; title: string; hash: string; since: string; updated: string; agents: string[]; notes: string[]; hunks: EditHunk[] }
export type EditAction = 'accept' | 'revert' | 'edit'

export const agentEditsApi = {
  /** scope: 프로젝트 id 또는 library. 없으면 전부 */
  list: (scope?: string) => req(`/api/agent-edits${scope ? `?scope=${enc(scope)}` : ''}`).then((r) => json<{ reviews: EditReviewRow[]; attempts: EditAttempt[] }>(r)),
  review: (key: string) => req(`/api/agent-edits/review?key=${enc(key)}`).then((r) => json<{ review: EditReview | null }>(r)),
  decide: (key: string, hash: string, hunk: string, action: EditAction, text?: string) =>
    req('/api/agent-edits/review', send('POST', { key, hash, hunk, action, ...(text !== undefined && { text }) })).then((r) => json<{ review: EditReview | null }>(r)),
  dismissAttempt: (key: string) => req(`/api/agent-edits/attempts?key=${enc(key)}`, { method: 'DELETE' }).then((r) => json<{ ok: true }>(r)),
}
