import type { ReactNode } from 'react'
import type { FlowEvidence, FlowKind, FlowNode, FlowProgress, FlowResult } from '../api'
import { t as tr } from '../i18n'
import type { BlockStatus } from '@rw/core'

export type Mark = FlowKind | 'theorem' | 'guess'
export const KIND: Record<Mark, { act: boolean; name: () => string; def: () => string }> = {
  question: { act: false, name: () => tr('질문', 'Question'), def: () => tr('일을 여는 점(◇). 답을 구할 대상으로 세운 물음.', 'A dot that opens work (◇). A question set out to be answered.') },
  guess: { act: false, name: () => tr('질문 (예상 답 있음)', 'Question (expected answer)'), def: () => tr('예상 답(가설)을 함께 적은 질문.', 'A question written with an expected answer (a hypothesis).') },
  finding: { act: false, name: () => tr('명제', 'Proposition'), def: () => tr('일을 맺는 닫는 점(□). 작업에서 나온 주장 하나. 특정 모형·조건에서 확인되었으나 일반성은 확립되지 않았다. 사람이 판단한다: 판단 전은 주황, 승인은 청록, 기각은 회색 고리.', 'A dot that closes work (□). One claim that came out of the work, confirmed for given models or conditions; generality not established. A person judges it: orange before judgment, teal when approved, a gray ring when rejected.') },
  theorem: { act: false, name: () => tr('정리', 'Theorem'), def: () => tr('증명으로 확립된 명제. 따로 고르지 않는다: 명제의 근거에 사람이 승인한 증명이 있으면 정리로 보인다.', 'A proposition established by proof. Not chosen directly: a proposition shows as a theorem when its evidence has a human-approved proof.') },
  calc: { act: true, name: () => tr('수치 계산', 'Numerical calculation'), def: () => tr('작업 점(○). 컴퓨터로 수치를 구하는 계산. 모형·크기·매개변수와 코드가 있고, 결과가 수치·그림이다.', 'A work dot (○). A computation of numbers: model, size, parameters and code, with numbers or figures as the result.') },
  analytic: { act: true, name: () => tr('이론 계산', 'Analytic calculation'), def: () => tr('식으로 값이나 표현을 구하는 계산. 주장의 참을 보이는 것은 증명이다.', 'Deriving a value or expression by hand. Showing a claim true is a proof.') },
  proof: { act: true, name: () => tr('증명', 'Proof'), def: () => tr('증명 또는 유도. 가정에서 결론으로 가는 단계가 있다. 실패한 시도도 포함한다.', 'A proof or derivation, with steps from assumptions to conclusion. Failed attempts count too.') },
  literature: { act: true, name: () => tr('문헌', 'Literature'), def: () => tr('작업 점(○). 선행 연구의 검토. 검토 자체가 다음 걸음을 낳았을 때만 점이고, 근거로 쓴 논문은 받는 점의 근거 표에 있다.', 'A work dot (○). Reviewing prior work. A dot only when the review led to the next step; papers used as evidence are in the receiving dot\'s evidence table.') },
}
export const FIELD: Record<string, () => string> = {
  question: () => tr('물음', 'Question'), guess: () => tr('예상 답', 'Expected answer'), motivation: () => tr('동기', 'Motivation'),
  statement: () => tr('진술', 'Statement'), condition: () => tr('조건', 'Conditions'),
  goal: () => tr('목적', 'Goal'), setup: () => tr('설정', 'Setup'), method: () => tr('방법', 'Method'), result: () => tr('결과', 'Result'),
  reading: () => tr('문헌', 'Reading'), gain: () => tr('얻은 것', 'What it gave'),
  criterion: () => tr('판정 기준', 'Criterion'), assumptions: () => tr('가정', 'Assumptions'), interpretation: () => tr('해석', 'Interpretation'), use: () => tr('사용처', 'Where it is used'),
}
/** 빈 칸에 회색으로 보이는 "무엇을 적을지" (10/20 안 A) */
export const FIELD_HINT: Record<string, () => string> = {
  question: () => tr('답을 구할 물음 한 문장', 'The question, in one sentence'), motivation: () => tr('왜 묻는가, 어디서 나왔나', 'Why ask it, where it came from'),
  guess: () => tr('예상하는 답 (있으면)', 'The answer you expect, if any'), criterion: () => tr('무엇이 나오면 해결 · 반증인가', 'What result solves or refutes it'),
  statement: () => tr('확인된 사실 한 문장', 'The confirmed fact, in one sentence'), condition: () => tr('성립하는 모형 · 조건', 'Models and conditions where it holds'),
  goal: () => tr('무엇을 구하나', 'What it computes or shows'), setup: () => tr('모형 · 크기 · 경계 조건', 'Model, size, boundary conditions'),
  assumptions: () => tr('쓰는 가정 · 공리', 'Assumptions and axioms used'), method: () => tr('어떻게 보이나', 'How it is shown'),
  result: () => tr('판정 기준에 비춘 값 · 결론', 'The value or conclusion, against the criterion'), interpretation: () => tr('결과가 뜻하는 것', 'What the result means'),
  reading: () => tr('읽은 논문 · 절', 'Paper and section read'), gain: () => tr('얻은 것', 'What it gave'), use: () => tr('어디에 쓰나', 'Where it is used'),
}
/** 카드의 칸 이름 (10/23 시안 v22): 질문 점의 칸 이름과 다른 것만 */
export const CARD_FIELD: Record<string, () => string> = {
  criterion: () => tr('완료 조건 · 예', 'Done when · yes'), criterion_no: () => tr('완료 조건 · 아니오', 'Done when · no'), criterion_unclear: () => tr('완료 조건 · 불분명', 'Done when · unclear'),
  stop: () => tr('중단 조건', 'Stop when'), value: () => tr('가치', 'Value'), out_of_scope: () => tr('제외 범위', 'Out of scope'), budget: () => tr('자원', 'Resources'), deliverable: () => tr('보고서', 'Report'),
}
/** 카드의 묶음 (시안 v22): 문제 | 발단 · 가치 | 사전 연구 · 도구 | 완료 · 중단 | 범위 · 자원 | 돌려받을 것 */
export const CARD_GROUPS: { h: () => string; fields: string[] }[] = [
  { h: () => tr('문제', 'Problem'), fields: ['question', 'guess'] },
  { h: () => tr('의의', 'Why'), fields: ['motivation', 'value'] },
  { h: () => tr('종료 조건', 'When it ends'), fields: ['criterion', 'criterion_no', 'criterion_unclear', 'stop'] },
  { h: () => tr('범위와 자원', 'Scope and resources'), fields: ['out_of_scope', 'budget'] },
  { h: () => tr('산출물', 'What comes back'), fields: ['deliverable'] },
]
/** 카드 칸의 빈 칸 안내 (시안 v22) */
export const CARD_HINT: Record<string, () => string> = {
  criterion: () => tr('무엇이 나오면 예인가 (계산 전에 고정)', 'What result means yes (fixed before computing)'), criterion_no: () => tr('무엇이 나오면 아니오인가', 'What result means no'),
  criterion_unclear: () => tr('그 밖. 불분명도 끝난 것으로 보고하고 더 돌리지 않음', 'Anything else. Unclear is reported as finished, not run further'),
  stop: () => tr('기준을 바꾸고 싶어질 때 · 자원의 절반을 넘을 때 …', 'When the criterion needs changing, or half the resources are used …'),
  value: () => tr('예이면 무엇을 하고, 아니오이면 무엇을 하나', 'What happens next if yes, and if no'), out_of_scope: () => tr('이번에 하지 않는 것', 'What this card does not do'),
  budget: () => tr('시간 · 기계 · 멈출 한도', 'Time, machine, and the limit to stop at'), deliverable: () => tr('보고서가 놓일 노트 절과 그 모양 (첫 줄 · 표 · 그림)', 'Where the report goes and its shape (first line, table, figure)'),
}
/** 끝맺음 묶음의 칸 (나머지 칸은 계획 묶음) */
export const END_FIELDS = ['result', 'interpretation', 'gain', 'use']
export const PRIORITY: Record<'high' | 'normal' | 'low', () => string> = { high: () => tr('먼저', 'First'), normal: () => tr('보통', 'Normal'), low: () => tr('나중', 'Later') }
export const EDGE: Record<string, () => string> = { origin: () => tr('발단', 'Origin'), support: () => tr('근거', 'Support'), refute: () => tr('반박', 'Refutes'), use: () => tr('사용', 'Uses') }
export const EVK: Record<FlowEvidence['kind'], () => string> = { calc: () => tr('수치 계산', 'Numerics'), analytic: () => tr('이론 계산', 'Analytic'), proof: () => tr('증명', 'Proof'), other: () => tr('그 밖', 'Other'), paper: () => tr('논문', 'Paper') }

export const markOf = (n: FlowNode): Mark => n.theorem ? 'theorem' : n.kind === 'question' && n.fields.guess ? 'guess' : n.kind
/** 그림의 상태 이름 (색 class) */
export const stateOf = (n: FlowNode): 'open' | 'active' | 'paused' | 'solved' | 'refuted' | 'dropped' => n.progress !== 'done' ? n.progress : n.result ?? 'solved'
export function stateName(n: FlowNode): string {
  const act = KIND[n.kind].act
  switch (stateOf(n)) {
    case 'open': return tr('미해결', 'Open')
    case 'active': return tr('진행', 'In progress')
    case 'paused': return tr('멈춤', 'Paused')
    case 'solved': return act ? tr('끝남 · 성공', 'Done · succeeded') : tr('끝남 · 해결', 'Done · solved')
    case 'refuted': return act ? tr('끝남 · 실패', 'Done · failed') : tr('끝남 · 반증', 'Done · refuted')
    case 'dropped': return tr('끝남 · 폐기', 'Done · dropped')
  }
}
export const DOT: Record<ReturnType<typeof stateOf>, BlockStatus> = { open: 'in-progress', active: 'in-progress', paused: 'blocked', solved: 'solved', refuted: 'stopped', dropped: 'stopped' }

/** 명제의 판단 (10/23 "판단 설계"): 승인됨이면 채우고, 판단 전 · 수정 요청 · 기각은 속을 비운다. 명제가 아니면 undefined */
export const judgedOf = (n: FlowNode): boolean | undefined => n.kind === 'finding' ? n.verdict === 'approve' : undefined
/** 판단 이름: 명제는 판단, 카드(맡긴 질문)는 카드 상태. 둘 다 아니면 undefined */
export function judgeName(n: FlowNode): string | undefined {
  if (n.kind === 'finding') return n.verdict === 'approve' ? tr('승인됨', 'Approved') : n.verdict === 'send-back' ? tr('수정 요청', 'Sent back') : n.verdict === 'reject' ? tr('기각', 'Rejected') : tr('판단 전', 'Not judged')
  switch (n.cardState) {
    case 'waiting': return tr('카드 · 사전 연구 판단 대기', 'Card · prior work awaiting judgment')
    case 'ready': return tr('카드 · 시작 전', 'Card · not started')
    case 'active': return tr('카드 · 진행', 'Card · started')
    case 'ended': return tr('카드 · 종료', 'Card · ended')
  }
  return undefined
}
/** 사용자 차례 (주황 고리): 판단 대기열의 명제와 시작을 기다리는 카드 */
export const turnOf = (n: FlowNode): boolean => !!n.queued || n.cardState === 'ready'
/** 점 기호의 주황 채움 (10/26 "흐름 점 표식"): 내 차례인 점과, 아직 승인 · 기각되지 않은 명제 모두 */
export const markTurn = (n: FlowNode): boolean => turnOf(n) || (n.kind === 'finding' && n.verdict !== 'approve' && n.verdict !== 'reject')
/** 점 기호의 상태: 기각된 명제는 폐기처럼 회색 고리 (10/26) */
export const markState = (n: FlowNode): ReturnType<typeof stateOf> => n.kind === 'finding' && n.verdict === 'reject' ? 'dropped' : stateOf(n)

/** 점의 역할 (10/26 "흐름 점 표식"): 여는 점(질문) ◇ · 작업 ○ · 닫는 점(명제 · 정리) □ */
export const roleOf = (m: Mark): 'open' | 'work' | 'close' => KIND[m].act ? 'work' : m === 'question' || m === 'guess' ? 'open' : 'close'

/**
 * 점 기호 (10/26 "흐름 점 표식"): 모양 = 역할, 기호 = 그 안의 종류, 색 = 상태(디자인 문서의 넷).
 * 속이 빈 것은 시작 전(점선) · 폐기 · 판단 전 명제. 판단할 차례(turn)인 명제는 주황으로 채운다.
 */
export function MarkSvg({ m, x, y, state, big, judged, turn }: { m: Mark; x: number; y: number; state: string; big?: boolean; judged?: boolean; turn?: boolean }) {
  const r = big ? 14 : 13
  const role = roleOf(m)
  const body = role === 'work' ? <circle className="fl-b" cx={x} cy={y} r={r - 0.5} />
    : role === 'close' ? <rect className="fl-b" x={x - r + 2} y={y - r + 2} width={2 * r - 4} height={2 * r - 4} rx={3} />
    : <rect className="fl-b" x={x - r * 0.7} y={y - r * 0.7} width={r * 1.4} height={r * 1.4} rx={3} transform={`rotate(45 ${x} ${y})`} />
  const ch = { question: '?', guess: '?', finding: '', theorem: 'T', calc: 'π', analytic: '∫', proof: '∴', literature: '§' }[m]
  const serif = m === 'theorem' || m === 'calc'
  const fs = { '∴': 19, '∫': 14, T: 15, 'π': 17, '?': 13 }[ch] ?? 14
  const dy = { '∴': 6.5, '∫': 5, T: 5.5, '?': 4.5 }[ch] ?? 5
  const g = ch && <text className={`fl-g${serif ? ' serif' : ''}${m === 'calc' ? ' italic' : ''}`} x={x} y={y + dy} fontSize={fs} fontWeight={serif ? 700 : 800} textAnchor="middle">{ch}</text>
  return <g className={`fl-m s-${state}${turn ? ' turn' : judged === false ? ' unjudged' : ''}`}>{body}{g}</g>
}
export const MarkIcon = ({ n, size = 20 }: { n: FlowNode; size?: number }) =>
  <svg className="fl-icon" width={size} height={size} viewBox="0 0 30 30" aria-hidden><MarkSvg m={markOf(n)} x={15} y={15} state={markState(n)} judged={judgedOf(n)} turn={markTurn(n)} /></svg>

export const PROGRESS: Record<FlowProgress, () => string> = { open: () => tr('미해결', 'Open'), active: () => tr('진행', 'In progress'), paused: () => tr('멈춤', 'Paused'), done: () => tr('끝남', 'Done') }
export const resultName = (r: FlowResult, act: boolean) => r === 'solved' ? (act ? tr('성공', 'Succeeded') : tr('해결', 'Solved')) : r === 'refuted' ? (act ? tr('실패', 'Failed') : tr('반증', 'Refuted')) : tr('폐기', 'Dropped')
