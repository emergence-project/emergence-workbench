import { useEffect } from 'react'
import type { ResearchApi } from './api'
import { getSession, handlersOf, sessionKey, setSession, useSession } from './blockSession'
import { blockTarget, CommentablePdf } from './Comments'
import { Icon } from './icons'
import { go } from './router'
import { t, plural } from './i18n'

/**
 * 블록의 결과 PDF 탭. 편집 탭과 다른 칸에 둘 수 있다.
 * PDF를 누르면 편집 탭의 원고 줄로 간다. 편집 탭이 닫혀 있으면 그 블록을 연다.
 */
export function PdfTab({ rid, bid, title, rapi }: { rid: string; bid: string; title: string; rapi: ResearchApi }) {
  const key = sessionKey(rid, bid)
  const s = useSession(key)

  // 앱을 새로 연 뒤 편집 탭 없이 PDF 탭만 있을 때: 지난번 PDF가 있으면 보여 준다
  useEffect(() => {
    if (getSession(key).pdfVersion !== null) return
    let cancelled = false
    fetch(rapi.pdfUrl(bid, 0), { method: 'HEAD' }).then((h) => {
      if (!cancelled && h.ok && getSession(key).pdfVersion === null) setSession(key, { pdfVersion: Date.now() })
    }).catch(() => undefined)
    return () => { cancelled = true }
  }, [key, rapi, bid])
  // 이 PDF가 지금 노트의 것인지 (C3 "PDF 이전 결과 표시"를 보조 노트에도, 10/5)
  useEffect(() => { if (!getSession(key).blockPdf) rapi.pdfState(bid).then((st) => setSession(key, { blockPdf: st })).catch(() => undefined) }, [key, rapi, bid])

  const onPick = (page: number, x: number, y: number, text: string) => {
    const pick = handlersOf(key).pick
    if (pick) pick(page, x, y, text)
    else go({ page: 'block', rid, bid })
  }
  return (
    <div className="ws-doc pdf-tab" data-ui="결과 PDF">
      <div className="pane-head" data-ui="머리줄">
        <span className="sp" />
        {s.result && <span className={`pdf-state ${s.result.ok ? 'ok' : 'bad'}`}>{s.result.ok ? t('✓ 컴파일 완료', '✓ Compiled') : t(`! 오류 ${s.result.problems.length}`, `! ${plural(s.result.problems.length, 'error')}`)}</span>}
        <button className="btn primary btn-icon" data-ui="컴파일 버튼" disabled={s.compiling} aria-label={t('컴파일', 'Compile')} title={t('컴파일 — 편집 탭이 닫혀 있으면 엽니다', 'Compile. Opens the edit tab if it is closed')}
          onClick={() => { const c = handlersOf(key).compile; if (c) c(); else go({ page: 'block', rid, bid }) }}>{s.compiling ? '…' : Icon.play}</button>
      </div>
      {s.blockPdf?.hasPdf && (s.blockPdf.stale || s.result?.ok === false) && <div className="banner" role="status" data-ui="PDF 이전 결과">
        {s.result?.ok === false ? t('이번 컴파일은 PDF를 만들지 못했습니다 · 보이는 것은 이전 결과', 'This compile did not produce a PDF · showing the previous result') : t('노트가 바뀌었습니다 · PDF는 이전 결과', 'The note has changed · the PDF is the previous result')}</div>}
      <CommentablePdf rid={rid} target={blockTarget(bid, title)} url={s.pdfVersion !== null ? rapi.pdfUrl(bid, s.pdfVersion) : null} highlight={s.highlight} onPick={onPick} />
    </div>
  )
}
