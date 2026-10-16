// STATUS의 흐름 절 둘 (종합 검토 묶음 F, 시안 planning/mockups/2026-10-16-flow-agent-view.html):
// "흐름 요약"은 지금 할 것(최근 점 · 열린 점 · 사람 승인 대기), "흐름 지도"는 점마다 한 줄.
// STATUS는 연구 파일이라 한국어로 쓴다. 상태 이름이 바뀌면 고칠 곳은 아래 이름표뿐이다.
import type { FlowNode } from '@rw/core/contract/flow'
import { approved, scanFlow } from './flow.js'
import type { Workbench } from './workbench.js'

const KIND: Record<FlowNode['kind'], [string, string]> = {
  question: ['질문', '?'], finding: ['발견', '◉'], calc: ['수치 계산', 'π'], analytic: ['이론 계산', '∫'], proof: ['증명', '∴'], literature: ['문헌', '§'],
}
const FIELD: Record<string, string> = {
  question: '물음', guess: '예상 답', motivation: '동기', statement: '진술', condition: '조건', goal: '목표', setup: '설정', method: '방법', result: '결과', reading: '문헌', gain: '얻은 것',
}
const EDGE: Record<FlowNode['from'][number]['type'], string> = { origin: '발단', support: '근거', refute: '반박', use: '사용' }
const PROGRESS: Record<FlowNode['progress'], string> = { open: '미해결', active: '진행', paused: '멈춤', done: '해결' }
const RESULT: Record<NonNullable<FlowNode['result']>, string> = { solved: '해결', refuted: '반증', dropped: '폐기' }
const RECENT = 5
const CLIP = 240

const stateName = (n: FlowNode) => n.theorem ? '정리' : n.progress === 'done' ? RESULT[n.result ?? 'solved'] : PROGRESS[n.progress]
const isOpen = (n: FlowNode) => n.progress !== 'done'
const oneLine = (s: string) => { const t = s.replace(/\s+/g, ' ').trim(); return t.length > CLIP ? `${t.slice(0, CLIP - 1)}…` : t }
const end = (n: FlowNode) => n.end ? ' · 갈래 끝' : ''
/** 에이전트 검토는 있고 사람 승인이 없는 증명 근거 */
const awaitsHuman = (n: FlowNode) => n.evidence.some((e) => e.kind === 'proof' && approved(e, 'agent') && !approved(e, 'human'))

function counts(nodes: FlowNode[]): string {
  const n = (f: (x: FlowNode) => boolean) => nodes.filter(f).length
  const solved = n((x) => x.progress === 'done' && (x.result ?? 'solved') === 'solved'), theorems = n((x) => x.theorem)
  return [
    `해결 ${solved}${theorems ? `(정리 ${theorems})` : ''}`, `진행 ${n((x) => x.progress === 'active')}`, `멈춤 ${n((x) => x.progress === 'paused')}`,
    `미해결 ${n((x) => x.progress === 'open')}`, `폐기 ${n((x) => x.result === 'dropped')}`, `반증 ${n((x) => x.result === 'refuted')}`,
  ].filter((s) => !/ 0$/.test(s)).join(' · ')
}

function brief(n: FlowNode, all: FlowNode[], full: boolean): string[] {
  const out = [`- ${n.date ?? '—'} ${KIND[n.kind][1]} ${n.short} · \`flow-${n.id}\` · ${KIND[n.kind][0]} · ${stateName(n)}${end(n)} — ${n.title}`]
  if (!full) return out
  const byId = new Map(all.map((x) => [x.id, x]))
  for (const [k, v] of Object.entries(n.fields)) out.push(`  - ${FIELD[k] ?? k}: ${oneLine(v)}`)
  if (n.from.length) out.push(`  - 앞선 점 ← ${n.from.map((f) => `${EDGE[f.type]} \`${f.id}\` (${byId.get(f.id) ? stateName(byId.get(f.id)!) : '—'})`).join(' · ')}`)
  const next = all.filter((x) => x.from.some((f) => f.id === n.id))
  if (next.length) out.push(`  - 뒤따른 점 → ${next.map((x) => `\`${x.id}\` (${stateName(x)}${end(x)})`).join(' · ')}`)
  for (const e of n.evidence) {
    const checks = e.checks.map((c) => `${c.at.replace('T', ' ')} ${c.by} ${c.role === 'human' ? '승인' : '검토'}${c.revoked ? ' 거둠' : ''}`)
    out.push(`  - 근거: ${e.file ?? `[@${e.ref}]`}${e.text ? ` — ${oneLine(e.text)}` : ''} (${checks.length ? checks.join(', ') : '검토 없음'})`)
  }
  for (const g of n.guesses) out.push(`  - 짐작(사람 확인 안 함): ${oneLine(g)}`)
  return out
}

/** 점이 없으면 빈 배열 (절을 만들지 않는다) */
export function flowStatusSections(wb: Workbench): string[] {
  const nodes = scanFlow(wb).nodes
  if (!nodes.length) return []
  const newest = [...nodes].reverse() // scanFlow는 날짜 · id 순
  const recent = newest.slice(0, RECENT)
  const olderOpen = newest.slice(RECENT).filter(isOpen)
  const awaiting = nodes.filter(awaitsHuman)
  const out = [
    '## 흐름 요약 — 원본 `workbench/flow/` · 점 주소 `flow-<id>` (기록 대상과 같다)', '',
    `점 ${nodes.length} · ${counts(nodes)}`, '',
    '> 질문 문장 · 발단 선 · 갈래 폐기 · 승인은 사람이 정한다. 새 점은 사용자가 말할 때까지 더하지 않는다(10/15 보류). 에이전트의 검토는 근거의 `role: agent` 확인 기록으로 단다.',
    '> 모든 점: 절 "흐름 지도". 점 하나의 전부: `workbench/flow/<id>.yaml`.', '',
    `### 최근 점 ${recent.length} (새것부터. 열린 점 = 미해결 · 진행 · 멈춤은 핵심 칸까지)`, '',
  ]
  for (const n of recent) out.push(...brief(n, nodes, isOpen(n)))
  out.push('', `### 그 밖의 열린 점 ${olderOpen.length}${olderOpen.length ? '' : ' (없음 — 열린 점은 모두 위에 있다)'}`, '')
  for (const n of olderOpen) out.push(...brief(n, nodes, true))
  if (olderOpen.length) out.push('')
  out.push(`### 사람 승인 대기 ${awaiting.length}${awaiting.length ? '' : ' (없음)'}`, '',
    '> 근거의 증명에 에이전트 검토만 있고 사람 승인이 없다. 승인 전에는 정리가 아니니 이 위에 쌓지 않는다.', '')
  for (const n of awaiting) out.push(...brief(n, nodes, false))
  if (awaiting.length) out.push('')

  out.push(`## 흐름 지도 ${nodes.length} — 날짜 순, 점마다 한 줄 · ▶ 시작 · ← 앞선 점`, '')
  for (const n of nodes) {
    const head = `- ${n.from.length ? '' : '▶ '}\`${n.id}\` · ${KIND[n.kind][0]} · ${stateName(n)}${end(n)}`
    out.push(isOpen(n) ? `${head} → 흐름 요약` : `${head} — ${n.title}${n.from.length ? ` ← ${n.from.map((f) => `${EDGE[f.type]} ${f.id}`).join(' · ')}` : ''}`)
  }
  out.push('')
  return out
}
