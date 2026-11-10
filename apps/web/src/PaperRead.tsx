import { useEffect, useState } from 'react'
import { papersApi, type PaperPeek } from './api'
import { t } from './i18n'
import { PdfElsewhere } from './PdfElsewhere'
import { PdfView } from './PdfView'
import { PAPERS_CHANGED } from './PapersPage'
import { go } from './router'

/**
 * 라이브러리에 넣기 전에 읽기 (11/5 피드백 "곧바로 추가 말고 읽다가 추가할 수 있게", 「진행」):
 * 추천 논문 · 찾기의 인터넷 결과 줄을 누르면 넣지 않고 연다. arXiv면 PDF, 아니면 초록과 출판사 링크.
 * 툴바 오른쪽 「＋ 추가」로 넣으면 보통 논문 화면으로 바뀌어 하이라이트 · 메모를 쓴다 (넣기 전에는 둘 곳이 없어 읽기만).
 */

/** 줄에서 이미 아는 제목 · 저자 (정보를 받기 전에도 머리줄에 보이게) */
const known = new Map<string, { title: string; authors: string[] }>()
export function readPaper(p: { id: string; title: string; authors: string[] }) {
  known.set(p.id, { title: p.title, authors: p.authors })
  go({ page: 'shelf', read: p.id })
}

export function PaperRead({ id, onSaved }: { id: string; onSaved(m: string): void }) {
  const [peek, setPeek] = useState<PaperPeek | null>(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    let live = true
    setPeek(null); setErr('')
    papersApi.peek(id).then((p) => { if (live) setPeek(p) }).catch((e: Error) => { if (live) setErr(e.message) })
    return () => { live = false }
  }, [id])
  const was = known.get(id)
  const title = peek?.title ?? was?.title ?? id
  const authors = peek?.authors.length ? peek.authors : was?.authors ?? []
  const arxiv = peek?.arxiv ?? (/^10\./.test(id) ? undefined : id)
  const add = async () => {
    setBusy(true)
    try {
      const r = await papersApi.add(id)
      window.dispatchEvent(new Event(PAPERS_CHANGED))
      onSaved(r.pdfError ? t(`더했습니다: ${r.key} (PDF는 받지 못했습니다: ${r.pdfError})`, `Added: ${r.key} (PDF not downloaded: ${r.pdfError})`)
        : r.existed ? t(`이미 있는 논문입니다: ${r.key}`, `Paper already exists: ${r.key}`) : t(`더했습니다: ${r.key}`, `Added: ${r.key}`))
      go({ page: 'shelf', open: r.key })
    } catch (e) { onSaved(e instanceof Error ? e.message : String(e)) } finally { setBusy(false) }
  }
  return (
    <main className="stage full pl with-side pl-open" data-ui="넣기 전 논문">
      <section className="pane">
        <div className="pane-head" data-ui="머리줄">
          <span className="crumb"><button className="a" onClick={() => go({ page: 'shelf' })}>{t('논문', 'Papers')}</button> › <b title={title}>{title}</b></span>
          <span className="sp" />
          <span className="muted">{t('라이브러리에 없음', 'Not in the library')}</span>
          <button className="btn primary small" disabled={busy} onClick={() => void add()}>{busy ? t('추가 중…', 'Adding…') : t('＋ 추가', '＋ Add')}</button>
        </div>
        {arxiv
          ? <PdfView url={papersApi.peekPdfUrl(arxiv)} highlight={NO_BOXES} onPick={() => undefined} sideToc={`read:${arxiv}`} />
          : <div className="scroll pr-none"><p className="empty">{t('arXiv 논문이 아니어서 넣기 전에는 PDF를 받지 않습니다.', 'Not an arXiv paper, so no PDF before adding.')} <PdfElsewhere doi={peek?.doi ?? id} title={title} /></p></div>}
      </section>
      <aside className="pane pl-rs" data-ui="넣기 전 논문 정보" aria-label={t('논문 정보', 'Paper info')}>
        <div className="scroll pr-info">
          <h2 className="pr-title">{title}</h2>
          {authors.length > 0 && <p className="muted">{authors.join(', ')}</p>}
          {err && <div className="banner danger">{err}</div>}
          {!peek && !err && <p className="muted">{t('정보를 받는 중…', 'Getting details…')}</p>}
          {peek?.offline && <p className="muted">{t('인터넷에서 정보를 받지 못했습니다.', 'Could not get details from the internet.')}</p>}
          {peek?.abstract ? <p className="pr-abstract">{peek.abstract}</p> : peek && !peek.offline && <p className="muted">{t('초록이 없습니다.', 'No abstract.')}</p>}
          <p className="muted">{[arxiv && `arXiv:${arxiv}`, peek?.doi && `doi:${peek.doi}`].filter(Boolean).join(' · ')}</p>
          <p className="muted pr-hint">{t('하이라이트 · 메모는 「＋ 추가」로 넣은 뒤에 씁니다.', 'Highlights and memos work after "＋ Add".')}</p>
        </div>
      </aside>
    </main>
  )
}
const NO_BOXES: never[] = []
