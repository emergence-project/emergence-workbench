/**
 * 맡긴 일이 사용자 차례일 때 결정할 것(decide)인지 확인만 할 것(confirm)인지 (11/23 「내 차례」를 결정 필요 · 확인만 두 묶음으로).
 * 확인만: 결과가 왔고 종결 조건을 통과했으며 답하지 않은 물음이 없는 일. 승인 한 번이면 끝난다.
 * 결정: 종결 조건 제안, 미달 · 모름인 결과, 물음이 남은 결과.
 * 서버(레일 · 홈 수, research-issues)와 화면(기록 · 프로젝트 정보 · 폰)이 같은 판단을 쓴다.
 */
export interface TaskTurnInput {
  state: string
  endCheck?: 'pass' | 'fail' | 'unknown'
  asks?: readonly unknown[]
  answers?: readonly { n: number }[]
}

export function taskTurn(t: TaskTurnInput): 'decide' | 'confirm' | null {
  if (t.state === 'proposed') return 'decide'
  if (t.state !== 'result') return null
  const answered = new Set((t.answers ?? []).map((a) => a.n))
  const open = (t.asks ?? []).some((_, i) => !answered.has(i + 1)) // 물음 번호는 1부터
  return t.endCheck === 'pass' && !open ? 'confirm' : 'decide'
}
