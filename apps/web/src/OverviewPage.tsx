import { RESEARCH_TARGET, todoDue, type JournalEntry, type TreeIssue } from '@rw/core'
import { fill } from './projectData'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { agentEditsApi, ConflictError, notesApi, LIMITS, type BlockRow, type ManuscriptInfo, type NoteRow, type ProjectInfo, type ResearchApi, type ResearchListItem, type ResearchSummary, type Topic, type TopicStats } from './api'
import { statusOf } from './format'
import { Icon } from './icons'
import { lastWorkMs, PROJECT_KIND_LABEL } from './projectProfile'
import { ProjectStateDot, type ProfilePatch } from './ProjectProfileFields'
import { StatusDot } from './StatusDot'
import { oldestFirst, stripDue } from './homeData'
import { ProjectEditDialog } from './ProjectEditDialog'
import { useJournal } from './useJournal'
import { MemoText, openTarget, targetTitle } from './memo'
import { AUX_NOTE } from './notes'
import { go } from './router'
import { focusTodo, todoKey } from './workRecords'
import { reviewStatusLabel } from './reviewStatus'
import { askText } from './askText'
import { store } from './store'
import { LOOSE_NOTES_LABEL, LOOSE_TOPIC_ID } from './noteKinds'
import { NewCard, NoteCardView } from './NoteCardView'
import { TopicCardView } from './TopicCardView'
import { TopicEditDialog } from './TopicEditDialog'
import { routeOfNote } from './RightSidebar'
import { createNoteAsk, NoteTrash } from './Topics'
import { gridColumns, notesInPeriod, PERIODS, RECENT_SORTS, SORTS, sortRecent, sortTopics, type NotePeriod, type NoteSort, type RecentSort } from './topicNotes'
import { t } from './i18n'

interface Props {
  rid: string
  rapi: ResearchApi
  summary: ResearchSummary
  /** 노트 한 목록 (연구노트 · 계산 노트 · 보조 노트): "노트" 섹션의 최근 손댄 노트 */
  notes: NoteRow[]
  /** 프로젝트 이름과 색 (주제 카드 미리보기 기본 바탕 · 주제 고치기 창 머리) */
  project: string
  pc: string
  /** 파일이 바뀔 때마다 올라가는 수. 검토 대기를 다시 읽는 데 쓴다 */
  version: number
  anchor?: string
  /** 이 프로젝트의 등록 정보: 성격 · 분야 · 진행 상태 (이 컴퓨터의 설정) */
  listed?: ResearchListItem
  /** 모든 프로젝트 (분야 제안) */
  all: ResearchListItem[]
  onProfile(patch: ProfilePatch, message: string): Promise<void>
  onChanged(): void
  onSaved(message: string): void
}

/** 장 번호: 본문은 1, 2, …, 부록은 A, B, … */
export function partNumber(parts: ManuscriptInfo['parts'], i: number): string {
  const p = parts[i]!
  const n = parts.slice(0, i + 1).filter((x) => x.appendix === p.appendix).length
  return p.appendix ? String.fromCharCode(64 + n) : String(n)
}

/** 장 오른쪽의 상태별 수: 해결 · 진행 · 멈춤 (색 점 + 수) */
export function StatusCounts({ list }: { list: BlockRow[] }) {
  if (list.length === 0) return <span className="none">—</span>
  const n = (s: string) => list.filter((b) => statusOf(b.status) === s).length
  return (
    <span className="counts">
      {(['solved', 'in-progress', 'blocked'] as const).map((s) => n(s) > 0 && <span key={s} className="count"><StatusDot s={s} />{n(s)}</span>)}
    </span>
  )
}

/** 첫 화면에는 우선순위 위의 할 일 셋만. 나머지는 할 일 화면에서 (피드백 10/3 14:38) */
const NOW_LIMIT = 3
/** 첫 화면 작업 칸에는 제목만: 첫 줄의 " — " 앞 (전체는 툴팁, 10/7 15:31) */
export const nowTitle = (text: string) => (text.split('\n')[0] ?? '').split(' — ')[0]!.trim()

/** 첫 화면 작업 패널의 한 묶음: 소제목과 수, 셋까지 보이고 나머지는 "n개 더" (onMore가 있으면 그 화면으로, 없으면 펼친다) */
function NowGroup({ title, count, turn, empty, ui, onMore, children }: { title: string; count: number; turn?: string; empty?: string; ui: string; onMore?(): void; children: React.ReactNode[] }) {
  const [all, setAll] = useState(false)
  const shown = all ? children : children.slice(0, NOW_LIMIT)
  const rest = count - shown.length
  return (
    <div className="now-group" data-ui={ui}>
      <h3>{title} {turn ? <span className="rail-count" title={turn}>{count}</span> : <span className="count">{count}</span>}</h3>
      {count === 0 && empty ? <p className="empty">{empty}</p> : <ul className="now-list">{shown}</ul>}
      {rest > 0 && <button className="a now-more" onClick={() => (onMore ? onMore() : setAll(true))}>{t(`${rest}개 더`, `${rest} more`)}</button>}
    </div>
  )
}

/** 첫 화면 작업 패널의 한 줄: 표시 · 제목 한 줄 · 설명 한 줄(있으면) · 오른쪽 끝(마감·행동). 줄을 누르면 그 항목으로, 전체 글은 툴팁 */
function NowRow({ ui, item, mark, title, sub, end, full, onOpen }: {
  ui: string; item: string; mark: React.ReactNode; title: React.ReactNode; sub?: React.ReactNode; end?: React.ReactNode; full: string; onOpen(): void
}) {
  return (
    <li className="now-row" data-ui={ui} data-ui-item={item} role="link" tabIndex={0} title={full}
      onClick={onOpen} onKeyDown={(event) => { if (event.key === 'Enter') onOpen() }}>
      {mark}
      <span className="now-text"><span className="now-title">{title}</span>{sub && <span className="now-sub">{sub}</span>}</span>
      {end && <span className="now-end">{end}</span>}
    </li>
  )
}

/** 할 일 우선순위: 마감이 있는 것은 마감이 이른 순, 그다음 마감 없는 것을 먼저 적은 순 */
export function byPriority(todos: JournalEntry[]): { entry: JournalEntry; due: string | null; text: string }[] {
  const rows = oldestFirst(todos).map((entry) => {
    const due = todoDue(entry.text, entry.date)
    return { entry, due, text: due ? stripDue(entry.text) : entry.text }
  })
  return [...rows.filter((r) => r.due).sort((a, b) => a.due!.localeCompare(b.due!)), ...rows.filter((r) => !r.due)]
}

/**
 * 프로젝트 첫 화면 — 탭이 하나도 선택되지 않았을 때 보이는 현황판 (2026-10-03 12:00 피드백).
 * 왼쪽: 프로젝트 제목 · 설명 · 성격과 분야 · 확인할 문제 · 주제와 노트 카드.
 * 오른쪽: 머리 높이와 관계없이 본문 맨 위에서 시작하는 작업(우선순위 순). 좁은 화면은 작업부터.
 * 10/5 시안 "프로젝트 첫 화면": 원고 칸은 뺐다(원고는 왼쪽 사이드바 "원고"에서). 오른쪽 작업 칸은 그대로.
 */
export function OverviewPage({ rid, rapi, summary, notes, project: projectName, pc, version, anchor, listed, all, onProfile, onChanged, onSaved }: Props) {
  const { research, tree, blocks } = summary
  const byId = new Map(blocks.map((b) => [b.id, b]))
  const titleOf = (id: string) => byId.get(id)?.title ?? id
  const { entries } = useJournal(rapi, version)
  const todos = byPriority(entries.filter((e) => e.kind === 'todo' && !e.done))
  const today = new Date().toLocaleDateString('sv')
  const open = (bid: string) => go({ page: 'block', rid, bid })
  const [project, setProject] = useState<ProjectInfo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)

  useEffect(() => fill(() => rapi.project(), setProject, null), [rapi, version])
  useEffect(() => {
    if (anchor) document.getElementById(anchor)?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }, [anchor])

  const blocked = blocks.filter((b) => statusOf(b.status) === 'blocked')
  const reviews = project?.reviews.filter((r) => r.status !== 'accepted') ?? []
  // 에이전트 고침 (10/8): 검토할 노트와 확인된 노트 고치기 요청. 작업 패널에 한 줄씩, 누르면 고침 검토 화면
  const [edits, setEdits] = useState<{ key: string; title: string; sub: string; attempt: boolean }[]>([])
  useEffect(() => {
    agentEditsApi.list(rid).then((v) => setEdits([
      ...v.attempts.map((a) => ({ key: a.key, title: a.title, sub: a.summary ? t(`고치기 요청 · ${a.summary}`, `Edit request: ${a.summary}`) : t('고치기 요청 · 그 대화에서 허락하면 고칩니다', 'Edit request: the agent edits once you agree in that conversation'), attempt: true })),
      ...v.reviews.map((r) => ({ key: r.key, title: r.title, sub: t(`바뀐 곳 ${r.changes}`, `${r.changes} changed`), attempt: false })),
    ])).catch(() => setEdits([]))
  }, [rid, version])
  const reopen = (b: { id: string; hash: string }) => {
    rapi.patchMeta(b.id, { status: 'in-progress' }, b.hash).then(onChanged).catch((e: Error) => setError(e.message))
  }

  // 제목이나 설명을 눌러도 프로젝트 정보로 간다 (피드백 10/3 14:47)
  const openInfo = () => go({ page: 'info', rid })
  const onInfoKey = (e: React.KeyboardEvent) => { if (e.key === 'Enter') openInfo() }

  return (
    <div className="ws-doc" data-ui="개괄">
      <section className="pane" data-ui="본문">
        <div className="scroll">
          <div className="page-body landing">
            <div className="landing-cols">
              <div className="main-notes" data-ui="연구 내용">
                <div className="landing-title">
                  <h1 className="h-title to-info" data-ui="연구 제목" role="link" tabIndex={0} title={t('프로젝트 정보 보기', 'View project info')} onClick={openInfo} onKeyDown={onInfoKey}>{research.title}</h1>
                  {listed && <div className="ov-actions" data-ui="프로젝트 머리 행동"><button className="icon-btn ov-edit" data-ui="프로젝트 고치기" data-tip={t('고치기', 'Edit')} aria-label={t('프로젝트 고치기', 'Edit project')} onClick={() => setEditing(true)}>{Icon.pencil}</button></div>}
                </div>

                <div className="landing-desc to-info" data-ui="연구 목표" role="link" tabIndex={0} title={t('프로젝트 정보 보기', 'View project info')} onClick={openInfo} onKeyDown={onInfoKey}>
                  {research.question ? <p>{research.question}</p> : <p className="muted">{t('설명이 없습니다 · 연필로 더하기', 'No description · add one with the pencil')}</p>}
                </div>

                {listed && (
                  <dl className="ov-profile" data-ui="프로젝트 성격과 분야">
                    <dt>{t('성격', 'Kind')}</dt>
                    <dd>{PROJECT_KIND_LABEL[listed.kind]}{listed.state !== 'active' && <span className="ov-state"><ProjectStateDot state={listed.state} label /></span>}</dd>
                    <dt>{t('분야', 'Field')}</dt>
                    <dd>{listed.fields.length ? listed.fields.map((f) => <span key={f} className="pc-field">{f}</span>) : <span className="muted">{t('없음', 'None')}</span>}</dd>
                  </dl>
                )}

                {tree.issues.length > 0 && (
                  <details className="issues" role="note" data-ui="확인이 필요한 보조 노트">
                    <summary><b>{t(`확인이 필요한 ${AUX_NOTE}`, `${AUX_NOTE} needing review`)}</b> <span className="rail-count" title={t('확인이 필요한 노트 수', 'Notes needing review')}>{tree.issues.length}</span></summary>
                    <ul>{tree.issues.map((i, n) => <li key={n}>{issueText(i, titleOf)}</li>)}</ul>
                  </details>
                )}

                <ProjectCards rid={rid} rapi={rapi} notes={notes} project={projectName} pc={pc} version={version} onChanged={onChanged} onSaved={onSaved} />
              </div>

              <aside className="now" id="blocked" data-ui="지금">
                <div className="sec-head">
                  <h2 title={t('할 일 · 멈춘 노트 · 검토 대기를 모두 같은 줄 모양으로 (10/7 15:31)', 'To-dos, blocked notes and pending reviews')}><button className="a" data-ui="할 일 전체 버튼" onClick={() => go({ page: 'todo', rid })}>{t('작업', 'Work')}</button></h2>
                </div>
                {/* 모든 프로젝트가 같은 세 묶음, 같은 줄 모양: 제목 한 줄 + 설명 한 줄, 묶음마다 셋까지 (10/7 15:31·17:02) */}
                <NowGroup title={t('할 일', 'To-do')} count={todos.length} empty={t('남은 할 일이 없습니다.', 'No to-dos left.')} ui="첫 화면 할 일" onMore={() => go({ page: 'todo', rid })}>
                  {todos.map(({ entry, due, text }) => {
                    const goTodo = () => { focusTodo(todoKey(entry)); go({ page: 'todo', rid }) }
                    return (
                      <NowRow key={`${entry.date}-${entry.index}`} ui="할 일 항목" item={text} mark={<span className="now-mark" aria-hidden>·</span>}
                        title={<MemoText text={nowTitle(text)} />} full={text} onOpen={goTodo}
                        sub={entry.target !== RESEARCH_TARGET && <button className="a" onClick={(event) => { event.stopPropagation(); openTarget(rid, entry.target) }} onKeyDown={(event) => event.stopPropagation()}>{targetTitle(entry.target, titleOf)}</button>}
                        end={due && <span className={`due${due < today ? ' late' : ''}`}>{due.slice(5).replace('-', '/')}</span>} />
                    )
                  })}
                </NowGroup>
                {/* 할 일은 보기만 한다. 적기·끝내기는 할 일 화면에서 (피드백 10/3 14:48·14:49) */}

                {blocked.length > 0 && (
                  <NowGroup title={t('멈춤', 'Blocked')} count={blocked.length} ui="멈춘 노트">
                    {blocked.map((b) => {
                      const detail = [b.blockedReason && t(`멈춘 이유: ${b.blockedReason}`, `Blocked because: ${b.blockedReason}`), b.resumeCondition && t(`다시 시작: ${b.resumeCondition}`, `Resume when: ${b.resumeCondition}`)].filter(Boolean).join(' · ')
                      return (
                        <NowRow key={b.id} ui="막힌 보조 노트" item={b.title ?? b.id} mark={<StatusDot s="blocked" />}
                          title={b.title ?? b.id} full={detail ? `${b.title ?? b.id}\n${detail}` : b.title ?? b.id} onOpen={() => open(b.id)}
                          sub={b.resumeCondition ? t(`다시 시작: ${b.resumeCondition}`, `Resume when: ${b.resumeCondition}`) : b.blockedReason}
                          end={<button className="icon-btn now-act" data-ui="다시 열기 버튼" data-tip={t('다시 열기', 'Reopen')} aria-label={t(`다시 열기 — ${b.title ?? b.id}`, `Reopen: ${b.title ?? b.id}`)} onClick={(event) => { event.stopPropagation(); reopen(b) }} onKeyDown={(event) => event.stopPropagation()}>{Icon.reopen}</button>} />
                      )
                    })}
                  </NowGroup>
                )}

                {edits.length > 0 && (
                  <NowGroup title={t('에이전트 고침', 'Agent edits')} count={edits.length} turn={t('바뀐 곳마다 승인 · 되돌리기 · 고치기', 'Approve, revert or edit each change')} ui="에이전트 고침" onMore={() => go({ page: 'review', scope: rid })}>
                    {edits.map((e) => (
                      <NowRow key={`${e.attempt ? 'a' : 'r'}-${e.key}`} ui="에이전트 고침 줄" item={e.title} mark={<span className="now-mark" aria-hidden>·</span>}
                        title={e.title} full={`${e.title}\n${e.sub}`} sub={e.sub}
                        onOpen={() => go({ page: 'review', scope: rid, ...(!e.attempt && { key: e.key }) })} />
                    ))}
                  </NowGroup>
                )}

                {reviews.length > 0 && (
                  <NowGroup title={t('검토 대기', 'Awaiting review')} count={reviews.length} turn={t('물리·수학 검토는 사용자만', 'Only you can do the physics and math review')} ui="검토 대기" onMore={() => go({ page: 'todo', rid })}>
                    {reviews.map((r) => (
                      <NowRow key={r.file} ui="검토 대기 문서" item={r.title} mark={<span className="now-mark" aria-hidden>·</span>}
                        title={r.title} full={r.file} onOpen={() => go({ page: 'todo', rid })}
                        sub={`${reviewStatusLabel(r.status)}${r.updated ? ` · ${r.updated}` : ''}`} />
                    ))}
                  </NowGroup>
                )}
                {error && <p className="error-text">{error}</p>}
              </aside>
            </div>
          </div>
        </div>
      </section>
      {editing && listed && <ProjectEditDialog rapi={rapi} summary={summary} listed={listed} all={all} pc={pc}
        last={lastWorkMs(summary, entries)} onProfile={onProfile} onChanged={onChanged} onSaved={onSaved} onDone={() => setEditing(false)} />}
    </div>
  )
}

/**
 * 메인 노트 정하기: 저장소의 .tex(\documentclass 있는 것) 중 하나를 골라 research.yaml에 적는다.
 * more: 이미 원고가 있으면 카드 줄 끝의 점선 카드가 open으로 고르는 칸을 연다
 */
export function MainNotePicker({ rapi, more, open, onClose, onDone }: { rapi: ResearchApi; more: boolean; open: boolean; onClose?(): void; onDone(): void }) {
  const picker = useRef<HTMLElement>(null)
  const [list, setList] = useState<{ candidates: { path: string; title: string }[]; hash: string } | null>(null)
  const [picking, setPicking] = useState(false)
  const [path, setPath] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const start = () => {
    setPicking(true); setError(null)
    rapi.mainNoteCandidates().then((r) => { setList(r); if (r.candidates[0]) { setPath(r.candidates[0].path); setName(r.candidates[0].title) } }).catch((e: Error) => setError(e.message))
  }
  const save = async () => {
    if (!list || !path) return
    setBusy(true); setError(null)
    try { await rapi.setMainNote(path, name, list.hash); setPicking(false); setList(null); onDone() }
    catch (e) { setError(e instanceof ConflictError ? t('research.yaml이 그사이 바뀌었습니다. 다시 골라 주세요.', 'research.yaml changed in the meantime. Choose again.') : (e as Error).message); if (e instanceof ConflictError) start() }
    finally { setBusy(false) }
  }
  useEffect(() => { if (open && !picking) start() }, [open]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (picking) picker.current?.scrollIntoView({ block: 'center' }) }, [picking])
  if (more && !picking) return null
  return (
    <section ref={picker} className={`main-empty${more ? ' more' : ''}`} id="main-pick" data-ui="메인 노트 정하기">
      {!more && <>
        <h2>{t('원고', 'Manuscript')}</h2>
        <p>{t('이 프로젝트의 원고가 아직 없습니다. 결과를 모으는 LaTeX 원고를 고르세요. 정하면 여기에 장 목록과 장마다 열린 문제가 보입니다.', 'This project has no manuscript yet. Choose the LaTeX manuscript that collects your results. Its chapters and their open problems will show here.')}</p>
      </>}
      {more && picking && <p>{t('저장소의 다른 LaTeX 원고를 목록에 더합니다. 기존 원고는 그대로입니다.', 'Adds another LaTeX manuscript from the repository to the list. Existing manuscripts stay as they are.')}</p>}
      {!picking ? (!more && <button className="btn primary" data-ui="메인 노트 정하기 버튼" onClick={start}>{t('원고 정하기', 'Choose manuscript')}</button>) : !list ? <p className="muted">{t('저장소에서 원고를 찾는 중…', 'Looking for manuscripts in the repository…')}</p> : list.candidates.length === 0 ? (
        <p className="muted">{t('저장소에서 \\documentclass가 있는 .tex를 찾지 못했습니다. 원고를 만든 뒤 다시 누르거나, research.yaml의 sources.manuscript에 직접 적어 주세요.', 'No .tex with \\documentclass was found in the repository. Create a manuscript and try again, or write it in sources.manuscript of research.yaml.')}</p>
      ) : (
        <div className="main-pick">
          <div className="main-pick-list" role="radiogroup" aria-label={t('원고 후보', 'Manuscript candidates')}>
            {list.candidates.map((c) => (
              <label key={c.path} className={`main-pick-it${path === c.path ? ' on' : ''}`}>
                <input type="radio" name="main-note" checked={path === c.path} onChange={() => { setPath(c.path); setName(c.title) }} />
                <span className="mono">{c.path}</span>{c.title && <span className="muted"> · {c.title}</span>}
              </label>
            ))}
          </div>
          <label className="main-pick-name">{t('이름', 'Name')} <input id="main-note-name" value={name} placeholder={t('예: 논문 원고', 'e.g. Paper manuscript')} onChange={(e) => setName(e.target.value)} /></label>
          <div className="main-pick-act">
            <button className="btn" onClick={() => { setPicking(false); onClose?.() }}>{t('취소', 'Cancel')}</button>
            <button className="btn primary" disabled={busy || !path} onClick={() => void save()}>{t('이것으로 정하기', 'Use this one')}</button>
          </div>
          <p className="hint">{more ? t('research.yaml의 sources.manuscript를 목록으로 바꿔 한 항목만 더합니다.', 'Turns sources.manuscript in research.yaml into a list and adds one item.') : t('research.yaml의 sources에 manuscript 한 줄만 더합니다.', 'Adds one manuscript line to sources in research.yaml.')} {t('원고 파일은 고치지 않습니다.', 'The manuscript file is not changed.')}</p>
        </div>
      )}
      {error && <p className="error-text">{error}</p>}
    </section>
  )
}

function issueText(i: TreeIssue, titleOf: (id: string) => string): string {
  const n = titleOf(i.id)
  switch (i.kind) {
    case 'missing-parent': return t(`“${n}”의 갈라져 나온 곳(${i.parent})이 없습니다.`, `The parent of “${n}” (${i.parent}) is missing.`)
    case 'missing-alternative': return t(`“${n}”의 다른 시도(${i.alternative})가 없습니다.`, `The alternative of “${n}” (${i.alternative}) is missing.`)
    case 'cycle': return t(`“${n}”의 갈라져 나온 곳이 고리를 이룹니다.`, `The parents of “${n}” form a cycle.`)
    case 'bad-status': return t(`“${n}”의 상태 값(${i.status})을 알 수 없어 진행으로 봅니다.`, `Unknown status of “${n}” (${i.status}); treated as in progress.`)
    case 'blocked-without-reason': return t(`“${n}”는 멈춤인데 멈춘 이유나 다시 시작할 조건이 없습니다.`, `“${n}” is blocked but has no reason or resume condition.`)
    case 'stopped-without-reason': return t(`“${n}”는 정지인데 정지 이유가 없습니다.`, `“${n}” is stopped but has no reason.`)
    case 'id-mismatch': return t(`“${n}”의 머리말 id(${i.headerId})가 파일 이름과 다릅니다.`, `The front matter id of “${n}” (${i.headerId}) differs from the file name.`)
  }
}

/** 저장해 두는 고르기 (정렬 · 기간): 다음에 열어도 그대로 */
function useStored<T extends string>(key: string, initial: T): [T, (v: T) => void] {
  const [v, setV] = useState<T>(() => store.get<T>(key, initial))
  return [v, (next: T) => { setV(next); store.set(key, next) }]
}

/** 고르기 한 줄: "정렬" + 고르기 */
function SortBar<T extends string>({ ui, label, list, value, onPick }: { ui: string; label: string; list: { id: T; label: string }[]; value: T; onPick(v: T): void }) {
  return (
    <span className="ov-sort">
      <span className="ts-sort-l">{t('정렬', 'Sort')}</span>
      <div className="segmented small" role="radiogroup" aria-label={label} title={t('즐겨찾기는 늘 앞에', 'Favorites always come first')} data-ui={ui}>
        {list.map((s) => <button key={s.id} role="radio" aria-checked={value === s.id} className={value === s.id ? 'on' : ''} onClick={() => onPick(s.id)}>{s.label}</button>)}
      </div>
    </span>
  )
}

/** 카드 격자 한 줄에 들어가는 카드 수 (폭이 바뀌면 다시 잰다) */
function useGridColumns() {
  const ref = useRef<HTMLDivElement>(null)
  const [cols, setCols] = useState(3)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => {
      const card = el.firstElementChild
      if (!el.clientWidth || !card) return
      // CSS 토큰으로 그린 실제 폭·간격을 읽어 만들기 카드도 한 칸으로 센다.
      setCols(gridColumns(el.getBoundingClientRect().width, card.getBoundingClientRect().width, parseFloat(getComputedStyle(el).columnGap)))
    }
    measure()
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    ro?.observe(el)
    return () => ro?.disconnect()
  }, [])
  return [ref, cols] as const
}

/**
 * 첫 화면 왼쪽 (10/5 시안 "프로젝트 첫 화면" · "만들기"):
 * - 주제: 주제 카드 줄(★ 먼저, 정렬 최근 작업 · 상태 · 이름), 맨 앞 점선 "＋ 주제 만들기"(이름만 받아 만들고 주제 고치기 창을 연다).
 *   주제 없는 노트가 있으면 제목 옆 "노트들 n" 이름표로 그 묶음 화면에 간다.
 * - 노트: 최근 손댄 노트(기간 오늘 · 이번 주 · 전체, 정렬 최신순 · 이름, ★ 먼저). 한 줄만 보이고 "노트 n개 더 보기 ▾"로 펼친다.
 *   맨 앞 점선 "＋ 노트 만들기"는 주제 없이 "노트들"에 만든다.
 * - 지운 노트: 15일 보관 중인 노트를 접는 줄로 (예전 연구노트 화면에서 옮김).
 */
function ProjectCards({ rid, rapi, notes, project, pc, version, onChanged, onSaved }: {
  rid: string; rapi: ResearchApi; notes: NoteRow[]; project: string; pc: string; version: number; onChanged(): void; onSaved(message: string): void
}) {
  const api = notesApi(rid)
  const [data, setData] = useState<{ topics: (Topic & TopicStats)[]; loose: TopicStats; hash: string } | null>(null)
  const [tick, setTick] = useState(0)
  useEffect(() => fill(() => notesApi(rid).topicsOverview(), setData, null), [rid, version, tick])
  const [topicSort, setTopicSort] = useStored<NoteSort>('rw-overview-topic-sort', 'recent')
  const [period, setPeriod] = useStored<NotePeriod>('rw-overview-note-period', 'week')
  const [noteSort, setNoteSort] = useStored<RecentSort>('rw-overview-note-sort', 'recent')
  const [expanded, setExpanded] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [gridRef, cols] = useGridColumns()

  const fail = (e: unknown) => onSaved(e instanceof ConflictError ? t('다른 곳에서 파일이 바뀌어 고치지 않았습니다. 다시 해 보세요.', 'Not changed: the file changed elsewhere. Try again.') : (e as Error).message)
  const topics = data?.topics ?? []
  const titleOf = (id: string) => topics.find((x) => x.id === id)?.title

  const starTopic = (topic: Topic) => data && api.patchTopic(topic.id, { star: !topic.star }, data.hash)
    .then(() => { setTick((x) => x + 1); onChanged(); onSaved(topic.star ? t(`"${topic.title}"를 즐겨찾기에서 뺐습니다`, `Removed "${topic.title}" from favorites`) : t(`"${topic.title}"를 즐겨찾기에 넣었습니다`, `Added "${topic.title}" to favorites`)) }).catch(fail)
  const createTopic = async () => {
    const title = (await askText({ title: t('새 주제', 'New topic'), label: t('이름', 'Name'), placeholder: t('예: Kempe 사슬', 'e.g. Kempe chains'), hint: t(`${LIMITS.title}자까지. 만든 뒤 설명과 카드 미리보기를 적습니다.`, `Up to ${LIMITS.title} characters. Add a description and card preview after creating it.`), ok: t('만들기', 'Create') }))?.trim()
    if (!title) return
    try {
      if (!data) return
      const r = await api.createTopic({ title: title.slice(0, LIMITS.title) }, data.hash)
      setData(await api.topicsOverview())
      setEditing(r.topic.id)
      onChanged()
      onSaved(t(`주제 "${r.topic.title}"를 만들었습니다`, `Created topic "${r.topic.title}"`))
    } catch (e) { fail(e) }
  }
  const starNote = (n: NoteRow) => api.setHead(n.file, { star: !n.star }, n.hash)
    .then(() => { onChanged(); onSaved(n.star ? t(`"${n.title}"를 즐겨찾기에서 뺐습니다`, `Removed "${n.title}" from favorites`) : t(`"${n.title}"를 즐겨찾기에 넣었습니다`, `Added "${n.title}" to favorites`)) }).catch(fail)

  const counts = Object.fromEntries(PERIODS.map((p) => [p.id, notesInPeriod(notes, p.id).length])) as Record<NotePeriod, number>
  const recent = sortRecent(notesInPeriod(notes, period), noteSort)
  // 한 줄 = 맨 앞 점선 만들기 카드 + 노트 (열 수 - 1)장
  const oneRow = Math.max(0, cols - 1)
  const shown = expanded ? recent : recent.slice(0, oneRow)
  const more = recent.length - oneRow
  const editTopic = editing ? topics.find((t) => t.id === editing) : undefined

  return (
    <>
      <section className="ov-sec" data-ui="주제 섹션">
        <div className="ov-head">
          <h2 className="land-h">{t('주제', 'Topics')}</h2>
          {(data?.loose.notes ?? 0) > 0 && (
            <button className="ov-loose" data-ui="노트들 묶음" title={t('주제가 없는 노트 — 노트들 화면으로', 'Notes without a topic: open their page')} onClick={() => go({ page: 'topic', rid, tid: LOOSE_TOPIC_ID })}>
              {LOOSE_NOTES_LABEL} {data!.loose.notes}</button>
          )}
          <span className="sp" />
          <SortBar ui="주제 정렬" label={t('주제 정렬', 'Sort topics')} list={SORTS} value={topicSort} onPick={setTopicSort} />
        </div>
        <div className="kc-grid" data-ui="주제 카드 목록">
          <NewCard shape="topic" label={t('주제 만들기', 'New topic')} ui="새 주제" onClick={() => void createTopic()} />
          {sortTopics(topics, topicSort).map((t) => (
            <TopicCardView key={t.id} pc={pc} onOpen={() => go({ page: 'topic', rid, tid: t.id })} onStar={() => void starTopic(t)} data={{
              title: t.title, description: t.description, star: t.star, kinds: t.kinds, byStatus: t.byStatus, updated: t.updated,
              preview: { text: t.preview?.text, image: t.preview?.image, imageUrl: t.preview?.image ? api.topicImageUrl(t.id, data!.hash) : undefined, color: t.preview?.color },
            }} />
          ))}
        </div>
      </section>

      <section className="ov-sec" data-ui="노트 섹션">
        <div className="ov-head">
          <h2 className="land-h">{t('노트', 'Notes')}</h2>
          <div className="segmented small" role="radiogroup" aria-label={t('노트 기간', 'Note period')} data-ui="노트 기간">
            {PERIODS.map((p) => <button key={p.id} role="radio" aria-checked={period === p.id} className={period === p.id ? 'on' : ''} onClick={() => { setPeriod(p.id); setExpanded(false) }}>{p.label} {counts[p.id]}</button>)}
          </div>
          <span className="sp" />
          <SortBar ui="노트 정렬" label={t('노트 정렬', 'Sort notes')} list={RECENT_SORTS} value={noteSort} onPick={setNoteSort} />
        </div>
        <div className="kc-grid" ref={gridRef} data-ui="최근 손댄 노트">
          <NewCard shape="note" label={t('노트 만들기', 'New note')} ui="새 노트" onClick={() => void createNoteAsk(rapi, rid, null, onChanged, onSaved, fail)} />
          {shown.map((n) => <NoteCardView key={n.file} row={n} topicTitle={titleOf} onOpen={() => go(routeOfNote(rid, n))} onStar={() => void starNote(n)} />)}
        </div>
        {recent.length === 0 && period !== 'all' && <p className="ov-empty">{period === 'today' ? t('오늘 손댄 노트가 없습니다.', 'No notes touched today.') : t('이번 주에 손댄 노트가 없습니다.', 'No notes touched this week.')}</p>}
        {more > 0 && (
          <div className="more-bar">
            <button aria-expanded={expanded} data-ui="노트 더 보기" onClick={() => setExpanded((v) => !v)}>{expanded ? t('접기 ▴', 'Collapse ▴') : t(`노트 ${more}개 더 보기 ▾`, `Show ${more} more ▾`)}</button>
          </div>
        )}
        <NoteTrash rapi={rapi} version={version} onChanged={onChanged} onSaved={onSaved} />
      </section>

      {editTopic && data && <TopicEditDialog rid={rid} topic={editTopic} hash={data.hash} pc={pc} project={project} onClose={() => setEditing(null)}
        onSaved={(m) => { setEditing(null); setTick((x) => x + 1); onChanged(); onSaved(m) }} />}
    </>
  )
}
