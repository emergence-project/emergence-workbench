import type { ReactNode } from 'react'
import { Icon } from './icons'
import { t } from './i18n'
import { useRightMode, useRightSlots, type RightMode } from './noteScreen'

const SLOT: Record<Exclude<RightMode, 'terminal'>, [ReactNode, string, string]> = {
  agent: [Icon.spark, '에이전트 대화', 'Agent chat'],
  info: [Icon.info, '정보', 'Info'],
  records: [Icon.comment, '기록', 'Records'],
}
/** 레일의 순서: 에이전트 대화가 맨 위, 구분선, 그 아래 열린 것의 정보 · 기록 */
const ORDER = ['agent', 'info', 'records'] as const

/** 지금 보이는 칸: 고른 갈래가 이 화면에 없으면 정보, 정보도 없으면 첫 칸 */
export function shownSlot(slots: RightMode[], chosen: RightMode): RightMode | null {
  if (chosen === 'terminal') return null
  return slots.includes(chosen) ? chosen : slots.includes('info') ? 'info' : slots[0] ?? null
}

/**
 * 오른쪽 레일 (11/28 사용자 결정 「왼쪽은 어디, 오른쪽은 열린 것의 어느 면」): 버튼 하나가 오른쪽 사이드바의 칸 하나다.
 * 왼쪽 레일은 장소를 고르고 왼쪽 사이드바 · 가운데만 바꾼다. 오른쪽 레일은 가운데에 열린 것의 면(에이전트 대화 · 정보 · 기록)을 고르고 오른쪽 사이드바만 바꾼다.
 * 켜진 칸을 다시 누르면 사이드바가 닫힌다. 이 화면에 없는 칸은 버튼이 없다(fallback은 사이드바가 닫혀 있을 때 화면 종류로 정한 칸).
 * 확장은 이 레일에 버튼을 더하지 않는다(docs/design-system.md 6절 「확장의 자리」)
 */
export function RightRail({ fallback, open, onPick }: { fallback: RightMode[]; open: boolean; onPick(m: RightMode, on: boolean): void }) {
  const chosen = useRightMode()
  const slots = useRightSlots() ?? fallback
  const shown = open ? shownSlot(slots, chosen) : null
  const list = ORDER.filter((m) => slots.includes(m))
  if (!list.length) return null
  return (
    <nav className="rail rail-r" aria-label={t('열린 것의 보기', 'Views of what is open')} data-ui="오른쪽 레일">
      {list.map((m) => {
        const [icon, ko, en] = SLOT[m], on = shown === m
        return <span key={m} className="rail-r-cell">
          <button className={`rail-btn tip-left${on ? ' on' : ''}`} data-mode={m} aria-pressed={on} data-tip={t(ko, en)} aria-label={t(ko, en)} onClick={() => onPick(m, on)}>{icon}</button>
          {m === 'agent' && list.length > 1 && <span className="rail-hr" />}
        </span>
      })}
    </nav>
  )
}
