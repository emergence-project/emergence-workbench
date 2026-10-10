import { useEffect, useMemo, useState, type DragEvent, type ReactNode } from 'react'
import { api, type ProjectState, type RepoSync, type ResearchListItem } from './api'
import { CardImage } from './CardImage'
import { cardTime, TagLine } from './cardParts'
import { initials, projectColor } from './format'
import { deadlines, doneByDay, type Loaded } from './homeData'
import { Icon } from './icons'
import { attentionOf, filterProjects, issueTip, KIND_FILTERS, kindFilterLabel, lastWorkMs, moveId, PROJECT_KIND_LABEL, PROJECT_STATE_LABEL, PROJECT_STATES, stateCounts, type AttentionMark, type KindFilter } from './projectProfile'
import { ProjectStateDot } from './ProjectProfileFields'
import { go } from './router'
import { WeekCalendar } from './WeekCalendar'
import { t, plural, locale } from './i18n'

export { oldestFirst } from './homeData'

/**
 * 홈 (10/5 시안 "홈"): 프로젝트 목록(기본) · 카드 보기 → "한 일 달력"(한 주).
 * 거르기는 왼쪽 성격(전체 · 연구 · 업무), 오른쪽 진행 상태(진행 · 멈춤 · 완료). 분야는 보이기만.
 * 상태 기호: 주황 점 = 확인 필요(첫 화면의 확인이 필요한 노트 + 판단할 맡긴 일, 왼쪽 띠의 수와 같음), 돌아가는 화살표 = 업데이트 필요(GitHub에 받을 새 커밋).
 * 순서는 카드 왼쪽 색 영역(목록은 머리 글자 네모)을 잡아 끌어 바꾸고, 왼쪽 띠도 그 순서를 따른다.
 */
type View = 'list' | 'card'
const VIEW_KEY = 'rw-home-view'
const KIND_KEY = 'rw-home-kind'
const STATE_KEY = 'rw-home-state'
const read = <T extends string>(key: string, ok: readonly T[], fallback: T): T => {
  try { const v = localStorage.getItem(key) as T | null; return v && ok.includes(v) ? v : fallback } catch { return fallback }
}
const remember = (key: string, v: string) => { try { localStorage.setItem(key, v) } catch { /* 기억 못 해도 된다 */ } }

export function HomePage({ researches: all, issues, judgeTasks = {}, agentEdits = {}, version, onReordered, onRegister, onSaved }: {
  researches: ResearchListItem[]
  /** 프로젝트마다 확인이 필요한 보조 노트 수 (왼쪽 띠의 수) */
  issues: Record<string, number>
  /** issues 가운데 판단할 맡긴 일의 수 (툴팁 내역) */
  judgeTasks?: Record<string, number>
  /** issues 가운데 에이전트 고침 검토 · 고치기 요청의 수 (툴팁 내역, 10/8) */
  agentEdits?: Record<string, number>
  version: number
  onReordered(list: ResearchListItem[]): void
  onRegister(): void
  onSaved(msg: string): void
}) {
  const [loaded, setLoaded] = useState<Record<string, Loaded | Error>>({})
  const [syncs, setSyncs] = useState<Record<string, RepoSync | null>>({})
  const [view, setViewState] = useState<View>(() => read(VIEW_KEY, ['list', 'card'] as const, 'list'))
  const [kind, setKindState] = useState<KindFilter>(() => read(KIND_KEY, KIND_FILTERS, 'all'))
  const [state, setStateState] = useState<ProjectState>(() => read(STATE_KEY, PROJECT_STATES, 'active'))
  const setView = (v: View) => { setViewState(v); remember(VIEW_KEY, v) }
  const setKind = (v: KindFilter) => { setKindState(v); remember(KIND_KEY, v) }
  const setState = (v: ProjectState) => { setStateState(v); remember(STATE_KEY, v) }

  // 순서만 바뀐 것(카드 끌기)으로는 다시 읽지 않는다: 프로젝트마다 요약·일지·git fetch를 하므로
  const availableIds = all.filter((x) => x.available).map((x) => x.id).sort().join('\n')
  useEffect(() => {
    for (const r of all.filter((x) => x.available)) {
      const rapi = api.research(r.id)
      Promise.all([rapi.summary(), rapi.journal(365)])
        .then(([summary, j]) => setLoaded((prev) => ({ ...prev, [r.id]: { summary, entries: j.entries } })))
        .catch((e: Error) => setLoaded((prev) => ({ ...prev, [r.id]: e })))
      rapi.sync(true).then((s) => setSyncs((prev) => ({ ...prev, [r.id]: s }))).catch(() => setSyncs((prev) => ({ ...prev, [r.id]: null })))
    }
  }, [availableIds, version]) // eslint-disable-line react-hooks/exhaustive-deps

  const counts = useMemo(() => stateCounts(all, kind), [all, kind])
  const shown = useMemo(() => filterProjects(all, kind, state), [all, kind, state])
  const byDay = useMemo(() => doneByDay(shown, loaded), [shown, loaded])
  const dues = useMemo(() => deadlines(shown, loaded), [shown, loaded])

  // 끌어서 순서 바꾸기: 끄는 동안 놓을 자리를 표시하고, 놓으면 설정에 저장한다
  const [dragging, setDragging] = useState<string | null>(null)
  const [over, setOver] = useState<string | null>(null)
  const drop = (to: string) => {
    const from = dragging
    setDragging(null); setOver(null)
    if (!from || from === to) return
    const ids = moveId(all.map((r) => r.id), from, to)
    const byId = new Map(all.map((r) => [r.id, r]))
    onReordered(ids.map((id) => byId.get(id)!))
    api.setOrder(ids).then((r) => onReordered(r.researches)).catch((e: Error) => onSaved(t(`순서를 저장하지 못했습니다 — ${e.message}`, `Could not save the order: ${e.message}`)))
  }
  const dragProps = (id: string) => ({
    draggable: true,
    onDragStart: (e: DragEvent) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', id); setDragging(id) },
    onDragEnd: () => { setDragging(null); setOver(null) },
  })
  const dropProps = (id: string) => ({
    onDragOver: (e: DragEvent) => { if (dragging) { e.preventDefault(); if (over !== id) setOver(id) } },
    onDrop: (e: DragEvent) => { e.preventDefault(); drop(id) },
  })

  const update = (rid: string) => {
    api.research(rid).update().then((s) => { setSyncs((prev) => ({ ...prev, [rid]: s })); onSaved(t('GitHub의 새 커밋을 받았습니다', 'Pulled new commits from GitHub')) })
      .catch((e: Error) => onSaved(t(`받지 못했습니다 — ${e.message}`, `Could not pull: ${e.message}`)))
  }
  const rowOf = (r: ResearchListItem): ProjectRowData => {
    const l = loaded[r.id]
    const sync = syncs[r.id]
    return {
      r,
      question: l && !(l instanceof Error) ? l.summary.research.question : '',
      image: l && !(l instanceof Error) ? l.summary.research.image : undefined,
      last: l && !(l instanceof Error) ? lastWorkMs(l.summary, l.entries) : undefined,
      error: l instanceof Error ? l.message : r.problem,
      mark: attentionOf(issues[r.id] ?? 0, sync?.behind ?? 0),
      issues: issues[r.id] ?? 0,
      tasks: judgeTasks[r.id] ?? 0,
      edits: agentEdits[r.id] ?? 0,
      sync: sync ?? null,
      onUpdate: () => update(r.id),
      drag: dragProps(r.id), dropTarget: dropProps(r.id),
      dragging: dragging === r.id, over: over === r.id && dragging !== r.id,
    }
  }

  return (
    <main className="stage full" data-ui="홈">
      <section className="pane">
        <div className="pane-head" data-ui="머리줄">
          <span className="crumb" data-ui="위치 표시">{t(`${new Date().getMonth() + 1}월 ${new Date().getDate()}일`, new Date().toLocaleDateString(locale(), { month: 'short', day: 'numeric' }))}</span>
        </div>
        <div className="scroll">
          <div className="page-body home-body">
            {all.length === 0 && (
              <p className="h-sub" data-ui="첫 안내">{t('연구 저장소를 등록해 시작하세요. 저장소는 옮기지 않고, 그 안에 workbench/ 폴더만 만듭니다.', 'Register a research repository to start. The repository is not moved; only a workbench/ folder is created inside it.')}</p>
            )}
            <section className="home-projects" data-ui="프로젝트 카드">
              <div className="sec-head hp-head">
                <h2>{t('프로젝트', 'Projects')}</h2>
                <div className="segmented hp-view" role="radiogroup" aria-label={t('보기', 'View')} data-ui="보기 고르기">
                  {(['list', 'card'] as const).map((v) => (
                    <button key={v} role="radio" aria-checked={view === v} className={view === v ? 'on' : ''} onClick={() => setView(v)}>{v === 'list' ? t('목록', 'List') : t('카드', 'Cards')}</button>
                  ))}
                </div>
              </div>
              {all.length > 0 && (
                <div className="hp-filters">
                  <div className="segmented" role="radiogroup" aria-label={t('성격 필터', 'Kind filter')} data-ui="성격 거르기">
                    {KIND_FILTERS.map((k) => <button key={k} role="radio" aria-checked={kind === k} className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>{kindFilterLabel(k)}</button>)}
                  </div>
                  <div className="segmented" role="radiogroup" aria-label={t('진행 상태 필터', 'Status filter')} data-ui="진행 상태 거르기">
                    {PROJECT_STATES.map((s) => <button key={s} role="radio" aria-checked={state === s} className={state === s ? 'on' : ''} onClick={() => setState(s)}>{PROJECT_STATE_LABEL[s]} <span className="count">{counts[s]}</span></button>)}
                  </div>
                </div>
              )}
              {view === 'list' ? (
                <div className="hp-list" role="table" aria-label={t('프로젝트 목록', 'Project list')} data-ui="카드 목록">
                  <div className="hp-row hp-th" role="row">
                    <span role="columnheader">{t('상태', 'Status')}</span><span role="columnheader">{t('프로젝트', 'Project')}</span><span role="columnheader">{t('분야', 'Field')}</span><span role="columnheader" className="hp-time">{t('최근 작업', 'Last worked')}</span>
                  </div>
                  {shown.map((r) => <ProjectRow key={r.id} {...rowOf(r)} />)}
                  {shown.length === 0 && all.length > 0 && <p className="hp-empty muted">{t(`${PROJECT_STATE_LABEL[state]} 중인 ${kind === 'all' ? '' : `${PROJECT_KIND_LABEL[kind]} `}프로젝트가 없습니다.`, `No ${kind === 'all' ? '' : `${PROJECT_KIND_LABEL[kind].toLowerCase()} `}projects with status "${PROJECT_STATE_LABEL[state]}".`)}</p>}
                  <button className="hp-row hp-add" data-ui="연구 등록 카드" title={t('GitHub 저장소나 이 컴퓨터 폴더에서', 'From a GitHub repository or a folder on this computer')} onClick={onRegister}>{t('＋ 프로젝트 등록', '＋ Register project')}</button>
                </div>
              ) : (
                <div className="hp-cards" data-ui="카드 목록">
                  {shown.map((r) => <ProjectCard key={r.id} {...rowOf(r)} />)}
                  <button className="card add-card hp-add-card" data-ui="연구 등록 카드" title={t('GitHub 저장소나 이 컴퓨터 폴더에서', 'From a GitHub repository or a folder on this computer')} onClick={onRegister}>
                    <span className="t">{t('＋ 프로젝트 등록', '＋ Register project')}</span>
                  </button>
                </div>
              )}
              {all.length > 0 && <Legend view={view} />}
            </section>
            {shown.length > 0 && <WeekCalendar byDay={byDay} deadlines={dues} onCopied={onSaved} />}
          </div>
        </div>
      </section>
    </main>
  )
}

interface ProjectRowData {
  r: ResearchListItem
  question: string
  image?: string
  last?: number
  error?: string
  mark: AttentionMark
  issues: number
  /** issues 가운데 판단할 맡긴 일 */
  tasks?: number
  /** issues 가운데 에이전트 고침 */
  edits?: number
  sync: RepoSync | null
  onUpdate(): void
  drag: { draggable: boolean; onDragStart(e: DragEvent): void; onDragEnd(): void }
  dropTarget: { onDragOver(e: DragEvent): void; onDrop(e: DragEvent): void }
  dragging: boolean
  over: boolean
}

const open = (r: ResearchListItem) => { if (r.available) go({ page: 'overview', rid: r.id }) }
const linkProps = (r: ResearchListItem) => ({
  role: 'link' as const, tabIndex: r.available ? 0 : -1,
  onClick: () => open(r),
  onKeyDown: (e: React.KeyboardEvent) => { if (e.key === 'Enter' && e.target === e.currentTarget) open(r) },
})
const DRAG_TIP = t('끌어서 순서 바꾸기', 'Drag to reorder')

/** 목록의 한 줄: 상태 기호 · 머리 글자 네모와 이름 · "성격 · 설명" · 분야 · 최근 작업 */
function ProjectRow(p: ProjectRowData) {
  const { r } = p
  return (
    <div className={`hp-row${r.available ? '' : ' off'}${p.dragging ? ' dragging' : ''}${p.over ? ' over' : ''}`} data-ui="프로젝트 카드" data-ui-item={r.title} {...linkProps(r)} {...p.dropTarget}>
      <span className="hp-mark"><Attention {...p} /></span>
      <span className="hp-main">
        {/* 머리 글자 네모를 두 줄 높이로 키우고, 이름과 "성격 · 설명"을 그 오른쪽에 (10/7 작업 탭 시안 "홈") */}
        <span className="card-av hp-av" style={{ background: projectColor(r.id) }} title={DRAG_TIP} aria-hidden {...p.drag}>{initials(r.title)}</span>
        <span className="hp-name" data-ui="프로젝트 이름">
          <span className="t-name" title={r.path.replace(/^\/Users\/[^/]+/, '~')}>{r.title}</span>
        </span>
        <span className="hp-desc" data-ui="한 줄 설명" title={p.question}><b>{PROJECT_KIND_LABEL[r.kind]}</b>{p.question && <> · {p.question}</>}</span>
        {p.error && <span className="error-text">{p.error}</span>}
      </span>
      <span className="hp-fields"><TagLine tags={r.fields.map((f) => ({ key: f, label: f, cls: 'pc-field' }))} /></span>
      <span className="hp-time">{p.last ? cardTime(p.last) : ''}</span>
    </div>
  )
}

/**
 * 프로젝트 카드 (10/5 시안 "프로젝트 카드"): 왼쪽 위에서 아래까지 프로젝트 색 영역 + 가운데 그림(없으면 색만, 머리 글자 없음).
 * 색 영역을 잡아 끌어 순서를 바꾼다. 제목 · 한 줄 설명 · [성격] 네모 이름표 + 분야 한 줄 · 바닥 줄 최근 시각 · 상태 기호.
 */
type ProjectCardProps = (ProjectRowData & { preview?: false }) | (
  Pick<ProjectRowData, 'r' | 'question' | 'image' | 'last' | 'error'>
  & Partial<Pick<ProjectRowData, 'mark' | 'issues' | 'tasks' | 'edits' | 'sync'>>
  & { preview: true; pc?: string }
)

export function ProjectCard(p: ProjectCardProps) {
  const { r } = p
  const tags = [
    { key: '__kind', label: PROJECT_KIND_LABEL[r.kind], cls: 'kc-kind' },
    ...r.fields.map((f) => ({ key: f, label: f, cls: 'pc-field' })),
  ]
  return (
    <div className={`pcard${r.available ? '' : ' off'}${p.preview ? ' preview' : ''}${!p.preview && p.dragging ? ' dragging' : ''}${!p.preview && p.over ? ' over' : ''}`} data-ui={p.preview ? '프로젝트 카드 미리보기' : '프로젝트 카드'} data-ui-item={r.title}
      style={{ ['--pc' as string]: (p.preview && p.pc) || projectColor(r.id) }} {...(p.preview ? {} : { ...linkProps(r), ...p.dropTarget })}>
      <span className="pcard-band" title={p.preview ? undefined : DRAG_TIP} {...(p.preview ? {} : p.drag)}>
        {p.image && <CardImage image={p.image} legacyUrl={api.imageUrl(r.id, p.image)} />}
      </span>
      <span className="pcard-body">
        <span className="pcard-title" data-ui="프로젝트 이름" title={r.path.replace(/^\/Users\/[^/]+/, '~')}>{r.title}</span>
        <span className="pcard-desc" data-ui="한 줄 설명" title={p.question}>{p.question || ' '}</span>
        <TagLine tags={tags} />
        {p.error && <span className="error-text">{p.error}</span>}
        <span className="pcard-foot">
          <span className="kc-time">{p.last ? t(`최근 ${cardTime(p.last)}`, `Last ${cardTime(p.last)}`) : ''}</span>
          {r.state !== 'active' && <span className="kc-state"><ProjectStateDot state={r.state} /></span>}
          <span className="pcard-mark"><Attention mark={p.mark ?? null} issues={p.issues ?? 0} tasks={p.tasks ?? 0} edits={p.edits ?? 0} sync={p.sync ?? null} onUpdate={p.preview ? undefined : p.onUpdate} /></span>
        </span>
      </span>
    </div>
  )
}

/** 상태 기호 하나. 업데이트 필요이고 앱에서 받을 수 있으면(빨리 감기만) 누르면 받는다 */
function Attention({ mark, issues, tasks = 0, edits = 0, sync, onUpdate }: Pick<ProjectRowData, 'mark' | 'issues' | 'tasks' | 'edits' | 'sync'> & { onUpdate?(): void }) {
  if (!mark) return null
  const tip0 = issueTip(issues - tasks - edits, tasks, edits)
  const checkTip = t(`확인 필요 — ${tip0}`, `Needs review: ${tip0}`)
  const updateTip = sync ? t(`업데이트 필요 — GitHub에 새 커밋 ${sync.behind}개${sync.canUpdate ? onUpdate ? ' (누르면 받습니다)' : '' : ' · 이 컴퓨터에 커밋이나 변경이 있어 터미널에서 git pull'}`, `Needs update: ${plural(sync.behind, 'new commit')} on GitHub${sync.canUpdate ? onUpdate ? ' (click to pull)' : '' : ' · this computer has commits or changes, so run git pull in a terminal'}`) : ''
  if (mark === 'check') return <span className="am-dot" role="img" aria-label={checkTip} title={checkTip} />
  const tip = mark === 'both' ? `${checkTip}\n${updateTip}` : updateTip
  const icon: ReactNode = <>{Icon.sync}{mark === 'both' && <span className="am-badge" aria-hidden />}</>
  return sync?.canUpdate && onUpdate
    ? <button className="am-sync" aria-label={tip} title={tip} onClick={(e) => { e.stopPropagation(); onUpdate() }} onKeyDown={(e) => e.stopPropagation()}>{icon}</button>
    : <span className="am-sync" role="img" aria-label={tip} title={tip}>{icon}</span>
}

/** 기호 뜻 (목록 오른쪽 아래) */
function Legend({ view }: { view: View }) {
  return (
    <p className="hp-legend" aria-label={t('상태 기호와 순서 바꾸기', 'Status marks and reordering')}>
      <span data-ui="프로젝트 순서 안내">{view === 'card' ? t('색 칸을 끌어 순서 바꾸기', 'Drag the color band to reorder') : t('머리 글자 네모를 끌어 순서 바꾸기', 'Drag the initials square to reorder')}</span>
      <span><span className="am-dot" aria-hidden />{t('확인 필요', 'Needs review')}</span>
      <span><span className="am-sync" aria-hidden>{Icon.sync}</span>{t('업데이트 필요', 'Needs update')}</span>
      <span><span className="am-sync" aria-hidden>{Icon.sync}<span className="am-badge" /></span>{t('둘 다', 'Both')}</span>
    </p>
  )
}
