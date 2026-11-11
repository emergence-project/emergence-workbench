/**
 * 흐름과 시도 나무 API의 계약 (workbench/problems/<id>/, 서버 routes/problems.ts · 화면 api/problems.ts).
 * 파일 형식은 docs/repo-format.md §16, 여기는 앱 서버와 화면 사이의 모양이다. (11/11 결정 "흐름을 시도 나무로 · 메시지 관문")
 */
import { z } from 'zod'
import { ATTEMPT_STATES, ATTEMPT_VERDICTS, DIRECTION_VERDICTS, PROBLEM_STATES, PROBLEM_STOPS, REPORT_WHYS, TEST_RESULTS } from '../problems.js'

export { ATTEMPT_STATES, ATTEMPT_VERDICTS, DIRECTION_VERDICTS, PROBLEM_STATES, PROBLEM_STOPS, REPORT_WHYS, TEST_RESULTS }
export const ProblemState = z.enum(PROBLEM_STATES)
export const AttemptState = z.enum(ATTEMPT_STATES)
export const ProblemStop = z.enum(PROBLEM_STOPS)

/** 문헌 대조 한 줄: 논문(라이브러리 키 또는 주소)과 그 논문이 한 것. 사실만 적는다 */
export const Literature = z.object({ ref: z.string(), fact: z.string(), by: z.string().optional(), at: z.string().optional() }).strict()

/** 방향 보고와 그에 대한 사용자의 결정. 보고는 사실만: 메시지의 예 · 아니오 문장을 지지하는 것, 어느 쪽과도 무관한 것 */
export const DirectionReport = z.object({
  at: z.string(),
  by: z.string(),
  why: z.enum(REPORT_WHYS),
  for_yes: z.string().optional(),
  for_no: z.string().optional(),
  neither: z.string().optional(),
  decision: z.object({ at: z.string(), verdict: z.enum(DIRECTION_VERDICTS), note: z.string().optional(), limit: z.number().optional() }).strict().optional(),
}).strict()

export const AttemptRun = z.object({ command: z.string().optional(), commit: z.string().optional() }).strict()

/** 시도 하나 (나무의 마디). label은 화면에 보이는 이름(A · C1), depth는 흐름 바로 아래가 0 */
export const Attempt = z.object({
  id: z.string(),
  label: z.string(),
  hash: z.string(),
  method: z.string(),
  parent: z.string().optional(),
  depth: z.number(),
  state: AttemptState,
  /** 후보를 제안한 쪽 */
  by: z.string(),
  created: z.string().optional(),
  /** 작업한 쪽 (시작할 때 적힌다). 판정은 이 이름이 아닌 쪽만 한다 */
  worker: z.string().optional(),
  started: z.string().optional(),
  did: z.string().optional(),
  result: z.string().optional(),
  files: z.array(z.string()),
  /** 실행: 결과를 낸 명령과 보고할 때의 커밋 (커밋은 비우면 앱이 적는다) */
  run: AttemptRun.optional(),
  /** 검사: 판정하는 쪽이 다시 돌리는 명령 */
  test: z.string().optional(),
  reported: z.string().optional(),
  /** tested = 검사 명령을 다시 돌린 결과. files = 판정할 때 파일마다의 해시 (앱이 적는다) */
  verdict: z.object({ at: z.string(), by: z.string(), note: z.string().optional(), check: z.string().optional(), tested: z.enum(TEST_RESULTS).optional(), files: z.record(z.string(), z.string()).optional() }).strict().optional(),
  /** 판정 뒤에 바뀐 파일 (지금 해시가 판정 때와 다르다). 읽을 때 앱이 계산한다 */
  changed: z.array(z.string()).optional(),
  lesson: z.string().optional(),
  reopen: z.string().optional(),
  /** all = 이 아래 가지를 모두 해야 끝난다(분해). 없으면 이 가운데 하나(탐색) */
  needs: z.literal('all').optional(),
  /** 지금 할 후보 (순서의 첫 후보) */
  next: z.boolean(),
}).strict()

const Counts = z.object({ candidate: z.number(), active: z.number(), reported: z.number(), holds: z.number(), dropped: z.number() }).strict()

/** 목록의 흐름 하나 */
export const ProblemRow = z.object({
  id: z.string(),
  question: z.string(),
  state: ProblemState,
  by: z.string(),
  created: z.string().optional(),
  /** 제안의 출처 (논문 · 노트 절 · 시도) */
  source: z.string().optional(),
  limit: z.number(),
  /** 시작한 시도 수 */
  used: z.number(),
  counts: Counts,
  next: z.object({ id: z.string(), label: z.string(), method: z.string() }).strict().optional(),
  stop: ProblemStop.optional(),
  /** 사용자 차례: 방향 보고가 결정을 기다린다 */
  waiting: z.boolean(),
}).strict()
export const ProblemList = z.object({
  problems: z.array(ProblemRow),
  diagnostics: z.array(z.object({ file: z.string(), message: z.string() }).strict()),
}).strict()

/** GET …/problems/:id: 흐름과 그 나무 */
export const Problem = ProblemRow.extend({
  hash: z.string(),
  if_yes: z.string().optional(),
  if_no: z.string().optional(),
  reader: z.string().optional(),
  literature: z.array(Literature),
  first_test: z.string().optional(),
  grading: z.string().optional(),
  opened: z.string().optional(),
  closed: z.object({ at: z.string(), reason: z.string().optional() }).strict().optional(),
  order: z.array(z.string()),
  needs: z.literal('all').optional(),
  reports: z.array(DirectionReport),
  /** 나무 순서(부모 다음에 자식, 형제는 순서대로) */
  attempts: z.array(Attempt),
  /** 폐기한 시도의 폐기 사유 (뿌리에 모인다) */
  lessons: z.array(z.object({ id: z.string(), label: z.string(), lesson: z.string(), reopen: z.string().optional() }).strict()),
}).strict()
export const ProblemOne = z.object({ problem: Problem }).strict()
export const ProblemBrief = z.object({ markdown: z.string() }).strict()
export const ProblemRemoved = z.object({ ok: z.literal(true) }).strict()

// ---------- 요청 ----------

const line = z.string().trim().min(1)
const hash = z.string().min(1, 'baseHash (the hash received when reading) is required')
/** POST …/problems: 사용자가 만들면 쓰는 중(draft), 에이전트가 만들면 제안(proposed, source가 있어야 한다) */
export const NewProblemBody = z.object({ question: line, source: z.string().optional(), if_yes: z.string().optional(), if_no: z.string().optional(), reader: z.string().optional() }).strict()
/** PATCH …/problems/:id: 보낸 칸만 바꾼다. 에이전트는 문헌 대조 · 첫 시험 · 채점만 */
export const ProblemPatchBody = z.object({
  baseHash: hash,
  set: z.object({
    question: line.optional(),
    if_yes: z.string().optional(),
    if_no: z.string().optional(),
    reader: z.string().optional(),
    literature: z.array(z.object({ ref: line, fact: line }).strict()).optional(),
    first_test: z.string().optional(),
    grading: z.string().optional(),
    limit: z.number().int().min(1).max(99).optional(),
    order: z.array(z.string()).optional(),
    needs: z.enum(['all', 'any']).optional(),
  }).strict(),
}).strict()
export const ProblemOpenBody = z.object({ baseHash: hash }).strict()
export const ProblemCloseBody = z.object({ baseHash: hash, reason: line }).strict()
/** POST …/problems/:id/attempts: 후보를 늘어놓는다 */
export const NewAttemptsBody = z.object({ attempts: z.array(z.object({ method: line, parent: z.string().optional(), needs: z.literal('all').optional() }).strict()).min(1).max(12) }).strict()
/** run: 결과를 낸 명령(과 커밋), test: 판정하는 쪽이 다시 돌릴 검사 명령 */
export const AttemptReportBody = z.object({ did: line, result: line, files: z.array(z.string()).optional(), run: AttemptRun.optional(), test: z.string().optional(), lesson: z.string().optional(), reopen: z.string().optional() }).strict()
/** tested: 시도에 검사 명령이 있으면 다시 돌린 결과 (에이전트의 성립에는 pass가 있어야 한다) */
export const AttemptVerdictBody = z.object({ result: z.enum(ATTEMPT_VERDICTS), note: line, check: z.string().optional(), tested: z.enum(TEST_RESULTS).optional(), lesson: z.string().optional(), reopen: z.string().optional() }).strict()
export const DirectionReportBody = z.object({ for_yes: z.string().optional(), for_no: z.string().optional(), neither: z.string().optional() }).strict()
export const DirectionDecisionBody = z.object({ baseHash: hash, verdict: z.enum(DIRECTION_VERDICTS), note: z.string().optional(), limit: z.number().int().min(1).max(99).optional() }).strict()

export type ProblemState = z.infer<typeof ProblemState>
export type AttemptState = z.infer<typeof AttemptState>
export type ProblemStop = z.infer<typeof ProblemStop>
export type Literature = z.infer<typeof Literature>
export type DirectionReport = z.infer<typeof DirectionReport>
export type Attempt = z.infer<typeof Attempt>
export type ProblemRow = z.infer<typeof ProblemRow>
export type ProblemList = z.infer<typeof ProblemList>
export type Problem = z.infer<typeof Problem>
export type ProblemOne = z.infer<typeof ProblemOne>
export type ProblemBrief = z.infer<typeof ProblemBrief>
export type ProblemRemoved = z.infer<typeof ProblemRemoved>
export type NewProblemBody = z.infer<typeof NewProblemBody>
export type ProblemPatchBody = z.infer<typeof ProblemPatchBody>
export type ProblemOpenBody = z.infer<typeof ProblemOpenBody>
export type ProblemCloseBody = z.infer<typeof ProblemCloseBody>
export type NewAttemptsBody = z.infer<typeof NewAttemptsBody>
export type AttemptReportBody = z.infer<typeof AttemptReportBody>
export type AttemptVerdictBody = z.infer<typeof AttemptVerdictBody>
export type DirectionReportBody = z.infer<typeof DirectionReportBody>
export type DirectionDecisionBody = z.infer<typeof DirectionDecisionBody>
