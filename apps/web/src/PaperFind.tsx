import { useEffect, useRef, useState } from 'react'
import { papersApi, type PaperProject, type PaperRow, type PaperSearch } from './api'
import { t } from './i18n'
import { PAPERS_CHANGED, matchPaper, showPaper } from './PapersPage'
import { go } from './router'
import { useSubjects } from './SubjectPicker'
import { readPaper } from './PaperRead'
import { Icon } from './icons'

/**
 * 논문 찾기 칸 (10/31 시안 1절): 첫 화면과 목록 맨 위 가운데. 글을 쓰면 아래에 묶음별 결과가 뜬다.
 * ① 라이브러리(첫 화면만: 목록에서는 표가 바로 걸러진다) ② 분류 · 프로젝트 ③ PDF 폴더(Google Drive 등)에만 있는 PDF ④ 인터넷(arXiv · Semantic Scholar · Crossref)
 * ③ · ④의 「＋ 추가」는 라이브러리에 더하고 그 논문을 연다. PDF 폴더의 파일은 옮기지 않는다
 * ④는 줄을 누르면 넣지 않고 먼저 읽는다 (PaperRead, 11/5)
 * 칸 모양 (11/8 16:03 제안 진행, 시안 N7ik 1절): 높이 42px · 움푹한 바탕 · 돋보기 · 바로 가는 키 「/」, 찾는 곳은 칸 아래 칩(모두 · 라이브러리 · Google Drive · 인터넷)
 */

type Scope = 'all' | 'library' | 'drive' | 'web'
const SCOPES: [Scope, string][] = [['all', t('모두', 'All')], ['library', t('라이브러리', 'Library')], ['drive', 'Google Drive'], ['web', t('인터넷', 'Internet')]]

const EACH = 5
const WAIT = 450
const SOURCE: Record<PaperSearch['web'][number]['source'], string> = { arxiv: 'arXiv', s2: 'Semantic Scholar', crossref: 'Crossref' }
/** 저자 둘까지, 그 뒤는 "외" (논문 첫 화면도 쓴다) */
export const shortAuthors = (authors: string[]) => (authors.length > 2 ? `${authors.slice(0, 2).join(', ')}${t(' 외', ' et al.')}` : authors.join(', '))
const has = (name: string, q: string) => q.toLowerCase().split(/\s+/).filter(Boolean).every((w) => name.toLowerCase().includes(w))

export function PaperFind({ value, onChange, papers, projects, onSaved }: {
  value: string; onChange(q: string): void
  /** 첫 화면에서만: 라이브러리 결과 묶음을 보인다 */
  papers?: PaperRow[] | null
  projects: PaperProject[]
  onSaved(m: string): void
}) {
  const { tree } = useSubjects()
  const [open, setOpen] = useState(false)
  const [found, setFound] = useState<{ q: string; r: PaperSearch } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState('')
  const [scope, setScope] = useState<Scope>('all')
  const box = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const q = value.trim()
  const ready = q.length >= 2
  /** 라이브러리 · 분류 · 프로젝트는 화면에서, Google Drive · 인터넷은 서버에서 찾는다 */
  const local = scope === 'all' || scope === 'library'
  const outside = scope !== 'library'

  // 바로 가는 키 「/」: 이 칸이 있는 화면에서는 앱 전체 검색 대신 이 칸으로 간다 (글을 쓰는 중이거나 창이 떠 있으면 그대로 둔다)
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return
      const el = document.activeElement
      if (el instanceof HTMLElement && (/^(TEXTAREA|INPUT|SELECT)$/.test(el.tagName) || el.isContentEditable)) return
      if (document.querySelector('[role="dialog"]') || !input.current?.offsetParent) return
      e.preventDefault(); e.stopPropagation()
      input.current.focus()
    }
    window.addEventListener('keydown', on, true)
    return () => window.removeEventListener('keydown', on, true)
  }, [])

  useEffect(() => {
    if (!ready || !outside) { setFound(null); return }
    let live = true
    const timer = setTimeout(() => { papersApi.search(q).then((r) => { if (live) setFound({ q, r }) }).catch(() => { if (live) setFound({ q, r: { drive: [], web: [], offline: true } }) }) }, WAIT)
    return () => { live = false; clearTimeout(timer) }
  }, [q, ready, outside])

  useEffect(() => {
    if (!open) return
    const away = (e: MouseEvent) => { if (!(e.target instanceof Node) || !box.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', away)
    return () => document.removeEventListener('mousedown', away)
  }, [open])

  const add = async (id: string, run: () => Promise<{ key: string; existed: boolean; pdfError?: string }>) => {
    setBusy(id); setErr('')
    try {
      const r = await run()
      window.dispatchEvent(new Event(PAPERS_CHANGED))
      onSaved(r.existed ? t(`이미 있는 논문입니다: ${r.key}`, `Paper already exists: ${r.key}`) : t(`더했습니다: ${r.key}`, `Added: ${r.key}`))
      setOpen(false); onChange(''); showPaper(r.key)
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)) } finally { setBusy(null) }
  }

  const lib = papers && local ? papers.filter((p) => matchPaper(p, q)) : []
  const subjects = tree?.enabled && local ? tree.items.filter((s) => has(s.name, q)).slice(0, EACH) : []
  const projs = local ? projects.filter((p) => has(p.title, q)).slice(0, EACH) : []
  const now = found?.q === q ? found.r : null
  const drive = scope === 'all' || scope === 'drive' ? now?.drive ?? [] : []
  const web = scope === 'all' || scope === 'web' ? now?.web ?? [] : []
  const pick = (to: () => void) => { setOpen(false); to() }

  return (
    <div className="pf" ref={box} data-ui="논문 찾기">
      <label className="pf-box">
        <span className="pf-icon" aria-hidden>{Icon.search}</span>
        <input ref={input} type="search" value={value} placeholder={t('논문 제목 · 저자 · arXiv 번호', 'Title · author · arXiv number')} aria-label={t('논문 찾기', 'Search papers')}
          onChange={(e) => { onChange(e.target.value); setOpen(true) }} onFocus={() => setOpen(true)} onKeyDown={(e) => { if (e.key === 'Escape') { setOpen(false); input.current?.blur() } }} />
        {!value && <kbd className="kbd pf-kbd" title={t('「/」를 누르면 이 칸으로 옵니다', 'Press / to jump here')}>/</kbd>}
      </label>
      <div className="pf-scopes" role="radiogroup" aria-label={t('찾는 곳', 'Where to search')} data-ui="찾는 곳">
        {SCOPES.map(([k, name]) => <button key={k} type="button" role="radio" aria-checked={scope === k} className={`memo-chip${scope === k ? ' on' : ''}`} onClick={() => { setScope(k); if (ready) setOpen(true); input.current?.focus() }}>{name}</button>)}
      </div>
      {open && ready && (
        <div className="pf-pop" data-ui="찾기 결과">
          {err && <div className="banner danger pf-err">{err}</div>}
          {papers && local && (
            <Group title={t('라이브러리', 'Library')} n={lib.length}>
              {lib.slice(0, EACH).map((p) => (
                <button key={p.key} className="pf-row" onClick={() => pick(() => showPaper(p.key))}>
                  <span className="pf-title">{p.title}</span><span className="pf-meta">{shortAuthors(p.authors)}{p.year ? ` · ${p.year}` : ''}</span>
                </button>
              ))}
              {lib.length > EACH && <button className="a pf-more" onClick={() => pick(() => go({ page: 'shelf', list: true }))}>{t(`목록에서 ${lib.length}편 모두 보기`, `See all ${lib.length} in the list`)}</button>}
            </Group>
          )}
          {(subjects.length > 0 || projs.length > 0) && (
            <Group title={t('분류 · 프로젝트', 'Subjects · projects')}>
              {subjects.map((s) => <button key={s.id} className="pf-row" onClick={() => pick(() => go({ page: 'shelf', filter: `subject:${s.id}` }))}><span className="pf-title">{s.name}</span><span className="pf-meta">{t('분류', 'Subject')}</span></button>)}
              {projs.map((p) => <button key={p.id} className="pf-row" onClick={() => pick(() => go({ page: 'shelf', filter: `project:${p.id}` }))}><span className="pf-title">{p.title}</span><span className="pf-meta">{t('프로젝트', 'Project')}</span></button>)}
            </Group>
          )}
          {outside && !now && <p className="pf-wait">{t('PDF 폴더와 인터넷에서 찾는 중…', 'Searching PDF folders and the internet…')}</p>}
          {drive.length > 0 && (
            <Group title={t('Google Drive · PDF 폴더', 'Google Drive · PDF folders')}>
              {drive.map((d) => (
                <div key={d.file} className="pf-row pf-out">
                  <span className="pf-title">{d.name}</span><span className="pf-meta">{d.folder}{d.id ? ` · ${d.id}` : ''}</span>
                  <button className="btn small" disabled={!d.id || busy !== null} data-tip={d.id ? undefined : t('PDF에서 arXiv 번호나 DOI를 찾지 못했습니다. 목록의 「＋ 논문 추가」에 끌어다 놓아 주세요', 'No arXiv number or DOI found in the PDF. Drop it on "＋ Add paper" in the list')}
                    onClick={() => void add(d.file, () => papersApi.addFile(d.file))}>{busy === d.file ? t('더하는 중…', 'Adding…') : t('＋ 추가', '＋ Add')}</button>
                </div>
              ))}
            </Group>
          )}
          {web.length > 0 && (
            <Group title={t('인터넷', 'Internet')}>
              {web.map((w) => (
                <div key={`${w.source}:${w.id}`} className="pf-row pf-out">
                  <button className="pf-open" title={t('넣기 전에 열어 읽기', 'Open to read before adding')} onClick={() => pick(() => readPaper(w))}><span className="pf-title">{w.title}</span><span className="pf-meta">{shortAuthors(w.authors)}{w.year ? ` · ${w.year}` : ''} · {SOURCE[w.source]}</span></button>
                  <button className="btn small" disabled={busy !== null} onClick={() => void add(w.id, () => papersApi.add(w.id))}>{busy === w.id ? t('더하는 중…', 'Adding…') : t('＋ 추가', '＋ Add')}</button>
                </div>
              ))}
            </Group>
          )}
          {outside && now?.offline && <p className="pf-wait">{t('인터넷에 연결되지 않아 바깥 결과는 보지 못했습니다.', 'Not connected to the internet, so outside results are missing.')}</p>}
          {(outside ? now && !now.offline : !!papers) && !lib.length && !subjects.length && !projs.length && !drive.length && !web.length && <p className="pf-wait">{t('찾은 것이 없습니다.', 'Nothing found.')}</p>}
        </div>
      )}
    </div>
  )
}

function Group({ title, n, children }: { title: string; n?: number; children: React.ReactNode }) {
  return (
    <section className="pf-group">
      <h3 className="pf-h">{title}{n !== undefined && <span className="pf-n">{n}</span>}</h3>
      {n === 0 ? <p className="pf-none">{t('없음', 'None')}</p> : children}
    </section>
  )
}
