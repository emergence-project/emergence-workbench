import type { UiSettings } from '@rw/core'
import type { ReactNode } from 'react'
import { AboutPage, aboutRailRoute, AboutRailCount, AboutSidebar } from './AboutPage'
import type { LibraryInfo } from './api'
import { AgentEditsPage } from './AgentEditsPage'
import { AppUpdateRailCount } from './AppUpdate'
import { KnowledgeList } from './KnowledgeList'
import { ConceptSide } from './ConceptNotes'
import { FeedbackPage, FeedbackRailCount } from './FeedbackPage'
import { t } from './i18n'
import { Icon } from './icons'
import { KnowledgeMapPage, LibraryPage } from './Library'
import { FiguresHome, PapersHome } from './LibraryHome'
import { isListRoute, type Route } from './router'
import { PapersPage, PapersSide } from './PapersPage'
import { FiguresPage, FiguresSide } from './FiguresPage'
import { NetworkPage, NetworkRailCount, NetworkSide } from './NetworkPage'
import { SettingsPage, SettingsSide } from './SettingsPage'

/** 프로젝트에 속하지 않는 화면이 App에서 받는 것 */
export interface GlobalPageProps {
  route: Route
  version: number
  library: LibraryInfo | null
  onLibraryChanged(): void
  ui: UiSettings
  onUi(patch: Partial<UiSettings>): void
  onSaved(message: string): void
  /** 오른쪽 사이드바가 열렸는지 (right가 있는 화면만, 제목줄 단추 · ⌥⌘\로 여닫음) */
  rightOpen: boolean
}

/**
 * 프로젝트에 속하지 않는 화면 (홈 말고). 왼쪽 띠 버튼, 제목줄 위치 표시, 본문이 모두 이 목록에서 나온다.
 * 새 화면은 여기에 한 항목만 더한다 (Route·router.ts에 주소를 더하고, 스타일은 styles/에 자기 파일).
 * label은 data-ui(피드백 모드의 부위 이름)로도 쓰이니 바꾸면 피드백 기록과 어긋난다.
 */
export const GLOBAL_PAGES: {
  page: Route['page']
  label: string
  /** label을 화면 언어로 (label은 data-ui라 한국어 그대로) */
  name: string
  aria: string
  tip: string
  icon: ReactNode
  /** 왼쪽 띠의 위(프로젝트 버튼 아래)인지 아래인지. 'none'은 띠에 버튼 없이 under 화면 안의 페이지 */
  rail: 'top' | 'bottom' | 'none'
  /** 이 화면에 있을 때 띠에서 켜 둘 화면 (예: 지도는 지식 안) */
  under?: Route['page']
  render(p: GlobalPageProps): ReactNode
  /** 있으면 앱의 왼쪽 사이드바에 이것을 둔다 (사이드바 켜고 끄기도 따른다) */
  side?(p: GlobalPageProps): ReactNode
  /** 이 주소에서 오른쪽 사이드바가 있는지. 있으면 제목줄에 여닫는 단추가 생기고 render가 rightOpen을 받는다 */
  right?(route: Route): boolean
  /** 있으면 왼쪽 띠 버튼에 붙는 수·표시 */
  badge?(version: number): ReactNode
  /** 띠 버튼을 누를 때 갈 곳 (배지가 세는 것이 보이는 곳, 10/8 11:36). 없으면 그 화면 첫 쪽 */
  railTo?(): Route
}[] = [
  {
    page: 'library', label: '지식', name: t('지식', 'Knowledge'), aria: t('지식', 'Knowledge'), tip: t('지식 — 개념노트 라이브러리', 'Knowledge: concept note library'), icon: Icon.library, rail: 'top',
    side: (p) => <ConceptSide info={p.library} route={p.route} />,
    // 첫 화면의 라이브러리 정보, 목록의 분류 정보, 개념노트의 정보 | 기록 (10/10 노트 화면 틀)
    right: (r) => r.page === 'library',
    render: (p) => p.route.page === 'library' && isListRoute(p.route)
      ? <KnowledgeList info={p.library} filters={{ subjectPrefix: p.route.subjectPrefix, issue: p.route.issue, check: p.route.check, showEmpty: p.route.showEmpty }} rightOpen={p.rightOpen} onChanged={p.onLibraryChanged} onSaved={p.onSaved} />
      : <LibraryPage info={p.library} topic={p.route.page === 'library' ? p.route.topic : undefined} rightOpen={p.rightOpen} onChanged={p.onLibraryChanged} onSaved={p.onSaved} />,
  },
  // 지식 지도 (10/6: 지식 화면의 보기 단추에서 띠의 페이지로 자리만 옮김, requirements §8.1 "라이브러리 목록 화면 · 지도")
  {
    page: 'kmap', label: '지도', name: t('지도', 'Map'), aria: t('지식 지도', 'Knowledge map'), tip: t('지도 — 개념노트 사이의 링크', 'Map: links between concept notes'), icon: Icon.tree, rail: 'none', under: 'library',
    side: (p) => <ConceptSide info={p.library} route={p.route} />,
    render: (p) => <KnowledgeMapPage info={p.library} topic={p.route.page === 'kmap' ? p.route.topic : undefined} />,
  },
  // 논문 라이브러리 (10/5). 10/6 L2: 첫 화면(PapersHome)과 목록(PapersPage)
  { page: 'shelf', label: '논문', name: t('논문', 'Papers'), aria: t('논문', 'Papers'), tip: t('논문 — 라이브러리의 논문과 책, PDF', 'Papers: papers, books and PDFs in the library'), icon: Icon.papers, rail: 'top',
    side: (p) => <PapersSide filter={p.route.page === 'shelf' ? p.route.filter : undefined} list={isListRoute(p.route) || (p.route.page === 'shelf' && !!p.route.open)} />,
    right: (r) => r.page === 'shelf' && !r.open && !isListRoute(r),
    render: (p) => (p.route.page === 'shelf' && !p.route.open && !isListRoute(p.route)
      ? <PapersHome info={p.library} rightOpen={p.rightOpen} onSaved={p.onSaved} />
      : <PapersPage filter={p.route.page === 'shelf' ? p.route.filter : undefined} open={p.route.page === 'shelf' ? p.route.open : undefined} onSaved={p.onSaved} />) },
  // 그림 라이브러리 (10/5, 10/4 19:10 피드백 "반복해서 쓰는 그림을 공용 자산으로"). 10/6 L2: 첫 화면(FiguresHome)과 목록(FiguresPage)
  { page: 'figures', label: '그림', name: t('그림', 'Figures'), aria: t('그림', 'Figures'), tip: t('그림 — 노트에서 함께 쓰는 tikz · svg 그림', 'Figures: tikz and svg figures shared across notes'), icon: Icon.figures, rail: 'top',
    side: (p) => <FiguresSide filter={p.route.page === 'figures' ? p.route.filter : undefined} list={isListRoute(p.route)} />,
    right: (r) => r.page === 'figures' && !isListRoute(r),
    render: (p) => (p.route.page === 'figures' && !isListRoute(p.route)
      ? <FiguresHome info={p.library} rightOpen={p.rightOpen} onSaved={p.onSaved} />
      : <FiguresPage filter={p.route.page === 'figures' ? p.route.filter : undefined} onSaved={p.onSaved} />) },
  // 저자와 소속을 설정에서 옮겨 왔다 (10/4 피드백). 사이드바에 사람, 사람마다 노트 참고 문헌의 논문
  { page: 'network', label: '네트워킹', name: t('네트워킹', 'Networking'), aria: t('네트워킹', 'Networking'), tip: t('네트워킹 — 저자와 소속, 함께 연구하는 사람들', 'Networking: authors, affiliations and collaborators'), icon: Icon.network, rail: 'top',
    side: (p) => <NetworkSide person={p.route.page === 'network' ? p.route.person : undefined} onSaved={p.onSaved} />,
    render: (p) => <NetworkPage person={p.route.page === 'network' ? p.route.person : undefined} onSaved={p.onSaved} />,
    badge: () => <NetworkRailCount /> },
  { page: 'feedback', label: '피드백', name: t('피드백', 'Feedback'), aria: t('피드백 모아 보기', 'All feedback'), tip: t('피드백 모아 보기 — 반영 여부', 'All feedback and whether it was applied'), icon: Icon.feedback, rail: 'bottom', render: (p) => <FeedbackPage version={p.version} />,
    badge: (version) => <FeedbackRailCount version={version} /> },
  // 에이전트 고침 검토 (10/8): 띠 버튼 없이 지식 첫 화면 점검 · 프로젝트 첫 화면 작업 패널에서 연다
  { page: 'review', label: '고침 검토', name: t('고침 검토', 'Edit review'), aria: t('에이전트 고침 검토', 'Review agent edits'), tip: t('에이전트 고침 검토', 'Review agent edits'), icon: Icon.approve, rail: 'none',
    render: (p) => <AgentEditsPage selected={p.route.page === 'review' ? p.route.key : undefined} scope={p.route.page === 'review' ? p.route.scope : undefined} version={p.version} onSaved={p.onSaved} /> },
  { page: 'about', label: '소개', name: t('소개', 'About'), aria: t('이 앱 소개', 'About'), tip: t('이 앱 소개', 'About'), icon: Icon.info, rail: 'bottom', render: (p) => <AboutPage part={p.route.page === 'about' ? p.route.part : undefined} />,
    side: (p) => <AboutSidebar part={p.route.page === 'about' ? p.route.part : undefined} />,
    badge: () => <AboutRailCount />, railTo: aboutRailRoute },
  { page: 'settings', label: '설정', name: t('설정', 'Settings'), aria: t('설정', 'Settings'), tip: t('설정', 'Settings'), icon: Icon.settings, rail: 'bottom', side: (p) => <SettingsSide part={p.route.page === 'settings' ? p.route.part : undefined} />,
    render: (p) => <SettingsPage ui={p.ui} onChange={p.onUi} part={p.route.page === 'settings' ? p.route.part : undefined} onSaved={p.onSaved} />,
    badge: () => <AppUpdateRailCount /> },
]

export const globalPageOf = (page: Route['page']) => GLOBAL_PAGES.find((g) => g.page === page)
