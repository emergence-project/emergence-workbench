// 흐름 점의 화면 이름 (10/27 "MCP는 화면과 같은 말로"): MCP 출력과 STATUS가 화면과 같은 이름을 쓰게 한 곳에 둔다.
// 연구 파일 · 에이전트가 읽는 글이라 한국어 그대로. 화면 쪽 정본은 apps/web/src/flow/marks.tsx의 KIND · stateName · judgeName
import type { FlowNode } from '@rw/core/contract/flow'

/** 종류 이름과 역할 (10/26 "흐름 점 표식": 여는 점 ◇ · 작업 ○ · 닫는 점 □) */
export const KIND_NAME: Record<FlowNode['kind'], { name: string; role: string; mark: string }> = {
  question: { name: '질문', role: '여는 점', mark: '◇?' },
  calc: { name: '수치 계산', role: '작업', mark: '○π' },
  analytic: { name: '이론 계산', role: '작업', mark: '○∫' },
  proof: { name: '증명', role: '작업', mark: '○∴' },
  literature: { name: '문헌', role: '작업', mark: '○§' },
  finding: { name: '명제', role: '닫는 점', mark: '□' },
}
const ACT = new Set<FlowNode['kind']>(['calc', 'analytic', 'proof', 'literature'])

/** 상태 이름: 미해결 · 진행 · 멈춤 · 끝남 · 해결 / 성공 · 반증 / 실패 · 폐기 (화면 stateName과 같게) */
export function stateLabel(n: FlowNode): string {
  if (n.progress !== 'done') return { open: '미해결', active: '진행', paused: '멈춤' }[n.progress]
  const act = ACT.has(n.kind)
  return n.result === 'refuted' ? (act ? '끝남 · 실패' : '끝남 · 반증') : n.result === 'dropped' ? '끝남 · 폐기' : (act ? '끝남 · 성공' : '끝남 · 해결')
}

/** 명제의 판단 이름 (화면 judgeName과 같게). 명제가 아니면 undefined */
export function judgmentLabel(n: FlowNode): string | undefined {
  if (n.kind !== 'finding') return undefined
  return n.verdict === 'approve' ? '승인됨' : n.verdict === 'send-back' ? '수정 요청' : n.verdict === 'reject' ? '기각' : '판단 전'
}

/** 한 줄 이름: "명제 (닫는 점) · 끝남 · 해결 · 판단 전" (정리면 종류 이름이 정리) */
export function shownName(n: FlowNode): string {
  const k = KIND_NAME[n.kind]
  const name = n.theorem ? '정리' : k.name
  return [`${name} (${k.role})`, stateLabel(n), judgmentLabel(n)].filter(Boolean).join(' · ')
}
