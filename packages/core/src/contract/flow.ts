/**
 * 연구 흐름 API의 계약 (workbench/flow/*.yaml, 서버 routes/flow.ts · 화면 api/flow.ts).
 * 점 하나 = 생각의 한 걸음. 파일 형식은 docs/repo-format.md §14, 여기는 앱 서버와 화면 사이의 모양이다.
 */
import { z } from 'zod'

import { FLOW_EDGES, FLOW_EVIDENCE, FLOW_KINDS, FLOW_PROGRESS, FLOW_RESULTS } from '../flow-kinds.js'
export { FLOW_EDGES, FLOW_EVIDENCE, FLOW_FIELDS, FLOW_KINDS, FLOW_PROGRESS, FLOW_RESULTS } from '../flow-kinds.js'

const FlowFrom = z.object({ id: z.string(), type: z.enum(FLOW_EDGES) }).strict()
const FlowCheck = z.object({
  at: z.string(),
  by: z.string(),
  /** agent = 에이전트 검토, human = 사람 승인 */
  role: z.enum(['agent', 'human']),
  note: z.string().optional(),
  /** 앞선 같은 역할의 확인을 거둔다 (기록은 덧붙이기만 하므로 지우지 않고 거둔 기록을 더한다) */
  revoked: z.boolean().optional(),
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
  checks: z.array(FlowCheck),
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
  date: z.string().optional(),
  from: z.array(FlowFrom),
  fields: z.record(z.string(), z.string()),
  /** 갈래 종결 */
  end: z.boolean().optional(),
  evidence: z.array(FlowEvidence),
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
/** 보이는 줄 (layout.yaml rows, 10/16): 중심선 기준 맨 위·맨 아래 줄. 사람이 ＋ 줄 · ×로 정한다. 없으면 앱의 기본 줄 수 */
export const FlowRows = z.object({ top: z.number().int().max(0), bottom: z.number().int().min(0) }).strict()

export const FlowScan = z.object({ nodes: z.array(FlowNode), diagnostics: z.array(Diagnostic), layout: FlowLayout, rows: FlowRows.nullable() }).strict()
export const FlowOne = z.object({ node: FlowNode }).strict()
export const FlowDeleted = z.object({ id: z.string(), changed: z.array(z.string()) }).strict()
export const FlowLayoutReply = z.object({ layout: FlowLayout }).strict()
export const FlowRowsReply = z.object({ rows: FlowRows }).strict()

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
}).strict().refine((e) => !!e.file !== !!e.ref, { message: 'file과 ref 가운데 하나만' })

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
  }).strict(),
}).strict()

/** 사람 승인 (거두기는 revoked). 에이전트 검토는 에이전트가 파일에 적는다 */
export const FlowCheckBody = z.object({ baseHash: z.string(), ev: z.number().int().min(0), revoked: z.boolean().optional(), note: z.string().max(500).optional() }).strict()

export const FlowLayoutBody = z.object({ id: z.string().min(1), at: Cell.nullable() }).strict()

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
export type FlowLayoutBody = z.infer<typeof FlowLayoutBody>
