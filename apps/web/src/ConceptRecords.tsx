import { useMemo, useRef, useState, type ReactNode } from 'react'
import { anchoredById, anchoredUnit, appendUnit, memoHighlights, newAnchorId, replaceUnit, type MemoAnchor } from './conceptMemo'
import { composeConceptMemo, saveConceptMemo, useConceptMemo, useConceptMemoLoaded } from './conceptMemoStore'
import { flash } from './flash'
import { t } from './i18n'
import { Icon } from './icons'
import { RecordContext, type RecordSelection } from './RecordContext'
import { PaintDots, RecordMenu } from './RecordMenus'
import { useRecordSelection } from './recordSelection'
import { useHighlightColor } from './ui'
import type { PaintColor } from './api'

/**
 * 개념노트 본문에서 글을 골라 하이라이트하거나 메모를 단다 (10/8 11:47: 연구노트와 같은 메뉴 · 앵커).
 * 기록은 노트 옆 concepts/<id>.memo.md에 적고(conceptMemo.ts), 메모 글은 오른쪽 사이드바 메모 칸에서 쓴다.
 * source는 머리말을 뺀 본문, contentOffset은 그 가운데 화면에 그리지 않은 앞부분(제목 줄) 길이다.
 */
export function ConceptRecords({ id, source, contentOffset, children }: { id: string; source: string; contentOffset: number; children: ReactNode }) {
  useConceptMemoLoaded(id)
  const slot = useConceptMemo(id)
  const box = useRef<HTMLDivElement>(null)
  const color = useHighlightColor()
  const [sel, setSel] = useState<RecordSelection | null>(null)
  const [active, setActive] = useState<{ id: string; x: number; y: number } | null>(null)
  const [busy, setBusy] = useState(false)
  const text = slot.memo?.text ?? ''
  const highlights = useMemo(() => memoHighlights(text), [text])
  const reveal = slot.reveal && { id: slot.reveal.anchor.id, line: slot.reveal.anchor.line, quote: slot.reveal.anchor.quote, prefix: slot.reveal.anchor.prefix, suffix: slot.reveal.anchor.suffix, nonce: slot.reveal.nonce }
  useRecordSelection(box, source, contentOffset, (selection) => { setSel(selection); if (selection) setActive(null) })
  const done = () => { setSel(null); window.getSelection()?.removeAllRanges() }
  // 되돌리기처럼 나중에 부르는 쓰기도 그때의 메모(hash)를 쓰게 한다. 렌더 때의 slot.memo를 쓰면 지운 뒤 hash가 낡아 409가 난다
  const latest = useRef(slot.memo)
  latest.current = slot.memo
  const write = async (next: (text: string) => string, message?: string) => {
    const memo = latest.current
    if (!memo || busy) return
    setBusy(true)
    try { await saveConceptMemo(id, memo, next(memo.text)); if (message) flash(message) }
    catch (e) { flash((e as Error).message) } finally { setBusy(false) }
  }
  const anchorOf = (s: RecordSelection, paint: PaintColor): MemoAnchor => ({ id: newAnchorId(text), color: paint, quote: s.quote, line: s.line, prefix: s.prefix, suffix: s.suffix })
  const paint = (p: PaintColor) => {
    if (!sel) return
    const anchor = anchorOf(sel, p)
    void write((memo) => appendUnit(memo, 'note', anchoredUnit(anchor, ''))).then(done)
  }
  const unit = active ? anchoredById(text, active.id) : undefined
  const remove = () => {
    if (!unit?.anchor) return
    const was = unit
    setActive(null)
    void write((memo) => { const u = anchoredById(memo, was.anchor!.id); return u ? replaceUnit(memo, u, null) : memo }).then(() =>
      flash(t('지웠습니다', 'Deleted'), { label: t('되돌리기', 'Undo'), run: () => { void write((memo) => appendUnit(memo, 'note', anchoredUnit(was.anchor!, was.text)), t('되살렸습니다', 'Restored')) } }))
  }
  const recolor = (p: PaintColor) => {
    if (!unit?.anchor || p === unit.anchor.color) return
    const was = unit
    void write((memo) => { const u = anchoredById(memo, was.anchor!.id); return u ? replaceUnit(memo, u, anchoredUnit({ ...u.anchor!, color: p }, u.text)) : memo })
  }
  return (
    <RecordContext.Provider value={{ source, contentOffset, highlights, reveal,
      onSelect: (selection) => { setSel(selection); if (selection) setActive(null) },
      onHighlight: (hid, point) => { done(); setActive({ id: hid, ...point }) },
    }}><div ref={box} className="note-ask">
      {children}
      {sel && slot.memo && (
        // 잠근 노트도 메모는 단다 (메모 파일은 잠금과 상관없다)
        <RecordMenu anchor={sel} owner={box.current} onClose={() => setSel(null)} onDefault={() => paint(color)}>
          <PaintDots color={color} onChange={paint} disabled={busy} />
          <span className="record-menu-sep" />
          <button disabled={busy} onClick={() => { composeConceptMemo(id, anchorOf(sel, color)); done() }}><span className="ico">{Icon.comment}</span> {t('메모', 'Memo')}</button>
        </RecordMenu>
      )}
      {active && unit?.anchor && <RecordMenu anchor={active} highlight owner={box.current} onClose={() => setActive(null)}>
        <PaintDots color={unit.anchor.color} action="바꾸기" disabled={busy} onChange={recolor} />
        <span className="record-menu-sep" />
        <button disabled={busy} onClick={() => { composeConceptMemo(id, unit.anchor!); setActive(null) }}><span className="ico">{Icon.comment}</span> {unit.text ? t('메모 고치기', 'Edit memo') : t('메모 달기', 'Add memo')}</button>
        <button disabled={busy} aria-label={t('지우기', 'Delete')} title={t('지우기', 'Delete')} onClick={remove}><span className="ico">{Icon.trash}</span></button>
      </RecordMenu>}
    </div></RecordContext.Provider>
  )
}
