/**
 * 흐름과 시도 나무의 이름표 (11/11 결정 "흐름을 시도 나무로 · 메시지 관문", workbench/problems/<id>/). 화면이 zod 없이 쓰게 계약 밖에 둔다.
 * 흐름: proposed 제안(에이전트가 올림) · draft 쓰는 중 · open 진행(사용자가 시작함) · closed 접음.
 * 시도: candidate 후보 · active 진행 · reported 판정 대기(일한 쪽의 보고만 있음) · holds 성립 · dropped 폐기.
 */
export const PROBLEM_STATES = ['proposed', 'draft', 'open', 'closed'] as const
export const ATTEMPT_STATES = ['candidate', 'active', 'reported', 'holds', 'dropped'] as const
/** 판정의 결과 (일한 쪽이 아닌 쪽이 붙인다) */
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
/** 시작한 시도 수의 기본 한도와, 사용자가 "계속"할 때 더하는 기본 수 */
export const PROBLEM_LIMIT = 6
export const PROBLEM_LIMIT_STEP = 3
/** 폐기가 이만큼 이어지면 멈추고 방향 보고를 낸다 */
export const PROBLEM_STREAK = 3
/** 이어받기 한 장의 상한 (바이트) */
export const BRIEF_MAX = 2048
