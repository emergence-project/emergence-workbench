// 중앙의 작업 현황 (11/19 피드백 "뭐가 남아있고, 뭐가 정체되어 있는지", 시안 2026-11-19-central-checklist 안 A):
// 하위 대화 · 자리 기다림 · 사용자가 답할 피드백 · 다른 대화의 비정상 종료(11/20)를 한 줄씩 단계와 묶음으로 나누고, 오래 그대로인 줄은 정체로 내 차례에 올린다
import type { CentralState } from './api'
import { t } from './i18n'

type Kid = CentralState['kids'][number]
export type BoardGroup = 'turn' | 'doing' | 'ready' | 'done'
/** 상태 표시: 점(채움) · 고리(빈 원), 색은 파랑 · 청록 · 주황 · 회색 */
export type BoardMark = 'run' | 'ci' | 'ready' | 'user' | 'merged' | 'held' | 'error' | 'idle'
export type BoardRow = {
  key: string
  /** 하위 대화 id (자리 기다림 · 피드백은 없음) */
  id?: string
  title: string
  stage: string
  mark: BoardMark
  group: BoardGroup
  /** 마지막으로 움직인 때 (ISO) */
  at?: string
  /** 정체면 그대로인 분 */
  stalled?: number
  extras: string[]
  feedback?: boolean
}

/** 이 단계에서 이만큼(분) 움직임이 없으면 정체: 진행 중 20분 · CI 기다림 30분 · 합칠 준비와 중앙이 답할 허락 10분. 사용자 결정은 정체로 치지 않는다 */
export const STALL_MIN = { run: 20, ci: 30, ready: 10, ask: 10 } as const
/** 내 차례에 보이는 피드백 수 (더 있으면 「모두 보기」) */
export const FEEDBACK_MAX = 5

const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

function kidRow(k: Kid, now: number): BoardRow | undefined {
  const base = { key: k.id, id: k.id, title: k.title, at: k.updated }
  const extras = [k.pr && `PR #${k.pr.number}`, k.todos && t(`할 일 ${k.todos.done}/${k.todos.total}`, `to-dos ${k.todos.done}/${k.todos.total}`)].filter((x): x is string => !!x)
  if (k.archived || k.merged) {
    if (!sameDay(new Date(k.updated), new Date(now))) return undefined
    return { ...base, stage: k.merged ? t('합쳐짐', 'Merged') : t('닫음', 'Closed'), mark: k.merged ? 'merged' : 'idle', group: 'done', extras }
  }
  const stall = (min: number) => { const m = Math.floor((now - Date.parse(k.updated)) / 60_000); return m >= min ? m : undefined }
  const wait = k.wait === 'plan' ? t('계획 승인', 'plan approval') : t('허락', 'permission')
  if (k.state === 'waiting' && (!k.ask || k.ask.critical))
    return { ...base, stage: t('사용자 결정 기다림', 'Waits for your decision'), mark: 'user', group: 'turn', extras: [...extras, k.ask?.critical ? `${wait} · ${k.ask.critical}` : wait] }
  if (k.state === 'waiting') return { ...base, stage: t(`${wait} 기다림 (중앙이 답함)`, `Waits for ${wait} (Central answers)`), mark: 'user', group: 'doing', stalled: stall(STALL_MIN.ask), extras }
  if (k.state === 'error') return { ...base, stage: k.crashes ? t('비정상 종료', 'Crashed') : t('오류', 'Error'), mark: 'error', group: 'turn', extras: k.crashes && k.crashes > 1 ? [...extras, t(`${k.crashes}번째`, `${k.crashes} times`)] : extras }
  if (k.state === 'running' || k.state === 'queued') return { ...base, stage: k.state === 'queued' ? t('대기', 'Queued') : t('진행 중', 'Working'), mark: 'run', group: 'doing', stalled: stall(STALL_MIN.run), extras }
  if (k.ci === 'failed') return { ...base, stage: t('CI 실패', 'Check failed'), mark: 'error', group: 'doing', stalled: stall(STALL_MIN.ask), extras }
  if (k.ci === 'pending') return { ...base, stage: t('CI 기다림', 'Waiting for checks'), mark: 'ci', group: 'doing', stalled: stall(STALL_MIN.ci), extras }
  if (k.ci === 'passed') return { ...base, stage: t('CI 통과 · 합칠 준비', 'Checks passed · ready to merge'), mark: 'ready', group: 'ready', stalled: stall(STALL_MIN.ready), extras }
  if (k.pr) return { ...base, stage: t('PR 올림', 'Pull request open'), mark: 'ci', group: 'doing', stalled: stall(STALL_MIN.ci), extras }
  return { ...base, stage: k.state === 'stopped' ? t('멈춤', 'Stopped') : t('차례 끝남 · 확인', 'Turn ended · check it'), mark: 'idle', group: 'turn', extras }
}

/** 작업 현황의 줄: 묶음마다 오래된 것이 위. 정체는 내 차례로 */
export function boardRows(s: Pick<CentralState, 'kids' | 'held' | 'feedback' | 'crashed'>, now = Date.now()): { rows: BoardRow[]; moreFeedback: number } {
  const rows = s.kids.map((k) => kidRow(k, now)).filter((r): r is BoardRow => !!r)
    .map((r) => (r.stalled !== undefined ? { ...r, group: 'turn' as const } : r))
  ;(s.held ?? []).forEach((h, i) => rows.push({ key: `held:${i}`, title: h.title, stage: t('자리 기다림', 'Waiting for room'), mark: 'held', group: 'doing', ...(h.at && { at: h.at }), extras: [t(`순서 ${i + 1}`, `#${i + 1} in line`)] }))
  // 하위 대화가 아닌 대화의 비정상 종료 (11/20): 내 차례에
  for (const x of s.crashed ?? []) rows.push({ key: `crash:${x.id}`, id: x.id, title: x.title, stage: t('비정상 종료', 'Crashed'), mark: 'error', group: 'turn', at: x.at, extras: x.count > 1 ? [t(`${x.count}번째`, `${x.count} times`)] : [] })
  const fb = s.feedback ?? []
  fb.slice(0, FEEDBACK_MAX).forEach((f) => rows.push({ key: `fb:${f.key}`, title: f.text, stage: t('사용자 결정 기다림', 'Waits for your decision'), mark: 'user', group: 'turn', at: f.at, extras: [], feedback: true }))
  const order: BoardGroup[] = ['turn', 'doing', 'ready', 'done']
  rows.sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group) || (a.group === 'done' ? (b.at ?? '').localeCompare(a.at ?? '') : (a.at ?? '').localeCompare(b.at ?? '')))
  return { rows, moreFeedback: Math.max(0, fb.length - FEEDBACK_MAX) }
}

/** 머리 · 「중앙」 줄의 수: 남음(끝남 밖) · 내 차례 · 정체 */
export function boardCounts(rows: BoardRow[], moreFeedback = 0) {
  return {
    left: rows.filter((r) => r.group !== 'done').length + moreFeedback,
    turn: rows.filter((r) => r.group === 'turn').length + moreFeedback,
    stalled: rows.filter((r) => r.stalled !== undefined).length,
  }
}
