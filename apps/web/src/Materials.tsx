import { displayName } from '@rw/core'
import { useEffect, useRef, useState } from 'react'
import { api, papersApi, type BibEntry, type LibraryInfo, type MaterialFile, type PaperList, type ResearchApi } from './api'
import { CommentablePdf, paperTarget } from './Comments'
import { useDragHeight } from './dragHeight'
import { go, type Route } from './router'
import { Icon } from './icons'
import { CITE_EVENT, citeKeys } from './citeKeys'
import { store } from './store'
import { t } from './i18n'

/**
 * 사이드바의 "논문·파일": 실제로 가진 PDF·파일(workbench/materials/)만.
 * - 10/5 "옮기기": 라이브러리 bib에 있는 논문의 PDF는 여기 두지 않고,
 *   맨 위 한 줄 "논문 N편"이 논문 라이브러리의 이 프로젝트 목록으로 간다. 라이브러리에 없는 논문 PDF와 논문이 아닌 파일만 남는다.
 * - 논문 PDF(bib 키와 이름이 같은 파일)는 눌러서 작업 화면에 연다. PDF가 없는 bib 논문은 인용한 노트 화면(CitedPapers)에서 받는다.
 * - 파일: PDF·그림은 작업 화면에, 발표자료(pptx·key)는 맥 앱으로 연다.
 * - 이 묶음에 파일을 끌어다 놓으면 materials/에 올린다.
 */
export function MaterialsNav({ rid, rapi, route, version, onSaved, library, onLibraryChanged }: {
  rid: string; rapi: ResearchApi; route: Route; version: number; onSaved(msg: string): void; library: LibraryInfo | null; onLibraryChanged(): void
}) {
  const [data, setData] = useState<{ bib: BibEntry[]; files: MaterialFile[] } | null>(null)
  const [over, setOver] = useState(false)
  const [tick, setTick] = useState(0)
  useEffect(() => { rapi.materials().then(setData).catch(() => setData({ bib: [], files: [] })) }, [rapi, version, tick])
  const [papers, setPapers] = useState<PaperList | null>(null)
  useEffect(() => { papersApi.list().then(setPapers).catch(() => setPapers(null)) }, [version, tick])

  const openDoc = (name: string) => go({ page: 'doc', rid, name })
  const on = (name: string) => route.page === 'doc' && route.name === name
  const openFile = (f: MaterialFile) => {
    if (f.kind === 'pdf' || f.kind === 'image') return openDoc(f.name)
    rapi.openMaterial(f.name).then(() => onSaved(t(`맥 앱으로 열었습니다 — ${f.name}`, `Opened in the Mac app: ${f.name}`))).catch((err: Error) => onSaved(err.message))
  }
  const drop = async (e: React.DragEvent) => {
    e.preventDefault()
    setOver(false)
    const files = [...e.dataTransfer.files]
    for (const f of files) {
      try { await rapi.uploadMaterial(f); onSaved(t(`자료에 넣었습니다 — ${f.name}`, `Added to materials: ${f.name}`)) } catch (err) { onSaved(t(`넣지 못했습니다 — ${(err as Error).message}`, `Could not add: ${(err as Error).message}`)) }
    }
    setTick((t) => t + 1)
  }

  const others = (data?.files ?? []).filter((f) => !f.bibKey)
  // 실제로 가진 PDF·파일만 (bib에만 있는 논문은 인용한 노트 화면에서, 10/3 피드백)
  const inLibrary = new Set(papers?.library ? papers.papers.map((p) => p.key) : [])
  const owned = (data?.bib ?? []).filter((e) => e.file && !inLibrary.has(e.key))
  const mine = papers?.library ? papers.papers.filter((p) => p.projects.includes(rid)).length : 0
  return (
    <div className={`materials${over ? ' drop' : ''}`} data-ui="자료"
      onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setOver(true) } }}
      onDragLeave={() => setOver(false)} onDrop={(e) => void drop(e)}>
      {papers?.library && (
        <button className="nav mat" data-ui="논문 라이브러리로" title={t('논문 라이브러리에서 이 프로젝트에 표시된 논문', 'Papers marked for this project in the paper library')} onClick={() => go({ page: 'shelf', filter: `project:${rid}` })}>
          <span className="mat-ico ico" aria-hidden>{Icon.papers}</span>
          <span className="label">{t(`논문${mine > 0 ? ` ${mine}편` : ''}`, `Papers${mine > 0 ? ` ${mine}` : ''}`)} <span className="muted">· {t('논문 라이브러리', 'Paper library')}</span></span>
        </button>
      )}
      {data && !papers?.library && owned.length === 0 && others.length === 0 && <div className="nav muted"><span className="label">{t('가진 PDF·파일이 없습니다. 파일을 여기로 끌어다 놓으세요', 'No PDFs or files yet. Drag files here')}</span></div>}
      {owned.map((e) => (
        <div key={e.key} className="mat-row">
          <button className={`nav mat${on(e.file!) ? ' on' : ''}`} data-ui="논문" data-ui-item={e.key}
            title={[e.title, e.author, [e.journal, e.year].filter(Boolean).join(' '), e.eprint && `arXiv:${e.eprint}`, `@${e.key}`].filter(Boolean).join('\n')}
            onClick={() => openDoc(e.file!)}>
            <span className="mat-ico ico" aria-hidden>{Icon.pdf}</span>
            <span className="label">{shortAuthors(e.author)}{e.year ? ` ${e.year}` : ''} <span className="muted">· {e.title ?? e.key}</span></span>
          </button>
          {library?.path && (
            <button className="mat-act" title={library.notes.some((n) => n.kind === 'paper' && n.id === e.key) ? t('문헌노트 열기 (공유 라이브러리)', 'Open literature note (shared library)') : t('문헌노트 만들기 — 요약·핵심 주장·방법·질문 (공유 라이브러리)', 'Create literature note: summary, key claims, method, questions (shared library)')}
              onClick={() => {
                api.createPaper(rid, e.key).then((r) => { if (r.created) { onLibraryChanged(); onSaved(t('문헌노트를 만들었습니다', 'Created the literature note')) } go({ page: 'paper', rid, id: r.id }) }).catch((err: Error) => onSaved(err.message))
              }}>{library.notes.some((n) => n.kind === 'paper' && n.id === e.key) ? t('문헌노트', 'Literature note') : `＋ ${t('문헌노트', 'Literature note')}`}</button>
          )}
        </div>
      ))}
      {others.map((f) => (
        <button key={f.name} className={`nav mat${on(f.name) ? ' on' : ''}`} data-ui="자료 파일" data-ui-item={f.name} title={`${f.name} · ${(f.size / 1024 / 1024).toFixed(1)}MB${f.kind === 'slides' ? `\n${t('누르면 맥 앱(Keynote·PowerPoint)으로 엽니다', 'Click to open in the Mac app (Keynote, PowerPoint)')}` : ''}`}
          onClick={() => openFile(f)}>
          <span className="mat-ico ico" aria-hidden>{f.kind === 'slides' ? Icon.slides : f.kind === 'image' ? Icon.image : Icon.pdf}</span>
          <span className="label">{f.name}</span>
          {f.kind === 'slides' && <span className="meta">{t('맥에서', 'On Mac')}</span>}
        </button>
      ))}
    </div>
  )
}

/** "Sample, Bea and Tester, Theo and Example, Ada E." → "Sample–Tester–Example", 넷 이상이면 "Sample 외" */
export function shortAuthors(author?: string): string {
  if (!author) return ''
  const names = author.split(/\s+and\s+/).map((a) => (a.includes(',') ? a.split(',')[0]! : a.trim().split(/\s+/).pop()!).trim())
  const others = names.at(-1)?.toLowerCase() === 'others'
  const last = others ? names.slice(0, -1) : names
  return last.length > 3 || (others && last.length) ? `${last[0]} ${t('외', 'et al.')}` : last.join('–')
}

const NO_BOXES: never[] = []

/** 자료 탭: materials/의 PDF나 그림 */
export function DocTab({ rid, name, rapi }: { rid: string; name: string; rapi: ResearchApi }) {
  const url = rapi.materialUrl(name)
  const isPdf = /\.pdf$/i.test(name)
  return (
    <div className="ws-doc pdf-tab" data-ui="자료 보기">
      <div className="pane-head" data-ui="머리줄">
        <span className="crumb">{t('자료', 'Materials')} · <b>{name}</b></span>
        <span className="sp" />
        <a className="btn" href={url} target="_blank" rel="noreferrer">{t('새 창', 'New window')}</a>
      </div>
      {isPdf
        ? <CommentablePdf rid={rid} target={paperTarget(name)} url={url} highlight={NO_BOXES} onPick={() => undefined} />
        : <div className="scroll" style={{ display: 'grid', placeItems: 'center', padding: 'var(--sp-4)' }}><img src={url} alt={name} style={{ maxWidth: '100%' }} /></div>}
    </div>
  )
}

export { citeKeys }

/**
 * 노트가 인용한 논문 (10/3 피드백): 노트에서 참고하는 논문 정보는 노트 화면에서 본다.
 * 사이드바 "논문·파일"에는 실제로 가진 PDF·파일만 둔다.
 * 10/6 D13: 읽는 본문 끝에 두고 펼침은 프로젝트·파일마다 기억한다.
 * 원문 편집기가 열린 칸에서는 아래에 두고, 위 경계를 끌어 높이를 바꾼다.
 * 머리줄에 어느 파일이 인용한 것인지 적는다 (옆 칸에 연 개념노트의 인용과 헷갈리지 않게).
 */
export function CitedPapers({ rid, rapi, text, file, library, onSaved, onLibraryChanged, onReveal, docked = false }: {
  rid: string; rapi: ResearchApi; text: string; file: string; library?: LibraryInfo | null; onSaved(msg: string): void; onLibraryChanged?(): void
  /** 원문 편집기 아래 칸에 둘 때만 높이를 제한하고 경계를 끌 수 있다. */
  docked?: boolean
  /** 인용한 줄로 가기 (편집기가 있을 때) */
  onReveal?(line: number): void
}) {
  const [bib, setBib] = useState<BibEntry[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [tick, setTick] = useState(0)
  const openKey = `rw-cited-open:${JSON.stringify([rid, file])}`
  const [openState, setOpenState] = useState(() => ({ key: openKey, value: store.get(openKey, false) }))
  // 같은 컴포넌트가 다른 파일을 받는 순간에도 앞 노트의 펼침을 보여 주지 않는다.
  const open = openState.key === openKey ? openState.value : store.get(openKey, false)
  const setOpen = (value: boolean) => { setOpenState({ key: openKey, value }); store.set(openKey, value) }
  const [height, startDrag] = useDragHeight('rw-cited-height', 160)
  const [picked, setPicked] = useState<string | null>(null)
  useEffect(() => { rapi.materials().then((d) => setBib(d.bib)).catch(() => setBib([])) }, [rapi, tick])
  const keys = citeKeys(text)
  // 본문의 [n]을 누르면(MarkdownNote의 CITE_EVENT) 펼치고 그 논문을 골라 보이게 한 뒤 잠깐 하이라이트한다 (10/7 19:42)
  const box = useRef<HTMLDivElement>(null)
  const shown = keys.length > 0 && !!bib
  useEffect(() => {
    const el = box.current
    if (!el) return
    const onCite = (event: Event) => {
      const key = (event as CustomEvent<string>).detail
      setOpenState({ key: openKey, value: true }); store.set(openKey, true); setPicked(key)
      requestAnimationFrame(() => {
        const item = [...el.querySelectorAll<HTMLElement>('.cited-item')].find((b) => b.dataset.uiItem === key)
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
        item?.classList.remove('flash'); void item?.offsetWidth; item?.classList.add('flash')
      })
    }
    el.addEventListener(CITE_EVENT, onCite)
    return () => el.removeEventListener(CITE_EVENT, onCite)
  }, [shown, openKey])
  if (!shown) return null
  const byKey = new Map(bib.map((e) => [e.key, e]))
  const fetchPaper = (e: BibEntry) => {
    setBusy(e.key)
    rapi.fetchPaper(e.key).then((f) => { setTick((t) => t + 1); onSaved(t(`arXiv에서 받았습니다 — ${e.title ?? e.key}`, `Downloaded from arXiv: ${e.title ?? e.key}`)); go({ page: 'doc', rid, name: f.name }) })
      .catch((err: Error) => onSaved(t(`받지 못했습니다 — ${err.message}`, `Could not download: ${err.message}`))).finally(() => setBusy(null))
  }
  const cur = picked && keys.includes(picked) ? picked : keys[0]!
  /** 이 파일에서 그 키를 인용한 줄 */
  const linesOf = (k: string) => text.split('\n').flatMap((l, i) => (citeKeys(l).includes(k) ? [i + 1] : []))
  const detail = (k: string) => {
    const e = byKey.get(k)
    const hasNote = library?.notes.some((n) => n.kind === 'paper' && n.id === k)
    const lines = linesOf(k)
    return <>
      <div className="cd-title">{e?.title ?? `@${k}`}</div>
      <div className="cd-actions">
        {e?.file && <button className="a" onClick={() => go({ page: 'doc', rid, name: e.file! })}>{t('PDF 보기', 'View PDF')}</button>}
        {e && !e.file && e.eprint && <button className="a" disabled={busy === k} onClick={() => fetchPaper(e)}>{busy === k ? t('받는 중', 'Downloading') : t('PDF 받기', 'Download PDF')}</button>}
        {e && !e.file && !e.eprint && <span className="muted">{t('PDF 없음', 'No PDF')}</span>}
        {e && library?.path && (
          <button className="a" onClick={() => api.createPaper(rid, k).then((r) => { if (r.created) { onLibraryChanged?.(); onSaved(t('문헌노트를 만들었습니다', 'Created the literature note')) } go({ page: 'paper', rid, id: r.id }) }).catch((err: Error) => onSaved(err.message))}>
            {hasNote ? t('문헌노트', 'Literature note') : t('문헌노트 만들기', 'Create literature note')}</button>
        )}
        {lines.length > 0 && <span className="muted">{t('인용한 줄', 'Cited on lines')}</span>}
        {lines.map((n) => onReveal ? <button key={n} className="a" onClick={() => onReveal(n)}>{t(`${n}줄`, String(n))}</button> : <span key={n} className="muted">{t(`${n}줄`, String(n))}</span>)}
      </div>
      {e ? <div className="muted">{e.author?.split(/\s+and\s+/).map(displayName).join(', ')}</div> : <div className="muted">{t('bib에 없는 키입니다. references.bib나 프로젝트 bib에 더하면 여기에 보입니다.', 'This key is not in the bib. Add it to references.bib or the project bib to see it here.')}</div>}
      {e && <div className="muted">{[e.journal, e.year, e.eprint && `arXiv:${e.eprint}`, e.doi && `doi:${e.doi}`].filter(Boolean).join(' · ')} <span className="mono">@{k}</span></div>}
    </>
  }
  return (
    <div ref={box} className={`cited${open ? ' open' : ''}${docked ? ' cited-docked' : ''}`} data-ui="인용한 논문">
      {open && docked && <div className="row-resizer" onPointerDown={startDrag} role="separator" aria-label={t('인용한 논문 칸 경계 — 끌어서 높이 조절', 'Cited papers border: drag to resize')} />}
      <button className="cited-head" aria-expanded={open} title={open ? t('접기', 'Collapse') : t('펼치기', 'Expand')} onClick={() => setOpen(!open)}>
        <span className="chev" aria-hidden>›</span>{t('인용한 논문', 'Cited papers')} <span className="muted">{keys.length}</span>{file && <span className="muted cited-src" title={file}>· {t(`${file.split('/').pop()}에서`, `from ${file.split('/').pop()}`)}</span>}
      </button>
      {/* 10/4 대화 "VS Code 터미널처럼 칸 안에서 골라서 보기": 왼쪽 목록에서 고르면 오른쪽에 그 논문 하나 (긴 목록을 스크롤하지 않게) */}
      {open && <div className="cited-body cited-split" style={docked ? { height } : undefined}>
        <ul className="cited-list" role="listbox" aria-label={t('인용한 논문', 'Cited papers')}>
          {keys.map((k, i) => {
            const e = byKey.get(k)
            return (
              <li key={k}><button role="option" aria-selected={cur === k} className={`cited-item${cur === k ? ' on' : ''}`} data-ui="인용 논문" data-ui-item={k} onClick={() => setPicked(k)}>
                <span className="num">[{i + 1}]</span><span className="label">{e ? `${shortAuthors(e.author)}${e.year ? ` ${e.year}` : ''}` : `@${k}`}</span>
              </button></li>
            )
          })}
        </ul>
        <div className="cited-detail" data-ui="인용 논문 자세히">{cur && detail(cur)}</div>
      </div>}
    </div>
  )
}
