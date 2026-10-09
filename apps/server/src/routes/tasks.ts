// 맡긴 일 (작업 탭, workbench/tasks/*.md)
import type { FastifyInstance } from 'fastify'
import { answerTask, createTask, judgeTask, scanTasks, nextTask, readTask, RULES_DOC, type NewTask } from '../tasks.js'
import type { RouteContext } from './context.js'

export function registerTasks(app: FastifyInstance, ctx: RouteContext): void {
  const { wbOf } = ctx
  type P = { rid: string; id: string }
  /** 맡긴 일 전부 (최근에 맡긴 것부터). 보고서 본문(body)도 함께. rules = 규칙 문서 경로 (에이전트에게 줄 말에 넣는다) */
  app.get<{ Params: { rid: string } }>('/api/researches/:rid/tasks', async (req) => ({ ...scanTasks(wbOf(req.params.rid)), rules: RULES_DOC }))
  app.get<{ Params: P }>('/api/researches/:rid/tasks/:id', async (req) => ({ task: readTask(wbOf(req.params.rid), req.params.id) }))
  /** 맡기기: { title, task, endCondition?, topic?, agent?, references?, avoid? } → workbench/tasks/<날짜>-<이름>.md */
  app.post<{ Params: { rid: string }; Body: NewTask }>('/api/researches/:rid/tasks', async (req) => ({ task: createTask(wbOf(req.params.rid), req.body ?? {}), rules: RULES_DOC }))
  /** 판단: { verdict: approve|send-back|pause|discard, note?, seconds?, endCondition?(종결 조건 제안을 고쳐서 승인), baseHash } */
  app.post<{ Params: P; Body: Record<string, unknown> }>('/api/researches/:rid/tasks/:id/judge', async (req) =>
    ({ task: judgeTask(wbOf(req.params.rid), req.params.id, req.body ?? {}) }))
  /** 사용자 확인 요청에 답: { n, answer, note?, baseHash } */
  app.post<{ Params: P; Body: Record<string, unknown> }>('/api/researches/:rid/tasks/:id/answer', async (req) =>
    ({ task: answerTask(wbOf(req.params.rid), req.params.id, req.body ?? {}) }))
  /** 다음 지시: { i, action: start|drop|restore, edit?, baseHash } */
  app.post<{ Params: P; Body: Record<string, unknown> }>('/api/researches/:rid/tasks/:id/next', async (req) =>
    nextTask(wbOf(req.params.rid), req.params.id, req.body ?? {}))
}
