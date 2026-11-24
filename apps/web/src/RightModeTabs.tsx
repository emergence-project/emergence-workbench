import type { ReactNode } from 'react'
import { Icon } from './icons'
import { t } from './i18n'
import { setRightMode, type RightMode } from './noteScreen'

/** 오른쪽 사이드바 갈래 아이콘 */
const MODE_ICON: Record<RightMode, [ReactNode, string, string]> = {
  info: [Icon.info, '정보', 'Info'],
  records: [Icon.comment, '기록', 'Records'],
  agent: [Icon.spark, '에이전트', 'Agent'],
  terminal: [Icon.terminal, '터미널', 'Terminal'],
}

/**
 * 오른쪽 사이드바 맨 위 갈래 아이콘 줄 (11/24 사용자 결정 「상단바에는 어느 화면에서나 늘 필요한 것만」, 시안 sidebar-view-buttons):
 * 정보 · 기록 · 에이전트를 상단바가 아니라 열린 사이드바 안에 둔다(11/21 안 A #628을 되돌림). 에이전트 대화 창의 아이콘 줄(WorkAside.tsx SideTabs)과 같은 모양.
 * 상단바에는 사이드바 여닫기 단추만 남고, 사이드바는 마지막에 본 갈래로 열린다. 갈래가 하나뿐이면 줄을 그리지 않는다
 */
export function RightModeTabs({ modes, mode }: { modes: RightMode[]; mode: RightMode }) {
  if (modes.length < 2) return null
  return (
    <div className="rs-modes" role="tablist" aria-label={t('오른쪽 사이드바 갈래', 'Right sidebar view')} data-ui="오른쪽 사이드바 갈래">
      {modes.map((m) => {
        const [icon, ko, en] = MODE_ICON[m], on = mode === m
        return <button key={m} role="tab" data-mode={m} aria-selected={on} className={`ac-side-tab${on ? ' on' : ''}`} data-tip={t(ko, en)} aria-label={t(ko, en)} onClick={() => setRightMode(m)}>{icon}</button>
      })}
    </div>
  )
}
