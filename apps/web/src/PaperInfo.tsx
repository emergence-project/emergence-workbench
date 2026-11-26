import { PaperTitle } from './PaperTitle'
import { PdfElsewhere } from './PdfElsewhere'
import { SubjectPicker, useSubjects } from './SubjectPicker'
import { subjectsApi } from './api/subjects'
import { useEffect, useState } from 'react'
import { papersApi, type ArxivCandidate, type PaperRow } from './api'
import { Icon } from './icons'
import { openPdf, type Ctx } from './PaperTable'
import { t } from './i18n'

/** 목록이 바뀌면 사이드바와 본문이 함께 다시 읽는다 */
export const PAPERS_CHANGED = 'rw-papers-changed'
export const CHANGED = PAPERS_CHANGED
export const announce = () => window.dispatchEvent(new Event(CHANGED))
/** 오른쪽 사이드바: 고른 논문 */
export function PaperSide({ paper, projects, ctx, onClose, onSaved }: { paper: PaperRow; projects: { id: string; title: string }[]; ctx: Ctx; onClose(): void; onSaved(m: string): void }) {
  return (
    <aside className="pane pl-rs" data-ui="논문 정보" aria-label={t('고른 논문', 'Selected paper')}>
      <div className="rs-head"><span className="rs-label">{paper.kind === 'book' ? t('책', 'Book') : t('논문', 'Paper')}</span><span className="sp" /><button className="icon-btn" aria-label={t('닫기', 'Close')} data-tip={t('닫기', 'Close')} onClick={onClose}>{Icon.x}</button></div>
      <PaperInfo paper={paper} projects={projects} ctx={ctx} onSaved={onSaved} />
    </aside>
  )
}

/** PDF가 없고 arXiv 번호가 있으면 받는다: 첫 논문 PDF 폴더에 <키>.pdf로 (10/7 19:12 "논문 추가 요청") */
function FetchPdf({ paper, onSaved }: { paper: PaperRow; onSaved(m: string): void }) {
  const [busy, setBusy] = useState(false)
  const fetchPdf = async () => {
    setBusy(true)
    try {
      const r = await papersApi.add(paper.eprint!)
      onSaved(r.pdf ? t(`PDF를 받았습니다 — ${paper.title}`, `Downloaded the PDF: ${paper.title}`) : r.pdfError ? t(`PDF를 받지 못했습니다 — ${r.pdfError}`, `Could not download the PDF: ${r.pdfError}`) : t('먼저 설정 › 논문 PDF 폴더를 정해 주세요', 'First set Settings › Paper PDF folder'))
      announce()
    } catch (e) { onSaved(t(`PDF를 받지 못했습니다 — ${(e as Error).message}`, `Could not download the PDF: ${(e as Error).message}`)) } finally { setBusy(false) }
  }
  return <button className="btn primary" disabled={busy} title={t(`arXiv ${paper.eprint}에서 PDF를 받아 논문 PDF 폴더에 둡니다`, `Download the PDF from arXiv ${paper.eprint} into the paper PDF folder`)} onClick={() => void fetchPdf()}>{busy ? t('받는 중…', 'Downloading…') : t('arXiv에서 PDF 받기', 'Download PDF from arXiv')}</button>
}

/** arXiv 번호가 없는 논문의 arXiv 판 후보 (10/11 12:46): 맞는 것을 골라야 bib에 적는다. 잘못 이어지지 않게 저절로 적지 않는다 */
function FindArxiv({ paper, onClose, onSaved }: { paper: PaperRow; onClose(): void; onSaved(m: string): void }) {
  const [list, setList] = useState<ArxivCandidate[] | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')
  useEffect(() => {
    let live = true
    papersApi.findArxiv(paper.key).then((r) => { if (live) setList(r.candidates) }, (e: Error) => { if (live) setError(e.message) })
    return () => { live = false }
  }, [paper.key])
  const choose = async (c: ArxivCandidate) => {
    setBusy(c.eprint)
    try { await papersApi.setEprint(paper.key, c.eprint); onSaved(t(`arXiv 번호를 적었습니다 — ${c.eprint}`, `Saved the arXiv number: ${c.eprint}`)); announce(); onClose() }
    catch (e) { onSaved(t(`arXiv 번호를 적지 못했습니다 — ${(e as Error).message}`, `Could not save the arXiv number: ${(e as Error).message}`)) } finally { setBusy('') }
  }
  return (
    <div className="pl-ax" data-ui="arXiv 후보">
      <div className="pl-ax-head"><span className="rs-label">{t('arXiv 후보', 'arXiv candidates')}</span><span className="sp" /><button className="icon-btn" aria-label={t('닫기', 'Close')} data-tip={t('닫기', 'Close')} onClick={onClose}>{Icon.x}</button></div>
      {error ? <p className="pl-ax-msg bad">{error}</p>
        : !list ? <p className="pl-ax-msg muted">{t('찾는 중…', 'Searching…')}</p>
        : !list.length ? <p className="pl-ax-msg muted">{t('arXiv에서 맞는 논문을 찾지 못했습니다.', 'No matching paper found on arXiv.')}</p>
        : list.map((c) => (
          <div key={c.eprint} className="pl-ax-row">
            <div className="pl-ax-title">{c.title}</div>
            <div className="pl-ax-sub muted">{c.authors.slice(0, 3).join(', ')}{c.authors.length > 3 ? ' …' : ''}{c.year ? ` · ${c.year}` : ''}</div>
            <div className="pl-ax-acts">
              <a className="a" href={`https://arxiv.org/abs/${c.eprint}`} target="_blank" rel="noreferrer">arXiv {c.eprint}</a>
              {c.match === 'doi' && <span className="muted">{t('DOI 같음', 'Same DOI')}</span>}
              <span className="sp" />
              <button className="btn sm" disabled={!!busy} onClick={() => void choose(c)}>{busy === c.eprint ? t('적는 중…', 'Saving…') : t('이 번호 적기', 'Use this number')}</button>
            </div>
          </div>
        ))}
    </div>
  )
}

/** 고른 논문의 정보 (목록의 오른쪽 칸과 논문 열기의 "정보"가 함께 쓴다) */
export function PaperInfo({ paper, projects, ctx, opened, onSaved }: { paper: PaperRow; projects: { id: string; title: string }[]; ctx: Ctx; opened?: boolean; onSaved(m: string): void }) {
  const { tree } = useSubjects()
  const [adding, setAdding] = useState(false)
  const [finding, setFinding] = useState(false)
  useEffect(() => setFinding(false), [paper.key])
  const manual = paper.projects.filter((p) => !paper.autoProjects.includes(p))
  const save = async (next: string[]) => {
    try { await papersApi.setProjects(paper.key, next); announce() } catch (e) { onSaved(t(`프로젝트를 바꾸지 못했습니다: ${(e as Error).message}`, `Could not change projects: ${(e as Error).message}`)) }
  }
  const free = projects.filter((p) => !paper.projects.includes(p.id))
  return (
      <div className="rs-scroll rs-pad pl-rs-body">
        <h3 className="pl-rs-title"><PaperTitle title={paper.title} /></h3>
        <p className="pl-rs-sub">{paper.authors.join(', ')}{paper.year ? ` · ${paper.year}` : ''}</p>
        {paper.venue && <p className="pl-rs-sub muted">{paper.venue}</p>}
        <div className="pl-rs-links">
          {paper.eprint && <a className="a" href={`https://arxiv.org/abs/${paper.eprint}`} target="_blank" rel="noreferrer">arXiv {paper.eprint}</a>}
          {paper.doi && <a className="a" href={`https://doi.org/${paper.doi}`} target="_blank" rel="noreferrer">DOI</a>}
          {!paper.eprint && !paper.doi && paper.pdf.where === 'none' && <PdfElsewhere title={paper.title} />}
          {!paper.eprint && paper.kind === 'paper' && !finding && <button className="a" title={t('제목과 첫 저자로 arXiv 판을 찾습니다. 고른 번호만 references.bib에 적습니다', 'Search arXiv by title and first author. Only the number you choose is written to references.bib')} onClick={() => setFinding(true)}>{t('arXiv 찾기', 'Find on arXiv')}</button>}
        </div>
        {finding && !paper.eprint && <FindArxiv key={paper.key} paper={paper} onClose={() => setFinding(false)} onSaved={onSaved} />}
        {!opened && (paper.pdf.where === 'none' && paper.eprint
          ? <FetchPdf paper={paper} onSaved={onSaved} />
          : (
            <button className={`btn${paper.pdf.where === 'none' ? '' : ' primary'}`} disabled={paper.pdf.where === 'none'} title={paper.pdf.where === 'cloud' ? t('클라우드에만 있으면 여는 동안 맥이 받아 옵니다', 'If it is only in the cloud, the Mac downloads it while opening') : undefined} onClick={() => openPdf(paper)}>
              {paper.pdf.where === 'none' ? t('PDF 없음', 'No PDF') : t('열기', 'Open')}
            </button>
          ))}
        {tree?.enabled && <div className="rs-field"><div className="rs-label">{t('분류', 'Subject')}</div><SubjectPicker key={paper.key} tree={tree} value={paper.subjects ?? []} onChange={async (ids) => {
          try { await subjectsApi.paper(paper.key, ids, paper.subjectsHash!); onSaved(t('분류를 고쳤습니다', 'Updated subjects')) } finally { announce() }
        }} /></div>}
        <div className="rs-field">
          <div className="rs-label">{t('프로젝트', 'Projects')}</div>
          <div className="pl-rs-chips">
            {paper.projects.map((id) => (
              <span key={id} className="tag" title={paper.autoProjects.includes(id) ? t('이 프로젝트의 bib에 있어서 자동으로 이어졌습니다', 'Linked automatically because it is in this project\'s bib') : undefined}>
                {ctx.projectTitle(id)}
                {!paper.autoProjects.includes(id) && <button className="pl-chip-x" aria-label={t(`${ctx.projectTitle(id)} 제거`, `Remove ${ctx.projectTitle(id)}`)} onClick={() => void save(manual.filter((x) => x !== id))}>×</button>}
              </span>
            ))}
            {free.length > 0 && !adding && <button className="btn sm" onClick={() => setAdding(true)}>{t('＋ 추가', '＋ Add')}</button>}
            {adding && (
              <select className="rs-select" autoFocus value="" onBlur={() => setAdding(false)} onChange={(e) => { setAdding(false); if (e.target.value) void save([...manual, e.target.value]) }}>
                <option value="">{t('프로젝트 고르기', 'Choose project')}</option>
                {free.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
              </select>
            )}
          </div>
        </div>
        <div className="rs-field">
          <div className="rs-label">{t('코멘트', 'Comments')}</div>
          <p className="muted">{paper.comments ? t(`${paper.comments}개${paper.waiting ? ` · 답 기다리는 질문 ${paper.waiting}` : ''}`, `${paper.comments}${paper.waiting ? ` · questions awaiting answers ${paper.waiting}` : ''}`) : t('아직 없음', 'None yet')}</p>
        </div>
        <div className="rs-field pl-rs-path">
          <div className="muted mono" title={paper.key}>{paper.key}</div>
          <div className="muted mono" title={paper.pdf.file}>{paper.pdf.file?.split('/').filter(Boolean).pop() ?? t('PDF 폴더에 없음', 'Not in the PDF folder')}{paper.pdf.where === 'cloud' ? t(' (클라우드)', ' (cloud)') : ''}</div>
        </div>
      </div>
  )
}
