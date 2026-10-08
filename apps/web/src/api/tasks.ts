// ---------- 맡긴 일 (작업 탭, 10/7): workbench/tasks/*.md, 서버 tasks.ts. 형식은 docs/agent-delegated-work.md ----------
import { enc, json, req, send } from './http'

export type TaskState = 'working' | 'proposed' | 'result' | 'done' | 'paused' | 'stopped'
export type Verdict = 'approve' | 'send-back' | 'pause' | 'discard'
export interface TaskAsk { q: string; options: string[] }
export interface TaskIssue { text: string; impact?: string; next?: number }
export interface TaskNext { task: string; endCondition?: string; started?: string; dropped?: boolean }
export interface TaskAnswer { n: number; answer: string; note?: string; at: string }
export interface TaskJudgment { at: string; verdict: Verdict; note?: string; seconds?: number }

export interface Task {
  id: string
  file: string
  title: string
  topic?: string
  agent: string
  created: string
  state: TaskState
  task: string
  endCondition?: string
  references: string[]
  avoid?: string
  resultAt?: string
  conclusion?: string
  endCheck?: 'pass' | 'fail' | 'unknown'
  asks: TaskAsk[]
  issues: TaskIssue[]
  next: TaskNext[]
  outputs: string[]
  check: { machine?: string; repro?: string; human?: string }
  proposal?: { endCondition: string[]; reason?: string }
  answers: TaskAnswer[]
  judged: TaskJudgment[]
  body: string
  hash: string
  mtime: number
}

export interface TaskDiagnostic { file: string; code: 'filename' | 'frontmatter' | 'yaml' | 'schema' | 'read'; message: string; line: number; column?: number }
export interface TaskScan { tasks: Task[]; diagnostics: TaskDiagnostic[]; rules?: string }

export interface NewTask { title: string; task: string; endCondition?: string; topic?: string; agent?: string; references?: string[]; avoid?: string }

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
    get: (id: string) => req(one(id)).then((r) => json<{ task: Task }>(r)).then((r) => r.task),
    create: (input: NewTask) => req(base, send('POST', input)).then((r) => json<{ task: Task; rules?: string }>(r)).then(keepRules).then((r) => r.task),
    judge: (id: string, body: { verdict: Verdict; note?: string; seconds?: number; endCondition?: string; baseHash: string }) =>
      req(`${one(id)}/judge`, send('POST', body)).then((r) => json<{ task: Task }>(r)).then((r) => r.task),
    answer: (id: string, body: { n: number; answer: string; note?: string; baseHash: string }) =>
      req(`${one(id)}/answer`, send('POST', body)).then((r) => json<{ task: Task }>(r)).then((r) => r.task),
    next: (id: string, body: { i: number; action: 'start' | 'drop' | 'restore'; edit?: Partial<NewTask>; baseHash: string }) =>
      req(`${one(id)}/next`, send('POST', body)).then((r) => json<{ task: Task; started?: Task }>(r)),
  }
}
