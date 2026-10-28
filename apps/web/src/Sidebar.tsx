import { useEffect, useState, type ReactNode } from 'react'
import { useFlow } from './flow/data'
import { judgeTurns } from './flow/JudgeQueue'
import { type ManuscriptInfo, type NoteRow, type ResearchApi, type Topic } from './api'
import { Icon } from './icons'
import { openPart } from './Manuscript'
import { LOOSE_NOTES_LABEL, LOOSE_NOTES_UI, LOOSE_TOPIC_ID } from './noteKinds'
import { partNumber } from './OverviewPage'
import { routeOfNote } from './RightSidebar'
import { SideTabs } from './SectionToc'
import { go, type Route } from './router'
import { StatusDot } from './StatusDot'
import { store } from './store'
import { byStar } from './Topics'
import { t } from './i18n'
import { useAgentEdits, useMaterials, usePapers } from './projectQueries'
import { repoBehindAhead, useRepoInfo } from './ProjectInfoPage'
import { StarIcon } from './marks'

/**
 * 왼쪽 사이드바 = 지금 프로젝트에서 어디로 갈지 (10/5 시안 S2 "주제 › 노트 나무").
 * 프로젝트 정보 · 작업 · 주제(주제 › 노트, 지금 연 노트의 주제만 펼침, 노트마다 상태 점) · "노트들"(주제 없는 노트) · 자료(원고 · 참고 자료).
 * 맨 위 탭 "프로젝트 | 목차"(10/18)로 이 목록과 지금 연 노트의 절 목차를 바꿔 본다. 개념노트 · 문헌노트는 레일 "지식", 지도는 원고의 보기로 둔다.
 * 수는 사용자 차례만 주황 알약(기록 = 에이전트가 물은 기록, 수정 검토 = 검토할 노트, 10/18)이다.
 */
type Group = string
const LOOSE = LOOSE_TOPIC_ID

/** 지금 주소가 연 노트 */
export function noteOfRoute(route: Route, notes: NoteRow[]): NoteRow | null {
  if (route.page === 'part') return notes.find((n) => n.file === route.file) ?? null
  return null
}

export function ResearchNav({ rid, rapi, route, materials, askCount = 0, manuscripts, topics, notes }: {
  rid: string; rapi: ResearchApi; route: Route; materials: ReactNode
  /** 에이전트가 물어 사용자 답을 기다리는 기록 수 (10/15, 사용자 차례 주황 알약) */
  askCount?: number; manuscripts: ManuscriptInfo[]; topics: Topic[]; notes: NoteRow[]
}) {
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
  // 라이브러리 bib에 있는 논문의 PDF는 참고 자료에 두지 않으므로 세지 않는다 (Materials.tsx와 같게). 화면 캐시에서 참고 자료 목록과 함께 쓴다
  const materialList = useMaterials(rid)
  const paperList = usePapers()
  const matCount = (() => {
    const d = materialList.data
    if (!d || !paperList.isFetched) return null
    const lib = new Set(paperList.data?.library ? paperList.data.papers.map((x) => x.key) : [])
    return d.bib.filter((e) => e.file && !lib.has(e.key)).length + d.files.filter((f) => !f.bibKey).length
  })()

  // 고침 검토 (10/14): 이 프로젝트에서 검토할 노트 수 + 확인된 노트 고치기 요청 수
  const edits = useAgentEdits(rid).data
  const editCount = edits ? edits.reviews.length + edits.attempts.length : 0
  // 판단할 것 (10/23): 대기열의 명제와 시작을 기다리는 카드. 기록 › 내 차례 맨 위와 같은 수
  const flowScan = useFlow(rid).scan
  const judgeCount = flowScan ? (({ queued, ready }) => queued.length + ready.length)(judgeTurns(flowScan.nodes)) : 0

  const known = new Set(topics.map((t) => t.id))
  const notesOf = (g: Group) => notes.filter((n) => (g === LOOSE ? !n.topics.some((t) => known.has(t)) : n.topics[0] === g))
  // 두 번째 이후 주제에도 걸친 노트는 그 주제 아래에 흐리게 한 번 더 (주제 화면의 노트 수와 같게, 10/27 18:27 피드백)
  const alsoOf = (g: Group) => (g === LOOSE ? [] : notes.filter((n) => n.topics[0] !== g && n.topics.slice(1).includes(g)))
  const titleOf = new Map(topics.map((x) => [x.id, x.title]))
  const papers = manuscripts.filter((m) => m.kind === 'paper')
  const manuscriptSelected = paperOpen || route.page === 'notes' || route.page === 'map'

  const noteRow = (n: NoteRow, also = false) => {
    const on = !also && current?.file === n.file
    const home = also ? titleOf.get(n.topics[0] ?? '') : undefined
    return (
      <button key={n.file} className={`nav tree-note${on ? ' on' : ''}${also ? ' also' : ''}`} aria-current={on ? 'page' : undefined} data-ui="나무 노트" data-ui-item={n.title}
        title={home ? t(`${n.title} — 주 주제: ${home}`, `${n.title}. Main topic: ${home}`) : n.title}
        onClick={() => go(routeOfNote(rid, n))}><StatusDot s={n.status} /><span className="label">{n.title}</span></button>
    )
  }
  const branch = (g: Group, label: string, onName: () => void, star = false) => {
    const list = notesOf(g)
    const also = alsoOf(g)
    const opened = isOpen(g)
    const on = route.page === 'topic' && route.tid === g
    return (
      <div key={g} className="tree-topic" data-ui={g === LOOSE ? '노트들' : '나무 주제'} data-ui-item={g === LOOSE ? LOOSE_NOTES_UI : label}>
        <div className={`tree-head${on ? ' on' : ''}${opened ? ' open' : ''}`}>
          <button className="tree-chev" aria-expanded={opened} aria-label={`${opened ? t('접기', 'Collapse') : t('펼치기', 'Expand')}: ${label}`} onClick={() => toggle(g)}><span aria-hidden>›</span></button>
          <button className="tree-name" aria-current={on ? 'page' : undefined} title={g === LOOSE ? t('주제가 없는 노트 — 노트들 화면으로', 'Notes without a topic. Open the notes screen') : t(`${label} — 주제 화면으로`, `${label}: open the topic screen`)} onClick={onName}>{star && <StarIcon on />}{label}</button>
          <span className="n">{list.length + also.length || ''}</span>
        </div>
        {opened && list.length + also.length > 0 && <div className="tree-notes">{list.map((n) => noteRow(n))}{also.map((n) => noteRow(n, true))}</div>}
      </div>
    )
  }
  const repoOn = route.page === 'repo' || route.page === 'files'
  const ba = repoBehindAhead(useRepoInfo(rapi).data)
  const recordsOn = route.page === 'records' || route.page === 'todo' || route.page === 'log' || route.page === 'task' || route.page === 'judge'
  return (
    <div className="project-toc" data-ui="프로젝트 목차">
      <SideTabs label={t('프로젝트', 'Project')} turn={askCount + judgeCount + editCount}
        turnTip={t(`내 차례: 에이전트가 물은 기록 ${askCount} · 판단 ${judgeCount} · 수정 검토 ${editCount}`, `Your turn: ${askCount} agent question(s), ${judgeCount} to judge, ${editCount} edit review(s)`)}
        show={!!current || route.page === 'part' || route.page === 'task' || route.page === 'judge' || route.page === 'concept'}>
      <div className="project-nav">
        <div className="side-quick" data-ui="빠른 이동">
          <button className={`nav side-row${route.page === 'info' ? ' on' : ''}`} aria-current={route.page === 'info' ? 'page' : undefined} data-ui="프로젝트 정보 블록" title={t('개요: 설명 · 시작일 · 성격과 분야 · 들어 있는 것', 'Overview: description, start date, kind and fields, contents')} onClick={() => go({ page: 'info', rid })}>
            <span className="q-ico" aria-hidden>{Icon.projectInfo}</span><span className="label">{t('프로젝트 정보', 'Project info')}</span></button>
          <div className="tree-notes side-sub">
            <button className={`nav tree-note${route.page === 'status' ? ' on' : ''}`} aria-current={route.page === 'status' ? 'page' : undefined} data-ui="현황 블록" title={t('내 차례 · 맡긴 일 · 주제 · 최근 기록 (에이전트가 STATUS.md로 읽는 것과 같은 내용)', 'Your turn, delegated work, topics, recent journal (same as what agents read in STATUS.md)')} onClick={() => go({ page: 'status', rid })}>
              <span className="label">{t('현황', 'Status')}</span></button>
            <button className={`nav tree-note${route.page === 'changes' ? ' on' : ''}`} aria-current={route.page === 'changes' ? 'page' : undefined} data-ui="변경사항 블록" title={t('내가 마지막으로 본 뒤 바뀐 노트 · 흐름 점 · 맡긴 일 · 기록 · 파일, 에이전트가 본 것', 'Notes, flow dots, tasks, records and files changed since you last looked, and what agents have seen')} onClick={() => go({ page: 'changes', rid })}>
              <span className="label">{t('변경사항', 'Changes')}</span></button>
            <button className={`nav tree-note${route.page === 'agents' ? ' on' : ''}`} aria-current={route.page === 'agents' ? 'page' : undefined} data-ui="AGENTS.md 블록" title={t('에이전트가 이 저장소에서 먼저 읽는 규칙과 그 근거가 된 결정', 'Rules agents read first in this repository, and the decisions behind them')} onClick={() => go({ page: 'agents', rid })}>
              <span className="label">{t('규칙', 'Rules')}</span></button>
          </div>
          <button className={`nav side-row${recordsOn ? ' on' : ''}`} aria-current={recordsOn ? 'page' : undefined} data-ui="기록 블록" title={t('내 차례 · 에이전트 차례 · 모든 기록과 맡긴 일', 'Your turn, agents\' turn, all records and delegated tasks')} onClick={() => go({ page: 'records', rid })}>
            <span className="q-ico" aria-hidden>{Icon.comment}</span><span className="label">{t('기록', 'Records')}</span>
              {askCount + judgeCount > 0 && <span className="rail-count" data-ui="물은 기록 수" title={t(`에이전트가 물은 기록 ${askCount}개 · 판단할 것 ${judgeCount}개`, `${askCount} agent question(s), ${judgeCount} to judge`)}>{askCount + judgeCount}</span>}</button>
          <button className={`nav side-row${route.page === 'edits' ? ' on' : ''}`} aria-current={route.page === 'edits' ? 'page' : undefined} data-ui="고침 검토 블록" title={t('에이전트가 고친 노트를 바뀐 곳마다 검토', 'Review each change agents made to notes')} onClick={() => go({ page: 'edits', rid })}>
            <span className="q-ico" aria-hidden>{Icon.review}</span><span className="label">{t('수정 검토', 'Edit review')}</span>{editCount ? <span className="rail-count" title={t(`검토할 노트와 고치기 요청 ${editCount}개`, `${editCount} note(s) to review and edit request(s)`)}>{editCount}</span> : null}</button>
          <button className={`nav side-row${route.page === 'flow' ? ' on' : ''}`} aria-current={route.page === 'flow' ? 'page' : undefined} data-ui="흐름 블록" title={t('연구 흐름: 생각의 걸음과 그 사이의 선', 'Research flow: steps of thinking and the lines between them')} onClick={() => go({ page: 'flow', rid })}>
            <span className="q-ico" aria-hidden>{Icon.flow}</span><span className="label">{t('흐름', 'Flow')}</span></button>
          <div className={`side-row-wrap${repoOn ? ' on' : ''}`}>
            <button className={`nav side-row${repoOn ? ' on' : ''}`} aria-current={repoOn ? 'page' : undefined} data-ui="저장소 블록" title={t('폴더 · 브랜치 · GitHub와 같은지, 그리고 모든 파일 (나무는 목차 탭에)', 'Folder, branch, whether it matches GitHub, and every file (the tree is on the Contents tab)')} onClick={() => go({ page: 'repo', rid })}>
              <span className="q-ico" aria-hidden>{Icon.repo}</span><span className="label">{t('저장소', 'Repository')}</span></button>
            {ba && (ba.behind > 0 || ba.ahead > 0) && <button className="side-sync" data-ui="저장소 받기 올리기 수"
              title={t(`GitHub에 새 커밋 ${ba.behind} · 올리지 않은 커밋 ${ba.ahead} — 현황에서 동기화합니다`, `${ba.behind} new on GitHub · ${ba.ahead} unpushed. Sync from Status`)}
              onClick={() => go({ page: 'status', rid })}><span className="turn-dot" aria-hidden />{ba.behind > 0 && `↓${ba.behind}`}{ba.ahead > 0 && ` ↑${ba.ahead}`}</button>}
          </div>
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
      </SideTabs>
    </div>
  )
}

