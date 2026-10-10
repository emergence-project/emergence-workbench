/**
 * 맡긴 일 API의 계약 (workbench/tasks/*.md, 서버 routes/tasks.ts · 화면 api/tasks.ts).
 * 서버는 요청 몸을 이 정의로 검사하고, 테스트는 응답이 이 정의와 정확히 맞는지 본다. 화면은 타입만 가져간다.
 * 파일 형식은 docs/agent-delegated-work.md, 여기는 앱 서버와 화면 사이의 모양이다.
 */
import { z } from 'zod'

// ---------- 응답 ----------

export const TASK_STATES = ['working', 'proposed', 'result', 'done', 'paused', 'stopped'] as const
export const VERDICTS = ['approve', 'send-back', 'pause', 'discard'] as const

const TaskAsk = z.object({ q: z.string(), options: z.array(z.string()) }).strict()
const TaskIssue = z.object({ text: z.string(), impact: z.string().optional(), next: z.number().optional() }).strict()
const TaskNext = z.object({ task: z.string(), endCondition: z.string().optional(), started: z.string().optional(), dropped: z.boolean().optional() }).strict()
const TaskAnswer = z.object({ n: z.number(), answer: z.string(), note: z.string().optional(), at: z.string() }).strict()
const TaskJudgment = z.object({ at: z.string(), verdict: z.enum(VERDICTS), note: z.string().optional(), seconds: z.number().optional() }).strict()

export const Task = z.object({
  /** 파일 이름 (날짜-이름) */
  id: z.string(),
  /** 저장소 기준 경로 */
  file: z.string(),
  title: z.string(),
  topic: z.string().optional(),
  agent: z.string(),
  created: z.string(),
  state: z.enum(TASK_STATES),
  task: z.string(),
  endCondition: z.string().optional(),
  references: z.array(z.string()),
  avoid: z.string().optional(),
  resultAt: z.string().optional(),
  conclusion: z.string().optional(),
  endCheck: z.enum(['pass', 'fail', 'unknown']).optional(),
  asks: z.array(TaskAsk),
  issues: z.array(TaskIssue),
  next: z.array(TaskNext),
  outputs: z.array(z.string()),
  check: z.object({ machine: z.string().optional(), repro: z.string().optional(), human: z.string().optional() }).strict(),
  proposal: z.object({ endCondition: z.array(z.string()), reason: z.string().optional() }).strict().optional(),
  answers: z.array(TaskAnswer),
  judged: z.array(TaskJudgment),
  /** 머리말 뒤 보고서 본문 */
  body: z.string(),
  hash: z.string(),
  mtime: z.number(),
}).strict()

export const TaskDiagnostic = z.object({
  file: z.string(),
  code: z.enum(['filename', 'frontmatter', 'yaml', 'schema', 'read']),
  message: z.string(),
  line: z.number(),
  column: z.number().optional(),
}).strict()

/** GET /tasks. rules = 규칙 문서 경로 (에이전트에게 줄 말에 넣는다) */
export const TaskScan = z.object({ tasks: z.array(Task), diagnostics: z.array(TaskDiagnostic), rules: z.string() }).strict()
/** GET /tasks/:id, POST judge · answer */
export const TaskOne = z.object({ task: Task }).strict()
/** POST /tasks (맡기기) */
export const TaskCreated = z.object({ task: Task, rules: z.string() }).strict()
/** POST next: start면 새로 맡긴 일(started)도 */
export const TaskNextDone = z.object({ task: Task, started: Task.optional() }).strict()

// ---------- 요청 ----------
// 모양(글인지, 목록인지)만 여기서 본다. 빈 제목, 주제 id 모양, 상태에 따른 규칙은 서버 tasks.ts가 본다.

const optionalText = z.string().nullish()
/** 1부터 세는 번호. 숫자 글("2")도 받는다 */
const ordinal = z.union([z.number().int().positive(), z.string().regex(/^\d+$/).transform(Number)])
const baseHash = z.string().min(1, 'baseHash (the hash received when reading) is required')

export const NewTaskBody = z.object({
  title: z.string(),
  task: z.string(),
  endCondition: optionalText,
  topic: optionalText,
  agent: optionalText,
  references: z.array(z.string()).optional(),
  avoid: optionalText,
})
export const JudgeBody = z.object({
  verdict: z.enum(VERDICTS),
  note: z.string().optional(),
  /** 판단에 쓴 시간 (화면이 잰다) */
  seconds: z.number().nonnegative().optional(),
  /** 종결 조건 제안을 고쳐서 승인할 때 */
  endCondition: z.string().optional(),
  baseHash,
})
export const AnswerBody = z.object({ n: ordinal, answer: z.string(), note: z.string().optional(), baseHash })
export const NextBody = z.object({ i: ordinal, action: z.enum(['start', 'drop', 'restore']), edit: NewTaskBody.partial().optional(), baseHash })

export type TaskState = (typeof TASK_STATES)[number]
export type Verdict = (typeof VERDICTS)[number]
export type TaskAsk = z.infer<typeof TaskAsk>
export type TaskIssue = z.infer<typeof TaskIssue>
export type TaskNext = z.infer<typeof TaskNext>
export type TaskAnswer = z.infer<typeof TaskAnswer>
export type TaskJudgment = z.infer<typeof TaskJudgment>
export type Task = z.infer<typeof Task>
export type TaskDiagnostic = z.infer<typeof TaskDiagnostic>
export type TaskScan = z.infer<typeof TaskScan>
export type TaskOne = z.infer<typeof TaskOne>
export type TaskCreated = z.infer<typeof TaskCreated>
export type TaskNextDone = z.infer<typeof TaskNextDone>
/** 보내는 쪽(화면) 모양. 서버가 받은 뒤의 모양은 z.output */
export type NewTaskBody = z.input<typeof NewTaskBody>
export type JudgeBody = z.input<typeof JudgeBody>
export type AnswerBody = z.input<typeof AnswerBody>
export type NextBody = z.input<typeof NextBody>
