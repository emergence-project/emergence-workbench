/** 상단바의 위치 표시 (App.tsx에서 나눔) */
import { t } from './i18n'
import { partOf } from './aboutContent'
import { GLOBAL_PAGES } from './globalPages'
import { LOOSE_NOTES_LABEL, LOOSE_NOTES_UI, LOOSE_TOPIC_ID } from './noteKinds'
import { chatTitles } from './AgentChats'
import { taskTitles } from './taskView'
import { shortLabel } from './notes'
import type { noteOfRoute } from './Sidebar'
import type { Route } from './router'
import type { Crumb } from './TopBar'
import type { LibraryInfo, ManuscriptInfo, ResearchSummary, Topic } from './api'
import type { Tab } from './Workspace'
import type { useProjectData } from './projectData'

export const PAGE_LABEL: Partial<Record<Route['page'], string>> = {
  home: t('홈', 'Home'), overview: t('첫 화면', 'Start'), info: t('프로젝트 정보', 'Project info'), agents: t('규칙', 'Rules'), status: t('현황', 'Status'), changes: t('변경사항', 'Changes'), repo: t('저장소', 'Repository'), files: t('파일', 'Files'), notes: t('원고', 'Manuscript'), concepts: t('개념노트', 'Concept notes'), papers: t('문헌노트', 'Literature notes'), todo: t('기록', 'Records'), records: t('기록', 'Records'), log: t('기록', 'Records'), map: t('지도', 'Map'), edits: t('수정 검토', 'Edit review'), problems: t('흐름', 'Flow'),
  ...Object.fromEntries(GLOBAL_PAGES.map((g) => [g.page, g.name])),
}

/**
 * 제목줄의 위치 표시 (10/5 시안 "상단바" 1번 나): 노트는 "프로젝트 › 주 주제"까지, 이름마다 그 화면으로.
 * 노트 이름은 탭 · 나무 · 본문 제목이 보이고, 파일 경로는 오른쪽 사이드바 맨 아래에 있다
 */
export function crumbsOf({ current, rid, route, openNote, topics, library, msOfFile, summary, titles }: {
  current?: { title: string; path: string }
  rid?: string | null
  route: Route
  openNote: ReturnType<typeof noteOfRoute>
  topics: ReturnType<typeof useProjectData>['topics']
  library: ReturnType<typeof useProjectData>['library']
  msOfFile(file: string): ManuscriptInfo | null
  summary: ResearchSummary | null
  titles: typeof taskTitles
}): Crumb[] {
return current && rid
  ? [{ label: current.title, to: { page: 'overview' as const, rid }, title: t(`${current.path} — 첫 화면으로`, `${current.path}: go to the start page`) }, ...(openNote ? ((): Crumb[] => {
      const topic = topics.find((x) => x.id === openNote.topics[0])
      return [topic ? { label: topic.title, to: { page: 'topic' as const, rid, tid: topic.id }, title: t('주제 화면으로', 'Go to the topic') } : { label: LOOSE_NOTES_LABEL, to: { page: 'topic' as const, rid, tid: LOOSE_TOPIC_ID }, title: t('주제가 없는 노트 — 노트들 화면으로', 'A note without a topic: go to loose notes') }]
    })()
    : route.page === 'doc' ? [{ label: t('자료', 'Materials') }, { label: route.name }]
    : route.page === 'file' ? [{ label: t('파일', 'File') }, { label: route.path }]
      : route.page === 'concept' || route.page === 'paper' ? [{ label: route.page === 'concept' ? t('개념노트', 'Concept note') : t('문헌노트', 'Literature note') }, { label: library?.notes.find((n) => n.kind === route.page && n.id === route.id)?.title ?? route.id }]
      : route.page === 'task' ? [{ label: t('기록', 'Records'), to: { page: 'records' as const, rid } }, { label: titles.get(route.task) ?? route.task }]
      : route.page === 'topic' ? [{ label: route.tid === LOOSE_TOPIC_ID ? LOOSE_NOTES_LABEL : topics.find((x) => x.id === route.tid)?.title ?? route.tid }]
      : route.page === 'part' ? ((): Crumb[] => {
        const ms = msOfFile(route.file)
        const chapter = ms?.parts.find((p) => p.file === route.file && !p.line)?.title
        // 원고의 장: 원고 › 장 (파일 경로는 쓰지 않는다)
        return [{ label: ms?.name ?? t('원고', 'Manuscript'), ...(ms && { to: { page: 'part' as const, rid, file: ms.main } }) }, ...(chapter ? [{ label: chapter }] : [])]
      })()
      : route.page === 'statement' ? [{ label: t('진술', 'Statement') }, { label: (() => { const x = summary?.statements.find((y) => y.id === route.sid); return x ? shortLabel(x) : route.sid })() }]
        : [{ label: PAGE_LABEL[route.page] ?? t('첫 화면', 'Start') }])]
  : route.page === 'kmap' ? [{ label: PAGE_LABEL.library!, to: { page: 'library' as const } }, { label: PAGE_LABEL.kmap! }]
  : route.page === 'about' && route.part ? [{ label: PAGE_LABEL.about!, to: { page: 'about' as const } }, { label: partOf(route.part).title }]
  : [{ label: PAGE_LABEL[route.page] ?? 'Emergence Workbench' }]
}

/** 원고 PDF 탭의 key. 예전에 연 탭은 key ''(이름순 첫 연구노트)일 수 있다: 적은 원고가 없으면 그 노트(목록 첫째)로 읽는다 (10/5 경로 key) */
export function msKeyOfPdfTab(t: { ms?: string }, manuscripts: ManuscriptInfo[]): string {
  const k = t.ms ?? ''
  return k === '' && !manuscripts.some((m) => m.key === '') && manuscripts[0] ? manuscripts[0].key : k
}

export function tabTitle(tab: Tab, summary: ResearchSummary | null, manuscripts: ManuscriptInfo[] = [], library: LibraryInfo | null = null, topics: Topic[] = [], ko = false): string {
  // ko: 피드백 부위 이름(data-ui-item)으로 쓸 한국어 이름
  const L = (k: string, e: string) => (ko ? k : t(k, e))
  switch (tab.k) {
    case 'overview': return L('첫 화면', 'Start')
    case 'todo':
    case 'records': return L('기록', 'Records')
    case 'info': return L('프로젝트 정보', 'Project info')
    case 'agents': return L('규칙', 'Rules')
    case 'status': return L('현황', 'Status')
    case 'changes': return L('변경사항', 'Changes')
    case 'repo': return L('저장소', 'Repository')
    case 'files': return L('저장소', 'Repository')
    case 'log': return L('기록', 'Records')
    case 'map': return L('지도', 'Map')
    case 'notes': return L('원고', 'Manuscript')
    case 'concepts': return L('개념노트', 'Concept notes')
    case 'papers': return L('문헌노트', 'Literature notes')
    case 'edits': return L('수정 검토', 'Edit review')
    case 'problems': return L('흐름', 'Flow')
    case 'statement': { const x = summary?.statements.find((y) => y.id === tab.sid); return x ? shortLabel(x) : tab.sid }
    case 'doc': return tab.name
    case 'file': return tab.path.split('/').pop()!
    case 'task': return taskTitles.get(tab.task) ?? tab.task
    case 'chat': return chatTitles.get(tab.chat) ?? L('대화', 'Conversation')
    case 'topic': return tab.tid === LOOSE_TOPIC_ID ? (ko ? LOOSE_NOTES_UI : LOOSE_NOTES_LABEL) : topics.find((x) => x.id === tab.tid)?.title ?? tab.tid
    case 'part': return manuscripts.flatMap((m) => m.parts).find((p) => p.file === tab.file && !p.line)?.title ?? manuscripts.find((m) => m.main === tab.file)?.name ?? tab.file.split('/').pop()!
    case 'mspdf': { const m = manuscripts.find((x) => x.key === msKeyOfPdfTab(tab, manuscripts)); return `${L('원고 PDF', 'Manuscript PDF')}${m ? ` · ${m.name}` : ''}` }
    case 'concept': case 'paper': return library?.notes.find((n) => n.kind === tab.k && n.id === tab.id)?.title ?? tab.id
  }
}
