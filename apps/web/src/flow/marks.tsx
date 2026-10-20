import type { ReactNode } from 'react'
import type { FlowEvidence, FlowKind, FlowNode, FlowProgress, FlowResult } from '../api'
import { t as tr } from '../i18n'
import type { BlockStatus } from '@rw/core'

export type Mark = FlowKind | 'theorem' | 'guess'
export const KIND: Record<Mark, { act: boolean; name: () => string; def: () => string }> = {
  question: { act: false, name: () => tr('질문', 'Question'), def: () => tr('답을 구할 대상으로 세운 물음. 예상 답이 있으면 기호가 전구 속 ?로 바뀐다.', 'A question set out to be answered. With an expected answer the mark becomes a bulb with ?.') },
  guess: { act: false, name: () => tr('질문 (예상 답 있음)', 'Question (expected answer)'), def: () => tr('예상 답(가설)을 함께 적은 질문.', 'A question written with an expected answer (a hypothesis).') },
  finding: { act: false, name: () => tr('발견', 'Finding'), def: () => tr('계산이나 문헌에서 확인된 사실. 특정 모형·조건에서 성립이 확인되었으나 일반성은 확립되지 않았다.', 'A fact confirmed by a calculation or the literature, for given models or conditions; generality not established.') },
  theorem: { act: false, name: () => tr('정리', 'Theorem'), def: () => tr('증명으로 확립된 발견. 따로 고르지 않는다: 발견의 근거에 사람이 승인한 증명이 있으면 정리로 보인다.', 'A finding established by proof. Not chosen directly: a finding shows as a theorem when its evidence has a human-approved proof.') },
  calc: { act: true, name: () => tr('수치 계산', 'Numerical calculation'), def: () => tr('컴퓨터로 수치를 구하는 계산. 모형·크기·매개변수와 코드가 있고, 결과가 수치·그림이다.', 'A computation of numbers: model, size, parameters and code, with numbers or figures as the result.') },
  analytic: { act: true, name: () => tr('이론 계산', 'Analytic calculation'), def: () => tr('식으로 값이나 표현을 구하는 계산. 주장의 참을 보이는 것은 증명이다.', 'Deriving a value or expression by hand. Showing a claim true is a proof.') },
  proof: { act: true, name: () => tr('증명', 'Proof'), def: () => tr('증명 또는 유도. 가정에서 결론으로 가는 단계가 있다. 실패한 시도도 포함한다.', 'A proof or derivation, with steps from assumptions to conclusion. Failed attempts count too.') },
  literature: { act: true, name: () => tr('문헌', 'Literature'), def: () => tr('선행 연구의 검토. 검토 자체가 다음 걸음을 낳았을 때만 점이고, 근거로 쓴 논문은 받는 점 이름 뒤의 §로 보인다.', 'Reviewing prior work. A dot only when the review led to the next step; papers used as evidence show as § after the dot\'s name.') },
}
export const FIELD: Record<string, () => string> = {
  question: () => tr('물음', 'Question'), guess: () => tr('예상 답', 'Expected answer'), motivation: () => tr('동기', 'Motivation'),
  statement: () => tr('진술', 'Statement'), condition: () => tr('조건', 'Conditions'),
  goal: () => tr('목적', 'Goal'), setup: () => tr('설정', 'Setup'), method: () => tr('방법', 'Method'), result: () => tr('결과', 'Result'),
  reading: () => tr('문헌', 'Reading'), gain: () => tr('얻은 것', 'What it gave'),
  criterion: () => tr('판정 기준', 'Criterion'), assumptions: () => tr('가정', 'Assumptions'), interpretation: () => tr('해석', 'Interpretation'), use: () => tr('쓰는 곳', 'Where it is used'),
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

/** 점 기호: 진술은 원, 행위는 둥근 네모. 속이 빈 것은 미해결(점선)과 폐기 */
export function MarkSvg({ m, x, y, state, big }: { m: Mark; x: number; y: number; state: string; big?: boolean }) {
  const r = big ? 14 : 13
  const body = KIND[m].act
    ? <rect className="fl-b" x={x - r + 1} y={y - r + 1} width={2 * r - 2} height={2 * r - 2} rx={5} />
    : <circle className="fl-b" cx={x} cy={y} r={r} />
  let g: ReactNode
  if (m === 'finding') g = <>
    <path className="fl-gs" d={`M${x - 9.5} ${y}Q${x} ${y - 9.5} ${x + 9.5} ${y}Q${x} ${y + 9.5} ${x - 9.5} ${y}Z`} />
    <circle className="fl-g" cx={x} cy={y} r={4.3} />
  </>
  else if (m === 'guess') g = <>
    <path className="fl-gs" d={`M${x - 3} ${y + 5.2}h6M${x - 2.2} ${y + 7.6}h4.4M${x - 3.2} ${y + 3}c-4.6-2.6-4.6-12 3.2-12s7.8 9.4 3.2 12z`} />
    <text className="fl-g" x={x} y={y + 1.6} fontSize={8.5} fontWeight={800} textAnchor="middle">?</text>
  </>
  else {
    const ch = { question: '?', theorem: 'T', calc: 'π', analytic: '∫', proof: '∴', literature: '§' }[m]
    const serif = m === 'theorem' || m === 'calc'
    const fs = { '∴': 20, '∫': 14, T: 17, 'π': 18 }[ch] ?? 15
    const dy = { '∴': 6.5, '∫': 5, T: 6 }[ch] ?? 5.5
    g = <text className={`fl-g${serif ? ' serif' : ''}${m === 'calc' ? ' italic' : ''}`} x={x} y={y + dy} fontSize={fs} fontWeight={serif ? 700 : 800} textAnchor="middle">{ch}</text>
  }
  return <g className={`fl-m s-${state}`}>{body}{g}</g>
}
export const MarkIcon = ({ n, size = 20 }: { n: FlowNode; size?: number }) =>
  <svg className="fl-icon" width={size} height={size} viewBox="0 0 30 30" aria-hidden><MarkSvg m={markOf(n)} x={15} y={15} state={stateOf(n)} /></svg>

export const PROGRESS: Record<FlowProgress, () => string> = { open: () => tr('미해결', 'Open'), active: () => tr('진행', 'In progress'), paused: () => tr('멈춤', 'Paused'), done: () => tr('끝남', 'Done') }
export const resultName = (r: FlowResult, act: boolean) => r === 'solved' ? (act ? tr('성공', 'Succeeded') : tr('해결', 'Solved')) : r === 'refuted' ? (act ? tr('실패', 'Failed') : tr('반증', 'Refuted')) : tr('폐기', 'Dropped')
