/**
 * 연구 흐름 API의 계약 (workbench/flow/*.yaml, 서버 routes/flow.ts · 화면 api/flow.ts).
 * 점 하나 = 생각의 한 걸음. 파일 형식은 docs/repo-format.md §14, 여기는 앱 서버와 화면 사이의 모양이다.
 */
import { z } from 'zod'

import { FLOW_EDGES, FLOW_EVIDENCE, FLOW_GAPS, FLOW_KINDS, FLOW_PRIORITY, FLOW_PROGRESS, FLOW_RESULTS } from '../flow-kinds.js'
export { FLOW_EDGES, FLOW_EVIDENCE, FLOW_FIELDS, FLOW_GAPS, FLOW_KINDS, FLOW_PRIORITY, FLOW_PROGRESS, FLOW_REQUIRED, FLOW_RESULTS } from '../flow-kinds.js'

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
  date: z.string().optional(),
  from: z.array(FlowFrom),
  fields: z.record(z.string(), z.string()),
  /** 갈래 종결 */
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
  /** 기록 출처 (일지·노트·커밋) */
  sources: z.array(z.string()),
  /** 에이전트가 짐작한 것 (사람이 확인하지 않음) */
  guesses: z.array(z.string()),
  /** 사람이 승인한 증명이 근거에 있는 발견 = 정리 */
  theorem: z.boolean(),
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
export const FlowSearchReply = z.object({
  rows: z.array(z.object({
    id: z.string(), kind: z.enum(FLOW_KINDS), state: z.string(), short: z.string(), title: z.string(), date: z.string().optional(),
    params: z.record(z.string(), z.string()).optional(), result: z.string().optional(), reason: z.string().optional(), score: z.number(),
  }).strict()),
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

export const NewFlowBody = z.object({
  kind: z.enum(FLOW_KINDS),
  short: Short,
  title: z.string().max(300).optional(),
  topics: z.array(z.string().min(1)).optional(),
  from: z.array(FlowFrom).optional(),
  progress: z.enum(FLOW_PROGRESS).optional(),
}).strict()

export const FlowPatchBody = z.object({
  baseHash: z.string(),
  set: z.object({
    kind: z.enum(FLOW_KINDS).optional(),
    progress: z.enum(FLOW_PROGRESS).optional(),
    result: z.enum(FLOW_RESULTS).nullable().optional(),
    short: Short.optional(),
    title: z.string().max(300).optional(),
    topics: z.array(z.string().min(1)).optional(),
    date: z.string().max(20).optional(),
    fields: z.record(z.string(), Text).optional(),
    end: z.boolean().optional(),
    from: z.array(FlowFrom).optional(),
    evidence: z.array(EvidenceIn).optional(),
    run: RunIn.nullable().optional(),
    steps: z.array(StepIn).optional(),
    reason: Text.optional(),
    next: Text.optional(),
    priority: z.enum(FLOW_PRIORITY).nullable().optional(),
  }).strict(),
  /** 해결 문턱 검사 (10/20): 점이 끝남으로 넘어갈 때 필수 칸을 본다. MCP와 새 고치기 칸이 켠다 */
  gate: z.boolean().optional(),
}).strict()

/** 사람 승인 (거두기는 revoked). 에이전트 검토는 에이전트가 파일에 적는다 */
export const FlowCheckBody = z.object({ baseHash: z.string(), ev: z.number().int().min(0).optional(), step: z.number().int().min(0).optional(), revoked: z.boolean().optional(), note: z.string().max(500).optional() }).strict()
  .refine((b) => (b.ev === undefined) !== (b.step === undefined), { message: 'ev와 step 가운데 하나만' })
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
export type FlowCheckBody = z.infer<typeof FlowCheckBody>
export type FlowReviewBody = z.infer<typeof FlowReviewBody>
export type FlowSearchReply = z.infer<typeof FlowSearchReply>
export type FlowStep = z.infer<typeof FlowStep>
export type FlowGap = z.infer<typeof FlowGap>
export type FlowLayoutBody = z.infer<typeof FlowLayoutBody>
export type FlowRowMove = z.infer<typeof FlowRowMove>
