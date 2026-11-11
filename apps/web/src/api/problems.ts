// ---------- 문제와 시도 나무 (11/11): workbench/problems/<id>/, 서버 problems.ts. 형식은 docs/repo-format.md §16 ----------
import { enc, json, req, send } from './http'
import type { AttemptReportBody, AttemptVerdictBody, DirectionDecisionBody, NewAttemptsBody, NewProblemBody, ProblemList, ProblemOne, ProblemPatchBody, ProblemRemoved } from '@rw/core/contract/problems'
export type { Attempt, AttemptState, DirectionReport, Problem as ProblemDoc, ProblemList, ProblemRow, ProblemState, ProblemStop } from '@rw/core/contract/problems'
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
    close: (id: string, baseHash: string, reason: string) => req(`${base}/${enc(id)}/close`, send('POST', { baseHash, reason })).then(one),
    remove: (id: string, baseHash: string) => req(`${base}/${enc(id)}?baseHash=${enc(baseHash)}`, { method: 'DELETE' }).then((r) => json<ProblemRemoved>(r)),
    addAttempts: (id: string, attempts: NewAttemptsBody['attempts']) => req(`${base}/${enc(id)}/attempts`, send('POST', { attempts })).then(one),
    start: (id: string, aid: string) => req(`${base}/${enc(id)}/attempts/${enc(aid)}/start`, send('POST', {})).then(one),
    report: (id: string, aid: string, body: AttemptReportBody) => req(`${base}/${enc(id)}/attempts/${enc(aid)}/report`, send('POST', body)).then(one),
    verdict: (id: string, aid: string, body: AttemptVerdictBody) => req(`${base}/${enc(id)}/attempts/${enc(aid)}/verdict`, send('POST', body)).then(one),
    /** 방향 보고에 대한 결정: 계속 · 좁히기 · 접기 */
    decide: (id: string, baseHash: string, verdict: DirectionDecisionBody['verdict'], note?: string, limit?: number) =>
      req(`${base}/${enc(id)}/decide`, send('POST', { baseHash, verdict, ...(note?.trim() && { note: note.trim() }), ...(limit !== undefined && { limit }) })).then(one),
  }
}
