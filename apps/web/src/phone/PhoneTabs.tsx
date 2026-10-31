import type { ReactNode } from 'react'
import { t } from '../i18n'
import { Icon } from '../icons'
import { usePhone } from '../phoneLayout'
import { go, type Route } from '../router'
import { useTurns } from './turns'

/**
 * 폰의 아래 탭 넷 (10/31 사용자 결정 "안 A · 내 차례 먼저"): 차례 · 프로젝트 · 대화 · 설정.
 * 폰에서는 레일 대신 이것을 둔다(styles/phone.css가 레일을 숨긴다). 맥 폭에서는 아무것도 그리지 않는다.
 */
export function PhoneTabs({ route, version }: { route: Route; version: number }) {
  return usePhone() ? <Tabs route={route} version={version} /> : null
}

type TabKey = 'turns' | 'projects' | 'agent' | 'settings'

const tabOf = (r: Route): TabKey => (r.page === 'turns' ? 'turns' : r.page === 'agent' ? 'agent' : r.page === 'settings' ? 'settings' : 'projects')

function Tabs({ route, version }: { route: Route; version: number }) {
  const { items } = useTurns(version)
  const on = tabOf(route)
  const tabs: { key: TabKey; label: string; icon: ReactNode; to: Route; n?: number }[] = [
    { key: 'turns', label: t('차례', 'Turn'), icon: Icon.flag, to: { page: 'turns' }, n: items.length },
    { key: 'projects', label: t('프로젝트', 'Projects'), icon: Icon.research, to: { page: 'home' } },
    { key: 'agent', label: t('대화', 'Chats'), icon: Icon.spark, to: { page: 'agent' } },
    { key: 'settings', label: t('설정', 'Settings'), icon: Icon.settings, to: { page: 'settings' } },
  ]
  return (
    <nav className="ph-tabs" aria-label={t('화면', 'Screens')} data-ui="폰 탭 바">
      {tabs.map((x) => (
        <button key={x.key} className={`ph-tab${on === x.key ? ' on' : ''}`} aria-current={on === x.key ? 'page' : undefined} data-ui="폰 탭" data-ui-item={x.key}
          onClick={() => go(x.to)}>
          <span className="ph-tab-icon">{x.icon}{!!x.n && <span className="ph-n" aria-label={t(`내 차례 ${x.n}`, `${x.n} for you`)}>{x.n}</span>}</span>
          {x.label}
        </button>
      ))}
    </nav>
  )
}
