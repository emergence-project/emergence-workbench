/**
 * 흐름과 시도 나무의 이름표 (11/11 결정 "흐름을 시도 나무로 · 메시지 관문", workbench/problems/<id>/). 화면이 zod 없이 쓰게 계약 밖에 둔다.
 * 흐름: proposed 제안(에이전트가 올림) · draft 쓰는 중 · open 진행(사용자가 시작함) · closed 접음.
 * 시도: candidate 후보 · active 진행 · reported 판정 대기(작업한 쪽의 보고만 있음) · holds 성립 · dropped 폐기.
 */
export const PROBLEM_STATES = ['proposed', 'draft', 'open', 'closed'] as const
export const ATTEMPT_STATES = ['candidate', 'active', 'reported', 'holds', 'dropped'] as const
/** 판정의 결과 (작업한 쪽이 아닌 쪽이 붙인다) */
export const ATTEMPT_VERDICTS = ['holds', 'dropped'] as const
/** 검사 명령을 다시 돌린 결과 (판정하는 쪽이 적는다) */
export const TEST_RESULTS = ['pass', 'fail'] as const
/**
 * 새 시도를 시작하지 못하는 까닭: decision 방향 보고가 사용자의 결정을 기다림 · limit 한도에 닿음 ·
 * stuck 폐기가 이어짐 · exhausted 후보도 진행 중인 시도도 없음. 뒤 셋은 방향 보고를 내야 풀린다
 */
export const PROBLEM_STOPS = ['decision', 'limit', 'stuck', 'exhausted'] as const
/** 방향 보고를 낸 까닭: 멈춘 까닭 셋, 또는 asked(멈춤 없이 스스로 냄) */
export const REPORT_WHYS = ['limit', 'stuck', 'exhausted', 'asked'] as const
/** 방향 보고에 대한 사용자의 결정: 계속 · 좁히기 · 접기 */
export const DIRECTION_VERDICTS = ['continue', 'narrow', 'close'] as const
/** 주장이 질문의 어느 쪽을 받치나 (보고할 때 작업한 쪽이 적는다): 예의 문장 · 아니오의 문장 · 어느 쪽도 아님. 방향 보고의 칸 이름과 같다 */
export const CLAIM_SIDES = ['for_yes', 'for_no', 'neither'] as const
/** 사용자가 흐름을 닫으며 정하는 답 */
export const FLOW_ANSWERS = ['yes', 'no'] as const
/** 닫을 때 답이 기대는 주장마다 사용자가 고르는 것: 승인 · 수정(돌려보냄) · 기각(폐기) */
export const BASIS_REVIEWS = ['approve', 'return', 'reject'] as const
/**
 * 예외 기록의 종류 (11/11 "해 보면서 판단": 2주 뒤 평가에 쓴다). refused 앱이 규칙으로 거절함(앱이 적는다) · warned 앱이 경고만 함(앱이 적는다, 11/20 커밋 꼬리말) ·
 * no-claim 판단할 수 있는 한 문장으로 적지 못함 · no-verdict 판정하지 못함 · needs-user 사용자 차례가 아닌데 결정이 필요함 · workaround 규칙을 돌아서 함 · other
 */
export const EXCEPTION_KINDS = ['refused', 'warned', 'no-claim', 'no-verdict', 'needs-user', 'workaround', 'other'] as const
/** 시작한 시도 수의 기본 한도와, 사용자가 "계속"할 때 더하는 기본 수 */
export const PROBLEM_LIMIT = 6
export const PROBLEM_LIMIT_STEP = 3
/** 폐기가 이만큼 이어지면 멈추고 방향 보고를 낸다 */
export const PROBLEM_STREAK = 3
/** 이어받기 한 장의 상한 (바이트) */
export const BRIEF_MAX = 3072

/**
 * 근거의 세기 (11/20 결정 "흐름 근거 공통 기준", 프로젝트와 상관없이 같다).
 * rerun 다시 돌림: 명령을 돌려 같은 결과가 나온다(실행 명령 · 검사 명령) · reread 다시 읽음: 글을 따라가면 같은 결론이 나온다(노트 절 · 증명 · bib 키) ·
 * pointer 가리킴만: 무엇이 있었는지만 알려 준다(PR 번호 · 커밋 · 작업 파일 · 일지). 가리킴만으로는 성립을 주지 않고 출처로만 보인다
 */
export const EVIDENCE_STRENGTHS = ['rerun', 'reread', 'pointer'] as const
export type EvidenceStrength = (typeof EVIDENCE_STRENGTHS)[number]
const POINTER = [
  /^(pr|commit|issue):/i,
  /^#\d+$/,
  /^[0-9a-f]{7,40}$/i,
  /^https?:\/\/github\.com\/[^/]+\/[^/]+\/(pull|commit|issues)\//i,
  /^(workbench\/)?(tasks|log)\//,
]
/** 근거 한 줄(시도의 파일 칸)의 세기: 가리킴만이거나 다시 읽음 */
export const fileStrength = (f: string): 'reread' | 'pointer' => (POINTER.some((r) => r.test(f.trim())) ? 'pointer' : 'reread')
/** 시도 하나가 가진 가장 센 근거. 근거가 하나도 없으면 undefined */
export function attemptStrength(a: { files: string[]; run?: { command?: string }; test?: string }): EvidenceStrength | undefined {
  if (a.run?.command || a.test) return 'rerun'
  if (!a.files.length) return undefined
  return a.files.some((f) => fileStrength(f) === 'reread') ? 'reread' : 'pointer'
}
/** 근거가 있는 경로(PR 번호 · 커밋이 아닌 저장소 안 경로)만: 절 표시(#…)를 뗀다 */
export const evidencePaths = (files: string[]): string[] => [...new Set(files.filter((f) => !/^(pr|commit|issue|bib):|^#|^https?:/i.test(f) && !/^[0-9a-f]{7,40}$/i.test(f)).map((f) => f.split('#')[0]!.trim()).filter(Boolean))]
/** 커밋 꼬리말: 이 커밋이 어느 시도의 근거인가 (`Attempt: <흐름>/<글자>`) */
export const attemptTrailer = (flow: string, label: string): string => `Attempt: ${flow}/${label.toLowerCase()}`
export const hasAttemptTrailer = (message: string, flow: string, label: string): boolean =>
  new RegExp(`^Attempt:\\s*${flow.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/${label.toLowerCase()}\\s*$`, 'im').test(message)
