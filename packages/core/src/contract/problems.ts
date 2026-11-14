/**
 * 흐름과 시도 나무 API의 계약 (workbench/problems/<id>/, 서버 routes/problems.ts · 화면 api/problems.ts).
 * 파일 형식은 docs/repo-format.md §16, 여기는 앱 서버와 화면 사이의 모양이다. (11/11 결정 "흐름을 시도 나무로 · 메시지 관문")
 */
import { z } from 'zod'
import { ATTEMPT_STATES, ATTEMPT_VERDICTS, BASIS_REVIEWS, CLAIM_SIDES, DIRECTION_VERDICTS, EXCEPTION_KINDS, FLOW_ANSWERS, PROBLEM_STATES, PROBLEM_STOPS, REPORT_WHYS, TEST_RESULTS } from '../problems.js'

export { ATTEMPT_STATES, ATTEMPT_VERDICTS, BASIS_REVIEWS, CLAIM_SIDES, DIRECTION_VERDICTS, EXCEPTION_KINDS, FLOW_ANSWERS, PROBLEM_STATES, PROBLEM_STOPS, REPORT_WHYS, TEST_RESULTS }
export const ProblemState = z.enum(PROBLEM_STATES)
export const AttemptState = z.enum(ATTEMPT_STATES)
export const ProblemStop = z.enum(PROBLEM_STOPS)
export const ClaimSide = z.enum(CLAIM_SIDES)
export const FlowAnswer = z.enum(FLOW_ANSWERS)

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

/**
 * 주장 하나 (차트의 점, 11/13 결정 "점 = 주장, 시도는 근거"): 판단할 수 있는 한 문장과 그것이 성립하는 조건.
 * 근거는 이 주장을 겨눈 시도(attempts)와 이 아래의 주장(under가 이 주장인 것)이다. 상태는 읽을 때 앱이 그 근거에서 계산한다:
 * 성립 = 성립한 시도가 있고 아래 주장이 모두 성립, 판정 대기 = 보고한 시도가 판정을 기다림, 진행 = 시도 중이거나 아래 주장을 기다림(waiting),
 * 폐기 = 시도가 모두 폐기됐거나 사용자가 기각, 후보 = 아직 해 본 것이 없음
 */
export const Claim = z.object({
  /** 흐름 안의 번호 (1 · 2 …). 화면에 보이는 이름이기도 하다 */
  id: z.string(),
  hash: z.string(),
  statement: z.string(),
  condition: z.string().optional(),
  /** 위 주장: 이 주장은 그 주장의 근거다. 없으면 질문 바로 아래 */
  under: z.string().optional(),
  /** 질문 바로 아래가 0 */
  depth: z.number(),
  /** 질문의 어느 쪽을 받치나 (질문 바로 아래의 주장만) */
  side: ClaimSide.optional(),
  by: z.string(),
  created: z.string().optional(),
  /** 이 주장을 내놓은 시도 (시도가 보고하며 생긴 주장) */
  from: z.string().optional(),
  state: AttemptState,
  /** 시도는 성립했지만 아래 주장이 아직 성립하지 않았다 */
  waiting: z.boolean().optional(),
  /** 성립 판정 뒤에 진술 · 조건이나 파일이 바뀌었다 */
  stale: z.boolean().optional(),
  /** 사용자의 승인: 흐름을 답과 함께 닫을 때 그 답이 기대는 주장으로 받아들임 */
  accepted: z.object({ at: z.string(), by: z.string() }).strict().optional(),
  /** 사용자의 기각 */
  rejected: z.object({ at: z.string(), by: z.string(), note: z.string() }).strict().optional(),
  /** 이 주장을 겨눈 시도 (순서대로) */
  attempts: z.array(z.string()),
  /** 근거의 날짜 (YYYY-MM-DD): 이 주장을 겨눈 시도 가운데 가장 이른 한 날, 없으면 주장을 세운 날. 형제 주장은 이 순서로 놓인다. 읽을 때 앱이 계산한다 */
  when: z.string().optional(),
  /** 사용자가 확인하지 않은 옛 기록(에이전트가 적은 한 일)이 근거에 있다. 그 기록은 상태 계산에 들지 않는다 */
  unconfirmed: z.boolean().optional(),
}).strict()

/** 시도 하나: 주장(또는 질문)을 겨눈 방법 하나와 해 본 결과. 주장의 근거가 된다. label은 화면에 보이는 이름(A · B) */
export const Attempt = z.object({
  id: z.string(),
  label: z.string(),
  hash: z.string(),
  method: z.string(),
  /** 겨눈 주장. 없으면 질문을 바로 겨눈다 (아직 내놓은 주장이 없다) */
  claim: z.string().optional(),
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
  /** tested = 검사 명령을 다시 돌린 결과. files = 판정할 때 파일마다의 해시, claim = 그때 주장(진술 · 조건)의 해시 (앱이 적는다) */
  verdict: z.object({ at: z.string(), by: z.string(), note: z.string().optional(), check: z.string().optional(), tested: z.enum(TEST_RESULTS).optional(), files: z.record(z.string(), z.string()).optional(), claim: z.string().optional() }).strict().optional(),
  /** 판정 뒤에 바뀐 파일 (지금 해시가 판정 때와 다르다). 읽을 때 앱이 계산한다 */
  changed: z.array(z.string()).optional(),
  /** 성립 판정 뒤에 주장(진술 · 조건)이 바뀜. 읽을 때 앱이 계산한다 */
  restated: z.boolean().optional(),
  /** 사용자가 닫으려다 돌려보냄(수정): 작업한 쪽이 고쳐 다시 보고한다 */
  returned: z.object({ at: z.string(), by: z.string(), note: z.string() }).strict().optional(),
  lesson: z.string().optional(),
  reopen: z.string().optional(),
  /** 지금 할 후보 (순서의 첫 후보) */
  next: z.boolean(),
  /** 한 날 (YYYY-MM-DD): 지난 일을 적을 때 그 일을 한 날 */
  when: z.string().optional(),
  /** past = 지난 일을 나중에 적은 것(「＋ 한 일」). 한도 · 정체에 세지 않고, 에이전트가 적은 것은 사용자가 확인해야 근거가 된다 */
  origin: z.literal('past').optional(),
  /** 사용자 차례: 다음 판정을 사용자만 한다 (에이전트가 적은 옛 기록의 확인). 읽을 때 앱이 계산한다 */
  turn: z.boolean().optional(),
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
  /** 답과 함께 닫은 흐름의 답 */
  answer: FlowAnswer.optional(),
  /** 사용자 차례: 확인을 기다리는 옛 기록 수 */
  confirm: z.number().optional(),
}).strict()
export const ProblemList = z.object({
  problems: z.array(ProblemRow),
  diagnostics: z.array(z.object({ file: z.string(), message: z.string() }).strict()),
}).strict()

/** GET …/problems/:id: 흐름과 그 주장 · 시도 */
export const Problem = ProblemRow.extend({
  hash: z.string(),
  if_yes: z.string().optional(),
  if_no: z.string().optional(),
  reader: z.string().optional(),
  literature: z.array(Literature),
  first_test: z.string().optional(),
  grading: z.string().optional(),
  opened: z.string().optional(),
  /** answer · basis: 답과 함께 닫았을 때의 답과, 사용자가 승인한 주장(주장 번호) */
  closed: z.object({ at: z.string(), reason: z.string().optional(), answer: FlowAnswer.optional(), basis: z.array(z.string()).optional() }).strict().optional(),
  /** 지금 닫는다면 답마다 기대는 주장(번호): 그 쪽을 받치는 성립한 주장과 그 아래 근거 주장 (나무 순서). 읽을 때 앱이 계산한다 */
  basis: z.object({ yes: z.array(z.string()), no: z.array(z.string()) }).strict(),
  order: z.array(z.string()),
  reports: z.array(DirectionReport),
  /** 나무 순서(위 주장 다음에 그 근거 주장, 형제는 번호 순) */
  claims: z.array(Claim),
  /** 일하는 순서 (사용자가 정한 순서, 그다음 만든 순서) */
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
  }).strict(),
}).strict()
export const ProblemOpenBody = z.object({ baseHash: hash }).strict()
/**
 * POST …/problems/:id/close. 답 없이 닫으면 reason이 있어야 한다.
 * 답(answer)과 함께 닫으면 그 답이 기대는 주장(Problem.basis)마다 reviews에 승인 · 수정 · 기각이 있어야 하고, 모두 승인일 때만 닫힌다 (수정 · 기각에는 note)
 */
export const BasisReview = z.object({ id: z.string(), verdict: z.enum(BASIS_REVIEWS), note: z.string().optional() }).strict()
export const ProblemCloseBody = z.object({ baseHash: hash, reason: z.string().optional(), answer: FlowAnswer.optional(), reviews: z.array(BasisReview).optional() }).strict()
/** POST …/problems/:id/attempts: 후보를 늘어놓는다. claim = 겨눌 주장(없으면 질문) */
export const NewAttemptsBody = z.object({ attempts: z.array(z.object({ method: line, claim: z.string().optional() }).strict()).min(1).max(12) }).strict()
/** POST …/problems/:id/claims: 주장을 먼저 세운다. under = 위 주장(그 주장의 근거가 된다). 질문 바로 아래면 side가 있어야 한다 */
export const NewClaimBody = z.object({ statement: line, condition: z.string().optional(), under: z.string().optional(), side: ClaimSide.optional() }).strict()
/** run: 결과를 낸 명령(과 커밋), test: 판정하는 쪽이 다시 돌릴 검사 명령 */
/** statement · condition · side: 이 시도가 내놓는 주장. 겨눈 주장 그대로를 받치면 비운다. 적으면 겨눈 주장(없으면 질문) 아래에 새 주장이 생기고 이 시도는 그 근거가 된다 (side는 질문 바로 아래일 때) */
export const AttemptReportBody = z.object({ did: line, result: line, statement: z.string().optional(), condition: z.string().optional(), side: ClaimSide.optional(), files: z.array(z.string()).optional(), run: AttemptRun.optional(), test: z.string().optional(), lesson: z.string().optional(), reopen: z.string().optional() }).strict()
/** tested: 시도에 검사 명령이 있으면 다시 돌린 결과 (에이전트의 성립에는 pass가 있어야 한다) */
export const AttemptVerdictBody = z.object({ result: z.enum(ATTEMPT_VERDICTS), note: line, check: z.string().optional(), tested: z.enum(TEST_RESULTS).optional(), lesson: z.string().optional(), reopen: z.string().optional() }).strict()
const DAY = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'when: YYYY-MM-DD')
/**
 * POST …/problems/:id/attempts/record: 지난 일 하나를 적는다 (「＋ 한 일」). claim = 겨눈 주장(없으면 질문), statement를 적으면 그 아래 새 주장이 생긴다 (보고와 같다).
 * 사용자가 적으면 outcome(기본 성립)으로 곧바로 판정된 근거가 되고, 에이전트가 적으면 판정 대기로 남아 사용자가 확인한다 (outcome은 사용자만)
 */
export const RecordAttemptBody = z.object({
  method: line, claim: z.string().optional(), when: DAY.optional(), did: z.string().optional(), result: line,
  statement: z.string().optional(), condition: z.string().optional(), side: ClaimSide.optional(), files: z.array(z.string()).optional(),
  outcome: z.enum(ATTEMPT_VERDICTS).optional(), lesson: z.string().optional(),
}).strict()
export const DirectionReportBody = z.object({ for_yes: z.string().optional(), for_no: z.string().optional(), neither: z.string().optional() }).strict()
export const DirectionDecisionBody = z.object({ baseHash: hash, verdict: z.enum(DIRECTION_VERDICTS), note: z.string().optional(), limit: z.number().int().min(1).max(99).optional() }).strict()

// ---------- 예외 기록 (workbench/problems/_exceptions/) ----------

/** 규칙대로 되지 않은 일 하나. kind refused는 앱이 거절하며 적은 것(rule = 어느 규칙) */
export const FlowException = z.object({
  id: z.string(),
  at: z.string(),
  by: z.string(),
  kind: z.enum(EXCEPTION_KINDS),
  problem: z.string().optional(),
  attempt: z.string().optional(),
  what: z.string(),
  instead: z.string().optional(),
  rule: z.string().optional(),
}).strict()
export const FlowExceptionList = z.object({ exceptions: z.array(FlowException) }).strict()
export const FlowExceptionOne = z.object({ exception: FlowException }).strict()
/** POST …/problem-exceptions: 사용자나 에이전트가 한 줄 적는다 (refused는 앱만) */
export const NewExceptionBody = z.object({ kind: z.enum(EXCEPTION_KINDS).exclude(['refused']), what: line, instead: z.string().optional(), problem: z.string().optional(), attempt: z.string().optional() }).strict()

export type ProblemState = z.infer<typeof ProblemState>
export type ClaimSide = z.infer<typeof ClaimSide>
export type FlowAnswer = z.infer<typeof FlowAnswer>
export type BasisReview = z.infer<typeof BasisReview>
export type FlowException = z.infer<typeof FlowException>
export type FlowExceptionList = z.infer<typeof FlowExceptionList>
export type FlowExceptionOne = z.infer<typeof FlowExceptionOne>
export type NewExceptionBody = z.infer<typeof NewExceptionBody>
export type AttemptState = z.infer<typeof AttemptState>
export type ProblemStop = z.infer<typeof ProblemStop>
export type Literature = z.infer<typeof Literature>
export type DirectionReport = z.infer<typeof DirectionReport>
export type Claim = z.infer<typeof Claim>
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
export type NewClaimBody = z.infer<typeof NewClaimBody>
export type AttemptReportBody = z.infer<typeof AttemptReportBody>
export type AttemptVerdictBody = z.infer<typeof AttemptVerdictBody>
export type RecordAttemptBody = z.infer<typeof RecordAttemptBody>
export type DirectionReportBody = z.infer<typeof DirectionReportBody>
export type DirectionDecisionBody = z.infer<typeof DirectionDecisionBody>
