// 맡긴 일 (작업 탭, workbench/tasks/*.md). 요청·응답 모양은 @rw/core/contract/tasks
import type { FastifyInstance } from 'fastify'
import * as C from '@rw/core/contract/tasks'
import { parseBody, replies } from '../contract.js'
import { answerTask, createTask, judgeTask, scanTasks, nextTask, readTask, RULES_DOC } from '../tasks.js'
import type { RouteContext } from './context.js'

export function registerTasks(app: FastifyInstance, ctx: RouteContext): void {
  const { wbOf } = ctx
  type P = { rid: string; id: string }
  /** 맡긴 일 전부 (최근에 맡긴 것부터). 보고서 본문(body)도 함께. rules = 규칙 문서 경로 (에이전트에게 줄 말에 넣는다) */
  app.get<{ Params: { rid: string } }>('/api/researches/:rid/tasks', replies(C.TaskScan), async (req): Promise<C.TaskScan> => ({ ...scanTasks(wbOf(req.params.rid)), rules: RULES_DOC }))
  app.get<{ Params: P }>('/api/researches/:rid/tasks/:id', replies(C.TaskOne), async (req): Promise<C.TaskOne> => ({ task: readTask(wbOf(req.params.rid), req.params.id) }))
  /** 맡기기 → workbench/tasks/<날짜>-<이름>.md */
  app.post<{ Params: { rid: string } }>('/api/researches/:rid/tasks', replies(C.TaskCreated), async (req): Promise<C.TaskCreated> =>
    ({ task: createTask(wbOf(req.params.rid), parseBody(C.NewTaskBody, req.body)), rules: RULES_DOC }))
  /** 판단 (승인 · 수정 요청 · 멈춤 · 폐기) */
  app.post<{ Params: P }>('/api/researches/:rid/tasks/:id/judge', replies(C.TaskOne), async (req): Promise<C.TaskOne> =>
    ({ task: judgeTask(wbOf(req.params.rid), req.params.id, parseBody(C.JudgeBody, req.body)) }))
  /** 사용자 확인 요청에 답 */
  app.post<{ Params: P }>('/api/researches/:rid/tasks/:id/answer', replies(C.TaskOne), async (req): Promise<C.TaskOne> =>
    ({ task: answerTask(wbOf(req.params.rid), req.params.id, parseBody(C.AnswerBody, req.body)) }))
  /** 다음 지시: 맡기기 · 빼기 · 되살리기 */
  app.post<{ Params: P }>('/api/researches/:rid/tasks/:id/next', replies(C.TaskNextDone), async (req): Promise<C.TaskNextDone> =>
    nextTask(wbOf(req.params.rid), req.params.id, parseBody(C.NextBody, req.body)))
}
