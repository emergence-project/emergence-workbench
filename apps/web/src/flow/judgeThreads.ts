import { USER_ANSWER_BY } from '../recordsPanelHelpers'
import type { CommentEntry, RecordFile } from '../api'

/**
 * 판단 화면의 질문 줄기 (10/23 "판단 설계" 4-1): 짚은 곳(칸)마다 질문 하나가 줄기 하나.
 * 상태: 보내지 않음(이 브라우저의 초안) · 답하는 중(대기) · 답함(에이전트가 답함 = 내 차례) · 닫음(끝냄)
 */
export type ThreadState = 'draft' | 'waiting' | 'answered' | 'closed'
export const threadState = (e: Pick<CommentEntry, 'state' | 'answers'>): ThreadState =>
  e.state === '끝냄' ? 'closed' : e.state === '답함' && e.answers.length > 0 && e.answers.at(-1)!.by !== USER_ANSWER_BY ? 'answered' : 'waiting'
/** 사용자가 판단하며 쓴 질문 (에이전트가 쓴 질문은 기록의 내 차례에서 따로 본다) */
export const isJudgeQuestion = (e: Pick<CommentEntry, 'kind' | 'by'>) => e.kind === '질문' && !e.by
export const judgeQuestions = (comments: CommentEntry[]) => comments.filter(isJudgeQuestion)

/** 점마다 질문 수와 답함(내 차례) 수: 기록 모음에서 flow-<점> 파일을 센다 */
export function threadCounts(files: RecordFile[]): Map<string, { all: number; answered: number }> {
  const out = new Map<string, { all: number; answered: number }>()
  for (const f of files) {
    if (!f.target.startsWith('flow-')) continue
    const qs = judgeQuestions(f.comments).filter((e) => threadState(e) !== 'closed')
    if (!qs.length) continue
    out.set(f.target.slice(5), { all: qs.length, answered: qs.filter((e) => threadState(e) === 'answered').length })
  }
  return out
}

/** 보내지 않은 질문 (모아 보내기): 이 브라우저에만, 점마다 */
export type JudgeDraft = { field: string; text: string }
const draftKey = (rid: string, id: string) => `rw-judge-drafts:${rid}:${id}`
export function readDrafts(rid: string, id: string): JudgeDraft[] {
  try {
    const v = JSON.parse(localStorage.getItem(draftKey(rid, id)) ?? '[]') as unknown
    return Array.isArray(v) ? v.filter((x): x is JudgeDraft => typeof x?.field === 'string' && typeof x?.text === 'string') : []
  } catch { return [] }
}
export function writeDrafts(rid: string, id: string, list: JudgeDraft[]) {
  try { if (list.length) localStorage.setItem(draftKey(rid, id), JSON.stringify(list)); else localStorage.removeItem(draftKey(rid, id)) } catch { /* 저장 못 해도 화면은 그대로 */ }
}
