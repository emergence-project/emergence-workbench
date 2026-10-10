// ---------- 맡긴 일 (작업 탭, 10/7): workbench/tasks/*.md, 서버 tasks.ts. 형식은 docs/agent-delegated-work.md ----------
import { enc, json, req, send } from './http'

// 타입은 서버와 같은 계약에서 (packages/core/src/contract/tasks.ts). 타입만 가져와 번들에 zod가 들어가지 않는다
import type { AnswerBody, JudgeBody, NewTaskBody, NextBody, TaskCreated, TaskNextDone, TaskOne, TaskScan } from '@rw/core/contract/tasks'
export type { Task, TaskAnswer, TaskAsk, TaskDiagnostic, TaskIssue, TaskJudgment, TaskNext, TaskScan, TaskState, Verdict } from '@rw/core/contract/tasks'
export type NewTask = NewTaskBody

/** 규칙 문서 경로 (서버가 목록·맡기기 응답에 함께 준다; 맥에서는 ~/…/research-workspace/docs/agent-delegated-work.md) */
export const taskRules = { doc: 'research-workspace/docs/agent-delegated-work.md' }
const keepRules = <T extends { rules?: string }>(r: T): T => { if (r.rules) taskRules.doc = r.rules; return r }

export function tasksApi(rid: string) {
  const base = `/api/researches/${enc(rid)}/tasks`
  const one = (id: string) => `${base}/${enc(id)}`
  const scan = () => req(base).then((r) => json<TaskScan>(r)).then(keepRules)
  return {
    scan,
    list: () => scan().then((r) => r.tasks),
    get: (id: string) => req(one(id)).then((r) => json<TaskOne>(r)).then((r) => r.task),
    create: (input: NewTask) => req(base, send('POST', input)).then((r) => json<TaskCreated>(r)).then(keepRules).then((r) => r.task),
    judge: (id: string, body: JudgeBody) =>
      req(`${one(id)}/judge`, send('POST', body)).then((r) => json<TaskOne>(r)).then((r) => r.task),
    answer: (id: string, body: AnswerBody) =>
      req(`${one(id)}/answer`, send('POST', body)).then((r) => json<TaskOne>(r)).then((r) => r.task),
    next: (id: string, body: NextBody) =>
      req(`${one(id)}/next`, send('POST', body)).then((r) => json<TaskNextDone>(r)),
  }
}
