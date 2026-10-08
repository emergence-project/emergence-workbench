import { useEffect, useState, type ReactNode } from 'react'
import { ConflictError, notesApi, type BlockRow, type NoteRow, type ManuscriptInfo, type ManuscriptPart, type ResearchApi, type Topic, type TopicStats, type TrashedNote } from './api'
import type { BlockStatus } from '@rw/core'
import type { FlashAction } from './App'
import { statusLabel, statusOf } from './format'
import { descriptionLines } from './cardParts'
import { NewCard, NoteCardView } from './NoteCardView'
import { LOOSE_NOTES_LABEL, LOOSE_TOPIC_ID } from './noteKinds'
import { routeOfNote } from './RightSidebar'
import { store } from './store'
import { TopicEditDialog } from './TopicEditDialog'
import { isClosed, notesOfTopic, SORTS, sortNotes, STATUS_ORDER, type NoteSort } from './topicNotes'
import { openPart } from './Manuscript'
import { partNumber, StatusCounts } from './OverviewPage'
import { NOTE_KIND_LABEL } from './NewNote'
import { Icon } from './icons'
import { go } from './router'
import { askConfirm, askText } from './askText'
import { ExportLink } from './NoteExport'
import { StatusDot } from './StatusDot'
import { locale, plural, t as tr } from './i18n'

/**
 * 주제 (10/5 "주제와 노트"): 노트를 묶기만 하는 한 단계. research.yaml의 topics:에 적는다 (서버 topics.ts).
 * 여기에는 주제 화면(TopicPage), 원고 카드(원고 화면), 새 노트 만들기, 지운 노트가 있다. 카드 모양은 TopicCardView · NoteCardView.
 * 예전 기록의 원고 장(parts)은 주제 화면 아래 "원고의 장 n개"로 그대로 열어 본다.
 */

/** 원고의 장 하나와 그 원고 */
export interface PartRef { ms: ManuscriptInfo; p: ManuscriptPart; num: string }

const allParts = (manuscripts: ManuscriptInfo[]): PartRef[] =>
  manuscripts.flatMap((ms) => ms.parts.map((p, i) => ({ ms, p, num: partNumber(ms.parts, i) })))
const live = (blocks: BlockRow[]) => blocks.filter((b) => statusOf(b.status) !== 'stopped')

/** 카드의 장 (원고 순서) */
export const topicParts = (t: Topic, manuscripts: ManuscriptInfo[]) => allParts(manuscripts).filter((r) => t.parts.includes(r.p.id))
/** ★ 먼저, 그다음 적은 순 */
export const byStar = (list: Topic[]) => [...list.filter((t) => t.star), ...list.filter((t) => !t.star)]

export const TRASH_DAYS = 15

/** 연구노트·계산 노트를 바로 지우고 되돌리기를 알린다. 휴지통에 15일 보관하며 원고는 지우지 않는다. */
export function trashNoteWithUndo(rapi: ResearchApi, ms: ManuscriptInfo, onChanged: () => void, onSaved: (m: string, action?: FlashAction) => void) {
  return rapi.trashNote(ms.key).then((trashed) => {
    onChanged()
    onSaved(tr(`"${ms.name}"을 지웠습니다`, `Deleted "${ms.name}"`), {
      label: tr('되돌리기', 'Undo'),
      run: () => rapi.restoreNote(trashed.id)
        .then(() => { onChanged(); onSaved(tr('되살렸습니다', 'Restored')) })
        .catch((e: Error) => onSaved(e.message)),
    })
  }).catch((e: Error) => onSaved(e.message))
}

/** 원고(논문) 하나 = 카드 하나 (10/4 16:10 반려 "아직 수정 필요": 장 목록을 늘어놓지 않는다. 장은 원고를 열면 목차에) */
export function PaperCards({ rid, manuscripts, onCopy, onRemove, onAdd }: { rid: string; manuscripts: ManuscriptInfo[]; onCopy?(key: string): void; onRemove?(ms: ManuscriptInfo): void; onAdd?(): void }) {
  return <div className="note-cards" data-ui="메인 노트 장 목록">
    {onAdd && <NewCard shape="note" label={tr('원고 더하기', 'Add manuscript')} ui="메인 노트 더하기 버튼" onClick={onAdd} />}
    {manuscripts.map((ms) => <PaperCard key={ms.key} rid={rid} ms={ms} onCopy={onCopy} onRemove={onRemove} />)}
  </div>
}

function PaperCard({ rid, ms, onCopy, onRemove }: { rid: string; ms: ManuscriptInfo; onCopy?(key: string): void; onRemove?(ms: ManuscriptInfo): void }) {
  const body = ms.parts.filter((p) => !p.appendix).length
  const appx = ms.parts.length - body
  return (
    <div className="topic-card-wrap note-card-wrap">
      <button className="note-card topic-card" data-ui="원고 카드" data-ui-item={ms.name} onClick={() => go({ page: 'part', rid, file: ms.main })}>
        <span className="nc-title">{ms.name}</span>
        <span className="tc-parts">{ms.main}</span>
        <span className="nc-foot"><span>{NOTE_KIND_LABEL[ms.kind]} · {tr('장', 'Chapters')} {body}{appx ? ` · ${tr('부록', 'Appendices')} ${appx}` : ''}</span></span>
      </button>
      <span className="note-card-icons hover-actions">
        {onCopy && <button className="icon-btn" data-ui="복사해 연구노트 만들기" data-tip={tr('복사해 연구노트 만들기', 'Copy to a new research note')} aria-label={tr('복사해 연구노트 만들기', 'Copy to a new research note')} onClick={() => onCopy(ms.key)}>{Icon.plus}</button>}
        <ExportLink rid={rid} ms={ms} small />
        {/* 10/4 18:05: 원고 파일은 지우지 않고 목록(research.yaml)에서만 뺀다 */}
        {onRemove && <button className="icon-btn" data-ui="원고 빼기" title={tr('목록에서 빼기 — 원고 파일은 그대로 남습니다', 'Remove from the list. The manuscript files stay')} aria-label={tr('목록에서 빼기', 'Remove from the list')} onClick={() => onRemove(ms)}>×</button>}
      </span>
    </div>
  )
}

const partRow = (rid: string, r: PartRef, blocks: BlockRow[], showMs: boolean) => (
  <div key={r.p.id} className="chapter-wrap">
    <button className="chapter" data-ui="장" data-ui-item={r.p.title} title={r.p.line ? `${r.p.file}:${r.p.line}` : r.p.file} onClick={() => openPart(rid, r.ms, r.p)}>
      <span className="num">{r.num}</span>
      <span className="t">{r.p.title}{showMs && <span className="muted"> · {r.ms.name}</span>}</span>
      <StatusCounts list={live(blocks).filter((b) => b.grounds?.includes(r.p.id))} />
    </button>
  </div>
)

/**
 * 주제 화면 (10/5 시안 "주제 화면" · "노트 카드" · "카드 세부"): 머리에 주제 이름 + ★, 오른쪽에 연필 · 휴지통, 아래 설명,
 * 아래 노트 카드 격자(정렬: 최근 작업 · 상태 · 이름)와 점선 "＋ 노트 만들기". 해결 · 폐기 노트는 아래 접는 칸(정렬 "상태"면 함께).
 * tid가 LOOSE_TOPIC_ID면 "노트들"(주제 없는 노트)을 같은 모양으로 보인다. 예전 기록의 원고 장(parts)은 "원고의 장 n개"로 열어 본다.
 */
export function TopicPage({ rid, rapi, tid, notes, manuscripts, blocks, project, pc, version, onChanged, onSaved }: {
  rid: string; rapi: ResearchApi; tid: string; notes: NoteRow[]; manuscripts: ManuscriptInfo[]; blocks: BlockRow[]
  /** 프로젝트 이름과 색 (주제 고치기 창 머리 · 카드 미리보기 기본 바탕) */
  project: string; pc: string
  version: number
  onChanged(): void; onSaved(message: string): void
}) {
  const api = notesApi(rid)
  const [data, setData] = useState<{ topics: (Topic & TopicStats)[]; hash: string } | null>(null)
  const [failed, setFailed] = useState(false)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    notesApi(rid).topicsOverview().then((r) => { setData(r); setFailed(false) }).catch(() => setFailed(true))
  }, [rid, version, tick])
  const [sort, setSortState] = useState<NoteSort>(() => store.get<NoteSort>('rw-topic-sort', 'recent'))
  const setSort = (s: NoteSort) => { setSortState(s); store.set('rw-topic-sort', s) }
  const [foldOpen, setFoldOpen] = useState(true)
  const [partsOpen, setPartsOpen] = useState(false)
  const [editing, setEditing] = useState(false)

  const loose = tid === LOOSE_TOPIC_ID
  const topics = data?.topics ?? []
  const t = topics.find((x) => x.id === tid)
  const body = (inner: ReactNode) => (
    <div className="ws-doc" data-ui="소문제 카드 화면">
      <section className="pane" data-ui="본문"><div className="scroll"><div className="page-body topic-screen">{inner}</div></div></section>
    </div>
  )
  if (!data) return body(<p className="muted">{failed ? tr('주제를 읽지 못했습니다.', 'Could not read the topics.') : tr('불러오는 중…', 'Loading…')}</p>)
  if (!loose && !t) return body(<p className="muted">{tr('주제를 찾지 못했습니다. 왼쪽 사이드바에서 다시 고르세요.', 'Topic not found. Pick one again in the left sidebar.')}</p>)

  const done = () => { setTick((x) => x + 1); onChanged() }
  const fail = (e: unknown) => onSaved(e instanceof ConflictError ? tr('다른 곳에서 파일이 바뀌어 고치지 않았습니다. 다시 해 보세요.', 'The file changed elsewhere, so nothing was changed. Try again.') : (e as Error).message)
  const titleOf = (id: string) => topics.find((x) => x.id === id)?.title
  const mine = notesOfTopic(tid, notes, topics.map((x) => x.id))
  const all = sortNotes(mine, sort)
  const grid = sort === 'status' ? all : all.filter((n) => !isClosed(n.status))
  const closed = sort === 'status' ? [] : all.filter((n) => isClosed(n.status))
  const count = (s: BlockStatus) => mine.filter((n) => n.status === s).length
  // 접힌 묶음 머리처럼 무엇이 들었는지 읽혀야 하는 곳은 상태 이름도 함께 (문서 4절: 자리가 있으면 이름과 함께)
  const statusCounts = (states: BlockStatus[], labeled = false) => <span className="kc-counts">
    {states.filter((s) => count(s) > 0).map((s) => (
      <span key={s} className="kc-count" title={`${statusLabel(s)} ${count(s)}`}><StatusDot s={s} label={labeled} />{count(s)}</span>
    ))}
  </span>

  const starTopic = () => t && data && api.patchTopic(t.id, { star: !t.star }, data.hash)
    .then(() => { done(); onSaved(t.star ? tr(`"${t.title}"를 즐겨찾기에서 뺐습니다`, `Removed "${t.title}" from favorites`) : tr(`"${t.title}"를 즐겨찾기에 넣었습니다`, `Added "${t.title}" to favorites`)) }).catch(fail)
  const starNote = (n: NoteRow) => api.setHead(n.file, { star: !n.star }, n.hash)
    .then(() => { onChanged(); onSaved(n.star ? tr(`"${n.title}"를 즐겨찾기에서 뺐습니다`, `Removed "${n.title}" from favorites`) : tr(`"${n.title}"를 즐겨찾기에 넣었습니다`, `Added "${n.title}" to favorites`)) }).catch(fail)
  const removeTopic = async () => {
    if (!t) return
    if (!await askConfirm({ title: tr(`주제 "${t.title}"를 지울까요?`, `Delete topic "${t.title}"?`), hint: tr(`노트 ${mine.length}개는 그대로 남고, 다른 주제가 없는 노트는 "${LOOSE_NOTES_LABEL}"로 갑니다. 원고의 장과 파일은 그대로입니다.`, `The ${plural(mine.length, 'note')} stay. Notes with no other topic go to "${LOOSE_NOTES_LABEL}". Manuscript chapters and files stay.`), ok: tr('지우기', 'Delete') })) return
    api.deleteTopic(t.id, data?.hash).then(() => { onChanged(); onSaved(tr(`주제 "${t.title}"를 지웠습니다`, `Deleted topic "${t.title}"`)); go({ page: 'overview', rid }) }).catch(fail)
  }
  const createNote = () => void createNoteAsk(rapi, rid, loose ? null : { id: tid, title: t!.title }, onChanged, onSaved, fail)
  const card = (n: NoteRow) => <NoteCardView key={n.file} row={n} topicTitle={titleOf} onOpen={() => go(routeOfNote(rid, n))} onStar={() => void starNote(n)} />
  const parts = t ? topicParts(t, manuscripts) : []
  const desc = loose ? [] : descriptionLines(t!.description)

  return body(<>
    <header className="ts-head" data-ui="주제 머리">
      <div className="ts-title">
        <h1 className="h-title" title={loose ? tr('주제가 없는 노트 · 오른쪽 사이드바에서 주제를 고릅니다', 'Notes without a topic · Pick a topic in the right sidebar') : undefined}>{loose ? LOOSE_NOTES_LABEL : t!.title}</h1>
        {t && <>
          <button className={`icon-btn ts-star${t.star ? ' starred' : ''}`} data-ui="중요 표시" aria-pressed={t.star} title={t.star ? tr('즐겨찾기 빼기', 'Remove from favorites') : tr('즐겨찾기 (주제 목록 앞에 둡니다)', 'Favorite (puts it first in the topic list)')} aria-label={t.star ? tr('즐겨찾기 빼기', 'Remove from favorites') : tr('즐겨찾기', 'Favorite')} onClick={() => void starTopic()}>{t.star ? '★' : '☆'}</button>
          <span className="ts-actions" data-ui="주제 머리 행동">
            <button className="icon-btn" data-ui="주제 고치기" title={tr('고치기 — 이름 · 설명 · 카드 미리보기', 'Edit name, description, card preview')} aria-label={tr('주제 고치기', 'Edit topic')} onClick={() => setEditing(true)}>{Icon.pencil}</button>
            <button className="icon-btn" data-ui="카드 지우기" title={tr('주제 지우기 — 노트와 파일은 그대로', 'Delete topic. Notes and files stay')} aria-label={tr('주제 지우기', 'Delete topic')} onClick={() => void removeTopic()}>{Icon.trash}</button>
          </span>
        </>}
      </div>
      {desc.length > 0 ? (
        <div className={`ts-desc${loose ? ' muted' : ''}`} data-ui="주제 설명">
          {desc.filter((l) => !l.bullet).map((l, i) => <p key={`p${i}`}>{l.text}</p>)}
          {desc.some((l) => l.bullet) && <ul>{desc.filter((l) => l.bullet).map((l, i) => <li key={i}>{l.text}</li>)}</ul>}
        </div>
      ) : t && <p className="ts-desc muted">{tr('설명이 없습니다. 연필을 눌러 적습니다.', 'No description. Click the pencil to write one.')}</p>}
    </header>

    <div className="ts-bar">
      <span className="ts-sum"><span>{tr('노트', 'Notes')} {mine.length}</span>{statusCounts(STATUS_ORDER)}</span>
      <span className="sp" />
      <div className="ts-sort">
        <span className="ts-sort-l">{tr('정렬', 'Sort')}</span>
        <div className="segmented small" role="radiogroup" aria-label={tr('노트 정렬', 'Sort notes')} data-ui="노트 정렬">
          {SORTS.map((s) => <button key={s.id} role="radio" aria-checked={sort === s.id} className={sort === s.id ? 'on' : ''} onClick={() => setSort(s.id)}>{s.label}</button>)}
        </div>
      </div>
    </div>

    <div className="kc-grid" data-ui="노트 카드 목록">
      <NewCard shape="note" label={tr('노트 만들기', 'New note')} ui="새 노트" onClick={createNote} />
      {grid.map(card)}
    </div>

    {closed.length > 0 && (
      <section className="ts-fold" data-ui="해결·폐기 노트">
        <button className="ts-fold-h" aria-expanded={foldOpen} onClick={() => setFoldOpen((v) => !v)}>
          <span className={`ts-chev${foldOpen ? ' open' : ''}`} aria-hidden>›</span>{statusCounts(['solved', 'stopped'], true)}
        </button>
        {foldOpen && <div className="kc-grid">{closed.map(card)}</div>}
      </section>
    )}

    {parts.length > 0 && (
      <section className="ts-parts" data-ui="카드의 장">
        <button className="a" aria-expanded={partsOpen} onClick={() => setPartsOpen((v) => !v)}>{tr(`원고의 장 ${parts.length}개`, `Manuscript chapters: ${parts.length}`)}{partsOpen ? tr(' 접기', ' (collapse)') : ''}</button>
        {partsOpen && <div className="chapters">{parts.map((r) => partRow(rid, r, blocks, manuscripts.length > 1))}</div>}
      </section>
    )}

    {editing && t && <TopicEditDialog rid={rid} topic={t} hash={data.hash} pc={pc} project={project} onClose={() => setEditing(false)}
      onSaved={(m) => { setEditing(false); done(); onSaved(m) }} />}
  </>)
}

/**
 * 새 노트 (점선 "＋ 노트 만들기"): 이름만 받아 빈 Markdown 연구노트를 만들고 연다.
 * topic이 있으면 그 주제에 넣고, null이면 주제 없이 "노트들"로 (첫 화면 노트 섹션, 10/5 "여기서 만든 노트는 노트들로").
 */
export async function createNoteAsk(rapi: ResearchApi, rid: string, topic: { id: string; title: string } | null,
  onChanged: () => void, onSaved: (m: string) => void, fail: (e: unknown) => void) {
  const name = (await askText({ title: tr('새 노트', 'New note'), label: tr('이름', 'Name'), placeholder: tr('예: 근사적으로 붙이기', 'e.g. Asymptotic matching'), hint: topic ? tr(`주제 "${topic.title}"에 만듭니다. 빈 Markdown 노트로 시작합니다.`, `Creates it in topic "${topic.title}". Starts as an empty Markdown note.`) : tr(`주제 없이 "${LOOSE_NOTES_LABEL}"에 만듭니다. 주제는 노트의 오른쪽 사이드바에서 고릅니다.`, `Creates it in "${LOOSE_NOTES_LABEL}" without a topic. Pick a topic in the note's right sidebar.`), ok: tr('만들기', 'Create') }))?.trim()
  if (!name) return
  try {
    const r = await rapi.createNote('note', name)
    if (topic) {
      const api = notesApi(rid)
      const row = (await api.list()).find((x) => x.file === r.path)
      if (row) await api.setHead(row.file, { topics: [topic.id] }, row.hash)
    }
    onChanged()
    onSaved(tr(`노트 "${r.name}"을 만들었습니다 (${r.path})`, `Created note "${r.name}" (${r.path})`))
    go({ page: 'part', rid, file: r.path })
  } catch (e) { fail(e) }
}

/** 지운 노트 (10/4 17:04): 15일 동안 남겨 두고, 그 안에는 되살린다. 그 뒤에는 서버가 정말 지운다 */
export function NoteTrash({ rapi, version, onChanged, onSaved }: { rapi: ResearchApi; version: number; onChanged(): void; onSaved(m: string): void }) {
  const [list, setList] = useState<TrashedNote[]>([])
  const [open, setOpen] = useState(false)
  useEffect(() => { rapi.noteTrash().then(setList).catch(() => setList([])) }, [rapi, version])
  if (!list.length) return null
  const day = (iso: string) => { const d = new Date(iso); return tr(`${d.getMonth() + 1}월 ${d.getDate()}일`, d.toLocaleDateString(locale(), { month: 'short', day: 'numeric' })) }
  const restore = (t: TrashedNote) => rapi.restoreNote(t.id)
    .then(() => { setList((l) => l.filter((x) => x.id !== t.id)); onChanged(); onSaved(tr(`"${t.name}"을 되살렸습니다`, `Restored "${t.name}"`)) })
    .catch((e: Error) => onSaved(e.message))
  return (
    <section className="ts-fold note-trash" data-ui="지운 노트">
      <button className="ts-fold-h" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <span className={`ts-chev${open ? ' open' : ''}`} aria-hidden>›</span>{tr('지운 노트', 'Deleted notes')} {list.length}<span className="muted"> · {tr(`${TRASH_DAYS}일 보관`, `kept ${TRASH_DAYS} days`)}</span>
      </button>
      {open && <ul>{list.map((t) => (
        <li key={t.id}><span>{t.name}</span><span className="muted">{tr(`${day(t.until)}까지 보관`, `Kept until ${day(t.until)}`)}</span>
          <button className="a" data-ui="노트 되살리기" onClick={() => restore(t)}>{tr('되살리기', 'Restore')}</button></li>
      ))}</ul>}
    </section>
  )
}
