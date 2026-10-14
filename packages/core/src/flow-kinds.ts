/** 연구 흐름의 종류 이름표 (zod 없이: 화면도 값으로 가져온다). 계약은 contract/flow.ts */
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
