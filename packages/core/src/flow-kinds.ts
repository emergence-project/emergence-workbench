/** 연구 흐름의 종류 이름표 (zod 없이: 화면도 값으로 가져온다). 계약은 contract/flow.ts */
/** 진술: 질문 · 발견 (정리는 따로 고르지 않는다: 사람이 승인한 증명이 근거에 있는 발견). 행위: 수치 계산 · 이론 계산 · 증명 · 문헌 */
export const FLOW_KINDS = ['question', 'finding', 'calc', 'analytic', 'proof', 'literature'] as const
export const FLOW_PROGRESS = ['open', 'active', 'paused', 'done'] as const
export const FLOW_RESULTS = ['solved', 'refuted', 'dropped'] as const
/** 선 종류: 발단 · 근거 · 반박 · 사용 */
export const FLOW_EDGES = ['origin', 'support', 'refute', 'use'] as const
/** 근거 종류: 노트(수치 계산 · 이론 계산 · 증명 · 그 밖) 또는 논문 */
export const FLOW_EVIDENCE = ['calc', 'analytic', 'proof', 'other', 'paper'] as const
/** 다음 할 일의 우선 (10/20) */
export const FLOW_PRIORITY = ['high', 'normal', 'low'] as const
/** 종류마다 설명 칸 (이 순서로 보인다). criterion 판정 기준 · assumptions 가정 · interpretation 해석 · use 쓰는 곳은 10/20에 더했다 */
export const FLOW_FIELDS: Record<(typeof FLOW_KINDS)[number], readonly string[]> = {
  question: ['question', 'motivation', 'guess', 'criterion'],
  finding: ['statement', 'condition'],
  calc: ['goal', 'criterion', 'setup', 'result', 'interpretation'],
  analytic: ['goal', 'setup', 'assumptions', 'result'],
  proof: ['goal', 'assumptions', 'method', 'result'],
  literature: ['reading', 'gain', 'use'],
}
/** "해결"로 넘어가기 전에 채워야 하는 설명 칸 (10/20 사용자 결정 "해결 문턱"). 그 밖의 조건은 서버 flowGate */
export const FLOW_REQUIRED: Record<(typeof FLOW_KINDS)[number], readonly string[]> = {
  question: ['question', 'motivation', 'criterion'],
  finding: ['statement', 'condition'],
  calc: ['goal', 'criterion', 'setup', 'result'],
  analytic: ['goal', 'setup', 'assumptions', 'result'],
  proof: ['goal', 'assumptions', 'result'],
  literature: ['reading', 'gain'],
}
/** 빈틈 (앱이 계산한다, docs/repo-format.md §14 "빈틈") */
export const FLOW_GAPS = ['no-evidence', 'unverified-base', 'no-result', 'no-reason', 'no-criterion', 'no-next', 'missing-file', 'changed-evidence', 'step-gap'] as const
