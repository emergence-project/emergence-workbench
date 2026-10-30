import { SubjectPicker, useSubjects, SUBJECTS_CHANGED } from './SubjectPicker'
import { subjectsApi, type SubjectCount } from './api/subjects'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { api, conceptsApi, knowledgeApi, topicKey, type ConceptMd, type ConceptRow, type ConceptSources, type ConceptUse, type KnowledgeInfo, type KnowledgeTopic, type LibraryInfo } from './api'
import { useConceptMacros } from './conceptMacros'
import { useFigureUrl } from './figureEmbed'
import { ConceptEditor } from './ConceptEditor'
import { Icon } from './icons'
import { ObsidianMarkdown, type RenderOptions } from './ObsidianMarkdown'
import { go, type Route } from './router'
import { ConceptRecords, ConceptRecordsPanel, setShownConcept } from './ConceptRecords'
import { onOutside } from './autosave'
import { useNoteEdit } from './noteEdit'
import { NoteScreen } from './NoteScreenFrame'
import { RightSidebar } from './RightSidebar'
import { openRight, setRightSlot, useRightMode } from './noteScreen'
import { showKnowledgeList } from './knowledgeListState'
import { subjectTree, type SubjNode } from './knowledgeSubjects'
import { isListRoute } from './router'
import { useNoteSections } from './MarkdownNote'
import { SideTabs } from './SectionToc'
import { plural, t } from './i18n'

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
  const { data } = useKnowledge(info)
  const mode = useRightMode()
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
        onComment: () => openRight('records'), commentOn: mode === 'records',
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
        {side === 'inline' && rightOpen && <aside className="cn-side-col"><RightSidebar info={<div className="rs-pad"><ConceptSidePanel id={id} info={info} rid={rid} project={project} doc={doc} onChanged={onChanged} onSaved={onSaved} /></div>}
          records={<ConceptRecordsPanel id={id} title={m.title} />} /></aside>}
        </div>
      </div>
    </NoteScreen>
  )
}

/**
 * 문서 정보 (10/4 18:09 "미완성 태그와 문서 정보 등은 우측 사이드바로 모으자"):
 * 사용자 확인(확인 전·확인함), 상태(미완성·잠김), 미완성인 까닭, 분류, 다른 이름, 파일.
 */
type ReviewChoice = 'none' | 'todo' | 'ok'
interface DocState { onSubjects(ids: string[]): Promise<void>; note: ConceptMd; busy: boolean; onReview(c: ReviewChoice): void; onLock(on: boolean): void }
const REVIEW: { v: ReviewChoice; label: ReactNode; title: string }[] = [
  { v: 'none', label: <><i className="mark-ico" aria-hidden>{Icon.unchecked}</i> {t('확인 전', 'Not reviewed')}</>, title: t('확인 표시를 뺍니다', 'Removes the review mark') },
  { v: 'ok', label: <><i className="mark-ico" aria-hidden>{Icon.check}</i> {t('확인함', 'Reviewed')}</>, title: t('내용을 읽고 맞다고 확인했을 때. 본문이 바뀌면 "확인 뒤 고침"으로 바뀝니다', 'When you have read and confirmed the content. If the text changes, it becomes "Edited after review"') },
]
function ConceptDocInfo({ id, doc, compact }: { id: string; doc: DocState; compact?: boolean }) {
  const { note, busy, onReview } = doc
  const { tree, error } = useSubjects(id, note.hash)
  const m = note.meta
  // Existing none/todo/changed values share one on-screen confirmation state.
  const cur: ReviewChoice = note.checked === 'ok' ? 'ok' : 'none'
  const states = [
    note.unfinished.length > 0 && <span key="un" className="cn-state" title={t('빈 절, TODO 표시, 제목·틀뿐인 노트를 앱이 찾아 붙입니다', 'The app adds this for empty sections, TODO marks, and notes with only a title or outline')}>{t('미완성', 'Unfinished')}</span>,
  ].filter(Boolean)
  return (
    <section className={`cn-info${compact ? ' compact' : ''}`} data-ui="문서 정보">
      {!compact && <h2 className="cn-links-h">{t('문서 정보', 'Document info')}</h2>}
      <div className="cn-review" data-ui="사용자 확인">
        <div className="segmented small" role="radiogroup" aria-label={t('사용자 확인', 'Your review')}>
          {REVIEW.map((r) => <button key={r.v} className={cur === r.v ? 'on' : ''} role="radio" aria-checked={cur === r.v} disabled={busy} title={r.title} onClick={() => { if (cur !== r.v) onReview(r.v) }}>{r.label}</button>)}
        </div>
        {note.checked === 'ok' && m.checked?.at && <span className="muted">{m.checked.at}</span>}
        {note.checked === 'changed' && <span className="muted" title={t(`${m.checked?.at ?? ''}에 확인했습니다`, `Reviewed at ${m.checked?.at ?? ''}`)}>{t('확인 뒤 고침 · 다시 확인하려면 ✓ 확인함', 'Edited after review · Click ✓ Reviewed to review again')}</span>}
      </div>
      <label className="check" data-ui="고치기 잠금" title={t('잠그면 앱과 에이전트가 이 노트를 고치지 않습니다. 잠긴 노트도 연필을 누르면 고치는 동안만 풀립니다', 'When locked, the app and agents do not edit this note. The pencil still unlocks it while you edit')}>
        <input type="checkbox" checked={!!m.locked} disabled={busy} onChange={(e) => doc.onLock(e.target.checked)} />{t('잠그기', 'Lock')}
      </label>
      {states.length > 0 && <div className="cn-facts">{states}</div>}
      {note.unfinished.length > 0 && <ul className="cn-why">{note.unfinished.map((u) => <li key={u}>{u}</li>)}</ul>}
      <dl className="cn-info-list">
        {tree?.enabled ? <><dt>{t('분류', 'Subject')}</dt><dd><SubjectPicker tree={tree} value={m.subjects ?? []} disabled={busy} onChange={doc.onSubjects} /></dd></> : m.subject && <><dt>{t('분류', 'Subject')}</dt><dd>{m.subject}</dd></>}
        {error && <><dt>{t('분류', 'Subject')}</dt><dd className="error">{error}</dd></>}
        {m.aliases.length > 0 && <><dt>{t('다른 이름', 'Aliases')}</dt><dd>{m.aliases.join(', ')}</dd></>}
        <dt>{t('파일', 'File')}</dt><dd className="mono cn-info-path" title={`shared-library/concepts/${id}.md`}>{id.split('/').pop()}.md</dd>
        {m.study && <><dt>Study</dt><dd title={m.study}>{t('Study에서 옮김', 'Moved from Study')}</dd></>}
      </dl>
    </section>
  )
}

/** 문헌을 여는 주소: arXiv가 있으면 arXiv, 아니면 DOI */
export function sourceUrl(e: { eprint?: string; doi?: string }): string | undefined {
  return e.eprint ? `https://arxiv.org/abs/${e.eprint}` : e.doi ? `https://doi.org/${e.doi}` : undefined
}

/** "Example et al. 2022" — bib의 author(성, 이름 and …)와 year로 */
export function citeLabel(e: { author?: string; year?: string; key: string }): string {
  const names = (e.author ?? '').split(/\s+and\s+/).map((a) => (a.includes(',') ? a.split(',')[0]! : a.trim().split(/\s+/).pop() ?? '').replace(/[{}]/g, '').trim()).filter(Boolean)
  if (!names.length) return e.key
  const who = names.length === 1 ? names[0] : names.length === 2 ? `${names[0]}, ${names[1]}` : `${names[0]} et al.`
  return `${who}${e.year ? ` ${e.year}` : ''}`
}

/** 노트 본문 아래 출처 목록: 머리말 sources + 본문 [@키] (references.bib에서). 노트에 글로 적지 않고 앱이 모은다 (2026-10-04 결정) */
function ConceptSourcesList({ srcs }: { srcs: ConceptSources | null }) {
  const sources = srcs?.sources ?? []
  const unsorted = srcs?.unsorted ?? []
  return (
    <section className="cn-links" data-ui="출처와 쓰는 개념">
      <h2 className="cn-links-h">{t('출처', 'Sources')}</h2>
      {sources.length === 0 && unsorted.length === 0 && <p className="muted">{t('아직 없음 · 본문에 [@인용 키]를 적거나 머리말 sources:에 references.bib 키를 넣습니다', 'None yet · Write [@citation key] in the text or put references.bib keys in sources: in the front matter')}</p>}
      {sources.length > 0 && (
        <ol className="cn-src">
          {sources.map((e) => (
            <li key={e.key} id={`cn-src-${e.key}`}>
              {e.missing
                ? <><span className="mono">{e.key}</span> <span className="muted">{t('references.bib에 없는 키', 'Key not in references.bib')}</span></>
                : <>
                  <span>{citeLabel(e)}</span>{' · '}
                  {sourceUrl(e)
                    ? <a className="a cn-src-title" href={sourceUrl(e)} target="_blank" rel="noreferrer" title={t('논문 페이지 열기', 'Open paper page')}>{e.title ?? e.key}</a>
                    : <span className="cn-src-title">{e.title ?? e.key}</span>}
                  {e.journal && <span className="muted"> · {e.journal}</span>}
                  {e.eprint && <>{' · '}<a className="a" href={`https://arxiv.org/abs/${e.eprint}`} target="_blank" rel="noreferrer">arXiv:{e.eprint}</a></>}
                  {e.doi && <>{' · '}<a className="a" href={`https://doi.org/${e.doi}`} target="_blank" rel="noreferrer">doi</a></>}
                </>}
            </li>
          ))}
        </ol>
      )}
      {unsorted.length > 0 && (
        <div className="cn-unsorted">
          <p className="muted">{t('bib 키로 아직 바꾸지 못한 출처', 'Sources not yet turned into bib keys')} ({unsorted.length})</p>
          <ul>{unsorted.map((x, i) => <li key={i}>{x}</li>)}</ul>
        </div>
      )}
    </section>
  )
}

/**
 * 오른쪽 사이드바 (2026-10-04 15:18 피드백 "우측 사이드바에서 하기로"): 메모·할 일, 이 개념을 쓰는 개념, 이 노트가 가리키는 개념.
 * 연결은 색인에서 바로 받는다. 지식 화면에서는 노트 오른쪽 칸, 프로젝트에서는 앱의 맥락 칸에 놓인다.
 */
export function ConceptSidePanel({ id, info, rid, project, doc, slot, onChanged, onSaved }: {
  id: string; info: LibraryInfo | null; rid?: string; project?: string
  /** 읽고 있는 노트: 있으면 맨 위에 문서 정보 */
  doc?: DocState
  /** 프로젝트 탭: 맨 위에 노트 화면이 문서 정보를 그릴 자리 */
  slot?: boolean
  onChanged(): void; onSaved(msg: string): void
}) {
  const [links, setLinks] = useState<{ out: ConceptRow[]; back: ConceptRow[]; missing: string[] } | null>(null)
  useEffect(() => {
    let live = true
    conceptsApi.links(id).then((l) => { if (live) setLinks(l) }).catch(() => { if (live) setLinks(null) })
    return () => { live = false }
  }, [id, info])
  const chips = (rows: ConceptRow[]) => rows.length === 0
    ? <p className="muted">{t('아직 없음', 'None yet')}</p>
    : <div className="cn-facts">{rows.map((r) => <button key={r.id} className="dep-chip" onClick={(ev) => { ev.stopPropagation(); go(rid ? { page: 'concept', rid, id: r.id } : { page: 'library', topic: r.id }) }}>{r.title}</button>)}</div>
  return (
    <div className="cn-side-panel">
      {doc && <ConceptDocInfo id={id} doc={doc} />}
      {slot && <div ref={setRightSlot} className="rs-slot" />}
      <ConceptUses id={id} info={info} rid={rid} project={project} onChanged={onChanged} onSaved={onSaved} />
      <section>
        <h2 className="cn-links-h">{t('이 개념을 쓰는 개념', 'Concepts that use this')}</h2>
        {chips(links?.back ?? [])}
      </section>
      <section>
        <h2 className="cn-links-h">{t('이 노트가 가리키는 개념', 'Concepts this note links to')}</h2>
        {chips(links?.out ?? [])}
        {(links?.missing.length ?? 0) > 0 && <p className="muted" title={t('이 이름의 개념노트가 아직 없습니다', 'No concept note with this name yet')}>{t('노트 없는 링크', 'Links without a note')}: {links!.missing.join(', ')}</p>}
      </section>
    </div>
  )
}

/**
 * 쓰는 곳과 인용 (10/4 16:59 피드백 "쓰는 곳이랑 인용 문헌 관리 같이 생각해줘야해").
 * 이 개념을 쓰는 프로젝트마다: 기대는 연구노트, 그리고 개념노트의 출처([1], [2] …)를 그 프로젝트 bib도 갖고 있는지.
 * 원고에서 이 개념을 쓸 때 출처를 빠뜨리지 않게 한다. 같은 논문을 다른 키로 적어도 arXiv 번호·DOI·제목으로 알아본다.
 */
function ConceptUses({ id, info, rid, project, onChanged, onSaved }: {
  id: string; info: LibraryInfo | null; rid?: string; project?: string; onChanged(): void; onSaved(msg: string): void
}) {
  const [uses, setUses] = useState<ConceptUse[] | null>(null)
  const [srcs, setSrcs] = useState<ConceptSources | null>(null)
  useEffect(() => {
    let live = true
    conceptsApi.usage(id).then((u) => { if (live) setUses(u) }).catch(() => { if (live) setUses([]) })
    conceptsApi.sources(id).then((s) => { if (live) setSrcs(s) }).catch(() => { if (live) setSrcs(null) })
    return () => { live = false }
  }, [id, info])
  const link = (r: string, name: string, on: boolean) => {
    api.linkConcept(r, id, on).then(() => { onChanged(); onSaved(on ? t(`${name}에 이 개념노트를 연결했습니다`, `Linked this concept note to ${name}`) : t(`${name}와의 연결을 끊었습니다`, `Unlinked from ${name}`)) }).catch((e: Error) => onSaved(e.message))
  }
  const num = (key: string) => (srcs?.sources.findIndex((s) => s.key === key) ?? -1) + 1
  const label = (key: string) => { const e = srcs?.sources.find((s) => s.key === key); return e && !e.missing ? citeLabel(e) : key }
  const linkedHere = !!rid && !!uses?.some((u) => u.rid === rid && u.linked)
  return (
    <section data-ui="쓰는 곳">
      <h2 className="cn-links-h">{t('사용처와 인용', 'Used in and citations')}</h2>
      {uses?.length === 0 && <p className="muted">{t('아직 쓰는 프로젝트가 없습니다', 'No project uses this yet')}</p>}
      {uses?.map((u) => {
        const have = u.cites.filter((c) => c.projectKey)
        const lack = u.cites.filter((c) => !c.projectKey)
        return (
          <div key={u.rid} className="cn-use">
            <div className="cn-use-head">
              <button className="a cn-use-name" onClick={(ev) => { ev.stopPropagation(); go({ page: 'map', rid: u.rid }) }}>{u.project}</button>
              {u.linked && <span className="hover-actions"><button className="icon-btn" data-ui="개념 연결 끊기" title={t(`연결 끊기 — ${u.project}의 research.yaml concepts:에서 뺍니다`, `Unlink: removes it from concepts: in ${u.project}'s research.yaml`)} aria-label={t('연결 끊기', 'Unlink')} onClick={() => link(u.rid, u.project, false)}>×</button></span>}
            </div>
            {u.notes.length > 0 && <div className="cn-facts">{u.notes.map((n) => <button key={n.file} className="dep-chip" onClick={(ev) => { ev.stopPropagation(); go({ page: 'part', rid: u.rid, file: n.file }) }}>{n.title}</button>)}</div>}
            {u.cites.length > 0 && (
              <p className="cn-use-cites" title={t('이 개념노트의 출처가 프로젝트 bib에도 있는지 (같은 논문을 다른 키로 적어도 arXiv 번호·DOI·제목으로 찾습니다)', "Whether this concept note's sources are also in the project bib (matched by arXiv number, DOI, or title even under a different key)")}>
                {lack.length === 0 ? <>✓ {t(`출처 ${have.length}개 모두 이 프로젝트 bib에 있음`, `All ${plural(have.length, 'source')} are in this project's bib`)}</> : <>{t(`출처 ${u.cites.length}개 중 ${have.length}개가 이 프로젝트 bib에 있음`, `${have.length} of ${plural(u.cites.length, 'source')} are in this project's bib`)}</>}
              </p>
            )}
            {lack.length > 0 && <p className="muted">{t('bib에 없음', 'Not in bib')}: {lack.map((c) => `[${num(c.key)}] ${label(c.key)}`).join(', ')}</p>}
            {have.some((c) => c.projectKey !== c.key) && <p className="muted">{t('다른 키', 'Other keys')}: {have.filter((c) => c.projectKey !== c.key).map((c) => `[${num(c.key)}] ${c.projectKey}`).join(', ')}</p>}
          </div>
        )
      })}
      {rid && uses && !linkedHere && <button className="a cn-use-add" data-ui="개념 연결" title={t('프로젝트 전체가 이 개념에 기댄다고 적습니다 (workbench/research.yaml의 concepts:)', 'Records that the whole project relies on this concept (concepts: in workbench/research.yaml)')} onClick={() => link(rid, project ?? t('이 프로젝트', 'this project'), true)}>＋ {t(`${project ?? '이 프로젝트'}에 연결`, `Link to ${project ?? 'this project'}`)}</button>}
    </section>
  )
}

