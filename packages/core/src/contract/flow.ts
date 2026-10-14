/**
 * 연구 흐름 API의 계약 (workbench/flow/*.yaml, 서버 routes/flow.ts · 화면 api/flow.ts).
 * 점 하나 = 생각의 한 걸음. 파일 형식은 docs/repo-format.md §14, 여기는 앱 서버와 화면 사이의 모양이다.
 */
import { z } from 'zod'

/** 진술: 질문 · 발견 (정리는 따로 고르지 않는다: 사람이 승인한 증명이 근거에 있는 발견). 행위: 수치 계산 · 이론 계산 · 증명 · 문헌 */
export const FLOW_KINDS = ['question', 'finding', 'calc', 'analytic', 'proof', 'literature'] as const
export const FLOW_PROGRESS = ['open', 'active', 'paused', 'done'] as const
export const FLOW_RESULTS = ['solved', 'refuted', 'dropped'] as const
/** 선 종류: 발단 · 근거 · 반박 · 사용 */
export const FLOW_EDGES = ['origin', 'support', 'refute', 'use'] as const
/** 근거 종류: 노트(수치 계산 · 이론 계산 · 증명 · 그 밖) 또는 논문 */
export const FLOW_EVIDENCE = ['calc', 'analytic', 'proof', 'other', 'paper'] as const
/** 종류마다 설명 칸 (이 순서로 보인다) */
export const FLOW_FIELDS: Record<(typeof FLOW_KINDS)[number], readonly string[]> = {
  question: ['question', 'guess', 'motivation'],
  finding: ['statement', 'condition'],
  calc: ['goal', 'setup', 'result'],
  analytic: ['goal', 'setup', 'result'],
  proof: ['goal', 'method', 'result'],
  literature: ['reading', 'gain'],
}

const FlowFrom = z.object({ id: z.string(), type: z.enum(FLOW_EDGES) }).strict()
const FlowCheck = z.object({
  at: z.string(),
  by: z.string(),
  /** agent = 에이전트 검토, human = 사람 승인 */
  role: z.enum(['agent', 'human']),
  note: z.string().optional(),
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

export const FlowScan = z.object({ nodes: z.array(FlowNode), diagnostics: z.array(Diagnostic) }).strict()

export type FlowKind = (typeof FLOW_KINDS)[number]
export type FlowProgress = (typeof FLOW_PROGRESS)[number]
export type FlowResult = (typeof FLOW_RESULTS)[number]
export type FlowEdge = (typeof FLOW_EDGES)[number]
export type FlowNode = z.infer<typeof FlowNode>
export type FlowEvidence = z.infer<typeof FlowEvidence>
export type FlowScan = z.infer<typeof FlowScan>
