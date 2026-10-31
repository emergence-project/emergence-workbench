import { useState, type ReactNode } from 'react'
import { useQueries, useQuery } from '@tanstack/react-query'
import type { BlockStatus } from '@rw/core'
import { api, commentsApi, notesApi, tasksApi, type NoteRow, type ResearchListItem } from '../api'
import { CardDescription } from '../cardParts'
import { projectColor } from '../format'
import { t } from '../i18n'
import { Icon } from '../icons'
import { noteKindLabel } from '../noteKinds'
import { qk } from '../queries'
import { RecordList } from '../RecordList'
import { recordRoute } from '../recordsPanelHelpers'
import { go, type Route } from '../router'
import { StatusDot } from '../StatusDot'
import { judgeOrder } from '../taskView'
import { TaskCard } from '../WorkTasks'
import { useTurns } from './turns'

/**
 * 폰의 프로젝트 탭 (10/31 폰 시안 https://claude.ai/artifact/M7D5NatDAN9agDCJTmPpop, 2단계 "프로젝트와 노트 읽기"):
 * 프로젝트 목록 → 프로젝트 안(주제 · 기록 · 맡긴 일) → 주제의 노트 목록. 노트를 누르면 맥과 같은 노트 화면이 읽기 모양으로 열린다(styles/phone.css).
 * 자료는 맥 화면과 같은 캐시 키라 요청을 나눠 쓴다.
 */
export type ProjectsView = 'topics' | 'records' | 'tasks'
/** 주제 없는 노트를 모은 자리의 id */
export const NO_TOPIC = '-'

export function PhoneProjects({ rid, view = 'topics', tid, version, onSaved }: { rid?: string; view?: ProjectsView; tid?: string; version: number; onSaved(m: string): void }) {
  const list = useQuery({ queryKey: qk.researches, queryFn: () => api.researches() })
  const projects = list.data?.researches ?? []
  const project = rid ? projects.find((r) => r.id === rid) : undefined
  return (
    <main className="stage full ph-turns ph-projects" data-ui="폰 프로젝트">
      {!rid ? <ProjectList projects={projects} loading={list.isPending} version={version} />
        : !project ? <p className="empty ph-empty">{list.isPending ? t('불러오는 중…', 'Loading…') : t('이 프로젝트를 찾지 못했습니다.', 'Project not found.')}</p>
        : tid !== undefined ? <TopicNotes project={project} tid={tid} />
        : <ProjectPage project={project} view={view} onSaved={onSaved} />}
    </main>
  )
}

function Swatch({ r }: { r: ResearchListItem }) {
  const style: Record<string, string> = { background: projectColor(r.id, r.color) }
  return <span className="ph-swatch" style={style} aria-hidden />
}

const STATUS_ORDER: BlockStatus[] = ['in-progress', 'blocked', 'solved', 'stopped']

/** 상태마다 노트 수: 색 점과 수 (0은 빼고) */
function StatusCounts({ notes }: { notes: NoteRow[] }) {
  return <span className="ph-counts">{STATUS_ORDER.map((s) => {
    const n = notes.filter((x) => x.status === s).length
    return n > 0 && <span key={s}><StatusDot s={s} />{n}</span>
  })}</span>
}

function ProjectList({ projects, loading, version }: { projects: ResearchListItem[]; loading: boolean; version: number }) {
  const { items } = useTurns(version)
  const shown = projects.filter((r) => r.available)
  const active = shown.filter((r) => r.state === 'active')
  const others = shown.filter((r) => r.state !== 'active')
  const notes = useQueries({ queries: shown.map((r) => ({ queryKey: qk.notes(r.id), queryFn: () => notesApi(r.id).list() })) })
  const notesOf = (id: string) => notes[shown.findIndex((r) => r.id === id)]?.data ?? []
  const card = (r: ResearchListItem) => {
    const turn = items.filter((x) => x.kind !== 'feedback' && x.rid === r.id).length
    const ns = notesOf(r.id)
    return (
      <article key={r.id} className="ph-card" data-ui="폰 프로젝트 카드">
        <button className="ph-card-main" onClick={() => go({ page: 'projects', project: r.id })}>
          <span className="ph-pc-head"><Swatch r={r} /><span className="ph-title">{r.title}</span>
            {turn > 0 && <span className="ph-turn-n" aria-label={t(`내 차례 ${turn}`, `${turn} for you`)}><span className="turn-dot" aria-hidden />{turn}</span>}</span>
          {ns.length > 0 && <span className="ph-meta">{t(`노트 ${ns.length}`, `${ns.length} notes`)}<StatusCounts notes={ns} /></span>}
        </button>
      </article>
    )
  }
  return <>
    <div className="ph-head"><h1>{t('프로젝트', 'Projects')}</h1></div>
    {active.map(card)}
    {others.length > 0 && <section className="ph-group"><h2>{t('멈춘 · 끝난 프로젝트', 'Paused and done')}</h2>{others.map(card)}</section>}
    {!shown.length && <p className="empty ph-empty">{loading ? t('불러오는 중…', 'Loading…') : t('프로젝트가 없습니다. 맥에서 프로젝트를 등록하면 여기에 보입니다.', 'No projects. Register one on the Mac and it shows up here.')}</p>}
  </>
}

/** 위쪽 머리: 뒤로(한 단계 위) · 이름 */
function Head({ back, backLabel, title, children }: { back: Route; backLabel: string; title: ReactNode; children?: ReactNode }) {
  return (
    <div className="ph-nav">
      <button className="a ph-back" onClick={() => go(back)}>{Icon.back}{backLabel}</button>
      <h1>{title}</h1>
      {children}
    </div>
  )
}

const VIEWS: { key: ProjectsView; label: () => string }[] = [
  { key: 'topics', label: () => t('주제', 'Topics') },
  { key: 'records', label: () => t('기록', 'Records') },
  { key: 'tasks', label: () => t('맡긴 일', 'Tasks') },
]

function ProjectPage({ project: p, view, onSaved }: { project: ResearchListItem; view: ProjectsView; onSaved(m: string): void }) {
  return <>
    <Head back={{ page: 'projects' }} backLabel={t('프로젝트', 'Projects')} title={<><Swatch r={p} />{p.title}</>} />
    <div className="segmented ph-seg" role="tablist" aria-label={t('보기', 'View')} data-ui="폰 프로젝트 보기">
      {VIEWS.map((v) => <button key={v.key} role="tab" aria-selected={view === v.key} className={view === v.key ? 'on' : ''}
        onClick={() => go({ page: 'projects', project: p.id, ...(v.key !== 'topics' && { view: v.key }) })}>{v.label()}</button>)}
    </div>
    {view === 'topics' ? <Topics rid={p.id} /> : view === 'records' ? <Records rid={p.id} /> : <Tasks rid={p.id} onSaved={onSaved} />}
  </>
}

function useNotes(rid: string) {
  return useQuery({ queryKey: qk.notes(rid), queryFn: () => notesApi(rid).list() })
}
function useTopics(rid: string) {
  return useQuery({ queryKey: qk.topics(rid), queryFn: () => api.research(rid).topics() })
}

function Topics({ rid }: { rid: string }) {
  const topics = useTopics(rid)
  const notes = useNotes(rid).data ?? []
  const loose = notes.filter((n) => !n.topics.length)
  const row = (id: string, title: string, sub: string | undefined, ns: NoteRow[], done?: boolean) => (
    <button key={id} className="ph-row" data-ui="폰 주제" onClick={() => go({ page: 'projects', project: rid, tid: id })}>
      <span className="ph-row-x"><b>{title}</b>{sub && <CardDescription text={sub} lines={2} className="ph-sub" />}
        <span className="ph-meta">{t(`노트 ${ns.length}`, `${ns.length} notes`)}{done && <span>{t('끝냄', 'Done')}</span>}<StatusCounts notes={ns} /></span></span>
      <span className="ph-chev" aria-hidden>›</span>
    </button>
  )
  const list = topics.data ?? []
  return <div className="ph-list">
    {list.map((x) => row(x.id, x.title, x.description, notes.filter((n) => n.topics[0] === x.id), x.done))}
    {loose.length > 0 && row(NO_TOPIC, t('주제 없는 노트', 'Notes without a topic'), undefined, loose)}
    {!list.length && !loose.length && <p className="empty ph-empty">{topics.isPending ? t('불러오는 중…', 'Loading…') : t('주제와 노트가 없습니다.', 'No topics or notes.')}</p>}
  </div>
}

function TopicNotes({ project: p, tid }: { project: ResearchListItem; tid: string }) {
  const topic = useTopics(p.id).data?.find((x) => x.id === tid)
  const query = useNotes(p.id)
  const notes = (query.data ?? []).filter((n) => tid === NO_TOPIC ? !n.topics.length : n.topics.includes(tid))
  return <>
    <Head back={{ page: 'projects', project: p.id }} backLabel={p.title} title={tid === NO_TOPIC ? t('주제 없는 노트', 'Notes without a topic') : topic?.title ?? tid} />
    {topic?.description && <CardDescription text={topic.description} lines={3} className="ph-desc" />}
    <div className="ph-list">
      {notes.map((n) => (
        <button key={n.file} className="ph-row" data-ui="폰 노트" onClick={() => go({ page: 'part', rid: p.id, file: n.file })}>
          <span className="ph-row-dot"><StatusDot s={n.status} /></span>
          <span className="ph-row-x"><b>{n.title}</b>{n.description && <CardDescription text={n.description} lines={2} className="ph-sub" />}
            <span className="ph-meta">{noteKindLabel(n.kind)}{n.topics[0] !== tid && tid !== NO_TOPIC && <span>{t('다른 주제에서', 'From another topic')}</span>}</span></span>
          <span className="ph-chev" aria-hidden>›</span>
        </button>
      ))}
      {!notes.length && <p className="empty ph-empty">{query.isPending ? t('불러오는 중…', 'Loading…') : t('이 주제에 노트가 없습니다.', 'No notes in this topic.')}</p>}
    </div>
  </>
}

/** 기록: 자리(프로젝트 · 주제 · 노트)마다 묶어서. 줄은 맥의 기록 줄과 같은 부품이라 답 · 끝내기도 여기서 한다 */
function Records({ rid }: { rid: string }) {
  const query = useQuery({ queryKey: qk.records(rid), queryFn: () => commentsApi(rid).records() })
  const files = (query.data?.files ?? []).filter((f) => f.comments.length)
  return <div className="ph-records">
    {files.map((f) => (
      <section key={f.target} className="ph-group" data-ui="폰 기록 묶음">
        <h2>{f.target === 'project' ? t('이 프로젝트', 'This project') : f.title}</h2>
        <RecordList rid={rid} file={f} filter="전체" work onGo={() => { const r = recordRoute(rid, f, () => undefined); if (r) go(r) }} />
      </section>
    ))}
    {!files.length && <p className="empty ph-empty">{query.isPending ? t('불러오는 중…', 'Loading…') : t('아직 기록이 없습니다.', 'No records yet.')}</p>}
  </div>
}

/** 맡긴 일: 판단할 것 먼저(맥의 작업 탭과 같은 카드). 누르면 펼쳐 결과와 판단 버튼 */
function Tasks({ rid, onSaved }: { rid: string; onSaved(m: string): void }) {
  const query = useQuery({ queryKey: qk.tasks(rid), queryFn: () => tasksApi(rid).scan() })
  const [open, setOpen] = useState<string | null>(null)
  const all = query.data?.tasks ?? []
  const judge = judgeOrder(all)
  const tasks = [...judge, ...all.filter((x) => !judge.includes(x)).sort((a, b) => b.mtime - a.mtime)]
  return <div className="ph-tasks">
    {tasks.map((x) => <TaskCard key={x.id} rid={rid} task={x} open={open === x.id} onToggle={() => setOpen(open === x.id ? null : x.id)} onSaved={onSaved}
      reload={() => query.refetch()} onEditProposal={() => go({ page: 'projects', project: rid, view: 'records' })} />)}
    {!tasks.length && <p className="empty ph-empty">{query.isPending ? t('불러오는 중…', 'Loading…') : t('맡긴 일이 없습니다.', 'No delegated tasks.')}</p>}
  </div>
}
