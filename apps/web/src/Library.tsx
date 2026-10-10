import { parseBlock, updateBlockMeta, type LatexTemplate } from '@rw/core'
import { useCallback, useEffect, useRef, useState } from 'react'
import { api, type CompileResult, knowledgeApi, latexApi, topicKey, type KnowledgeTopic, type LibraryInfo, type LibraryKind } from './api'
import { ConceptNoteView, useKnowledge } from './ConceptNotes'
import { KnowledgeHome } from './KnowledgeHome'
import { Editor, type EditorHandle } from './Editor'
import { KnowledgeMap, STATUS_NAME } from './KnowledgeMap'
import { ObsidianMarkdown } from './ObsidianMarkdown'
import { PdfView } from './PdfView'
import { go } from './router'
import { Icon } from './icons'
import { useAutosave } from './autosave'
import { t } from './i18n'
/** 저장하고 이만큼 더 손을 멈추면 PDF를 다시 만든다 */
const COMPILE_AFTER_MS = 1500
export const KIND_NAME: Record<LibraryKind, string> = { concept: t('개념노트', 'Concept note'), paper: t('문헌노트', 'Literature note') }
/** 피드백 모드 부위 이름 (언어와 상관없이 한국어) */
const KIND_UI: Record<LibraryKind, string> = { concept: '개념노트', paper: '문헌노트' }

/**
 * 공유 라이브러리 노트 하나 (개념노트·문헌노트): 머리 정보(상태·쓰는 곳·Study 출처) + LaTeX 원문.
 * 라이브러리 화면과 프로젝트 작업 화면의 탭이 함께 쓴다. 저장은 블록과 같은 안전장치.
 */
export function LibraryNoteEditor({ kind, id, info, rid, project, onChanged, onSaved }: {
  kind: LibraryKind; id: string; info: LibraryInfo | null
  /** 이 노트를 연 프로젝트. 개념노트면 프로젝트 전체를 잇거나 끊을 수 있다 */
  rid?: string; project?: string
  onChanged(): void; onSaved(msg: string): void
}) {
  const note = info?.notes.find((n) => n.kind === kind && n.id === id)
  const uses = info?.usedBy[`${kind}:${id}`] ?? []
  // 프로젝트 전체가 이 개념에 기대는지 (보조 노트 없이, research.yaml의 concepts:)
  const linkedHere = !!rid && uses.some((u) => u.rid === rid && !u.note)
  const link = (on: boolean) => {
    if (!rid) return
    api.linkConcept(rid, id, on).then(() => { onChanged(); onSaved(on ? t(`${project ?? '이 프로젝트'}에 이 개념노트를 연결했습니다`, `Linked this concept note to ${project ?? 'this project'}`) : t(`${project ?? '이 프로젝트'}와의 연결을 끊었습니다`, `Unlinked from ${project ?? 'this project'}`)) }).catch((e: Error) => onSaved(e.message))
  }
  const [loaded, setLoaded] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const editor = useRef<EditorHandle>(null)
  // 오른쪽 PDF (분할 보기, 피드백 10/3 09:05): 저장한 뒤 잠시 멈추면 다시 컴파일한다
  const [pdfVersion, setPdfVersion] = useState<number | null>(null)
  const [compiling, setCompiling] = useState(false)
  const [result, setResult] = useState<(CompileResult & { warnings?: string[] }) | null>(null)
  const compileTimer = useRef<number | undefined>(undefined)
  // PDF 서식 (10/4 13:05 피드백 "latex rendering template을 library에 추가하고, compile시 선택"): 설정의 LaTeX 서식 중 문서 서식. 비우면 예전처럼 article
  const [templates, setTemplates] = useState<LatexTemplate[]>([])
  const [template, setTemplate] = useState(() => readPick(kind, id))
  useEffect(() => { latexApi.get().then((v) => setTemplates(v.templates.filter((t) => t.kind === 'document'))).catch(() => undefined) }, [])
  useEffect(() => setTemplate(readPick(kind, id)), [kind, id])
  // 앞 컴파일이 도는 중이면 겹쳐 돌리지 않고, 끝난 뒤 한 번만 다시 돈다(그사이 저장한 글로)
  const busy = useRef(false)
  const again = useRef(false)
  const compile = useCallback(async (tpl?: string) => {
    window.clearTimeout(compileTimer.current)
    if (busy.current) { again.current = true; return }
    busy.current = true
    setCompiling(true)
    try {
      const r = await api.compileLibraryNote(kind, id, tpl ?? template)
      setResult(r)
      if (r.hasPdf) setPdfVersion(Date.now())
    } catch (e) { setResult({ ok: false, durationMs: 0, hasPdf: false, problems: [{ file: '', line: 0, message: (e as Error).message, inBlock: false }], logTail: '' }) }
    finally {
      busy.current = false
      setCompiling(false)
      if (again.current) { again.current = false; void compileRef.current() }
    }
  }, [kind, id, template])
  const compileRef = useRef(compile)
  compileRef.current = compile
  useEffect(() => {
    setPdfVersion(null); setResult(null)
    let cancelled = false
    // 지난번 PDF가 있으면 먼저 보이고, 없으면 한 번 만든다
    fetch(api.libraryPdfUrl(kind, id, 0), { method: 'HEAD' }).then((h) => {
      if (cancelled) return
      if (h.ok) setPdfVersion(Date.now())
      else void compileRef.current()
    }).catch(() => undefined)
    return () => { cancelled = true; window.clearTimeout(compileTimer.current) }
  }, [kind, id])

  const { saver, state } = useAutosave(`${kind}/${id}`, {
    write: (text, hash) => api.saveLibraryNote(kind, id, text, hash),
    onSaved: () => {
      onChanged()
      window.clearTimeout(compileTimer.current)
      compileTimer.current = window.setTimeout(() => { void compileRef.current() }, COMPILE_AFTER_MS)
    },
    onError: (e) => setNotice(e.message),
  })
  const load = useCallback(async (msg?: string) => {
    const d = await api.readLibraryNote(kind, id)
    saver.load(d.content, d.hash)
    if (loaded !== null) editor.current?.replaceContent(d.content)
    else setLoaded(d.content)
    if (msg) setNotice(msg)
  }, [kind, id, loaded, saver])
  useEffect(() => { setLoaded(null); api.readLibraryNote(kind, id).then((d) => { saver.load(d.content, d.hash); setLoaded(d.content) }).catch((e: Error) => setNotice(e.message)) }, [kind, id, saver])

  const save = useCallback(() => saver.flush(), [saver])
  const onChange = useCallback((text: string) => saver.edit(text), [saver])

  /** 머리말 status를 바꾼다 (draft ↔ reviewed). 물리·수학 검토는 사용자만 */
  const setStatus = async (status: 'draft' | 'reviewed') => {
    const next = updateBlockMeta(saver.text, { status })
    saver.edit(next)
    editor.current?.replaceContent(next)
    if (await save()) onSaved(status === 'reviewed' ? t('확인함으로 표시했습니다', 'Marked as reviewed') : t('확인 전으로 되돌렸습니다', 'Set back to not reviewed'))
  }
  const status = loaded !== null ? parseBlock(saver.text).meta.status ?? 'draft' : note?.status ?? 'draft'

  return (
    <div className="ws-doc" data-ui={KIND_UI[kind]}>
      <section className="pane">
        <div className="pane-head" data-ui="머리줄">
          <span className="crumb">{KIND_NAME[kind]} · <b>{note?.title ?? id}</b></span>
          <span className={`lib-status ${status}`} title={t('확인 전: 아직 확인하지 않음 · 확인함: 사용자가 물리·수학 검토를 마침', 'Not reviewed: not checked yet · Reviewed: you finished the physics and math review')}>{STATUS_NAME[status as 'draft' | 'reviewed'] ?? status}</span>
          {note?.empty && <span className="lib-empty" title={t('구조만 있고 내용이 없습니다', 'Has structure but no content')}>{t('빈 노트', 'Empty note')}</span>}
          <span className="sp" />
          {status === 'reviewed'
            ? <button className="btn" onClick={() => void setStatus('draft')}>{t('확인 전으로 되돌리기', 'Mark not reviewed')}</button>
            : <button className="btn" onClick={() => void setStatus('reviewed')} title={t('사용자가 내용을 검토했을 때만', 'Only when you have reviewed the content')}>{t('확인함으로 표시', 'Mark reviewed')}</button>}
        </div>
        {state === 'conflict' && (
          <div className="banner danger">{t('다른 곳(에이전트나 다른 편집기)에서 이 파일이 바뀌어 저장을 멈췄습니다. 덮어쓰지 않았습니다.', 'This file changed elsewhere (an agent or another editor), so saving stopped. Nothing was overwritten.')}
            <span className="sp" /><button className="btn" onClick={() => void load(t('파일을 다시 읽었습니다. 이 화면에서 고친 내용은 버렸습니다.', 'Reloaded the file. Edits on this screen were discarded.'))}>{t('파일 다시 읽기', 'Reload file')}</button></div>
        )}
        {notice && <div className="banner">{notice}<span className="sp" /><button className="btn ghost" onClick={() => setNotice(null)}>{t('닫기', 'Close')}</button></div>}
        <div className="lib-meta" data-ui="쓰는 곳">
          <span className="muted">{t('쓰는 곳', 'Used in')}</span>
          {uses.length === 0 && <span className="muted">{t('아직 없음', 'None yet')}</span>}
          {uses.map((u, i) => (
            <button key={i} className="dep-chip" onClick={() => go(u.note ? { page: 'block', rid: u.rid, bid: u.note } : { page: 'map', rid: u.rid })}>
              {u.project}{u.noteTitle ? ` · ${u.noteTitle}` : ''}
            </button>
          ))}
          {kind === 'concept' && rid && (linkedHere
            ? <button className="btn ghost" data-ui="개념 연결 끊기" title={t('research.yaml의 concepts:에서 뺍니다', 'Removes it from concepts: in research.yaml')} onClick={() => link(false)}>{t('연결 끊기', 'Unlink')}</button>
            : <button className="btn" data-ui="개념 연결" title={t('프로젝트 전체가 이 개념에 기댄다고 적습니다 (workbench/research.yaml의 concepts:)', 'Records that the whole project relies on this concept (concepts: in workbench/research.yaml)')} onClick={() => link(true)}>＋ {t(`${project ?? '이 프로젝트'}에 연결`, `Link to ${project ?? 'this project'}`)}</button>)}
          {note?.study && <span className="muted" title={note.study}>· {t('Study에서 가져옴', 'Imported from Study')}</span>}
          {kind === 'paper' && note?.eprint && <span className="muted">· arXiv:{note.eprint}</span>}
        </div>
        <div className="lib-split">
          <div className="lib-src">
            {loaded !== null && <Editor key={`${kind}/${id}`} ref={editor} initial={loaded} errorLines={result?.problems.filter((p) => p.inBlock && p.line > 0).map((p) => p.line) ?? []} onChange={onChange} onCursorLine={() => undefined} onSave={() => void save()} onCompile={() => void save().then((ok) => { if (ok) void compile() })} />}
          </div>
          <div className="lib-pdf" data-ui="개념노트 PDF">
            {result && !result.ok && result.problems.length > 0 && (
              <div className="banner danger lib-problems">{result.problems.slice(0, 3).map((p, i) => <div key={i}>{p.line > 0 ? t(`${p.line}행: `, `Line ${p.line}: `) : ''}{p.message}</div>)}</div>
            )}
            {result?.warnings?.length ? <div className="banner lib-problems">{result.warnings.map((w, i) => <div key={i}>{w}</div>)}</div> : null}
            {pdfVersion !== null
              ? <PdfView url={api.libraryPdfUrl(kind, id, pdfVersion)} highlight={[]} onPick={() => undefined} />
              : <div className="ws-empty">{compiling ? t('PDF를 만드는 중…', 'Making PDF…') : t('PDF가 아직 없습니다', 'No PDF yet')}</div>}
          </div>
        </div>
        <div className="statusline">
          <span className="mono">research-library/{kind === 'concept' ? 'concepts' : 'papers'}/{id}.tex</span>
          <span className="sp" />
          <select className="tex-pick" data-ui="PDF 서식" title={t('PDF를 만들 LaTeX 서식 (설정 › LaTeX 서식)', 'LaTeX template for the PDF (Settings › LaTeX templates)')} value={template}
            onChange={(e) => { setTemplate(e.target.value); writePick(kind, id, e.target.value); void compile(e.target.value) }}>
            <option value="">{t('기본 (라이브러리 서식만)', 'Default (library template only)')}</option>
            {templates.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
          <button className="btn btn-icon" data-ui="개념노트 컴파일" title={t('컴파일 — PDF를 다시 만듭니다 (⌘↵)', 'Compile: make the PDF again (⌘↵)')} aria-label={t('컴파일', 'Compile')} disabled={compiling} onClick={() => void compile()}>{compiling ? t('컴파일 중…', 'Compiling…') : Icon.play}</button>
          <span className={`save-state ${state}`}>{{ saved: t('저장됨', 'Saved'), dirty: t('고치는 중…', 'Editing…'), saving: t('저장 중…', 'Saving…'), conflict: t('저장 멈춤', 'Save paused'), error: t('저장 실패', 'Save failed') }[state]}</span>
        </div>
      </section>
    </div>
  )
}

/**
 * 지식 화면 (왼쪽 띠) — 개념노트 (2026-10-04 재설계, 10/6 라이브러리 첫 화면).
 * 목록은 앱의 왼쪽 사이드바(ConceptNotes.tsx의 ConceptSide), 여기는 가운데.
 * 노트를 고르지 않았으면 첫 화면(KnowledgeHome: 최근 노트 · 점검 · 통계 · 라이브러리 정보), 고르면 그 노트를 읽는다.
 * Markdown 개념노트는 ConceptNoteView, 아직 LaTeX인 것은 예전 편집기, 옮기기 전 Study 노트는 읽기만.
 * 지도는 지식 안의 따로 된 페이지(KnowledgeMapPage, 사이드바 "지도" 줄), "공부할 것"은 첫 화면의 만들기 메뉴와 점검 "초안 검토"로 합쳤다.
 */
export function LibraryPage({ info, topic, rightOpen = true, onChanged, onSaved }: {
  info: LibraryInfo | null; topic?: string; rightOpen?: boolean; onChanged(): void; onSaved(msg: string): void
}) {
  const { data, error } = useKnowledge(info)
  const topics = data?.topics ?? []
  // 주소의 topic은 주제 key, 또는 개념노트 id (사이드바는 색인에서 id로 연다)
  const sel = topic ? topics.find((t) => t.key === topic) ?? topics.find((t) => t.concept?.id === topic) : undefined

  if (!info?.path) return <NoLibrary />
  if (!topic) return <KnowledgeHome info={info} rightOpen={rightOpen} onChanged={onChanged} onSaved={onSaved} />
  return (
    <main className="kn-page" data-ui="지식">
      {error && <div className="banner danger">{t('개념노트 목록을 읽지 못했습니다', 'Could not read the concept note list')}: {error}</div>}
      <section className="lib-view" data-ui="지식 보기">
        {!sel ? <div className="ws-empty">{data ? t('이 개념노트를 찾지 못했습니다. 왼쪽 목록에서 고르세요.', 'Concept note not found. Pick one from the list on the left.') : t('읽는 중…', 'Loading…')}</div>
          : sel.concept?.format === 'md' ? <ConceptNoteView key={sel.concept.id} id={sel.concept.id} info={info} rightOpen={rightOpen} tocOwner={`knowledge/${sel.concept.id}`} onChanged={onChanged} onSaved={onSaved} />
          : sel.concept ? <LibraryNoteEditor key={sel.concept.id} kind="concept" id={sel.concept.id} info={info} onChanged={onChanged} onSaved={onSaved} />
          : sel.study ? <ReadOnlyMd key={sel.key} load={() => api.studyNote(sel.study!.path)} path={t(`Study: ${sel.study.path} · 아직 옮기지 않음 (읽기만)`, `Study: ${sel.study.path} · Not moved yet (read only)`)} onClick={(e) => followLink(e, topics)} />
          : sel.review ? <ReadOnlyMd key={sel.key} load={() => knowledgeApi.review(sel.review!.path)} path={t(`Topic Review (Emergence, 읽기만): ${sel.review.path}`, `Topic Review (Emergence, read only): ${sel.review.path}`)} onClick={(e) => followLink(e, topics)} />
          : <div className="ws-empty">{t('이 주제에는 개념노트가 없습니다.', 'This topic has no concept note.')}</div>}
      </section>
    </main>
  )
}

function NoLibrary() {
  return <main className="stage full"><section className="pane"><div className="page-body"><h2>{t('지식', 'Knowledge')}</h2><p className="muted">{t('라이브러리 폴더가 설정되지 않았습니다 (~/.config/research-workspace/config.yaml의 library).', 'No library folder is set (library in ~/.config/research-workspace/config.yaml).')}</p></div></section></main>
}

/** 지식 지도 (왼쪽 띠의 "지도", 10/6에 지식 화면의 보기에서 자리만 옮김. 지도 자체는 그대로) */
export function KnowledgeMapPage({ info, topic }: { info: LibraryInfo | null; topic?: string }) {
  const { data, error } = useKnowledge(info)
  if (!info?.path) return <NoLibrary />
  return (
    <main className="kn-page" data-ui="지식 지도">
      {error && <div className="banner danger">{t('개념노트 목록을 읽지 못했습니다', 'Could not read the concept note list')}: {error}</div>}
      <KnowledgeMap topics={data?.topics ?? []} focus={topic} onOpen={(key) => go({ page: 'library', topic: key })} />
    </main>
  )
}

/** 본문의 [[링크]]를 누르면 그 주제로 */
function followLink(e: React.MouseEvent, topics: KnowledgeTopic[]) {
  const target = (e.target as HTMLElement).closest('.ob-link')?.getAttribute('title')?.replace(/#.*$/, '').split('/').pop()
  if (!target) return
  const k = topicKey(target)
  const hit = topics.find((x) => x.names.includes(k))
  if (hit) go({ page: 'library', topic: hit.key })
}

/** Study·Topic Review 원문 (읽기만, Obsidian처럼 그린다) */
function ReadOnlyMd({ load, path, onClick }: { load(): Promise<{ title: string; text: string }>; path: string; onClick(e: React.MouseEvent): void }) {
  const [text, setText] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load().then((d) => setText(d.text)).catch((e: Error) => setErr(e.message)) }, [path])
  return (
    <div className="scroll kn-read" onClick={onClick}>
      <div className="page-body">
        <p className="muted mono" style={{ fontSize: 'var(--fs-xs)' }}>{path}</p>
        {err && <p className="muted">{err}</p>}
        {text === null && !err ? <p className="muted">{t('읽는 중…', 'Loading…')}</p> : text !== null && <ObsidianMarkdown text={text} />}
      </div>
    </div>
  )
}

/** 노트마다 고른 PDF 서식은 이 브라우저에만 기억한다 (없거나 못 읽으면 기본) */
const pickKey = (kind: string, id: string) => `rw-pdf-template:${kind}/${id}`
function readPick(kind: string, id: string): string {
  try { return localStorage.getItem(pickKey(kind, id)) ?? '' } catch { return '' }
}
function writePick(kind: string, id: string, v: string): void {
  try { if (v) localStorage.setItem(pickKey(kind, id), v); else localStorage.removeItem(pickKey(kind, id)) } catch { /* 기억하지 못해도 이번 컴파일은 그대로 */ }
}
