import { SUBJECTS_CHANGED } from './SubjectPicker'
import { subjectsApi, type SubjectCount } from './api/subjects'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { conceptsApi, knowledgeApi, topicKey, type ConceptMd, type ConceptRow, type ConceptSources, type KnowledgeInfo, type KnowledgeTopic, type LibraryInfo } from './api'
import { useConceptMacros } from './conceptMacros'
import { useFigureUrl } from './figureEmbed'
import { ConceptEditor } from './ConceptEditor'
import { useStudyBooks } from './Study'
import { Icon } from './icons'
import { ObsidianMarkdown, type RenderOptions } from './ObsidianMarkdown'
import { go, type Route } from './router'
import { ConceptRecords, ConceptRecordsPanel, setShownConcept } from './ConceptRecords'
import { onOutside } from './autosave'
import { useNoteEdit } from './noteEdit'
import { NoteScreen } from './NoteScreenFrame'
import { RightSidebar } from './RightSidebar'
import { AgentPanel } from './AgentChats'
import { LIBRARY_RID } from '@rw/core'
import { useRightSlotsOwner, type RightMode } from './noteScreen'
import { showKnowledgeList } from './knowledgeListState'
import { subjectTree, type SubjNode } from './knowledgeSubjects'
import { isListRoute } from './router'
import { useNoteSections } from './MarkdownNote'
import { SideTabs } from './SectionToc'
import { t } from './i18n'
export { sourceUrl, citeLabel, ConceptSidePanel } from './ConceptNoteSide'
import { type ReviewChoice, type DocState, ConceptDocInfo, citeLabel, ConceptSourcesList, ConceptSidePanel } from './ConceptNoteSide'

/**
 * 개념노트 (2026-10-04 재설계, shared-library/concepts/*.md).
 * - 왼쪽 사이드바: 분류 나무와 찾기, 미완성·확인함 거르기. 아직 옮기지 않은 Study 노트는 맨 아래 따로.
 * - 가운데: 읽기 화면. 사람이 누르는 것은 "확인함" 하나와 고치기 잠금. 미완성은 앱이 본문을 보고 붙인다.
 * 지식 화면(Library.tsx)과 프로젝트 탭이 함께 쓴다.
 */

// 색인과 기호 모음은 사이드바와 본문이 함께 쓰므로 한 번만 읽는다 (라이브러리가 바뀌면 info가 새로 온다)
let indexCache: { info: LibraryInfo | null; p: Promise<KnowledgeInfo> } | null = null
export function useKnowledge(info: LibraryInfo | null): { data: KnowledgeInfo | null; error: string | null } {
  const [data, setData] = useState<KnowledgeInfo | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (!indexCache || indexCache.info !== info) indexCache = { info, p: knowledgeApi.index() }
    let live = true
    indexCache.p.then((d) => { if (live) { setData(d); setError(null) } }).catch((e: Error) => { if (live) setError(e.message) })
    return () => { live = false }
  }, [info])
  return { data, error }
}

export { forgetConceptMacros } from './conceptMacros'
/** rid: 그 프로젝트의 노트를 그릴 때 (![[그림]]을 그 프로젝트 전용 그림에서 먼저 찾는다) */
export function useConceptRender(rid?: string): RenderOptions {
  const macros = useConceptMacros()
  const figure = useFigureUrl(rid)
  return useMemo(() => ({ macros, assetUrl: conceptsApi.assetUrl, ...(figure && { figure }) }), [macros, figure])
}

const isUnfinished = (t: KnowledgeTopic) => !!t.concept && (t.concept.format === 'md' ? (t.concept.unfinished?.length ?? 0) > 0 : t.concept.empty)
const isChecked = (t: KnowledgeTopic) => !!t.concept && (t.concept.format === 'md' ? t.concept.checked === 'ok' : t.concept.status === 'reviewed')

export function conceptCounts(topics: KnowledgeTopic[]) {
  const notes = topics.filter((t) => t.concept)
  return { notes: notes.length, unfinished: notes.filter(isUnfinished).length, checked: notes.filter(isChecked).length, studyOnly: topics.filter((t) => !t.concept && t.study).length }
}

const RECENT_KEY = 'rw.concepts.recent'
/** 연 때까지 적은 기록 (지식 첫 화면 "최근 노트"의 "오늘 열었음"). 옛 기록(id만)은 연 때 없이 읽는다 */
const OPENED_KEY = 'rw.concepts.opened'
const readRecent = (): string[] => { try { const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]'); return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [] } catch { return [] } }
/** 최근 연 개념노트 (최근 것부터, 10개까지): id와 연 때(ms, 모르면 없음) */
export function readOpened(): { id: string; at?: number }[] {
  let timed: { id: string; at: number }[] = []
  try {
    const v = JSON.parse(localStorage.getItem(OPENED_KEY) ?? '[]')
    if (Array.isArray(v)) timed = v.filter((x): x is { id: string; at: number } => !!x && typeof x.id === 'string' && typeof x.at === 'number')
  } catch { /* 못 읽으면 옛 기록만 */ }
  const seen = new Set(timed.map((x) => x.id))
  return [...timed, ...readRecent().filter((id) => !seen.has(id)).map((id) => ({ id }))].slice(0, 10)
}
export const pushRecent = (id: string) => {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify([id, ...readRecent().filter((x) => x !== id)].slice(0, 10)))
    localStorage.setItem(OPENED_KEY, JSON.stringify([{ id, at: Date.now() }, ...readOpened().filter((x) => x.id !== id && x.at !== undefined)].slice(0, 10)))
  } catch { /* 저장 못 해도 목록은 돈다 */ }
}

/** 분류만 보이는 나무. 이름은 목록을 거르고, 꺾쇠는 하위 분류를 여닫는다. */
function SubjectGroups({ nodes, depth = 0, reveal }: { nodes: SubjNode[]; depth?: number; reveal?: string }) {
  const [shown, setShown] = useState(8)
  const selected = nodes.findIndex((n) => reveal !== undefined && (reveal === n.path || reveal.startsWith(`${n.path}${n.model === 'ids' ? '/' : ' › '}`)))
  const visible = nodes.slice(0, shown)
  if (selected >= shown) visible.push(nodes[selected]!)
  const count = visible.length
  return <>
    {visible.map((node) => <SubjectGroup key={node.path} node={node} depth={depth} reveal={reveal} />)}
    {nodes.length > count && <button className="a cn-more" onClick={() => setShown(shown + 8)}>{t(`${nodes.length - count}개 더`, `${nodes.length - count} more`)}</button>}
  </>
}

function SubjectGroup({ node, depth, reveal }: { node: SubjNode; depth: number; reveal?: string }) {
  const inside = reveal !== undefined && (reveal === node.path || reveal.startsWith(`${node.path}${node.model === 'ids' ? '/' : ' › '}`))
  const [open, setOpen] = useState(inside)
  useEffect(() => { if (inside) setOpen(true) }, [inside])
  return (
    <details className={`side-grp cn-subj${depth ? ' cn-subj-in' : ''}`} open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary className={inside ? 'on' : ''}>
        <span className={`chev${node.kids.length ? '' : ' kl-no-chevron'}`} aria-hidden>›</span>
        <button className="label kl-subject-name" data-ui="분류 줄" data-ui-item={node.path} title={node.path || t('분류 없음', 'No subject')}
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); showKnowledgeList({ subjectPrefix: node.path }) }}>{node.name}</button>
        <span className="n">{node.count}</span>
      </summary>
      {open && node.kids.length > 0 && <div className="side-grp-body"><SubjectGroups nodes={node.kids} depth={depth + 1} reveal={reveal} /></div>}
    </details>
  )
}

/**
 * 왼쪽 사이드바 (2026-10-04, 노트가 수만 개여도; 10/6 라이브러리 첫 화면).
 * 맨 위 줄 "지식 라이브러리"(첫 화면), 목록 · 지도 줄, 그 아래 접힌 분류 나무(노트 줄 없이 이름으로 목록 거르기).
 * 찾기는 제목줄 검색이, 최근 노트 · 점검 · 통계는 첫 화면이 맡는다. 목록은 서버 색인(SQLite)에서 한 쪽씩 받는다.
 * 아직 옮기지 않은 Study 노트와 옛 LaTeX 노트는 맨 아래 따로. 지도 화면에서 노트를 고르면 지도의 초점이 된다.
 */
export function ConceptSide({ info, route }: { info: LibraryInfo | null; route: Route }) {
  const { data } = useKnowledge(info)
  const study = useStudyBooks()
  const [subjects, setSubjects] = useState<SubjectCount[] | null>(null)
  const [noteCount, setNoteCount] = useState(0)
  const [classifiedTotal, setClassifiedTotal] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [subjectRevision, setSubjectRevision] = useState(0)
  useEffect(() => { const refresh = () => setSubjectRevision((n) => n + 1); window.addEventListener(SUBJECTS_CHANGED, refresh); return () => window.removeEventListener(SUBJECTS_CHANGED, refresh) }, [])
  const onMap = route.page === 'kmap'
  const sel = route.page === 'library' || route.page === 'kmap' ? route.topic : undefined
  useEffect(() => {
    let live = true
    conceptsApi.subjects({}).then((s) => { if (live) { setSubjects(s); setError(null) } }).catch((e: Error) => { if (live) setError(e.message) })
    conceptsApi.list({ limit: 1 }).then((r) => { if (live) setClassifiedTotal(r.total) }).catch(() => {})
    conceptsApi.list({ showEmpty: true, limit: 1 }).then((r) => { if (live) setNoteCount(r.total) }).catch(() => {})
    return () => { live = false }
  }, [info, subjectRevision])
  const [current, setCurrent] = useState<ConceptRow | null>(null)
  useEffect(() => {
    let live = true
    if (sel) conceptsApi.rows([sel]).then((r) => { if (live) setCurrent(r[0] ?? null) }).catch(() => {})
    else setCurrent(null)
    return () => { live = false }
  }, [sel, info, subjectRevision])
  // 빈 노트를 열어도 현재 분류 경로는 0개로 남겨 펼쳐 보인다.
  const idModel = subjects?.some((s) => s.model === 'ids')
  const tree = useMemo(() => subjectTree(!idModel && current && !subjects?.some((s) => s.subject === current.subject)
    ? [...(subjects ?? []), { subject: current.subject, count: 0 }] : subjects ?? []), [subjects, current, idModel])
  const total = idModel ? classifiedTotal : (subjects ?? []).reduce((s, x) => s + x.count, 0)
  const to = (topic: string): Route => (onMap ? { page: 'kmap', topic } : { page: 'library', topic })
  const studyOnly = (data?.topics ?? []).filter((t) => !t.concept && t.study)
  const legacy = (data?.topics ?? []).filter((t) => t.concept && t.concept.format !== 'md')
  const studyRow = (t: KnowledgeTopic) => (
    <button key={t.key} className={`nav cn-row cn-study${sel === t.key ? ' on' : ''}`} data-ui="개념노트 줄" data-ui-item={t.title} onClick={() => go(to(t.key))}>
      <span className="label">{t.title}</span>
    </button>
  )

  return (
    <div className="cn-side" data-ui="개념노트 목록">
      <SideTabs label={t('지식', 'Knowledge')} show={route.page === 'library' && !!sel}>
      <div className="side-quick" data-ui="빠른 이동">
        <button className={`nav side-row${route.page === 'library' && !sel && !isListRoute(route) ? ' on' : ''}`} aria-current={route.page === 'library' && !sel && !isListRoute(route) ? 'page' : undefined} data-ui="지식 라이브러리 줄" title={t('최근 노트 · 점검 · 통계', 'Recent notes · Checks · Stats')} onClick={() => go({ page: 'library' })}>
          <span className="q-ico" aria-hidden>{Icon.library}</span><span className="label">{t('지식 라이브러리', 'Knowledge library')}</span></button>
        <button className={`nav side-row${isListRoute(route) ? ' on' : ''}`} aria-current={isListRoute(route) ? 'page' : undefined} data-ui="목록 줄" onClick={() => showKnowledgeList()}>
          <span className="q-ico" aria-hidden>{Icon.list}</span><span className="label">{t('목록', 'List')}</span><span className="n">{noteCount}</span></button>
        <button className={`nav side-row${onMap && !sel ? ' on' : ''}`} aria-current={onMap && !sel ? 'page' : undefined} data-ui="지도 줄" title={t('개념노트 사이의 링크', 'Links between concept notes')} onClick={() => go({ page: 'kmap' })}>
          <span className="q-ico" aria-hidden>{Icon.tree}</span><span className="label">{t('지도', 'Map')}</span></button>
        {study.enabled && <>
          <button className={`nav side-row${route.page === 'study' && !route.book ? ' on' : ''}`} aria-current={route.page === 'study' && !route.book ? 'page' : undefined} data-ui="공부 줄" title={t('책 · 강의의 장과 개념노트', 'Chapters of books and lectures, and their concept notes')} onClick={() => go({ page: 'study' })}>
            <span className="q-ico" aria-hidden>{Icon.layers}</span><span className="label">{t('공부', 'Study')}</span>{!!study.books?.length && <span className="n">{study.books.length}</span>}</button>
          {study.books?.map((b) => (
            <button key={b.id} className={`nav side-row cn-book${route.page === 'study' && route.book === b.id ? ' on' : ''}`} aria-current={route.page === 'study' && route.book === b.id ? 'page' : undefined} data-ui="공부 책 줄" data-ui-item={b.title} title={b.title} onClick={() => go({ page: 'study', book: b.id })}>
              <span className="label">{b.title}</span><span className="n">{b.done}/{b.chapters}</span></button>
          ))}
        </>}
      </div>
      {error && <div className="empty space-empty">{t('목록을 읽지 못했습니다', 'Could not read the list')}: {error}</div>}
      {!subjects && !error && <div className="cn-loading">{t('목록을 모으는 중…', 'Gathering the list…')}</div>}
      {subjects && total === 0 && <div className="empty space-empty">{noteCount ? t('빈 노트를 뺀 분류가 없습니다.', 'No subjects apart from empty notes.') : t('개념노트가 아직 없습니다. 첫 화면의 "개념노트 만들기"로 더합니다.', 'No concept notes yet. Add one with "New concept note" on the first screen.')}</div>}
      {subjects && total > 0 && <div className="cn-tree-head">{t('분류', 'Subjects')} · {t(`${total}개`, String(total))}</div>}
      <SubjectGroups nodes={tree} reveal={(idModel ? current?.subjects?.[0] : current?.subject) ?? (route.page === 'library' && route.list ? route.subjectPrefix : undefined)} />
      {legacy.length > 0 && (
        <details className="side-grp" open={!!sel && legacy.some((t) => t.key === sel)}>
          <summary title={t('옛 형식(.tex) 개념노트 — Markdown으로 옮기기 전', 'Old format (.tex) concept notes, not yet moved to Markdown')}><span className="chev">›</span><span className="label">{t('LaTeX 개념노트 (옛 형식)', 'LaTeX concept notes (old format)')}</span><span className="n">{legacy.length}</span></summary>
          <div className="side-grp-body">{legacy.map(studyRow)}</div>
        </details>
      )}
      {studyOnly.length > 0 && (
        <details className="side-grp" open={!!sel && studyOnly.some((t) => t.key === sel)}>
          <summary title={t('Study(Obsidian)에만 있고 아직 개념노트로 옮기지 않은 노트 — 읽기만', 'Notes only in Study (Obsidian), not yet moved to concept notes. Read only')}><span className="chev">›</span><span className="label">{t('아직 옮기지 않은 Study 노트', 'Study notes not yet moved')}</span><span className="n">{studyOnly.length}</span></summary>
          <div className="side-grp-body">{studyOnly.map(studyRow)}</div>
        </details>
      )}
      </SideTabs>
    </div>
  )
}

/** 본문 맨 앞의 "# 제목"이 노트 제목과 같으면 뺀다 (제목을 크게 두 번 쓰지 않게) */
function dropTitle(body: string, title: string): string {
  const m = /^\s*#\s+(.+?)\s*\n/.exec(body)
  return m && topicKey(m[1]!) === topicKey(title) ? body.slice(m[0].length) : body
}

/**
 * 개념노트 하나 읽기 · 고치기 (노트 화면 틀, 10/10): 연구노트와 같은 툴바 · 저장 흐름을 쓴다.
 * 툴바 왼쪽: 확인함 · 잠김. 오른쪽: 저장 상태 · 연필 · ⋯. 고치는 동안 저절로 저장하고 "편집 완료"(Esc)로 마친다.
 * 잠긴 노트에서 연필을 누르면 고치는 동안만 잠금을 풀고, 편집 완료 때 다시 잠근다. 잠그기는 문서 정보의 체크.
 * 제목 아래: 다른 이름 · 분류 · 쓰는 곳 · 미완성인 이유.
 * rid를 주면 (프로젝트 탭) 그 프로젝트 전체를 이 개념에 잇거나 끊을 수 있고, 본문의 [[링크]]도 프로젝트 탭으로 연다.
 */
const CONCEPT_SLOTS: RightMode[] = ['info', 'records', 'agent']

export function ConceptNoteView({ id, info, rid, project, side = 'inline', rightOpen = true, tocOwner = null, onChanged, onSaved }: {
  id: string; info: LibraryInfo | null; rid?: string; project?: string
  /** 정보 · 기록을 어디에: 노트 오른쪽의 오른쪽 사이드바(inline, 지식 화면), 또는 앱의 오른쪽 사이드바(external, 프로젝트 탭) */
  side?: 'inline' | 'external'
  /** 지식 화면에서 오른쪽 사이드바를 열었는지 (상단바 단추) */
  rightOpen?: boolean
  /** 이 노트가 지금 칸에 보이면 그 탭 key: 절(##)을 왼쪽 사이드바 맨 아래 목차에 알린다 (10/7 15:54) */
  tocOwner?: string | null
  onChanged(): void; onSaved(msg: string): void
}) {
  const [note, setNote] = useState<ConceptMd | null>(null)
  // 오른쪽 사이드바 기록이 붙은 곳을 절 이름으로 적게 본문을 알린다
  useEffect(() => { if (note) setShownConcept(note) }, [note])
  const scroller = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  /** 고치기를 연 때의 본문 (편집기의 처음 글) */
  const [initial, setInitial] = useState('')
  /** 잠긴 노트를 고치려고 잠시 풀었다: 편집 완료 때 다시 잠근다 */
  const relock = useRef(false)
  /** 저장이 끝날 때마다 하나씩: 저장 전에 시작한 읽기는 바깥 변경으로 보지 않는다 */
  const writes = useRef(0)
  const edit = useNoteEdit(`concept/${id}`, {
    write: async (body, hash) => {
      const next = await conceptsApi.save(id, body, hash)
      writes.current++
      setNote(next)
      return next.hash
    },
  })
  const { saver, state: save, editing, notice, setNotice } = edit
  useNoteSections(scroller, editing ? null : tocOwner, note?.body ?? '', '.cn-body .ob-md h2, .cn-body .ob-md h3')
  const render = useConceptRender()
  // 사이드바를 닫아 두어도 오른쪽 레일이 이 화면의 칸(정보 · 기록 · 에이전트)을 보인다
  useRightSlotsOwner(side === 'inline' ? CONCEPT_SLOTS : null)
  const { data } = useKnowledge(info)
  const [srcs, setSrcs] = useState<ConceptSources | null>(null)
  /** 화면이 가진 노트를 바꾼다 (읽기 · 머리말 고치기). 고치는 중이 아니면 저장기도 그 글로 */
  const adopt = useCallback((n: ConceptMd) => { setNote(n); setError(null); if (saver.state === 'saved' && !saver.pending) saver.load(n.body, n.hash) }, [saver])
  // 늦게 온 읽기는 버린다. 고치는 중에 바깥에서 바뀌면 편집기를 내리지 않고 저장을 멈춘다 (고친 글이 사라지지 않게)
  const reads = useRef(0)
  const editingRef = useRef(editing)
  editingRef.current = editing
  const reload = useCallback(() => {
    const n0 = ++reads.current
    const w0 = writes.current
    conceptsApi.sources(id).then((s) => { if (n0 === reads.current) setSrcs(s) }).catch(() => { if (n0 === reads.current) setSrcs(null) })
    return conceptsApi.read(id).then((n) => {
      if (n0 !== reads.current) return
      // 읽는 사이 이 화면이 저장했거나 저장하는 중이면 그 저장의 결과가 더 새것이다 (저장이 끝나면 라이브러리 알림으로 다시 읽는다)
      if (w0 !== writes.current || saver.state === 'saving') return
      onOutside(saver, n.hash, {
        gone: () => undefined,
        reload: () => { if (editingRef.current) saver.conflict(); else adopt(n) },
      })
    }, (e: Error) => {
      if (n0 !== reads.current) return
      if (editingRef.current) setNotice(t(`이 노트를 다시 읽지 못했습니다. 바깥에서 지웠거나 옮겼을 수 있습니다. 고친 글을 복사해 두세요. (${e.message})`, `Could not read this note again. It may have been deleted or moved outside the app. Copy your edits. (${e.message})`))
      else setError(e.message)
    })
  }, [id, saver, adopt, setNotice])
  // 본문 인용 [@키]는 [1]로: 그 노트에서 처음 나온 순서 (서버가 본문 인용 → 머리말 sources 순으로 준다)
  const options = useMemo<RenderOptions>(() => ({ ...render, cite: (k: string) => { const i = srcs?.sources.findIndex((x) => x.key === k) ?? -1; return i >= 0 ? String(i + 1) : '?' },
    citeTitle: (k: string) => { const e = srcs?.sources.find((x) => x.key === k); return e && !e.missing ? `${citeLabel(e)} · ${e.title ?? k}` : t(`${k} (references.bib에 없음)`, `${k} (not in references.bib)`) } }), [render, srcs])
  // 라이브러리가 바뀌면(info) 다시 읽는다 — 바깥(에이전트·다른 편집기)에서 고친 것도 보이게
  useEffect(() => { void reload() }, [reload, info])

  const setLocked = async (on: boolean, n = note): Promise<ConceptMd | null> => {
    if (!n) return null
    setBusy(true)
    try {
      const next = await conceptsApi.setLocked(id, on, n.hash)
      adopt(next); onChanged()
      return next
    } catch (e) { onSaved((e as Error).message); void reload(); return null } finally { setBusy(false) }
  }
  const lock = async (on: boolean) => {
    if (await setLocked(on)) onSaved(on ? t('수정을 잠갔습니다', 'Editing locked') : t('잠금을 풀었습니다', 'Unlocked'))
  }
  const review = async (choice: ReviewChoice) => {
    if (!note) return
    setBusy(true)
    try {
      adopt(await conceptsApi.setReview(id, choice, note.hash)); onChanged()
      onSaved(choice === 'ok' ? t('확인함으로 표시했습니다', 'Marked as reviewed') : choice === 'todo' ? t('확인 전으로 표시했습니다', 'Marked as not reviewed') : t('확인 표시를 뺐습니다', 'Review mark removed'))
    } catch (e) { onSaved((e as Error).message); void reload() } finally { setBusy(false) }
  }
  const startEdit = async () => {
    if (!note || busy) return
    let n: ConceptMd | null = note
    if (note.meta.locked) {
      n = await setLocked(false)
      if (!n) return
      relock.current = true
      onSaved(t('고치는 동안 잠금을 풀었습니다. 편집 완료 때 다시 잠급니다', 'Unlocked while you edit. It locks again when you click Done'))
    }
    saver.load(n.body, n.hash)
    setInitial(n.body)
    edit.start(n.meta.title, true)
  }
  const finish = () => edit.finish(async () => {
    onChanged()
    if (!relock.current) return
    relock.current = false
    // 저장 결과가 화면에 오기 전일 수 있어 지금 파일의 hash로 잠근다
    const n = await conceptsApi.read(id).catch(() => null)
    if (n && await setLocked(true, n)) onSaved(t('다시 잠갔습니다', 'Locked again'))
  })
  const discardAndReload = () => { edit.setEditing(false); relock.current = false; void conceptsApi.read(id).then((n) => { saver.load(n.body, n.hash); adopt(n); setNotice(t('파일을 다시 읽었습니다. 이 화면에서 저장하지 않은 고침은 버렸습니다.', 'Reloaded the file. Unsaved edits on this screen were discarded.')) }, (e: Error) => setNotice(e.message)) }
  // 다른 노트로 가면 고치기를 끝낸다 (고치던 것은 저장기가 내려가며 저장한다)
  useEffect(() => { edit.setEditing(false); relock.current = false; setNotice(null) }, [id]) // eslint-disable-line react-hooks/exhaustive-deps
  /** 본문의 [[링크]]를 누르면 그 개념으로(프로젝트 탭이면 프로젝트 안에서), [@인용]을 누르면 출처로 */
  const follow = (e: React.MouseEvent) => {
    // [1]을 누르면 아래 출처 목록의 그 줄로 (10/4 사용자: 출처로 간 뒤 거기서 논문을 연다)
    const cite = (e.target as HTMLElement).closest('.ob-cite')?.getAttribute('data-keys')?.split(' ')[0]
    if (cite) {
      e.preventDefault()
      // 아래 출처의 그 줄로 가서 잠깐 표시한다. 문헌은 출처 줄에서 연다
      const li = document.getElementById(`cn-src-${cite}`)
      li?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      li?.classList.remove('flash'); void li?.offsetWidth; li?.classList.add('flash')
      return
    }
    const target = (e.target as HTMLElement).closest('.ob-link')?.getAttribute('title')?.replace(/#.*$/, '').split('/').pop()
    if (!target) return
    // 개념노트는 색인에서 찾고, 없으면 아직 옮기지 않은 Study 노트에서 (Study 노트는 지식 화면에만 있다)
    void conceptsApi.resolve(target).then((r) => {
      if (r) return go(rid ? { page: 'concept', rid, id: r.id } : { page: 'library', topic: r.id })
      const k = topicKey(target)
      const hit = data?.topics.find((t) => t.names.includes(k))
      if (hit) go({ page: 'library', topic: hit.key })
    }).catch(() => {})
  }

  if (error) return <div className="ws-doc"><section className="pane"><div className="page-body"><p className="muted">{error}</p></div></section></div>
  if (!note) return <div className="ws-doc"><section className="pane"><div className="empty center">{t('읽는 중…', 'Loading…')}</div></section></div>
  const m = note.meta
  const setSubjects = async (ids: string[]) => {
    setBusy(true)
    try { adopt(await subjectsApi.concept(id, ids, note.hash)); onChanged(); onSaved(t('분류를 고쳤습니다', 'Subjects updated')) }
    catch (e) { await reload(); throw e } finally { setBusy(false) }
  }
  const doc: DocState = { note, onSubjects: setSubjects, busy: busy || editing, onReview: (c: ReviewChoice) => void review(c), onLock: (on: boolean) => void lock(on) }
  const confirmation = <span className="cn-confirm" title={note.checked === 'changed' ? t('확인 뒤 고침 — 본문을 다시 확인해 주세요', 'Edited after review. Please review the text again') : undefined}><i className="mark-ico" aria-hidden>{note.checked === 'ok' ? Icon.check : Icon.unchecked}</i>{note.checked === 'ok' ? t('확인함', 'Reviewed') : t('확인 전', 'Not reviewed')}</span>
  const status = <>{confirmation}{m.locked && <span className="tag" title={t('잠긴 노트는 앱과 에이전트가 고치지 않습니다. 연필을 누르면 고치는 동안만 풀립니다', 'The app and agents do not edit locked notes. The pencil unlocks it while you edit')}>{t('잠김', 'Locked')}</span>}</>
  const shownBody = dropTitle(note.body, m.title)
  return (
    <NoteScreen ui="개념노트" className="cn-doc" notice={notice} onCloseNotice={() => setNotice(null)}
      // 프로젝트 탭: 문서 정보는 앱 오른쪽 사이드바 "정보" 맨 위에 (ConceptSidePanel의 slot)
      tocOwner={side === 'external' ? tocOwner : null} side={side === 'external' && <ConceptDocInfo id={id} doc={doc} />}
      toolbar={{
        ui: '머리줄',
        title: <span className="cn-toolbar-title" title={m.title}>{m.title}</span>,
        status, save, editing,
        saveAction: edit.saveAction(discardAndReload),
        view: edit.view, onView: edit.setView,
        onEdit: () => void startEdit(), editDisabled: busy || save === 'conflict', onDone: () => void finish(),
        menu: [{ label: t('파일 다시 읽기', 'Reload file'), ui: '파일 다시 읽기', tip: t('파일을 다시 읽습니다. 이 화면에서 저장하지 않은 고침은 버립니다', 'Reads the file again. Unsaved edits on this screen are discarded'), onClick: discardAndReload }],
      }}>
      <div ref={scroller} className={`scroll kn-read${editing ? ' cn-editing' : ''}${tocOwner ? ' cn-toc-scroll' : ''}`} onClick={editing ? undefined : follow}>
        <div className={`cn-layout${side === 'inline' && rightOpen ? ' with-side' : ''}`}>
        {/* 고른 글 하이라이트 · 기록은 읽기와 고치기 모두에서 (기록은 라이브러리 workbench/comments/concept-<id>.md, 10/18) */}
        {editing ? <ConceptRecords note={note} shown={initial} editing><ConceptEditor initial={initial} options={options} editView={edit.view}
            onChange={(body) => saver.edit(body)} onSave={(body) => { saver.edit(body); void edit.saveNow() }} onCancel={() => void finish()} /></ConceptRecords> : <div className="page-body cn-body">
          <header className="cn-head">
          <h1 className="h-title">{m.title}</h1>
          </header>
          <ConceptRecords note={note} shown={shownBody}><ObsidianMarkdown text={shownBody} options={options} /></ConceptRecords>
          <ConceptSourcesList srcs={srcs} />
        </div>}
        {side === 'inline' && rightOpen && <aside className="cn-side-col"><RightSidebar ownSlots={false} info={<div className="rs-pad"><ConceptSidePanel id={id} info={info} rid={rid} project={project} doc={doc} onChanged={onChanged} onSaved={onSaved} /></div>}
          records={<ConceptRecordsPanel id={id} title={m.title} />} agent={<AgentPanel rid={LIBRARY_RID} onSaved={onSaved} />} /></aside>}
        </div>
      </div>
    </NoteScreen>
  )
}
