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
/**
 * 카드 (10/23 "판단 설계"): 질문 점을 맡길 때 더 적는 설명 칸. 화면 이름: 가치 · 제외 범위 · 자원 · 중단 조건 · 보고서 · 완료 조건(아니오 · 불분명).
 * 완료 조건의 "예"는 질문의 criterion이다. 사전 연구 · 용어 · 도구 · 담당은 칸 글이 아니라 card에 적는다 (docs/repo-format.md §14 "카드")
 */
export const CARD_FIELDS = ['value', 'out_of_scope', 'budget', 'stop', 'deliverable', 'criterion_no', 'criterion_unclear'] as const
/** 카드를 판단한 뒤 바뀌면 그 판단이 낡는 칸 (문제 · 완료). 바꾸면 새 판본이라 다시 판단한다 */
export const CARD_LOCKED = ['question', 'criterion', 'criterion_no', 'criterion_unclear'] as const
/** 사람 판단의 말 (10/23 "판단 버튼 말"): 명제(발견)는 승인 · 수정 · 기각, 카드(질문)는 시작 · 수정 · 종료 */
export const FINDING_VERDICTS = ['approve', 'send-back', 'reject'] as const
export const CARD_VERDICTS = ['start', 'send-back', 'end'] as const
export const FLOW_VERDICTS = ['approve', 'send-back', 'reject', 'start', 'end'] as const
/** 판단 대기열의 상한 (10/23): 판단 전 명제가 이만큼 차면 에이전트는 새 명제를 내지 못한다 */
export const JUDGE_CAP = 3
/** 판단 설계를 정한 날. 그 전에 생긴 판단 전 명제(옛 결과)는 카드가 사전 연구로 고를 때만 대기열에 오른다 */
export const JUDGE_SINCE = '2026-10-23'
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
