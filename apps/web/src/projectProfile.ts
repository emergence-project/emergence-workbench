// 프로젝트 성격 · 분야 · 진행 상태 · 순서 (10/5 시안 "홈", "프로젝트 성격 · 분야"). 화면 이름은 이 파일에서만 정한다
import type { JournalEntry } from '@rw/core'
import type { ProjectKind, ProjectState, ResearchListItem, ResearchSummary } from './api'
import { t, plural } from './i18n'

export const PROJECT_KIND_LABEL: Record<ProjectKind, string> = { research: t('연구', 'Research'), work: t('업무', 'Work') }
export const PROJECT_KINDS: ProjectKind[] = ['research', 'work']
export const PROJECT_STATE_LABEL: Record<ProjectState, string> = { active: t('진행', 'In progress'), paused: t('멈춤', 'Paused'), done: t('완료', 'Done') }
export const PROJECT_STATES: ProjectState[] = ['active', 'paused', 'done']
/** 진행 상태의 색 점: 노트 상태와 같은 색(진행 파랑 · 멈춤 주황 · 완료 청록) */
export const PROJECT_STATE_DOT: Record<ProjectState, 'in-progress' | 'blocked' | 'solved'> = { active: 'in-progress', paused: 'blocked', done: 'solved' }

/** 홈 거르기: 성격(전체 · 연구 · 업무) */
export type KindFilter = 'all' | ProjectKind
export const KIND_FILTERS: KindFilter[] = ['all', 'research', 'work']
export const kindFilterLabel = (k: KindFilter) => (k === 'all' ? t('전체', 'All') : PROJECT_KIND_LABEL[k])

/** 성격으로 거른 뒤 진행 상태마다 몇 개인지 (오른쪽 거르기의 수) */
export function stateCounts(list: Pick<ResearchListItem, 'kind' | 'state'>[], kind: KindFilter): Record<ProjectState, number> {
  const out: Record<ProjectState, number> = { active: 0, paused: 0, done: 0 }
  for (const r of list) if (kind === 'all' || r.kind === kind) out[r.state]++
  return out
}

/** 홈에 보일 프로젝트: 성격과 진행 상태로 거른다. 순서는 목록(설정) 순서 그대로 */
export function filterProjects<T extends Pick<ResearchListItem, 'kind' | 'state'>>(list: T[], kind: KindFilter, state: ProjectState): T[] {
  return list.filter((r) => (kind === 'all' || r.kind === kind) && r.state === state)
}

/**
 * 끌어 놓기: from을 to 자리로 옮긴 id 목록. 거른 화면에서 끌어도 보이지 않는 프로젝트의 자리는 그대로 둔다
 * (from을 빼고 to의 앞에 넣는다. to보다 뒤에서 앞으로 끌면 to 앞, 앞에서 뒤로 끌면 to 뒤).
 */
export function moveId(ids: string[], from: string, to: string): string[] {
  if (from === to) return ids
  const i = ids.indexOf(from)
  const j = ids.indexOf(to)
  if (i < 0 || j < 0) return ids
  const rest = ids.filter((x) => x !== from)
  const at = rest.indexOf(to) + (i < j ? 1 : 0)
  return [...rest.slice(0, at), from, ...rest.slice(at)]
}

/** 프로젝트의 최근 시각(ms): 보조 노트를 고친 때와 일지 기록 중 가장 늦은 것 */
export function lastWorkMs(summary: Pick<ResearchSummary, 'blocks'>, entries: Pick<JournalEntry, 'date' | 'time'>[]): number | undefined {
  const times = [
    ...summary.blocks.map((b) => b.mtime),
    ...entries.map((e) => new Date(`${e.date}T${/^\d{1,2}:\d{2}$/.test(e.time) ? e.time.padStart(5, '0') : '00:00'}:00`).getTime()),
  ].filter((t) => Number.isFinite(t) && t > 0)
  return times.length ? Math.max(...times) : undefined
}

/** 상태 기호 (홈): 확인 필요(빨간 점) · 업데이트 필요(돌아가는 화살표) · 둘 다(화살표 오른쪽 위 빨간 점) */
export type AttentionMark = 'check' | 'update' | 'both' | null
/** "확인 필요"의 내역 (왼쪽 띠의 수와 첫 화면 점의 툴팁): 확인이 필요한 노트 + 판단할 맡긴 일(결과 · 종결 조건 제안, 10/7) */
export function issueTip(notes: number, tasks: number, edits = 0): string {
  const parts = [notes > 0 && t(`확인이 필요한 노트 ${notes}개`, `${plural(notes, 'note')} to review`), tasks > 0 && t(`판단할 맡긴 일 ${tasks}개`, `${plural(tasks, 'delegated task')} to decide`), edits > 0 && t(`에이전트 고침 ${edits}개`, `${plural(edits, 'agent edit')} to review`)].filter(Boolean)
  return parts.join(' · ') || t('확인할 것 없음', 'Nothing to review')
}
export function attentionOf(issues: number, behind: number): AttentionMark {
  if (issues > 0 && behind > 0) return 'both'
  if (issues > 0) return 'check'
  if (behind > 0) return 'update'
  return null
}

/**
 * 왼쪽 띠에 보일 프로젝트 (10/10 12:59): 진행 중인 것, 띠에 보이기를 켠 것, 지금 연 것. 순서는 홈과 같다.
 * 멈춤 · 완료는 홈 카드에서 연다.
 */
export function railProjects<T extends Pick<ResearchListItem, 'id' | 'state' | 'rail'>>(list: T[], open?: string | null): T[] {
  return list.filter((r) => r.state === 'active' || r.rail || r.id === open)
}
