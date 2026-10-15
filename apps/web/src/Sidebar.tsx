import { useEffect, useRef, useState, type ReactNode } from 'react'
import { agentEditsApi, papersApi, type ManuscriptInfo, type NoteRow, type ResearchApi, type Topic } from './api'
import { Icon } from './icons'
import { openPart } from './Manuscript'
import { LOOSE_NOTES_LABEL, LOOSE_NOTES_UI, LOOSE_TOPIC_ID } from './noteKinds'
import { partNumber } from './OverviewPage'
import { routeOfNote } from './RightSidebar'
import { SectionToc, useTocMaxHeight } from './SectionToc'
import { go, type Route } from './router'
import { StatusDot } from './StatusDot'
import { store } from './store'
import { byStar } from './Topics'
import { t } from './i18n'

/**
 * 왼쪽 사이드바 = 지금 프로젝트에서 어디로 갈지 (10/5 시안 S2 "주제 › 노트 나무").
 * 프로젝트 정보 · 작업 · 주제(주제 › 노트, 지금 연 노트의 주제만 펼침, 노트마다 상태 점) · "노트들"(주제 없는 노트) · 자료(원고 · 참고 자료).
 * 맨 아래는 지금 연 노트의 절 목차 (노트를 열었을 때만, 절이 하나면 숨김). 개념노트 · 문헌노트는 왼쪽 띠 "지식", 지도는 원고의 보기로 둔다.
 */
type Group = string
const LOOSE = LOOSE_TOPIC_ID

/** 지금 주소가 연 노트 */
export function noteOfRoute(route: Route, notes: NoteRow[]): NoteRow | null {
  if (route.page === 'block') return notes.find((n) => n.type === 'block' && n.id === route.bid) ?? null
  if (route.page === 'part') return notes.find((n) => n.type !== 'block' && n.file === route.file) ?? null
  return null
}

export function ResearchNav({ rid, rapi, route, materials, todoCount, askCount = 0, manuscripts, topics, notes, version }: {
  rid: string; rapi: ResearchApi; route: Route; materials: ReactNode; todoCount: number | null
  /** 에이전트가 물어 사용자 답을 기다리는 기록 수 (10/15, 사용자 차례 주황 알약) */
  askCount?: number; manuscripts: ManuscriptInfo[]; topics: Topic[]; notes: NoteRow[]; version: number
}) {
  const sidebar = useRef<HTMLDivElement>(null)
  const tocMaxHeight = useTocMaxHeight(sidebar)
  const current = noteOfRoute(route, notes)
  /** 연 노트의 주 주제 (없으면 "노트들") */
  const here: Group | null = current ? current.topics[0] ?? LOOSE : route.page === 'topic' ? route.tid : null
  const paperOpen = route.page === 'part' && manuscripts.some((m) => m.kind === 'paper' && (m.main === route.file || m.parts.some((p) => p.file === route.file)))
  const [open, setOpen] = useState<Group[]>(() => [...(here ? [here] : []), ...(paperOpen ? ['papers'] : [])])
  // 다른 노트를 열면 그 노트의 주제만 펼친다
  useEffect(() => { if (here) setOpen((prev) => [here, ...prev.filter((g) => g === 'papers' || g === 'refs')]) }, [here])
  useEffect(() => { if (paperOpen) setOpen((prev) => (prev.includes('papers') ? prev : [...prev, 'papers'])) }, [paperOpen])
  const [refsOpen, setRefsOpen] = useState<boolean>(() => store.get(`rw-side-refs-${rid}`, false))
  useEffect(() => store.set(`rw-side-refs-${rid}`, refsOpen), [rid, refsOpen])
  useEffect(() => { if (route.page === 'doc') setRefsOpen(true) }, [route.page])
  const isOpen = (g: Group) => open.includes(g)
  const toggle = (g: Group) => setOpen((prev) => (prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g]))
  const [matCount, setMatCount] = useState<number | null>(null)
  useEffect(() => {
    // 라이브러리 bib에 있는 논문의 PDF는 참고 자료에 두지 않으므로 세지 않는다 (Materials.tsx와 같게)
    Promise.all([rapi.materials(), papersApi.list().catch(() => null)]).then(([d, p]) => {
      const lib = new Set(p?.library ? p.papers.map((x) => x.key) : [])
      setMatCount(d.bib.filter((e) => e.file && !lib.has(e.key)).length + d.files.filter((f) => !f.bibKey).length)
    }).catch(() => setMatCount(null))
  }, [rapi, version])

  // 고침 검토 (10/14): 이 프로젝트에서 검토할 노트 수 + 확인된 노트 고치기 요청 수
  const [editCount, setEditCount] = useState(0)
  useEffect(() => { agentEditsApi.list(rid).then((v) => setEditCount(v.reviews.length + v.attempts.length)).catch(() => setEditCount(0)) }, [rid, version])

  const known = new Set(topics.map((t) => t.id))
  const notesOf = (g: Group) => notes.filter((n) => (g === LOOSE ? !n.topics.some((t) => known.has(t)) : n.topics[0] === g))
  const papers = manuscripts.filter((m) => m.kind === 'paper')
  const manuscriptSelected = paperOpen || route.page === 'notes' || route.page === 'map'

  const noteRow = (n: NoteRow) => {
    const on = current?.file === n.file
    return (
      <button key={n.file} className={`nav tree-note${on ? ' on' : ''}`} aria-current={on ? 'page' : undefined} data-ui="나무 노트" data-ui-item={n.title} title={n.title}
        onClick={() => go(routeOfNote(rid, n))}><StatusDot s={n.status} /><span className="label">{n.title}</span></button>
    )
  }
  const branch = (g: Group, label: string, onName: () => void, star = false) => {
    const list = notesOf(g)
    const opened = isOpen(g)
    const on = route.page === 'topic' && route.tid === g
    return (
      <div key={g} className="tree-topic" data-ui={g === LOOSE ? '노트들' : '나무 주제'} data-ui-item={g === LOOSE ? LOOSE_NOTES_UI : label}>
        <div className={`tree-head${on ? ' on' : ''}${opened ? ' open' : ''}`}>
          <button className="tree-chev" aria-expanded={opened} aria-label={`${opened ? t('접기', 'Collapse') : t('펼치기', 'Expand')}: ${label}`} onClick={() => toggle(g)}><span aria-hidden>›</span></button>
          <button className="tree-name" aria-current={on ? 'page' : undefined} title={g === LOOSE ? t('주제가 없는 노트 — 노트들 화면으로', 'Notes without a topic. Open the notes screen') : t(`${label} — 주제 화면으로`, `${label}: open the topic screen`)} onClick={onName}>{star ? '★ ' : ''}{label}</button>
          <span className="n">{list.length || ''}</span>
        </div>
        {opened && list.length > 0 && <div className="tree-notes">{list.map(noteRow)}</div>}
      </div>
    )
  }
  return (
    <div ref={sidebar} className="project-toc" data-ui="프로젝트 목차">
      <div className="project-nav">
        <div className="side-quick" data-ui="빠른 이동">
          <button className={`nav side-row${route.page === 'info' ? ' on' : ''}`} aria-current={route.page === 'info' ? 'page' : undefined} data-ui="프로젝트 정보 블록" title={t('설명·시작일·저장소', 'Description, start date, repository')} onClick={() => go({ page: 'info', rid })}>
            <span className="q-ico" aria-hidden>{Icon.projectInfo}</span><span className="label">{t('프로젝트 정보', 'Project info')}</span></button>
          <div className="tree-notes side-sub">
            <button className={`nav tree-note${route.page === 'agents' ? ' on' : ''}`} aria-current={route.page === 'agents' ? 'page' : undefined} data-ui="AGENTS.md 블록" title={t('에이전트가 이 저장소에서 먼저 읽는 규칙', 'Rules agents read first in this repository')} onClick={() => go({ page: 'agents', rid })}>
              <span className="label">AGENTS.md</span></button>
          </div>
          <button className={`nav side-row${route.page === 'todo' || route.page === 'log' || route.page === 'task' ? ' on' : ''}`} aria-current={route.page === 'todo' || route.page === 'log' ? 'page' : undefined} data-ui="할 일" title={t('에이전트에게 맡긴 일과 지난 작업 일지', 'Work delegated to agents and past work journal')} onClick={() => go({ page: 'todo', rid })}>
            <span className="q-ico" aria-hidden>{Icon.task}</span><span className="label">{t('작업', 'Work')}</span></button>
          <button className={`nav side-row${route.page === 'records' ? ' on' : ''}`} aria-current={route.page === 'records' ? 'page' : undefined} data-ui="기록 블록" title={t('프로젝트의 메모 · 할 일 · 질문을 대상별로', 'Memos, to-dos and questions across the project, by what they are about')} onClick={() => go({ page: 'records', rid })}>
            <span className="q-ico" aria-hidden>{Icon.memo}</span><span className="label">{t('기록', 'Records')}</span>{askCount > 0 && <span className="rail-count" data-ui="물은 기록 수" title={t(`에이전트가 물은 기록 ${askCount}개 — 답을 기다립니다`, `${askCount} agent question(s) waiting for your answer`)}>{askCount}</span>}{todoCount ? <span className="n" title={t('남은 할 일', 'Open to-dos')}>{todoCount}</span> : null}</button>
          <button className={`nav side-row${route.page === 'edits' ? ' on' : ''}`} aria-current={route.page === 'edits' ? 'page' : undefined} data-ui="고침 검토 블록" title={t('에이전트가 고친 노트를 바뀐 곳마다 검토', 'Review each change agents made to notes')} onClick={() => go({ page: 'edits', rid })}>
            <span className="q-ico" aria-hidden>{Icon.review}</span><span className="label">{t('고침 검토', 'Edit review')}</span>{editCount ? <span className="n" title={t('검토할 노트와 고치기 요청', 'Notes to review and edit requests')}>{editCount}</span> : null}</button>
          <button className={`nav side-row${route.page === 'flow' ? ' on' : ''}`} aria-current={route.page === 'flow' ? 'page' : undefined} data-ui="흐름 블록" title={t('연구 흐름: 생각의 걸음과 그 사이의 선', 'Research flow: steps of thinking and the lines between them')} onClick={() => go({ page: 'flow', rid })}>
            <span className="q-ico" aria-hidden>{Icon.flow}</span><span className="label">{t('흐름', 'Flow')}</span></button>
        </div>

        <div className="side-label">{t('주제', 'Topics')}</div>
        <div className="side-tree" data-ui="주제 나무">
          {byStar(topics).map((t) => branch(t.id, t.title, () => go({ page: 'topic', rid, tid: t.id }), t.star))}
          {branch(LOOSE, LOOSE_NOTES_LABEL, () => go({ page: 'topic', rid, tid: LOOSE }))}
        </div>

        <div className="side-label">{t('자료', 'Materials')}</div>
        <div className="side-quick">
          <button className={`nav side-row${manuscriptSelected ? ' on' : ''}`} data-ui="원고 묶음" aria-current={manuscriptSelected ? 'page' : undefined} aria-expanded={isOpen('papers')} title={papers.length ? t('원고 화면 — 원고와 그 장', 'Manuscript screen: manuscripts and their chapters') : t('원고 화면 — 원고가 없습니다. 거기서 원고를 정합니다', 'Manuscript screen: no manuscript yet. Set one up there')}
            onClick={() => {
              // 원고 화면을 열고 원고 목록을 펼친다. 이미 원고 화면이면 목록만 여닫는다 (10/5 4단계: 첫 화면의 원고 칸을 여기로)
              if (route.page !== 'notes') { go({ page: 'notes', rid }); if (papers.length && !isOpen('papers')) toggle('papers') } else if (papers.length) toggle('papers')
            }}>
            <span className="q-ico" aria-hidden>{Icon.manuscript}</span><span className="label">{t('원고', 'Manuscript')}</span>{papers.length > 1 && <span className="n">{papers.length}</span>}</button>
          {isOpen('papers') && papers.length > 0 && <div className="tree-notes side-papers">
            {papers.map((m) => {
              const mine = route.page === 'part' && (m.main === route.file || m.parts.some((p) => p.file === route.file))
              return (
                <div key={m.key}>
                  <button className={`nav tree-note${mine && route.page === 'part' && route.file === m.main && !m.parts.some((p) => p.file === m.main) ? ' on' : ''}`} title={m.main} onClick={() => go({ page: 'part', rid, file: m.main })}>
                    <span className="label">{m.name}</span></button>
                  {mine && m.parts.map((p, i) => {
                    const on = route.page === 'part' && route.file === p.file && !p.line
                    return <button key={p.id} className={`nav tree-note tree-part${on ? ' on' : ''}`} aria-current={on ? 'page' : undefined} title={p.title} onClick={() => openPart(rid, m, p)}>
                      <span className="num">{partNumber(m.parts, i)}</span><span className="label">{p.title}</span></button>
                  })}
                </div>
              )
            })}
          </div>}
          <button className={`nav side-row${route.page === 'doc' ? ' on' : ''}`} data-ui="재료" aria-expanded={refsOpen} title={t('가진 논문 PDF와 파일을 바로 아래에 펼칩니다', 'Show your paper PDFs and files right below')} onClick={() => setRefsOpen((v) => !v)}>
            <span className="q-ico" aria-hidden>{Icon.clip}</span><span className="label">{t('참고 자료', 'References')}</span>{matCount ? <span className="n">{matCount}</span> : null}<span className="tree-chev" aria-hidden><span>›</span></span></button>
          {refsOpen && <div className="side-tab-body" data-ui="참고 자료 하위 목록">{materials}</div>}
        </div>
      </div>

      <SectionToc show={!!current || route.page === 'part' || route.page === 'task' || route.page === 'concept'} maxHeight={tocMaxHeight} />
    </div>
  )
}

