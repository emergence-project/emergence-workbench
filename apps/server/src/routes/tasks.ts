// 맡긴 일 (작업 탭, workbench/tasks/*.md). 요청·응답 모양은 @rw/core/contract/tasks
import type { FastifyInstance } from 'fastify'
import * as C from '@rw/core/contract/tasks'
import { parseBody, replies } from '../contract.js'
import { answerTask, checkpointTask, createTask, linkTaskFlow, scanTasks, nextTask, readTask, reportTask, RULES_DOC } from '../tasks.js'
import { judgeTaskIntoFlow } from '../taskFlow.js'
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
  /** 판단 (승인 · 수정 요청 · 멈춤 · 폐기). 결과를 승인하면 이은 흐름 점에 반영한다 (10/27, taskFlow.ts) */
  app.post<{ Params: P }>('/api/researches/:rid/tasks/:id/judge', replies(C.TaskJudged), async (req): Promise<C.TaskJudged> => {
    const { task, closed, added } = judgeTaskIntoFlow(wbOf(req.params.rid), req.params.id, parseBody(C.JudgeBody, req.body))
    return { task, ...((closed || added) && { flow: { ...(closed && { closed }), ...(added && { added }) } }) }
  })
  /** 흐름 점과 잇기 · 풀기 (10/27): 짝 제안에서 "잇기"를 누를 때만 */
  app.post<{ Params: P }>('/api/researches/:rid/tasks/:id/flow', replies(C.TaskOne), async (req): Promise<C.TaskOne> =>
    ({ task: linkTaskFlow(wbOf(req.params.rid), req.params.id, parseBody(C.LinkFlowBody, req.body)) }))
  /** 사용자 확인 요청에 답 */
  app.post<{ Params: P }>('/api/researches/:rid/tasks/:id/answer', replies(C.TaskOne), async (req): Promise<C.TaskOne> =>
    ({ task: answerTask(wbOf(req.params.rid), req.params.id, parseBody(C.AnswerBody, req.body)) }))
  /** 에이전트의 보고: 종결 조건 제안(proposed) 또는 결과(result). MCP report_task가 부른다 (10/21) */
  app.post<{ Params: P }>('/api/researches/:rid/tasks/:id/report', replies(C.TaskOne), async (req): Promise<C.TaskOne> =>
    ({ task: reportTask(wbOf(req.params.rid), req.params.id, parseBody(C.ReportBody, req.body)) }))
  /** 지금 상태 한 줄 (10/30): MCP checkpoint_task가 부른다 */
  app.post<{ Params: P }>('/api/researches/:rid/tasks/:id/checkpoint', replies(C.TaskOne), async (req): Promise<C.TaskOne> =>
    ({ task: checkpointTask(wbOf(req.params.rid), req.params.id, parseBody(C.CheckpointBody, req.body)) }))
  /** 다음 지시: 맡기기 · 빼기 · 되살리기 */
  app.post<{ Params: P }>('/api/researches/:rid/tasks/:id/next', replies(C.TaskNextDone), async (req): Promise<C.TaskNextDone> =>
    nextTask(wbOf(req.params.rid), req.params.id, parseBody(C.NextBody, req.body)))
}
