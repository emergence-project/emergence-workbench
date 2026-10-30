/**
 * 연구 흐름 API의 계약 (workbench/flow/*.yaml, 서버 routes/flow.ts · 화면 api/flow.ts).
 * 점 하나 = 생각의 한 걸음. 파일 형식은 docs/repo-format.md §14, 여기는 앱 서버와 화면 사이의 모양이다.
 */
import { z } from 'zod'

import { FLOW_EDGES, FLOW_EVIDENCE, FLOW_GAPS, FLOW_KINDS, FLOW_PRIORITY, FLOW_PROGRESS, FLOW_RESULTS, FLOW_VERDICTS } from '../flow-kinds.js'
export { CARD_FIELDS, CARD_LOCKED, CARD_VERDICTS, FINDING_VERDICTS, FLOW_VERDICTS, FLOW_EDGES, FLOW_EVIDENCE, FLOW_FIELDS, FLOW_GAPS, FLOW_KINDS, FLOW_PRIORITY, FLOW_PROGRESS, FLOW_REQUIRED, FLOW_RESULTS, WORK_KINDS } from '../flow-kinds.js'

const FlowFrom = z.object({ id: z.string(), type: z.enum(FLOW_EDGES) }).strict()
const FlowCheck = z.object({
  at: z.string(),
  by: z.string(),
  /** agent = 에이전트 검토, human = 사람 승인 */
  role: z.enum(['agent', 'human']),
  note: z.string().optional(),
  /** 앞선 같은 역할의 확인을 거둔다 (기록은 덧붙이기만 하므로 지우지 않고 거둔 기록을 더한다) */
  revoked: z.boolean().optional(),
  /** 확인할 때 그 근거(절 또는 파일)·단계의 내용 해시. 지금 내용과 다르면 그 확인은 낡은 것이다 (10/20) */
  hash: z.string().optional(),
  /** 발견의 확인일 때 그 진술 · 조건의 해시 (10/23). 지금 진술 · 조건과 다르면 그 확인은 낡은 것이다 */
  claim: z.string().optional(),
}).strict()
const FlowEvidence = z.object({
  kind: z.enum(FLOW_EVIDENCE),
  /** 이 근거가 무엇을 보이는지 */
  text: z.string(),
  /** 노트 이름 (보이는 이름) */
  title: z.string().optional(),
  /** 저장소 기준 경로 (노트·코드·그림) */
  file: z.string().optional(),
  /** 라이브러리의 논문 키 */
  ref: z.string().optional(),
  /** 노트 안의 절(제목) 이름 (10/20). 확인 기록의 hash는 이 절의 내용으로 잰다 */
  section: z.string().optional(),
  checks: z.array(FlowCheck),
  /** 앱이 계산: 확인한 뒤 근거 내용이 바뀌었다 */
  stale: z.boolean().optional(),
}).strict()
/** 수치 계산의 실행 (10/20): 같은 계산을 다시 하지 않게 찾을 수 있는 모양으로 */
const FlowRun = z.object({
  code: z.string().optional(),
  commit: z.string().optional(),
  params: z.record(z.string(), z.string()).optional(),
  output: z.string().optional(),
}).strict()
/** 증명 · 이론 계산의 단계 (10/20): 단계마다 쓰는 것과 확인 */
const FlowStep = z.object({
  text: z.string(),
  /** 이 단계가 쓰는 것 (공리 · 앞 단계 · 다른 점 · 논문) */
  uses: z.string().optional(),
  checks: z.array(FlowCheck),
  stale: z.boolean().optional(),
}).strict()
const FlowGap = z.object({ code: z.enum(FLOW_GAPS), text: z.string() }).strict()
/**
 * 시작 기록 (10/23, `pnpm agent:start`): 일을 시작하기 전에 찾은 것과 판정 기준. late = 일을 한 뒤에 적은 기록(사후)
 */
const FlowStart = z.object({
  at: z.string(),
  by: z.string().optional(),
  /** 선행 찾기에 쓴 글과 걸린 점 */
  query: z.string().optional(),
  hits: z.array(z.string()),
  /** 가장 가까운 기존 결과 · 반례 (점 id)와 이번에 더할 것 */
  prior: z.array(z.string()),
  adds: z.string().optional(),
  /** 가까운 것이 없을 때 왜 새로운지 */
  novel: z.string().optional(),
  /** 판정 기준 칸이 없는 종류(증명 · 이론 계산 …)의 판정 기준 */
  criterion: z.string().optional(),
  /** 멈출 조건 */
  stop: z.string().optional(),
  late: z.boolean().optional(),
}).strict()
/** 반영 기록 (10/23, `pnpm agent:integrate`): 끝난 점의 결과를 이해 문서(into › section)에 반영했거나, 반영하지 않은 이유(skip) */
const FlowIntegration = z.object({
  at: z.string(),
  by: z.string().optional(),
  into: z.string().optional(),
  section: z.string().optional(),
  skip: z.string().optional(),
}).strict()

/**
 * 사람 판단 (10/23 "판단 설계", 덧붙이기만): 발견(명제)은 approve 승인 · send-back 수정 · reject 기각, 카드(질문)는 start 시작 · send-back 수정 · end 종료.
 * claim = 판단할 때 그 내용의 해시(발견은 진술 · 조건, 카드는 질문 · 완료 조건). 지금 내용과 다르면 그 판단은 낡는다(stale, 앱이 계산)
 */
const FlowJudgment = z.object({
  at: z.string(),
  by: z.string(),
  verdict: z.enum(FLOW_VERDICTS),
  note: z.string().optional(),
  claim: z.string().optional(),
  stale: z.boolean().optional(),
}).strict()
/** 카드에서 칸 글이 아닌 것 (10/23): 사전 연구(판단된 명제 점 id) · 용어 · 도구 · 담당 · 돌려받을 명제 수 */
const FlowTerm = z.object({ word: z.string(), def: z.string().optional(), ref: z.string().optional() }).strict()
const FlowCard = z.object({
  givens: z.array(z.string()),
  terms: z.array(FlowTerm),
  tools: z.array(z.string()),
  assignee: z.string().optional(),
  findings: z.number().int().min(0).optional(),
}).strict()

export const FlowNode = z.object({
  /** 파일 이름 (확장자 없이) */
  id: z.string(),
  /** 저장소 기준 경로 */
  file: z.string(),
  hash: z.string(),
  kind: z.enum(FLOW_KINDS),
  progress: z.enum(FLOW_PROGRESS),
  result: z.enum(FLOW_RESULTS).optional(),
  short: z.string(),
  title: z.string(),
  topics: z.array(z.string()),
  /** 시작일: 점을 만든 날 (앱이 적고 화면에서는 읽기만, 10/21) */
  date: z.string().optional(),
  /** 끝난 날: 끝남(해결 · 반증 · 폐기)으로 바꾼 날. 다시 열면 지운다 (10/21) */
  ended: z.string().optional(),
  /** 한 이: 점을 만든 이 (사용자 · claude-code · codex …, 10/21) */
  by: z.string().optional(),
  /** 이 점을 만든 맡긴 일 (workbench/tasks의 id, 10/21) */
  task: z.string().optional(),
  start: FlowStart.optional(),
  integration: FlowIntegration.optional(),
  from: z.array(FlowFrom),
  fields: z.record(z.string(), z.string()),
  /** 흐름 종료: 이 갈래는 여기서 끝나 뒤에 이어질 점이 없다 (10/21 "갈래 종결"에서 이름을 바꿈) */
  end: z.boolean().optional(),
  evidence: z.array(FlowEvidence),
  run: FlowRun.optional(),
  steps: z.array(FlowStep),
  /** 반증 · 폐기 · 멈춤의 이유 */
  reason: z.string().optional(),
  /** 다음 할 일과 우선 */
  next: z.string().optional(),
  priority: z.enum(FLOW_PRIORITY).optional(),
  /** 앱이 계산한 빈틈 */
  gaps: z.array(FlowGap),
  /** 옛 점 (10/30): 앱 · MCP를 거치지 않고 만들어져 만든 이(by)도 시작 기록도 없는 점. 판단 전으로 보이고 빈틈은 세지 않는다 */
  legacy: z.boolean().optional(),
  /** 기록 출처 (일지·노트·커밋) */
  sources: z.array(z.string()),
  /** 에이전트가 짐작한 것 (사람이 확인하지 않음) */
  guesses: z.array(z.string()),
  /** 사람이 승인한 증명이 근거에 있는 발견 = 정리 */
  theorem: z.boolean(),
  /** 카드 (질문을 맡길 때, 10/23) */
  card: FlowCard.optional(),
  /** 사람 판단 기록 (10/23) */
  judgments: z.array(FlowJudgment),
  /** 앱이 계산: 지금의 판단 = 낡지 않은 마지막 판단의 말. 없으면 판단 전 */
  verdict: z.enum(FLOW_VERDICTS).optional(),
  /** 앱이 계산 (흐름 전체를 읽을 때만): 판단 대기열에 든 명제 (사용자 차례) */
  queued: z.literal(true).optional(),
  /** 앱이 계산 (흐름 전체를 읽을 때만): 카드의 상태. 대기 · 준비(사용자가 시작할 차례) · 진행 · 종료 */
  cardState: z.enum(['waiting', 'ready', 'active', 'ended']).optional(),
}).strict()

const Diagnostic = z.object({ file: z.string(), code: z.string(), message: z.string(), line: z.number(), column: z.number().optional() }).strict()

/** 손으로 옮긴 자리 (workbench/flow/layout.yaml): 점 id → 칸. 프로젝트 흐름 하나에 하나. r은 중심선 기준(위가 음수) */
const Cell = z.object({ c: z.number().int().min(0), r: z.number().int() }).strict()
export const FlowLayout = z.record(z.string(), Cell)
/**
 * 보이는 줄 (layout.yaml rows, 10/16): 중심선 기준 맨 위·맨 아래 줄. 사람이 ＋ 줄 · ×로 정한다. 없으면 앱의 기본 줄 수.
 * names (10/20): 줄 이름 (중심선 기준 줄 → 이름). 주제와 따로이고 고르기 사항이다
 */
export const FlowRows = z.object({ top: z.number().int().max(0), bottom: z.number().int().min(0), names: z.record(z.string().regex(/^-?\d+$/), z.string()).optional() }).strict()

export const FlowScan = z.object({ nodes: z.array(FlowNode), diagnostics: z.array(Diagnostic), layout: FlowLayout, rows: FlowRows.nullable() }).strict()
export const FlowOne = z.object({ node: FlowNode }).strict()
/** 지난 시도 찾기 (MCP flow_search): 점마다 한 줄 */
/** 찾은 점에 이어진 맡긴 일 (10/26): link는 짝을 찾은 길 — field 맡긴 일의 flow 칸 · dot 점의 task 칸 · text 맡긴 일 글의 점 이름 */
export const FlowSearchTask = z.object({
  id: z.string(), title: z.string(), state: z.string(), link: z.enum(['field', 'dot', 'text']),
  resultAt: z.string().optional(), conclusion: z.string().optional(), outputs: z.array(z.string()).optional(),
}).strict()
export const FlowSearchReply = z.object({
  rows: z.array(z.object({
    id: z.string(), kind: z.enum(FLOW_KINDS), state: z.string(), short: z.string(), title: z.string(), date: z.string().optional(),
    params: z.record(z.string(), z.string()).optional(), result: z.string().optional(), reason: z.string().optional(), score: z.number(),
    tasks: z.array(FlowSearchTask).optional(),
  }).strict()),
}).strict()
/** 근거 고르기의 노트별 절 목록 (10/26): 노트 파일마다 절 이름 · 수준 · 첫 글 */
export const FlowNoteSections = z.object({
  notes: z.array(z.object({ file: z.string(), sections: z.array(z.object({ name: z.string(), level: z.number(), preview: z.string() }).strict()) }).strict()),
}).strict()
/** trashed: flow/.trash/로 옮긴 점 파일과 그 점의 기록 (workbench 기준 경로) */
export const FlowDeleted = z.object({ id: z.string(), changed: z.array(z.string()), trashed: z.array(z.string()) }).strict()
export const FlowLayoutReply = z.object({ layout: FlowLayout }).strict()
export const FlowRowsReply = z.object({ rows: FlowRows, layout: FlowLayout.optional() }).strict()

// ---------- 요청 ----------

const Text = z.string().max(4000)
const Short = z.string().trim().min(1).max(60)
/** 근거 하나 (확인 기록은 따로: 고칠 때 같은 ref·file의 기록은 그대로 남는다) */
const EvidenceIn = z.object({
  kind: z.enum(FLOW_EVIDENCE),
  text: Text,
  title: z.string().max(200).optional(),
  file: z.string().max(500).optional(),
  ref: z.string().max(200).optional(),
  section: z.string().max(200).optional(),
}).strict().refine((e) => !!e.file !== !!e.ref, { message: 'file과 ref 가운데 하나만' })
const RunIn = z.object({ code: z.string().max(500).optional(), commit: z.string().max(80).optional(), params: z.record(z.string().max(60), z.string().max(200)).optional(), output: z.string().max(500).optional() }).strict()
/** 단계 (확인 기록은 같은 자리의 것이 남는다. 글이 바뀌면 낡은 확인이 된다) */
const StepIn = z.object({ text: Text, uses: z.string().max(1000).optional() }).strict()

/** 카드 고치기 (화면 › 점 고치기 › 카드): 읽을 때의 모양과 같고 길이만 막는다 */
const FlowCardIn = z.object({
  givens: z.array(z.string().min(1)).max(40),
  terms: z.array(z.object({ word: z.string().max(80), def: z.string().max(1000).optional(), ref: z.string().max(300).optional() }).strict()).max(60),
  tools: z.array(z.string().max(300)).max(40),
  assignee: z.string().max(40).optional(),
  findings: z.number().int().min(0).max(20).optional(),
}).strict()

export const NewFlowBody = z.object({
  kind: z.enum(FLOW_KINDS),
  short: Short,
  title: z.string().max(300).optional(),
  topics: z.array(z.string().min(1)).optional(),
  from: z.array(FlowFrom).optional(),
  progress: z.enum(FLOW_PROGRESS).optional(),
  /** 만든 이 (MCP는 에이전트 이름, 화면은 비움 = 사용자) */
  by: z.string().max(40).optional(),
  /** 이 점을 만든 맡긴 일 id */
  task: z.string().max(120).optional(),
}).strict()

/** 시작 기록과 함께 새 점, 또는 열린 점을 시작 (MCP flow_add · flow_update, 10/24): pnpm agent:start와 같은 문 (apps/server/src/flowStart.ts startFlow).
 *  dot이 없으면 kind · short가 있어야 한다 (startFlow가 거절한다) */
export const FlowStartBody = z.object({
  dot: z.string().min(1).optional(),
  kind: z.enum(FLOW_KINDS).optional(),
  short: Short.optional(),
  title: z.string().max(300).optional(),
  topics: z.array(z.string().min(1)).optional(),
  from: z.array(FlowFrom).optional(),
  task: z.string().max(120).optional(),
  fields: z.record(z.string(), Text).optional(),
  criterion: Text.optional(),
  stop: Text.optional(),
  prior: z.array(z.string().min(1)).max(20).optional(),
  adds: Text.optional(),
  novel: Text.optional(),
  query: z.string().max(500).optional(),
  by: z.string().min(1).max(40),
}).strict()
/** 점과 선행 찾기에 걸린 점들 */
export const FlowStartReply = z.object({ node: FlowNode, hits: FlowSearchReply.shape.rows }).strict()

export const FlowPatchBody = z.object({
  baseHash: z.string(),
  set: z.object({
    kind: z.enum(FLOW_KINDS).optional(),
    progress: z.enum(FLOW_PROGRESS).optional(),
    result: z.enum(FLOW_RESULTS).nullable().optional(),
    short: Short.optional(),
    title: z.string().max(300).optional(),
    topics: z.array(z.string().min(1)).optional(),
    task: z.string().max(120).nullable().optional(),
    fields: z.record(z.string(), Text).optional(),
    end: z.boolean().optional(),
    from: z.array(FlowFrom).optional(),
    evidence: z.array(EvidenceIn).optional(),
    run: RunIn.nullable().optional(),
    steps: z.array(StepIn).optional(),
    reason: Text.optional(),
    next: Text.optional(),
    priority: z.enum(FLOW_PRIORITY).nullable().optional(),
    /** 카드 (질문 점만, 10/23): 사전 연구 · 용어 · 도구 · 담당 · 돌려받을 명제 수. null은 카드를 뺀다 */
    card: FlowCardIn.nullable().optional(),
  }).strict(),
  /** 해결 문턱 검사 (10/20): 점이 끝남으로 넘어갈 때 필수 칸을 본다. MCP와 새 고치기 칸이 켠다 */
  gate: z.boolean().optional(),
}).strict()

/** 사람 승인 (거두기는 revoked). 에이전트 검토는 에이전트가 파일에 적는다 */
export const FlowCheckBody = z.object({ baseHash: z.string(), ev: z.number().int().min(0).optional(), step: z.number().int().min(0).optional(), revoked: z.boolean().optional(), note: z.string().max(500).optional() }).strict()
  .refine((b) => (b.ev === undefined) !== (b.step === undefined), { message: 'ev와 step 가운데 하나만' })
/** 사람 판단 (10/23): 발견은 approve · send-back · reject, 카드가 있는 질문은 start · send-back · end. 사람만 (앱 화면) */
export const FlowJudgeBody = z.object({ baseHash: z.string(), verdict: z.enum(FLOW_VERDICTS), note: z.string().max(2000).optional() }).strict()
/** 에이전트 검토 (MCP flow_review): role agent로 덧붙인다 */
export const FlowReviewBody = z.object({ baseHash: z.string(), by: z.string().min(1).max(40), ev: z.number().int().min(0).optional(), step: z.number().int().min(0).optional(), revoked: z.boolean().optional(), note: z.string().max(500).optional() }).strict()
  .refine((b) => (b.ev === undefined) !== (b.step === undefined), { message: 'ev와 step 가운데 하나만' })

export const FlowLayoutBody = z.object({ id: z.string().min(1), at: Cell.nullable() }).strict()
/** 줄 옮기기 (10/20): from 줄을 to 자리로. cells = 화면이 계산한 지금 자리 전부 (옮긴 뒤 자리로 고쳐 손으로 놓은 자리로 적는다) */
export const FlowRowMove = z.object({ from: z.number().int(), to: z.number().int(), cells: FlowLayout }).strict()

export type FlowKind = (typeof FLOW_KINDS)[number]
export type FlowProgress = (typeof FLOW_PROGRESS)[number]
export type FlowResult = (typeof FLOW_RESULTS)[number]
export type FlowEdge = (typeof FLOW_EDGES)[number]
export type FlowNode = z.infer<typeof FlowNode>
export type FlowEvidence = z.infer<typeof FlowEvidence>
export type FlowScan = z.infer<typeof FlowScan>
export type FlowLayout = z.infer<typeof FlowLayout>
export type FlowRows = z.infer<typeof FlowRows>
export type FlowRowsReply = z.infer<typeof FlowRowsReply>
export type FlowOne = z.infer<typeof FlowOne>
export type FlowDeleted = z.infer<typeof FlowDeleted>
export type FlowLayoutReply = z.infer<typeof FlowLayoutReply>
export type NewFlowBody = z.infer<typeof NewFlowBody>
export type FlowPatchBody = z.infer<typeof FlowPatchBody>
export type FlowStartBody = z.infer<typeof FlowStartBody>
export type FlowStartReply = z.infer<typeof FlowStartReply>
export type FlowCheckBody = z.infer<typeof FlowCheckBody>
export type FlowReviewBody = z.infer<typeof FlowReviewBody>
export type FlowJudgeBody = z.infer<typeof FlowJudgeBody>
export type FlowJudgment = z.infer<typeof FlowJudgment>
export type FlowCard = z.infer<typeof FlowCard>
export type FlowVerdict = (typeof FLOW_VERDICTS)[number]
export type FlowSearchReply = z.infer<typeof FlowSearchReply>
export type FlowNoteSections = z.infer<typeof FlowNoteSections>
export type FlowStep = z.infer<typeof FlowStep>
export type FlowGap = z.infer<typeof FlowGap>
export type FlowStart = z.infer<typeof FlowStart>
export type FlowIntegration = z.infer<typeof FlowIntegration>
export type FlowLayoutBody = z.infer<typeof FlowLayoutBody>
export type FlowRowMove = z.infer<typeof FlowRowMove>
