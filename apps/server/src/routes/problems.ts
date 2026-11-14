// 흐름과 시도 나무 (workbench/problems/). 요청·응답 모양은 @rw/core/contract/problems
import type { FastifyInstance, FastifyRequest } from 'fastify'
import * as C from '@rw/core/contract/problems'
import { parseBody, replies } from '../contract.js'
import { problemBrief } from '../problemBrief.js'
import { addException, listExceptions } from '../problemExceptions.js'
import { USER, addAttempts, addClaim, closeProblem, createProblem, decideDirection, directionReport, openProblem, patchProblem, readProblem, recordAttempt, removeProblem, reportAttempt, scanProblems, startAttempt, verdictAttempt } from '../problems.js'
import type { RouteContext } from './context.js'

/** 누가 불렀나: MCP 입구가 붙이는 에이전트 이름(x-rw-agent), 없으면 화면의 사용자 */
const actorOf = (req: FastifyRequest): string => { const v = req.headers['x-rw-agent']; return typeof v === 'string' && v.trim() ? v.trim() : USER }

type P = { Params: { rid: string; id: string } }
type A = { Params: { rid: string; id: string; aid: string } }

export function registerProblems(app: FastifyInstance, ctx: RouteContext): void {
  const { wbOf } = ctx
  const R = '/api/researches/:rid/problems'
  app.get<{ Params: { rid: string } }>(R, replies(C.ProblemList), async (req): Promise<C.ProblemList> => scanProblems(wbOf(req.params.rid)))
  /** 사용자가 만들면 쓰는 중, 에이전트가 만들면 제안 (출처가 있어야 한다) */
  app.post<{ Params: { rid: string } }>(R, replies(C.ProblemOne), async (req): Promise<C.ProblemOne> =>
    ({ problem: createProblem(wbOf(req.params.rid), parseBody(C.NewProblemBody, req.body), actorOf(req)) }))
  app.get<P>(`${R}/:id`, replies(C.ProblemOne), async (req): Promise<C.ProblemOne> => ({ problem: readProblem(wbOf(req.params.rid), req.params.id) }))
  /** 이어받기 요약 (MCP problem_brief, 3KB 이하) */
  app.get<P>(`${R}/:id/brief`, replies(C.ProblemBrief), async (req): Promise<C.ProblemBrief> => ({ markdown: problemBrief(wbOf(req.params.rid), req.params.id) }))
  /** 질문 · 메시지 · 독자 · 한도 · 순서는 사용자만, 문헌 대조 · 첫 시험 · 채점은 에이전트도 */
  app.patch<P>(`${R}/:id`, replies(C.ProblemOne), async (req): Promise<C.ProblemOne> =>
    ({ problem: patchProblem(wbOf(req.params.rid), req.params.id, parseBody(C.ProblemPatchBody, req.body), actorOf(req)) }))
  /** 시작하지 않은 흐름 지우기 (problems/.trash/로) */
  app.delete<P & { Querystring: { baseHash?: string } }>(`${R}/:id`, replies(C.ProblemRemoved), async (req): Promise<C.ProblemRemoved> => {
    removeProblem(wbOf(req.params.rid), req.params.id, String(req.query.baseHash ?? ''), actorOf(req))
    return { ok: true }
  })
  /** 메시지 관문: 메시지(예 · 아니오)와 독자가 있어야 시작된다. 사용자만 */
  app.post<P>(`${R}/:id/open`, replies(C.ProblemOne), async (req): Promise<C.ProblemOne> =>
    ({ problem: openProblem(wbOf(req.params.rid), req.params.id, parseBody(C.ProblemOpenBody, req.body).baseHash, actorOf(req)) }))
  /** 종료: 답 없이는 사유와, 답과 함께면 그 답이 기대는 주장마다의 승인 · 수정 · 기각과 (모두 승인일 때만 닫힌다) */
  app.post<P>(`${R}/:id/close`, replies(C.ProblemOne), async (req): Promise<C.ProblemOne> =>
    ({ problem: closeProblem(wbOf(req.params.rid), req.params.id, parseBody(C.ProblemCloseBody, req.body), actorOf(req)) }))
  /** 주장을 먼저 세우기 (판단할 수 있는 한 문장. 위 주장의 근거로, 또는 질문 바로 아래에) */
  app.post<P>(`${R}/:id/claims`, replies(C.ProblemOne), async (req): Promise<C.ProblemOne> =>
    ({ problem: addClaim(wbOf(req.params.rid), req.params.id, parseBody(C.NewClaimBody, req.body), actorOf(req)) }))
  /** 시도 후보 늘어놓기 (주장이나 질문을 겨눠) */
  app.post<P>(`${R}/:id/attempts`, replies(C.ProblemOne), async (req): Promise<C.ProblemOne> =>
    ({ problem: addAttempts(wbOf(req.params.rid), req.params.id, parseBody(C.NewAttemptsBody, req.body), actorOf(req)) }))
  /** 지난 일 적기 (「＋ 한 일」): 사용자가 적으면 판정된 근거, 에이전트가 적으면 사용자의 확인을 기다린다 */
  app.post<P>(`${R}/:id/attempts/record`, replies(C.ProblemOne), async (req): Promise<C.ProblemOne> =>
    ({ problem: recordAttempt(wbOf(req.params.rid), req.params.id, parseBody(C.RecordAttemptBody, req.body), actorOf(req)) }))
  app.post<A>(`${R}/:id/attempts/:aid/start`, replies(C.ProblemOne), async (req): Promise<C.ProblemOne> =>
    ({ problem: startAttempt(wbOf(req.params.rid), req.params.id, req.params.aid, actorOf(req)) }))
  app.post<A>(`${R}/:id/attempts/:aid/report`, replies(C.ProblemOne), async (req): Promise<C.ProblemOne> =>
    ({ problem: reportAttempt(wbOf(req.params.rid), req.params.id, req.params.aid, parseBody(C.AttemptReportBody, req.body), actorOf(req)) }))
  /** 판정: 작업한 쪽이 아닌 쪽만 */
  app.post<A>(`${R}/:id/attempts/:aid/verdict`, replies(C.ProblemOne), async (req): Promise<C.ProblemOne> =>
    ({ problem: verdictAttempt(wbOf(req.params.rid), req.params.id, req.params.aid, parseBody(C.AttemptVerdictBody, req.body), actorOf(req)) }))
  /** 방향 보고 (사실만)와 사용자의 결정 (계속 · 좁히기 · 종료) */
  app.post<P>(`${R}/:id/report`, replies(C.ProblemOne), async (req): Promise<C.ProblemOne> =>
    ({ problem: directionReport(wbOf(req.params.rid), req.params.id, parseBody(C.DirectionReportBody, req.body), actorOf(req)) }))
  app.post<P>(`${R}/:id/decide`, replies(C.ProblemOne), async (req): Promise<C.ProblemOne> =>
    ({ problem: decideDirection(wbOf(req.params.rid), req.params.id, parseBody(C.DirectionDecisionBody, req.body), actorOf(req)) }))
  /** 예외 기록: 규칙대로 되지 않은 일 (앱이 거절한 것은 앱이 적는다). 흐름 id와 겹치지 않게 problems 밖 경로 */
  const X = '/api/researches/:rid/problem-exceptions'
  app.get<{ Params: { rid: string } }>(X, replies(C.FlowExceptionList), async (req): Promise<C.FlowExceptionList> => ({ exceptions: listExceptions(wbOf(req.params.rid)) }))
  app.post<{ Params: { rid: string } }>(X, replies(C.FlowExceptionOne), async (req): Promise<C.FlowExceptionOne> =>
    ({ exception: addException(wbOf(req.params.rid), parseBody(C.NewExceptionBody, req.body), actorOf(req)) }))
}
