// 흐름 점의 해결 문턱 (10/20 사용자 결정, docs/repo-format.md §14 "해결 문턱"). 서버(저장 · agent:check)와 편집 화면이 같은 검사를 쓴다
import { FLOW_REQUIRED } from './flow-kinds.js'
import { tr } from './i18n.js'
import type { FlowNode } from './contract/flow.js'

/** 설명 칸 이름 (문턱 · 빈틈 글에 쓴다) */
export const FLOW_FIELD_NAME: Record<string, () => string> = {
  question: () => tr('물음', 'question'), motivation: () => tr('동기', 'motivation'), guess: () => tr('예상 답', 'expected answer'), criterion: () => tr('판정 기준', 'criterion'),
  statement: () => tr('진술', 'statement'), condition: () => tr('조건', 'conditions'), goal: () => tr('목적', 'goal'), setup: () => tr('설정', 'setup'),
  method: () => tr('방법', 'method'), result: () => tr('결과', 'result'), interpretation: () => tr('해석', 'interpretation'), assumptions: () => tr('가정', 'assumptions'),
  reading: () => tr('문헌', 'reading'), gain: () => tr('얻은 것', 'what it gave'), use: () => tr('쓰는 곳', 'where it is used'),
}
const fieldName = (f: string) => FLOW_FIELD_NAME[f]?.() ?? f

/** 문턱이 보는 칸만 (편집 화면의 고치는 중인 값도 넣을 수 있게) */
export type FlowGateInput = Pick<FlowNode, 'kind' | 'progress' | 'result' | 'fields' | 'reason' | 'run'> & {
  evidence: { ref?: string; section?: string }[]; from: { type: string }[]; steps: { uses?: string }[]
}

/**
 * 해결 문턱: 점이 이번 저장으로 끝남(해결 · 반증 · 폐기)이나 멈춤으로 넘어갈 때 모자란 것. 비면 통과.
 * 미해결 · 진행은 빈 칸이 있어도 저장된다 (일하는 중이니까). before가 같은 상태면 검사하지 않는다 (옛 점은 빈틈으로만 보인다)
 */
export function flowGate(n: FlowGateInput, before?: Pick<FlowNode, 'progress' | 'result'>): string[] {
  const moved = !before || before.progress !== n.progress || (n.progress === 'done' && (before.result ?? 'solved') !== (n.result ?? 'solved'))
  if (!moved) return []
  const miss: string[] = []
  if (n.progress === 'paused' || (n.progress === 'done' && n.result !== undefined && n.result !== 'solved')) {
    if (!n.reason?.trim()) miss.push(tr('이유', 'reason'))
    return miss
  }
  if (n.progress !== 'done') return miss
  for (const f of FLOW_REQUIRED[n.kind]) if (!n.fields[f]?.trim()) miss.push(fieldName(f))
  if (n.kind !== 'question') {
    const anchored = n.evidence.some((e) => !!e.ref || !!e.section)
    const viaLine = n.kind === 'finding' && n.from.some((f) => f.type === 'support' || f.type === 'use')
    if (!anchored && !viaLine) miss.push(n.evidence.length ? tr('근거의 절 (노트 안의 제목 이름)', 'evidence section (a heading in the note)') : tr('근거', 'evidence'))
  }
  if (n.kind === 'calc' && !n.run?.code?.trim()) miss.push(tr('실행의 코드', 'run code'))
  if (n.kind === 'proof') {
    if (!n.steps.length) miss.push(tr('단계', 'steps'))
    const noUse = n.steps.map((s, i) => (s.uses?.trim() ? 0 : i + 1)).filter(Boolean)
    if (noUse.length) miss.push(tr(`단계 ${noUse.join(', ')}의 쓰는 것`, `what step ${noUse.join(', ')} uses`))
  }
  return miss
}
