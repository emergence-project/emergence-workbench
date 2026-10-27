import { LIBRARY_RID, RESEARCH_TARGET, sameNoteFile, type UiSettings } from '@rw/core'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api, subscribeEvents, type Chat, type LibraryInfo, type ManuscriptInfo, type RecordFile, type ResearchListItem, type ResearchSummary, type Topic, type WorkbenchEvent } from './api'
import { AGENT_OPEN, AgentBelow, AgentDock, AgentPanel, ChatTab, chatTitles, useAgentNotify, type AgentPlace } from './AgentChats'
import { AppUpdateRail } from './AppUpdate'
import { FeedbackMode } from './FeedbackMode'
import { AskTextHost } from './askText'
import { partOf } from './aboutContent'
import { ConceptNoteView, ConceptSidePanel } from './ConceptNotes'
import { ConceptRecordsPanel } from './ConceptRecords'
import { GLOBAL_PAGES, globalPageOf } from './globalPages'
import { RegisterDialog } from './RegisterDialog'
import { initials, projectColor, setProjectColors } from './format'
import { Icon } from './icons'
import { HomePage } from './HomePage'
import { WorkPage } from './LogPage'
import { taskTitles } from './taskView'
import { ManuscriptPdfTab, PartTab } from './Manuscript'
import { AgentEditsPage, Lazy, MapPage, prefetchLazyPages, TaskReport } from './lazyPages'
import { NotesPage } from './NotesPage'
import { NOTE_KIND_LABEL } from './NewNote'
import { LOOSE_NOTES_LABEL, LOOSE_NOTES_UI, LOOSE_TOPIC_ID } from './noteKinds'
import { shortLabel } from './notes'
import { StatementTab } from './StatementTab'
import { DocTab, MaterialsNav } from './Materials'
import { RepoFileTab } from './RepoFileTab'
import { commentsChanged, flowTarget, manuscriptTarget, OPEN_CONTEXT, targetOfTab } from './Comments'
import { figuresMaybeChanged } from './figureEmbed'
import { LibraryNoteEditor } from './Library'
import { QuickMemo } from './memo'
import { OPEN_RIGHT, setRightMode, useRightMode } from './noteScreen'
import { RecordsPanel } from './RecordsPanel'
import { recordPdfTab, recordRoute } from './recordsPanelHelpers'
import { NoInfo, NoteInfo, RightSidebar } from './RightSidebar'
import { TopBar, type Crumb } from './TopBar'
import { OverviewPage, partNumber } from './OverviewPage'
import { AgentsPage, ProjectInfoPage, RepoPage, StatusPage } from './ProjectInfoPage'
import { ChangesPage } from './ChangesPage'
import { FilesPage } from './FilesPage'
import { ProjectRailCount, useProjectIssues } from './projectIssues'
import { SearchOverlay } from './Search'
import { TopicPage } from './Topics'
import { FlowPage } from './FlowView'
import { JudgePage } from './flow/JudgePage'
import { flowTitles } from './flow/data'
import { useFlowSelection } from './flowSelection'
import { moveId, PROJECT_KIND_LABEL, railProjects } from './projectProfile'
import { railDragImage, useRailSlide } from './railDrag'
import { setFeedbackNote } from './feedbackNote'
import type { ProfilePatch } from './ProjectProfileFields'
import { go, useRoute, type Route } from './router'
import { useProjectData } from './projectData'
import { batchInvalidation, invalidationKeys, qk } from './queries'
import { recordWrites } from './useRecordActions'
import { noteOfRoute, ResearchNav } from './Sidebar'
import { store } from './store'
import { applyUi, cachedUi } from './ui'
import { FLASH_EVENT, type FlashAction, type FlashMessage } from './flash'
import { usePublishFailureFlash } from './RecordsPublish'
import { hasVisibleManuscriptEditor, isSection, manuscriptPdfTab, retargetNoteTabs, showBeside, tabKey, toggleSplit, useLayout, useWorkspaceDragging, workspaceVisibility, Workspace, type Tab, type TabRenderContext, type WorkspaceOpenRequest } from './Workspace'
import { t } from './i18n'

export type { FlashAction } from './flash'

export function App() {
  const route = useRoute()
  // 에이전트가 답을 마치거나 내 차례가 되면 맥 알림 (창을 보고 있지 않을 때)
  useAgentNotify()
  const rid = 'rid' in route ? route.rid : null
  const flowSel = useFlowSelection(rid ?? '')
  /** 연구 하나에 속하지 않는 화면: 홈과 globalPages.tsx의 화면. 연구 사이드바가 필요 없다 */
  const globalPage = route.page === 'home' || !!globalPageOf(route.page)
  const [researches, setResearches] = useState<ResearchListItem[] | null>(null)
  // 프로젝트 색: 고른 색과 자동 색이 겹치지 않게 목록 전체로 정한다 (자식이 그리기 전에)
  useMemo(() => { if (researches) setProjectColors(researches) }, [researches])
  /** 아직 화면 캐시(queries.ts)로 옮기지 않은 화면이 다시 받는 신호. 파일 알림 · 저장 뒤에 오른다 */
  const [version, setVersion] = useState(0)
  const [search, setSearch] = useState(false)
  const closeSearch = useCallback(() => setSearch(false), [])
  // 다른 화면으로 가면(뒤로 가기 포함) 검색 창을 닫는다
  useEffect(() => setSearch(false), [route])
  const [dialog, setDialog] = useState<'register' | null>(null)
  const [ui, setUi] = useState<UiSettings>(cachedUi)
  const [lastRid, setLastRid] = useState<string | null>(() => store.get('rw-last-research', null))
  useEffect(() => { if (rid) { setLastRid(rid); store.set('rw-last-research', rid) } }, [rid])
  /**
   * 화면에 제목(h1)이 따로 없으면 제목줄의 마지막 위치를 그 화면의 제목으로 알린다 (에이전트·화면 읽기 프로그램용, 보이는 모양은 그대로).
   * 화면이 자료를 읽어 와 제목을 늦게 그리기도 해서, 그려진 것을 보고 정한다
   */
  const [pageH1, setPageH1] = useState(false)
  // h1이 들어오거나 나갈 때만, 한 그림(frame)에 한 번 본다. 화면을 옮길 때도 본다(탭은 숨기기만 해서 노드가 바뀌지 않는다).
  // (10/5 리뷰: 노드가 바뀔 때마다 바로 크기를 재서 화면 하나 옮길 때 레이아웃을 네 번쯤 강제로 계산했다)
  useEffect(() => {
    let frame = 0
    const check = () => { frame = 0; setPageH1([...document.querySelectorAll('h1')].some((h) => !h.hasAttribute('role') && h.getClientRects().length > 0)) }
    const later = () => { if (!frame) frame = requestAnimationFrame(check) }
    const hasH1 = (n: Node) => n instanceof Element && (n.tagName === 'H1' || n.querySelector('h1') !== null)
    later()
    const mo = new MutationObserver((records) => { if (records.some((r) => [...r.addedNodes].some(hasH1) || [...r.removedNodes].some(hasH1))) later() })
    mo.observe(document.body, { childList: true, subtree: true })
    return () => { mo.disconnect(); cancelAnimationFrame(frame) }
  }, [route])
  const [error, setError] = useState<string | null>(null)
  const [layout, setLayout] = useLayout(rid)
  /** 에이전트 패널은 오른쪽 사이드바의 에이전트 탭이다 (10/22 안 A). 자리를 작업 화면 아래로 옮겼을 때 그 패널이 열려 있는지 */
  const [agentPanel, setAgentPanel] = useState(false)
  const rightMode = useRightMode()
  /** 패널 자리 (10/21 시안 코멘트 "아래로 내리거나 창 분할"): 오른쪽 사이드바 자리 · 작업 화면 아래. 나란히는 대화를 노트 옆 패널의 탭으로 연다 */
  const [agentPlace, setAgentPlaceState] = useState<AgentPlace>(() => store.get<AgentPlace>('rw-agent-place', 'right'))
  const setAgentPlace = (v: AgentPlace) => {
    setAgentPlaceState(v); store.set('rw-agent-place', v)
    if (v === 'right') { setAgentPanel(false); setRightMode('agent'); setLayout((l) => (l.ctx ? l : { ...l, ctx: true })) } else setAgentPanel(true)
  }
  /** 아래 자리에서 에이전트 탭을 고르면 아래 패널을 연다 */
  useEffect(() => { if (rightMode === 'agent' && agentPlace === 'bottom' && layout.ctx) setAgentPanel(true) }, [rightMode, agentPlace, layout.ctx])
  const [recordOpenRequest, setRecordOpenRequest] = useState<WorkspaceOpenRequest | null>(null)
  const workspaceDragging = useWorkspaceDragging()
  // 질문을 남기면 답이 붙는 오른쪽 사이드바를 적기 갈래로 연다 (Comments.tsx의 OPEN_CONTEXT), 노트 도구 줄의 말풍선 (noteScreen.ts의 OPEN_RIGHT)
  useEffect(() => {
    const open = () => setLayout((l) => (l.ctx ? l : { ...l, ctx: true }))
    const ask = () => { setRightMode('records'); open() }
    // 노트의 고른 글 메뉴 「에이전트에게」 (AgentChats.tsx의 sendToAgent): 오른쪽 사이드바의 에이전트 탭(아래 자리면 아래 패널)을 연다
    const agent = () => { setRightMode('agent'); if (store.get<AgentPlace>('rw-agent-place', 'right') === 'right') open(); else setAgentPanel(true) }
    window.addEventListener(OPEN_CONTEXT, ask)
    window.addEventListener(OPEN_RIGHT, open)
    window.addEventListener(AGENT_OPEN, agent)
    return () => { window.removeEventListener(OPEN_CONTEXT, ask); window.removeEventListener(OPEN_RIGHT, open); window.removeEventListener(AGENT_OPEN, agent) }
  }, [setLayout])
  const [sideOpen, setSideOpen] = useState<boolean>(() => store.get('rw-side', true))
  useEffect(() => store.set('rw-side', sideOpen), [sideOpen])
  // 프로젝트 밖 화면의 오른쪽 사이드바 (라이브러리 정보 등, globalPages.tsx의 right). 프로젝트의 것(layout.ctx)과 따로 기억한다
  const [globalRight, setGlobalRight] = useState<boolean>(() => store.get('rw-global-right', true))
  useEffect(() => store.set('rw-global-right', globalRight), [globalRight])
  const onGlobalPage = useRef(false)
  onGlobalPage.current = route.page === 'home' || !!globalPageOf(route.page)
  const [quickMemo, setQuickMemo] = useState(false)
  const [feedback, setFeedback] = useState(false)
  const closeFeedback = useCallback(() => setFeedback(false), [])
  const [toast, setToast] = useState<{ message: string; action?: FlashAction } | null>(null)
  const toastTimer = useRef<number | undefined>(undefined)
  const flash = useCallback((message: string, action?: FlashAction) => {
    setToast({ message, action })
    window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), action ? 8000 : 2200)
  }, [])
  useEffect(() => () => window.clearTimeout(toastTimer.current), [])
  useEffect(() => {
    const show = (event: Event) => { const { message, action } = (event as CustomEvent<FlashMessage>).detail; flash(message, action) }
    window.addEventListener(FLASH_EVENT, show)
    return () => window.removeEventListener(FLASH_EVENT, show)
  }, [flash])
  const bus = useMemo(() => new EventTarget(), [])
  const rapi = useMemo(() => (rid ? api.research(rid) : null), [rid])

  // ---------- 불러오기 ----------
  const [sandbox, setSandbox] = useState(false)
  // 목록은 화면 캐시(qk.researches)와 함께 둔다: 다른 화면이 그 키를 다시 받게 하면(다른 컴퓨터의 프로젝트 등록 등) 레일과 홈도 바뀐다 (10/22 맥미니 "등록을 눌렀는데 달라지는 것이 없어")
  const researchClient = useQueryClient()
  const researchList = useQuery({ queryKey: qk.researches, queryFn: () => api.researches() })
  useEffect(() => { if (researchList.data) { setResearches(researchList.data.researches); setSandbox(researchList.data.sandbox) } }, [researchList.data])
  useEffect(() => { if (researchList.error) setError(researchList.error.message) }, [researchList.error])
  const loadResearches = useCallback(() => api.researches().then((r) => { researchClient.setQueryData(qk.researches, r); setResearches(r.researches); setSandbox(r.sandbox); return r.researches }), [researchClient])
  // 따로 받는 화면은 첫 화면이 뜬 뒤 한가할 때 미리 받아 둔다 (lazyPages.tsx)
  useEffect(() => { prefetchLazyPages() }, [])

  // 요약은 화면 캐시에 프로젝트마다 둔다 (키에 프로젝트가 들어 있어 늦게 온 앞 프로젝트의 요약이 새 화면에 들어가지 않는다)
  const client = useQueryClient()
  const summaryQuery = useQuery({ queryKey: qk.summary(rid ?? ''), queryFn: () => rapi!.summary(), enabled: !!rapi })
  const summary: ResearchSummary | null = rapi ? summaryQuery.data ?? null : null
  // 프로젝트를 옮기면 앞 프로젝트의 요약 오류 문장은 지우고, 새 프로젝트의 요약 오류(캐시에 있던 것도)를 보인다
  useEffect(() => { setError(summaryQuery.error?.message ?? null) }, [rid, summaryQuery.error])
  /** 저장한 뒤: 이 프로젝트의 자료와 라이브러리를 다시 받고, 옮기지 않은 화면도 다시 받게 한다 */
  const changed = useCallback(() => {
    if (rid) void client.invalidateQueries({ queryKey: qk.project(rid) })
    void client.invalidateQueries({ queryKey: qk.library })
    setVersion((v) => v + 1)
  }, [client, rid])
  // 파일 감시 알림은 몰려서 온다 (저장 한 번, 에이전트가 파일 여러 개를 한꺼번에 바꿀 때).
  // 화면 캐시는 알림이 바꾸는 자료만 잠깐(0.4초) 모아 한 번 다시 받는다. 옮기지 않은 화면은 version을 같은 식으로 모아 올린다
  const invalidation = useMemo(() => batchInvalidation(client), [client])
  useEffect(() => () => invalidation.cancel(), [invalidation])
  const changeTimer = useRef<number | undefined>(undefined)
  const changedSoon = useCallback(() => {
    window.clearTimeout(changeTimer.current)
    changeTimer.current = window.setTimeout(() => setVersion((v) => v + 1), 400)
  }, [])
  useEffect(() => () => window.clearTimeout(changeTimer.current), [])
  const homeTimer = useRef<number | undefined>(undefined)
  const bumpHome = useCallback(() => {
    window.clearTimeout(homeTimer.current)
    homeTimer.current = window.setTimeout(() => setVersion((v) => v + 1), 400)
  }, [])
  const { library, libraryChanged, manuscripts, topics, notes, notesOf, notesChanged } = useProjectData(rid)
  // 주제를 바꿔 옮겨 간 노트(10/13 주제 폴더)를 옛 경로로 연 탭·주소는 지금 경로로 바꾼다
  const routeFile = route.page === 'part' && route.rid === rid ? route.file : null
  useEffect(() => {
    const own = notes
    if (!rid || notesOf !== rid || !own.length) return
    const files = new Set(own.map((n) => n.file))
    const moved = (file: string) => (files.has(file) ? undefined : own.find((n) => sameNoteFile(n.file, file))?.file)
    setLayout((l) => retargetNoteTabs(l, moved))
    const to = routeFile ? moved(routeFile) : undefined
    if (to) go({ page: 'part', rid, file: to })
  }, [notes, notesOf, routeFile, rid, setLayout])
  const issues = useProjectIssues(researches)
  // 기록을 저절로 올리다 실패하면 화면 아래 알림 (10/19 안 B)
  usePublishFailureFlash(rid)
  const msOfFile = (file: string) => manuscripts.find((m) => m.main === file || m.parts.some((p) => p.file === file)) ?? null
  const msKeyOfTab = (t: { ms?: string }) => msKeyOfPdfTab(t, manuscripts)
  // Document kind is display metadata; tab titles remain stable feedback targets.
  const kindOf = (tab: Tab): string | null => {
    if (tab.k === 'part' || tab.k === 'mspdf') {
      const ms = tab.k === 'part' ? msOfFile(tab.file) : manuscripts.find((m) => m.key === msKeyOfTab(tab))
      return ms ? NOTE_KIND_LABEL[ms.kind] : null
    }
    return tab.k === 'concept' ? t('개념노트', 'Concept note') : tab.k === 'paper' ? t('문헌노트', 'Literature note') : null
  }
  // 파일 변경 알림: 목록·개괄을 새로 읽는다.
  // 연결은 한 번만 연다 (화면을 옮길 때마다 다시 열면 그 사이의 알림을 놓친다). 처리는 지금 화면의 것
  const onWorkbenchEvent = useRef<(e: WorkbenchEvent) => void>(() => undefined)
  onWorkbenchEvent.current = (e: WorkbenchEvent) => {
    // 에이전트가 쓰는 중인 글: 열린 대화에 그대로 붙인다 (다시 받지 않는다)
    if (e.type === 'agent-draft') { client.setQueryData<Chat>(qk.agentChat(e.id), (c) => (c?.state === 'running' ? { ...c, draft: e.text } : c)); return }
    figuresMaybeChanged()
    // 화면 캐시: 알림이 바꾸는 자료만 (어느 프로젝트의 것이든. 홈의 프로젝트별 자료도 이것으로 새로워진다)
    invalidation.add(invalidationKeys(e))
    // 공용 라이브러리(개념노트·그림·논문)는 어느 프로젝트의 것도 아니다: 지금 화면을 잠깐 모았다가 다시 읽는다
    if (e.type === 'library') {
      // 개념노트 기록 파일(workbench/comments/concept-<id>.md)이 바뀌면 열린 기록 패널 · 본문 칠도 다시 읽는다
      const record = e.part === 'records' && /^workbench\/comments\/(concept-[^/]+)\.md$/.exec(e.file)
      if (record) commentsChanged(LIBRARY_RID, record[1]!)
      bumpHome(); return
    }
    issues.onEvent(e)
    if (e.type === 'comments') commentsChanged(e.research, e.target)
    if (e.research === rid) changedSoon()
    if (e.type === 'research') void loadResearches()
  }
  // 다시 붙었을 때(서버 재시작·잠자기 뒤): 끊긴 동안 바뀐 것을 한 번 다시 읽는다
  const onReconnect = useRef<() => void>(() => undefined)
  onReconnect.current = () => { void loadResearches().then(() => setError(null), () => undefined); void client.invalidateQueries(); changedSoon(); bumpHome() }
  useEffect(() => subscribeEvents((e: WorkbenchEvent) => {
    bus.dispatchEvent(new CustomEvent('rw', { detail: e }))
    onWorkbenchEvent.current(e)
  }, () => onReconnect.current()), [bus])

  // 화면 설정: 정본은 서버의 config.yaml. 바꾸면 바로 입히고 서버에 저장한다
  useEffect(() => { api.settings().then((u) => { setUi(u); applyUi(u) }).catch(() => undefined) }, [])
  const changeUi = useCallback((patch: Partial<UiSettings>) => {
    setUi((prev) => { const next = { ...prev, ...patch }; applyUi(next); return next })
    api.saveSettings(patch).catch((e: Error) => flash(t(`설정을 저장하지 못했습니다 — ${e.message}`, `Could not save settings: ${e.message}`)))
  }, [flash])
  /** 사이드바를 쓰는 전역 화면 (지식: 개념노트 목록) */
  const globalSide = globalPageOf(route.page)?.side
  const globalRightAble = !!globalPageOf(route.page)?.right?.(route)
  const showSide = (!globalPage && !!rid && sideOpen) || (!!globalSide && sideOpen)

  // 빠른 메모: 글을 쓰는 중이 아닐 때 M 키 (브라우저에서 ⌘M은 창 최소화라 쓰지 않는다)
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const el = document.activeElement as HTMLElement | null
      const typing = !!el && (/^(TEXTAREA|INPUT|SELECT)$/.test(el.tagName) || el.isContentEditable)
      // ⌘\ 왼쪽 사이드바, ⌥⌘\ 오른쪽 사이드바 (⌥를 누르면 e.key가 바뀌어 e.code로 본다)
      if ((e.metaKey || e.ctrlKey) && e.code === 'Backslash' && e.altKey) { e.preventDefault(); if (onGlobalPage.current) setGlobalRight((v) => !v); else setLayout((l) => ({ ...l, ctx: !l.ctx })); return }
      if ((e.metaKey || e.ctrlKey) && e.key === '\\') { e.preventDefault(); setSideOpen((v) => !v); return }
      if (typing || e.metaKey || e.ctrlKey || e.altKey || dialog || quickMemo || feedback || search) return
      // 전역 검색: "/" (⌘K는 개념노트 편집기의 명령 메뉴라 쓰지 않는다)
      if (e.key === '/') { e.preventDefault(); setSearch(true); return }
      if (!rid) return
      if (e.key === 'm' || e.key === 'M' || e.key === 'ㅡ') { e.preventDefault(); setQuickMemo(true) }
    }
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
  }, [dialog, quickMemo, feedback, search, rid, setLayout])

  // 레일의 프로젝트 버튼도 끌어서 순서를 바꾼다 (10/7 18:07). 홈 목록·카드와 같은 순서(설정)에 저장한다
  const [railDrag, setRailDrag] = useState<{ from: string | null; over: string | null }>({ from: null, over: null })
  // 10/7 18:07 피드백: 끄는 그림은 둥근 네모만, 끄는 동안 다른 버튼이 비켜나 놓일 자리를 보인다
  const railIds = railProjects(researches ?? [], rid).map((x) => x.id)
  const railShown = railDrag.from && railDrag.over ? moveId(railIds, railDrag.from, railDrag.over) : railIds
  const railBox = useRef<HTMLDivElement>(null)
  useRailSlide(railBox, railShown.join('\n'))

  if (error && !researches) return <div className="fatal">{t('서버에 연결하지 못했습니다', 'Could not connect to the server')}: {error}<p className="muted">{t('서버가 다시 켜지면 이 화면은 저절로 돌아옵니다.', 'This screen comes back by itself when the server is up again.')}</p></div>

  const current = researches?.find((r) => r.id === rid)
  /** 지금 연 노트 (연구노트 · 계산 노트) */
  const openNote = noteOfRoute(route, notes)
  setFeedbackNote(openNote && current ? `${current.title} › ${openNote.title} (${openNote.file})` : undefined)
  /**
   * 제목줄의 위치 표시 (10/5 시안 "상단바" 1번 나): 노트는 "프로젝트 › 주 주제"까지, 이름마다 그 화면으로.
   * 노트 이름은 탭 · 나무 · 본문 제목이 보이고, 파일 경로는 오른쪽 사이드바 맨 아래에 있다
   */
  const crumbs: Crumb[] = current && rid
    ? [{ label: current.title, to: { page: 'overview', rid }, title: t(`${current.path} — 첫 화면으로`, `${current.path}: go to the start page`) }, ...(openNote ? (() => {
        const topic = topics.find((x) => x.id === openNote.topics[0])
        return [topic ? { label: topic.title, to: { page: 'topic', rid, tid: topic.id } as Route, title: t('주제 화면으로', 'Go to the topic') } : { label: LOOSE_NOTES_LABEL, to: { page: 'topic', rid, tid: LOOSE_TOPIC_ID } as Route, title: t('주제가 없는 노트 — 노트들 화면으로', 'A note without a topic: go to loose notes') }]
      })()
      : route.page === 'doc' ? [{ label: t('자료', 'Materials') }, { label: route.name }]
      : route.page === 'file' ? [{ label: t('파일', 'File') }, { label: route.path }]
        : route.page === 'concept' || route.page === 'paper' ? [{ label: route.page === 'concept' ? t('개념노트', 'Concept note') : t('문헌노트', 'Literature note') }, { label: library?.notes.find((n) => n.kind === route.page && n.id === route.id)?.title ?? route.id }]
        : route.page === 'task' ? [{ label: t('기록', 'Records'), to: { page: 'records', rid } as Route }, { label: taskTitles.get(route.task) ?? route.task }]
        : route.page === 'judge' ? [{ label: t('기록', 'Records'), to: { page: 'records', rid } as Route }, { label: `${t('판단', 'Judge')} · ${flowTitles.get(route.id) ?? route.id}` }]
        : route.page === 'topic' ? [{ label: route.tid === LOOSE_TOPIC_ID ? LOOSE_NOTES_LABEL : topics.find((x) => x.id === route.tid)?.title ?? route.tid }]
        : route.page === 'part' ? (() => {
          const ms = msOfFile(route.file)
          const chapter = ms?.parts.find((p) => p.file === route.file && !p.line)?.title
          // 원고의 장: 원고 › 장 (파일 경로는 쓰지 않는다)
          return [{ label: ms?.name ?? t('원고', 'Manuscript'), ...(ms && { to: { page: 'part', rid, file: ms.main } as Route }) }, ...(chapter ? [{ label: chapter }] : [])]
        })()
        : route.page === 'statement' ? [{ label: t('진술', 'Statement') }, { label: (() => { const x = summary?.statements.find((y) => y.id === route.sid); return x ? shortLabel(x) : route.sid })() }]
          : [{ label: PAGE_LABEL[route.page] ?? t('첫 화면', 'Start') }])]
    : route.page === 'kmap' ? [{ label: PAGE_LABEL.library!, to: { page: 'library' } }, { label: PAGE_LABEL.kmap! }]
    : route.page === 'about' && route.part ? [{ label: PAGE_LABEL.about!, to: { page: 'about' } }, { label: partOf(route.part).title }]
    : [{ label: PAGE_LABEL[route.page] ?? 'Emergence Workbench' }]
  const place = [...crumbs.map((c) => c.label), ...(openNote ? [openNote.title] : [])]

  // 브라우저 탭·기록에 지금 화면이 보이게 (에이전트가 어느 화면인지 제목으로 안다). 같은 값이면 브라우저가 무시한다
  // 앱으로 설치한 창(standalone)은 브라우저가 창 제목 앞에 앱 이름을 붙이므로 화면 이름만 둔다 (10/8 "Emergence Workbench - 홈 — Emergence Workbench")
  const standalone = typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone), (display-mode: window-controls-overlay)').matches
  document.title = place[0] === 'Emergence Workbench' ? 'Emergence Workbench'
    : standalone ? [...place].reverse().join(' ‹ ')
    : `${[...place].reverse().join(' ‹ ')} — Emergence Workbench`

  /** 왼쪽 띠의 화면 버튼 (globalPages.tsx) */
  const railDragProps = (id: string) => ({
    draggable: true,
    onDragStart: (e: React.DragEvent<HTMLElement>) => {
      e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', id)
      railDragImage(e)
      setRailDrag({ from: id, over: null })
    },
    onDragEnd: () => setRailDrag({ from: null, over: null }),
    // 끄는 버튼 자신 위에서는 놓일 자리를 그대로 둔다 (자리가 바뀌며 앞뒤로 흔들리지 않게)
    onDragOver: (e: React.DragEvent) => { if (railDrag.from && id !== railDrag.from && railDrag.over !== id) setRailDrag({ ...railDrag, over: id }) },
  })
  const railDropProps = {
    onDragOver: (e: React.DragEvent) => { if (railDrag.from) e.preventDefault() },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault()
      const { from, over } = railDrag
      setRailDrag({ from: null, over: null })
      if (!from || !over || from === over || !researches) return
      // 띠에 없는 프로젝트(멈춤 · 완료)의 자리는 그대로: 전체 순서에서 옮긴다
      const ids = moveId(researches.map((x) => x.id), from, over)
      const byId = new Map(researches.map((x) => [x.id, x]))
      setResearches(ids.map((x) => byId.get(x)!))
      api.setOrder(ids).then((r) => setResearches(r.researches)).catch((err: Error) => flash(t(`순서를 저장하지 못했습니다 — ${err.message}`, `Could not save the order: ${err.message}`)))
    },
  }
  const railOn = (g: (typeof GLOBAL_PAGES)[number]) => route.page === g.page || GLOBAL_PAGES.some((x) => x.page === route.page && x.under === g.page)
  const railPage = (g: (typeof GLOBAL_PAGES)[number]) => (
    <button key={g.page} className={`rail-btn tip-right${railOn(g) ? ' on' : ''}`} aria-current={railOn(g) ? 'page' : undefined} data-ui={g.label} data-tip={g.tip} aria-label={g.aria}
      onClick={() => go(g.railTo?.() ?? ({ page: g.page } as Route))}>{g.icon}{g.badge?.(version)}</button>
  )

  /** 프로젝트 성격 · 분야 · 진행 상태 (이 컴퓨터의 설정에만) */
  const setProfile = (patch: ProfilePatch, message: string): Promise<void> => {
    if (!rid) return Promise.resolve()
    return api.setProfile(rid, patch).then(() => loadResearches()).then(() => flash(message)).catch((e: Error) => { flash(e.message); throw e })
  }
  const manuscriptOfRecord = (target: string) => manuscripts.find((m) => manuscriptTarget(undefined, m.key).target === target)
  const firstPartOfRecord = (target: string) => manuscriptOfRecord(target)?.parts[0]?.file
  const openRecordPdf = (file: RecordFile) => {
    if (!rid) return false
    const destination = recordRoute(rid, file, firstPartOfRecord)
    const tab = recordPdfTab(file, (target) => manuscriptOfRecord(target)?.key)
    if (!destination || !tab) return false
    setRecordOpenRequest({ route: destination, tab })
    go(destination)
    return true
  }
  /** 작업 화면의 탭 하나를 그린다 */
  const renderTab = (t: Tab, context?: TabRenderContext) => {
    if (!rid || !summary || !rapi) return null
    switch (t.k) {
      case 'doc': return <DocTab rid={rid} name={t.name} rapi={rapi} />
      case 'file': return <RepoFileTab key={`${rid}/${t.path}`} rid={rid} path={t.path} />
      case 'part': return <PartTab key={`${rid}/${t.file}`} rid={rid} file={t.file} info={msOfFile(t.file)} rapi={rapi} summary={summary} bus={bus} onSaved={flash} library={library} onLibraryChanged={libraryChanged}
        row={notes.find((n) => n.file === t.file) ?? null} tocOwner={context?.focused ? tabKey(t) : null} onChanged={() => { changed(); notesChanged() }}
        onShowPdf={() => setLayout((l) => showBeside(l, manuscriptPdfTab(msOfFile(t.file)?.key ?? ''), tabKey(t)))} />
      case 'concept': case 'paper':
        // Markdown 개념노트는 읽기 화면 (2026-10-04 재설계), LaTeX 노트는 예전 편집기.
        // 프로젝트 안에서는 메모·연결이 늘 앱의 맥락 칸에 있다: 맥락 칸을 끄면 숨는다 (10/4 19:17 "끄면 하단으로 가" — 노트 안 칸으로 바뀌어 좁은 칸에서 아래로 내려갔다)
        if (t.k === 'concept' && library?.notes.find((n) => n.kind === 'concept' && n.id === t.id)?.format === 'md') return <ConceptNoteView key={`md/${t.id}`} id={t.id} info={library} rid={rid} project={summary.research.title} side="external" tocOwner={context?.focused ? tabKey(t) : null} onChanged={libraryChanged} onSaved={flash} />
        return <LibraryNoteEditor key={`${t.k}/${t.id}`} kind={t.k} id={t.id} info={library} rid={rid} project={summary.research.title} onChanged={libraryChanged} onSaved={flash} />
      case 'mspdf': return <ManuscriptPdfTab key={msKeyOfTab(t)} rid={rid} info={manuscripts.find((m) => m.key === msKeyOfTab(t)) ?? null} rapi={rapi} onSaved={flash} version={version}
        active={context?.active ?? false} pairedEditor={hasVisibleManuscriptEditor(context?.visibleTabs ?? [], msKeyOfTab(t), (file) => msOfFile(file)?.key)} />
      // 옛 작업 탭(todo)은 기록 화면으로 합쳤다 (10/21): 남은 탭도 기록을 연다
      case 'todo': case 'records': return <WorkPage key="records" rid={rid} rapi={rapi} summary={summary} notes={notes} topics={topics} onSaved={flash} firstPartOf={firstPartOfRecord} onOpenPdf={openRecordPdf} version={version} />
      case 'log': return <WorkPage key="log" rid={rid} rapi={rapi} summary={summary} notes={notes} topics={topics} onSaved={flash} firstPartOf={firstPartOfRecord} onOpenPdf={openRecordPdf} focus="log" />
      case 'map': return <Lazy><MapPage key={rid} rid={rid} summary={summary} notes={notes} /></Lazy>
      case 'flow': return <FlowPage key={rid} rid={rid} topic={route.page === 'flow' ? route.topic : undefined} notes={notes} topics={topics.map((x) => ({ id: x.id, title: x.title }))} />
      case 'edits': return <Lazy><AgentEditsPage key={rid} rid={rid} selected={route.page === 'edits' ? route.key : undefined} version={version} onSaved={flash} /></Lazy>
      case 'chat': {
        // 대화 탭에는 다른 패널에서 보는 노트가 붙는다
        const at = layout.panes.findIndex((p) => p.tabs.some((x) => tabKey(x) === tabKey(t)))
        const n = at === -1 ? undefined : noteOfPane(1 - at)
        return <ChatTab key={t.chat} id={t.chat} auto={n && { kind: 'note', ref: n.file, label: n.title }} onSaved={flash} />
      }
      case 'task': return <Lazy><TaskReport key={`${rid}/${t.task}`} rid={rid} id={t.task} version={version} project={current?.title ?? summary.research.title} topics={topics} onSaved={flash} tocOwner={context?.focused ? tabKey(t) : null} /></Lazy>
      case 'judge': return <JudgePage key={`${rid}/${t.id}`} rid={rid} id={t.id} notes={notes} onSaved={flash} />
      case 'topic': return <TopicPage key={t.tid} rid={rid} rapi={rapi} tid={t.tid} notes={notes} manuscripts={manuscripts} project={current?.title ?? summary.research.title} pc={projectColor(rid)}
        version={version} onChanged={() => { changed(); notesChanged() }} onSaved={flash} />
      case 'notes': case 'concepts': case 'papers': return <NotesPage key={t.k} show={t.k} rid={rid} rapi={rapi} summary={summary} notes={notes} manuscripts={manuscripts} library={library} onChanged={changed} onLibraryChanged={libraryChanged} onSaved={flash} />
      case 'statement': return <StatementTab key={`${rid}/${t.sid}`} rid={rid} sid={t.sid} rapi={rapi} summary={summary} notes={notes} bus={bus} onChanged={changed} />
      case 'agents': return <AgentsPage key="agents" rid={rid} rapi={rapi} version={version} />
      case 'status': return <StatusPage key="status" rid={rid} rapi={rapi} />
      case 'changes': return <ChangesPage key="changes" rid={rid} />
      case 'repo': return <RepoPage key="repo" rid={rid} rapi={rapi} root={summary.root} version={version} />
      case 'files': return <FilesPage key="files" rid={rid} />
      case 'info': return (
        <ProjectInfoPage rid={rid} rapi={rapi} summary={summary} notes={notes} manuscripts={manuscripts}
          project={current} all={researches ?? []} onProfile={setProfile}
          onChanged={() => { changed(); void loadResearches() }} onSaved={flash} />
      )
      case 'overview': return (
        <OverviewPage rid={rid} rapi={rapi} summary={summary} notes={notes} project={current?.title ?? summary.research.title} pc={projectColor(rid)} anchor={route.page === 'overview' ? route.anchor : undefined}
          listed={current} all={researches ?? []} onProfile={setProfile}
          onChanged={() => { changed(); notesChanged() }} onSaved={flash} />
      )
    }
  }

  /** 지금 칸에서 보는 노트 (에이전트 입력란에 저절로 붙는다) */
  const noteOfPane = (i: number) => {
    const p = layout.panes[i]
    const t = isSection(route.page) && i === (layout.split ? layout.focus : 0) ? undefined : p?.tabs.find((x) => tabKey(x) === p.active)
    const row = t?.k === 'part' ? notes.find((n) => n.file === t.file) : undefined
    return row ? { file: row.file, title: row.title } : t?.k === 'part' ? { file: t.file, title: tabTitle(t, summary, manuscripts, library, topics) } : undefined
  }
  const agentNote = noteOfPane(layout.split ? layout.focus : 0)
  /** 나란히: 대화를 다른 칸의 탭으로 열고 패널은 닫는다 */
  const openChatBeside = (id: string) => {
    setLayout((l) => { const p = l.panes[l.split ? l.focus : 0]; return showBeside(l, { k: 'chat', chat: id }, p.active ?? '') })
    setAgentPanel(false)
    if (rightMode === 'agent') setRightMode('info')
  }
  const agentPanelOf = (key: string) => rid ? <AgentPanel key={key} rid={rid} note={agentNote} onSaved={flash} place={agentPlace} onPlace={setAgentPlace} onBeside={openChatBeside} /> : null

  return (
    <div className={`shell${sandbox ? ' sandbox' : ''}`}>
      {sandbox && (
        <div className="sandbox-bar" role="note" data-ui="예제 모드 띠">
          {t('개발용 예제 모드 — 설정과 연구는 저장소 안 .sandbox/ 복사본입니다. 내 연구로 쓰려면 터미널에서 ', 'Sample mode for development: settings and projects are copies in .sandbox/ inside the repository. To use it for your own projects, run ')}<code>zsh scripts/install.sh</code>{t('을 한 번 하고 주소 :5174를 여세요.', ' once in the terminal and open port :5174.')}
        </div>
      )}
      <TopBar crumbs={crumbs} heading={!pageH1} leftToggle={(!!rid && !globalPage) || !!globalSide} sideOpen={sideOpen} onSide={() => setSideOpen((v) => !v)}
        project={!!rid && !globalPage} split={workspaceVisibility(layout, route.page, workspaceDragging).shown.length === 2} onSplit={() => setLayout((l) => toggleSplit(l, route.page))} rightToggle={(!!rid && !globalPage) || globalRightAble}
        rightOpen={globalPage ? globalRight : layout.ctx} onRight={() => { if (globalPage) setGlobalRight((v) => !v); else setLayout((l) => ({ ...l, ctx: !l.ctx })) }}
        search={search} onSearch={() => setSearch(true)}
        feedback={feedback} onFeedback={() => setFeedback((v) => !v)} />

      <div className={`body${showSide ? '' : ' no-side'}`}>
        <nav className="rail" aria-label={t('공간', 'Spaces')} data-ui="왼쪽 띠">
          <button className={`rail-btn tip-right${route.page === 'home' ? ' on' : ''}`} aria-current={route.page === 'home' ? 'page' : undefined} data-ui="홈" data-tip={t('홈 — 모든 프로젝트', 'Home: all projects')} aria-label={t('홈', 'Home')} onClick={() => go({ page: 'home' })}>{Icon.home}</button>
          {GLOBAL_PAGES.filter((g) => g.rail === 'home').map(railPage)}
          <span className="rail-hr" />
          <div ref={railBox} className="rail-projects" data-ui="프로젝트 버튼들" {...railDropProps}>
            {railShown.map((id) => researches!.find((x) => x.id === id)!).map((r) => (
              <button key={r.id} data-rid={r.id} className={`rail-proj${r.id === rid ? ' on' : ''}${r.available ? '' : ' off'}${railDrag.from === r.id && railDrag.over ? ' lifted' : ''}`} aria-current={r.id === rid ? 'true' : undefined} style={{ ['--pc' as string]: projectColor(r.id) }}
                {...railDragProps(r.id)}
                data-ui="프로젝트 버튼" data-ui-item={r.title} data-tip={`${r.title}  ${PROJECT_KIND_LABEL[r.kind]}${r.fields.length ? ` ${r.fields.map((t) => `#${t}`).join(' ')}` : ''}`} aria-label={r.title}
                onClick={() => go({ page: 'overview', rid: r.id })}>{initials(r.title)}<ProjectRailCount n={issues.counts[r.id]} tasks={issues.tasks[r.id]} edits={issues.edits[r.id]} records={issues.records[r.id]} /></button>
            ))}
            <button className="rail-proj add" data-ui="프로젝트 등록" data-tip={t('프로젝트 등록', 'Register project')} aria-label={t('프로젝트 등록', 'Register project')} onClick={() => setDialog('register')}>＋</button>
          </div>
          <span className="rail-hr" />
          {GLOBAL_PAGES.filter((g) => g.rail === 'top').map(railPage)}
          <span className="sp" />
          <AppUpdateRail />
          {GLOBAL_PAGES.filter((g) => g.rail === 'bottom').map(railPage)}
        </nav>

        {showSide && <aside className="side" data-ui="사이드바">
          {globalSide ? (
            <div className="side-scroll">{globalSide({ route, version, library, onLibraryChanged: libraryChanged, ui, onUi: changeUi, onSaved: flash, rightOpen: globalRightAble && globalRight })}</div>
          ) : current && <>
            {/* 프로젝트 이름은 제목줄에만 둔다 (10/3 피드백: 중복 없애기) */}
            <div className="side-scroll project-side-scroll">
              {summary && rapi ? <ResearchNav rid={current.id} rapi={rapi} route={route} askCount={issues.records[current.id] ?? 0} manuscripts={manuscripts} topics={topics} notes={notes}
                materials={rapi && <MaterialsNav rid={current.id} rapi={rapi} route={route} onSaved={flash} library={library} onLibraryChanged={libraryChanged} />} /> : <div className="empty space-empty">{current.problem ?? t('불러오는 중…', 'Loading…')}</div>}
            </div>
          </>}
        </aside>}

        {globalPageOf(route.page) ? (
          globalPageOf(route.page)!.render({ route, version, library, onLibraryChanged: libraryChanged, ui, onUi: changeUi, onSaved: flash, rightOpen: globalRightAble && globalRight })
        ) : route.page === 'home' ? (
          researches ? <HomePage researches={researches} issues={issues.counts} judgeTasks={issues.tasks} agentEdits={issues.edits} askRecords={issues.records} onReordered={(list) => setResearches(list)} onRegister={() => setDialog('register')} onSaved={flash} /> : <main className="stage full"><section className="pane"><div className="page-body"><p className="muted">{error ?? t('불러오는 중…', 'Loading…')}</p></div></section></main>
        ) : !rid || !summary || !rapi ? (
          <main className="stage full">
            <section className="pane">
              <div className="page-body">
                {researches?.length === 0
                  ? <>
                    <h1 className="h-title">Emergence Workbench</h1>
                    <p className="h-sub">{t('연구 저장소를 등록해 시작하세요. 저장소는 옮기지 않고, 그 안에 workbench/ 폴더만 만듭니다.', 'Register a research repository to start. The repository stays where it is; only a workbench/ folder is created inside it.')}</p>
                    <div><button className="btn primary" onClick={() => setDialog('register')}>{t('연구 등록', 'Register project')}</button></div>
                  </>
                  : <p className="muted">{error ?? t('불러오는 중…', 'Loading…')}</p>}
              </div>
            </section>
          </main>
        ) : (
          <div className="ws-col"><Workspace kindOf={kindOf} rid={rid}
            ownPdfOf={(t) => { const m = t.k === 'part' ? msOfFile(t.file) : null; return m && m.kind !== 'paper' && m.main === (t as { file: string }).file ? manuscriptPdfTab(m.key) : null }} route={route} layout={layout} setLayout={setLayout} dragging={workspaceDragging}
            openRequest={recordOpenRequest} onOpened={() => setRecordOpenRequest(null)} onCloseFailed={flash}
            titleOf={(t) => tabTitle(t, summary, manuscripts, library, topics)}
            uiTitleOf={(t) => tabTitle(t, summary, manuscripts, library, topics, true)}
            renderTab={renderTab}
            home={renderTab({ k: isSection(route.page) ? route.page : 'overview' })}
            context={(() => {
              // 오른쪽 사이드바 (10/5 시안): 지금 칸에서 보고 있는 노트(편집이든 결과 PDF든)에 대해 정보 | 적기
              const p = layout.panes[layout.split ? layout.focus : 0]
              const t = isSection(route.page) ? undefined : p.tabs.find((x) => tabKey(x) === p.active)
              const tabName = (x: Tab) => tabTitle(x, summary, manuscripts, library, topics)
              // LaTeX 노트·원고의 코멘트는 그 원고 PDF에 남긴 것
              const ct = targetOfTab(t, tabName) ?? (t?.k === 'part' && msOfFile(t.file) ? manuscriptTarget(msOfFile(t.file)!.name, msOfFile(t.file)!.key || undefined) : null)
                ?? (route.page === 'flow' && flowSel ? flowTarget(flowSel.id, flowSel.title) : null)
              // 흐름 화면: 흐름 점의 기록을 모두 한 목록에 (10/20 사용자: 점을 누를 때마다 나뉘어 보기 어렵다). 적기는 고른 점에
              const flowRecords = route.page === 'flow'
              const row = t?.k === 'part' ? notes.find((n) => n.file === t.file) : undefined
              // 개념노트 탭이면 그 노트의 메모·연결 (2026-10-04 15:18 피드백: 오른쪽 사이드바에서)
              const cmd = t?.k === 'concept' && library?.notes.find((n) => n.kind === 'concept' && n.id === t.id)?.format === 'md' ? t.id : undefined
              const info = cmd ? <div className="cn-ctx"><ConceptSidePanel key={cmd} id={cmd} info={library} rid={rid} project={summary.research.title} slot onChanged={libraryChanged} onSaved={flash} /></div>
                : row ? <NoteInfo key={row.file} rid={rid} row={row} topics={topics} projectKind={current?.kind ?? 'research'} version={version}
                  onChanged={() => { notesChanged(); changed() }} onSaved={flash} />
                  : <NoInfo />
              // 개념노트의 기록은 라이브러리 기록 파일 (workbench/comments/concept-<id>.md, 10/18): 프로젝트 기록과 같은 패널
              // 에이전트 탭 (10/22 안 A): 자리가 아래면 그 패널을 가리킨다
              const agent = agentPlace === 'right' ? agentPanelOf(rid) : <AgentBelow open={agentPanel} onOpen={setAgentPanel} onHere={() => setAgentPlace('right')} />
              return <RightSidebar info={info} agent={agent}
                records={cmd ? <ConceptRecordsPanel key={cmd} id={cmd} title={library?.notes.find((n) => n.kind === 'concept' && n.id === cmd)?.title ?? cmd} /> : <RecordsPanel key={`${rid}|${flowRecords ? 'flow' : ct?.target ?? 'project'}`} rid={rid}
                  target={ct ?? { target: 'project', title: summary.research.title }} group={flowRecords ? 'flow-' : undefined}
                  firstPartOf={firstPartOfRecord} onOpenPdf={openRecordPdf} />} />
            })()} />
          {agentPanel && agentPlace === 'bottom' && <AgentDock>{agentPanelOf(`${rid}-dock`)}</AgentDock>}</div>
        )}
      </div>

      {quickMemo && rapi && summary && (() => {
        const target = RESEARCH_TARGET
        const label = t('이 프로젝트', 'This project')
        return (
          <QuickMemo target={target} targetLabel={label} onClose={() => setQuickMemo(false)}
            onSave={async (kind, text, to) => {
              // 할 일의 정본은 기록 파일 (2026-10-16). 메모는 오늘 일지에
              if (kind === 'todo') {
                const place = { target: 'project', title: summary.research.title }
                await recordWrites(summary.id).add(place.target, { kind: '할 일', text, ...place })
              } else await rapi.addJournal(kind, text, to)
              changed()
              flash(kind === 'todo' ? t(`할 일 저장됨 — 기록 · ${label}`, `To-do saved to records · ${label}`) : t(`메모 저장됨 — 오늘 일지 · ${label}`, `Memo saved to today\'s journal · ${label}`))
            }} />
        )
      })()}
      {feedback && <FeedbackMode onClose={closeFeedback} onSaved={flash} />}
      {search && <SearchOverlay rid={rid} onClose={closeSearch} />}
      <AskTextHost />
      <div className={`toast${toast ? ' show' : ''}`} role="status" data-feedback-ui>
        {toast?.message}
        {toast?.action && <> · <button type="button" className="a toast-action" data-ui="되돌리기 버튼" onClick={() => {
          window.clearTimeout(toastTimer.current)
          setToast(null)
          toast.action?.run()
        }}>{toast.action.label}</button></>}
      </div>
      {dialog === 'register' && (
        <RegisterDialog sandbox={sandbox} all={researches ?? []} onClose={() => setDialog(null)} onRegistered={(id) => {
          setDialog(null)
          void loadResearches().then(() => go({ page: 'overview', rid: id }))
        }} />
      )}
    </div>
  )
}

const PAGE_LABEL: Partial<Record<Route['page'], string>> = {
  home: t('홈', 'Home'), overview: t('첫 화면', 'Start'), info: t('프로젝트 정보', 'Project info'), agents: t('규칙', 'Rules'), status: t('현황', 'Status'), changes: t('변경사항', 'Changes'), repo: t('저장소', 'Repository'), files: t('파일', 'Files'), notes: t('원고', 'Manuscript'), concepts: t('개념노트', 'Concept notes'), papers: t('문헌노트', 'Literature notes'), todo: t('작업', 'Work'), records: t('기록', 'Records'), log: t('작업', 'Work'), map: t('지도', 'Map'), edits: t('수정 검토', 'Edit review'), flow: t('흐름', 'Flow'),
  ...Object.fromEntries(GLOBAL_PAGES.map((g) => [g.page, g.name])),
}

/** 원고 PDF 탭의 key. 예전에 연 탭은 key ''(이름순 첫 연구노트)일 수 있다: 적은 원고가 없으면 그 노트(목록 첫째)로 읽는다 (10/5 경로 key) */
function msKeyOfPdfTab(t: { ms?: string }, manuscripts: ManuscriptInfo[]): string {
  const k = t.ms ?? ''
  return k === '' && !manuscripts.some((m) => m.key === '') && manuscripts[0] ? manuscripts[0].key : k
}

function tabTitle(tab: Tab, summary: ResearchSummary | null, manuscripts: ManuscriptInfo[] = [], library: LibraryInfo | null = null, topics: Topic[] = [], ko = false): string {
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
    case 'files': return L('파일', 'Files')
    case 'log': return L('기록', 'Records')
    case 'map': return L('지도', 'Map')
    case 'notes': return L('원고', 'Manuscript')
    case 'concepts': return L('개념노트', 'Concept notes')
    case 'papers': return L('문헌노트', 'Literature notes')
    case 'edits': return L('수정 검토', 'Edit review')
    case 'flow': return L('흐름', 'Flow')
    case 'statement': { const x = summary?.statements.find((y) => y.id === tab.sid); return x ? shortLabel(x) : tab.sid }
    case 'doc': return tab.name
    case 'file': return tab.path.split('/').pop()!
    case 'task': return taskTitles.get(tab.task) ?? tab.task
    case 'judge': return `${L('판단', 'Judge')} · ${flowTitles.get(tab.id) ?? tab.id}`
    case 'chat': return chatTitles.get(tab.chat) ?? L('대화', 'Conversation')
    case 'topic': return tab.tid === LOOSE_TOPIC_ID ? (ko ? LOOSE_NOTES_UI : LOOSE_NOTES_LABEL) : topics.find((x) => x.id === tab.tid)?.title ?? tab.tid
    case 'part': return manuscripts.flatMap((m) => m.parts).find((p) => p.file === tab.file && !p.line)?.title ?? manuscripts.find((m) => m.main === tab.file)?.name ?? tab.file.split('/').pop()!
    case 'mspdf': { const m = manuscripts.find((x) => x.key === msKeyOfPdfTab(tab, manuscripts)); return `${L('원고 PDF', 'Manuscript PDF')}${m ? ` · ${m.name}` : ''}` }
    case 'concept': case 'paper': return library?.notes.find((n) => n.kind === tab.k && n.id === tab.id)?.title ?? tab.id
  }
}
