// ---------- 흐름: 질문 › 주장 › 시도 (11/11 · 11/13): workbench/problems/<id>/, 서버 problems.ts. 형식은 docs/repo-format.md §16 ----------
import { enc, json, req, send } from './http'
import type { AttemptReportBody, RecordAttemptBody, AttemptVerdictBody, DirectionDecisionBody, FlowExceptionList, FlowExceptionOne, NewAttemptsBody, NewClaimBody, NewExceptionBody, NewProblemBody, ProblemCloseBody, ProblemList, ProblemOne, ProblemPatchBody, ProblemRemoved } from '@rw/core/contract/problems'
export type { Attempt, AttemptState, BasisReview, Claim, ClaimSide, DirectionReport, FlowAnswer, FlowException, NewExceptionBody, Problem as ProblemDoc, ProblemList, ProblemRow, ProblemState, ProblemStop } from '@rw/core/contract/problems'
export { PROBLEM_LIMIT, PROBLEM_LIMIT_STEP } from '@rw/core'

export const problemsApi = (rid: string) => {
  const base = `/api/researches/${enc(rid)}/problems`
  const one = (r: Response) => json<ProblemOne>(r).then((x) => x.problem)
  return {
    list: () => req(base).then((r) => json<ProblemList>(r)),
    get: (id: string) => req(`${base}/${enc(id)}`).then(one),
    create: (body: NewProblemBody) => req(base, send('POST', body)).then(one),
    patch: (id: string, baseHash: string, set: ProblemPatchBody['set']) => req(`${base}/${enc(id)}`, send('PATCH', { baseHash, set })).then(one),
    /** 시작: 메시지(예 · 아니오)와 독자가 있어야 한다 */
    open: (id: string, baseHash: string) => req(`${base}/${enc(id)}/open`, send('POST', { baseHash })).then(one),
    /** 종료: 답 없이는 사유와, 답과 함께면 그 답이 기대는 주장마다의 승인 · 수정 · 기각과 (모두 승인일 때만 닫힌다) */
    close: (id: string, body: ProblemCloseBody) => req(`${base}/${enc(id)}/close`, send('POST', body)).then(one),
    remove: (id: string, baseHash: string) => req(`${base}/${enc(id)}?baseHash=${enc(baseHash)}`, { method: 'DELETE' }).then((r) => json<ProblemRemoved>(r)),
    /** 주장을 먼저 세운다: 위 주장(under)의 근거로, 또는 질문 바로 아래(side)에 */
    addClaim: (id: string, body: NewClaimBody) => req(`${base}/${enc(id)}/claims`, send('POST', body)).then(one),
    /** 후보: 주장(claim)이나 질문을 겨눈 방법 한 줄 */
    addAttempts: (id: string, attempts: NewAttemptsBody['attempts']) => req(`${base}/${enc(id)}/attempts`, send('POST', { attempts })).then(one),
    /** 지난 일 적기 (「＋ 한 일」): 사용자가 적으면 곧바로 판정된 근거 */
    record: (id: string, body: RecordAttemptBody) => req(`${base}/${enc(id)}/attempts/record`, send('POST', body)).then(one),
    start: (id: string, aid: string) => req(`${base}/${enc(id)}/attempts/${enc(aid)}/start`, send('POST', {})).then(one),
    report: (id: string, aid: string, body: AttemptReportBody) => req(`${base}/${enc(id)}/attempts/${enc(aid)}/report`, send('POST', body)).then(one),
    verdict: (id: string, aid: string, body: AttemptVerdictBody) => req(`${base}/${enc(id)}/attempts/${enc(aid)}/verdict`, send('POST', body)).then(one),
    /** 방향 보고에 대한 결정: 계속 · 좁히기 · 접기 */
    decide: (id: string, baseHash: string, verdict: DirectionDecisionBody['verdict'], note?: string, limit?: number) =>
      req(`${base}/${enc(id)}/decide`, send('POST', { baseHash, verdict, ...(note?.trim() && { note: note.trim() }), ...(limit !== undefined && { limit }) })).then(one),
    /** 예외 기록: 규칙대로 되지 않은 일 (새것부터) */
    exceptions: () => req(`/api/researches/${enc(rid)}/problem-exceptions`).then((r) => json<FlowExceptionList>(r)).then((x) => x.exceptions),
    addException: (body: NewExceptionBody) => req(`/api/researches/${enc(rid)}/problem-exceptions`, send('POST', body)).then((r) => json<FlowExceptionOne>(r)).then((x) => x.exception),
  }
}
