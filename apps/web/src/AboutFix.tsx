import { useEffect, useState, type RefObject } from 'react'
import { api, setAboutCheck } from './api'
import { putAboutChecks } from './aboutChecks'
import { t } from './i18n'
import { Icon } from './icons'
import { draftSource } from './unsent'

/**
 * 소개 고치기 탭 (11/20 시안 3절 안 C, 「시안대로 구현하자」).
 * 탭을 열면 본문이 피드백 모드처럼 고르기가 된다: 올리면 노란 테두리와 이름표, 누르면 그곳의 지금 글이 사이드바 칸에 들어온다.
 * 그림 속 상자 · 표 칸 · 문단 어디든 고를 수 있고, 본문은 편집 상태가 되지 않는다. 고친 글을 「담기」로 여러 곳 모아 한 번에 피드백으로 보낸다.
 * 소개 글은 앱 코드(about/<쪽>/<절>.tsx)에 있어 바로 저장하지 않고, 다음 피드백 처리 때 에이전트가 반영한다.
 * 예전(11/16–11/19)에는 툴바 연필로 수정 모드를 켜고 절 본문을 그 자리에서 고쳤다.
 */

/** 글 단위: 목록 항목 · 표 칸 · 문단 · 제목 */
const UNIT = 'li, td, th, p, dt, dd, h2, h3, h4, caption'
const FIGURE = 'figure, svg, .about-figs'
const norm = (s: string) => s.replace(/\s+/g, ' ').trim()
const clip = (s: string, n = 14) => (s.length > n ? `${s.slice(0, n)}…` : s)
const textOf = (el: Element) => norm(el instanceof HTMLElement ? el.innerText : el.textContent ?? '')

export interface FixChange { where: string; before: string; after: string; key?: string; pr?: number }

/** 누른 곳에서 고를 요소: 그림 안이면 글이 있는 가장 작은 상자(같은 글을 감싼 겉은 하나로), 밖이면 가장 가까운 글 단위 */
export function pickTarget(from: Element, root: Element): Element | null {
  if (!root.contains(from)) return null
  const fig = from.closest(FIGURE)
  if (fig && root.contains(fig)) {
    let el: Element | null = from
    while (el && el !== fig && !textOf(el)) el = el.parentElement
    if (!el || !textOf(el)) return null
    while (el.parentElement && el !== fig && el.parentElement !== fig && textOf(el.parentElement) === textOf(el)) el = el.parentElement
    return el
  }
  const unit = from.closest(UNIT)
  return unit && root.contains(unit) && textOf(unit) ? unit : null
}

/** 사용자가 찾을 수 있는 자리 이름: <절> › 그림 › 상자 글, 표는 줄(첫 칸) · 칸(머리), 목록은 몇째 항목, 그 밖은 문단 첫 말 */
export function whereOf(el: Element): string {
  const sec = el.closest('section')?.querySelector('h2')?.textContent?.trim()
  const head = sec ? `${sec} › ` : ''
  const before = textOf(el)
  if (el.closest(FIGURE)) return `${head}${t('그림', 'Figure')} › ${clip(before, 20)}`
  const cell = el.closest('td, th')
  const row = cell?.parentElement
  if (cell instanceof HTMLTableCellElement && row instanceof HTMLTableRowElement) {
    if (row.parentElement?.tagName === 'THEAD') return head + t(`표 머리 「${clip(before)}」 칸`, `Table header "${clip(before)}"`)
    const col = norm(cell.closest('table')?.querySelector('thead tr')?.children[cell.cellIndex]?.textContent ?? '')
    const name = norm(row.cells[0]?.innerText ?? '')
    return head + (col ? t(`표 「${clip(name)}」 줄 · 「${clip(col)}」 칸`, `Table row "${clip(name)}", column "${clip(col)}"`) : t(`표 「${clip(name)}」 줄 ${cell.cellIndex + 1}번째 칸`, `Table row "${clip(name)}", cell ${cell.cellIndex + 1}`))
  }
  if (el.tagName === 'LI') {
    const k = [...(el.parentElement?.children ?? [])].indexOf(el) + 1
    return head + t(`목록 ${k}번째 항목 「${clip(before)}」`, `List item ${k} "${clip(before)}"`)
  }
  if (el.tagName === 'H2') return head + t('절 제목', 'Section title')
  return head + t(`문단 「${clip(before)}」`, `Paragraph "${clip(before)}"`)
}

/** 피드백으로 남길 글 (에이전트가 읽는다: 한국어 그대로) */
export function fixText(changes: FixChange[], wish: string): string {
  const lines = [`소개 글을 이렇게 고쳐 줘. (고치기 탭, 고친 곳 ${changes.length})`, '']
  changes.forEach((c, i) => lines.push(`${i + 1}. ${c.where}`, `   전: ${c.before || '(없음)'}`, `   후: ${c.after || '(지움)'}`, ''))
  if (wish.trim()) lines.push(`바라는 점: ${wish.trim()}`)
  return lines.join('\n').trim()
}

/** 고르기: 탭이 열린 동안 본문에 올린 곳을 테두리와 이름표로 보이고, 누르면 onPick. 누름은 본문의 링크로 넘어가지 않는다 */
function usePicking(root: RefObject<HTMLElement | null>, on: boolean, onPick: (el: Element) => void) {
  const [hover, setHover] = useState<{ box: DOMRect; name: string } | null>(null)
  useEffect(() => {
    const el = root.current
    if (!on || !el) { setHover(null); return }
    const over = (e: Event) => {
      const x = e.target instanceof Element ? pickTarget(e.target, el) : null
      setHover(x ? { box: x.getBoundingClientRect(), name: whereOf(x) } : null)
    }
    const click = (e: Event) => {
      const x = e.target instanceof Element ? pickTarget(e.target, el) : null
      if (!x) return
      e.preventDefault(); e.stopPropagation()
      onPick(x)
    }
    const leave = () => setHover(null)
    el.classList.add('about-picking')
    el.addEventListener('mouseover', over)
    el.addEventListener('click', click, true)
    el.addEventListener('mouseleave', leave)
    const scroller = el.closest('.scroll')
    scroller?.addEventListener('scroll', leave)
    return () => {
      el.classList.remove('about-picking')
      el.removeEventListener('mouseover', over)
      el.removeEventListener('click', click, true)
      el.removeEventListener('mouseleave', leave)
      scroller?.removeEventListener('scroll', leave)
    }
  }, [root, on, onPick])
  return hover
}

type Kept = FixChange & { name?: string; part: string }
/**
 * 담은 곳과 바라는 점은 탭 · 쪽 · 절을 바꿔도 남는다 (11/26): 전에는 부품의 상태라, 여러 절의 고칠 곳을 모으려고 절을 넘기면 사라졌다
 * (소개는 절을 하나씩 보이고, 절이 바뀌면 고르던 곳을 비우려고 이 탭을 새로 만든다). 보내면 비운다
 */
let kept: { basket: Kept[]; wish: string } = { basket: [], wish: '' }
draftSource(() => kept.basket.length > 0 || kept.wish.trim() !== '')
/** 보낼 대상 이름: 한 쪽이면 그 쪽(절이 하나면 절까지), 여러 쪽이면 쪽 이름 없이 */
export function fixTarget(basket: { name?: string; part: string }[], here: string): string {
  const parts = [...new Set(basket.map((c) => c.part))]
  if (parts.length > 1) return '소개 › 고치기'
  const names = [...new Set(basket.map((c) => c.name).filter(Boolean))]
  return `소개 › ${parts[0] ?? here}${names.length === 1 ? ` › ${names[0]}` : ''} › 고치기`
}

/** 고치기 탭: 고른 곳 · 지금 글 · 고친 글 · 담기, 담은 곳 목록 · 바라는 점 · 피드백으로 보내기 */
export function AboutFixTab({ root, partName, sectionKey }: {
  root: RefObject<HTMLElement | null>; partName: string
  /** 고른 요소가 속한 절의 확인 키와 그 절의 마지막 PR (보낸 뒤 「반영 대기」) */
  sectionKey(el: Element): { key: string; pr: number; name: string } | undefined
}) {
  const [cur, setCur] = useState<{ where: string; before: string; key?: string; pr?: number; name?: string } | null>(null)
  const [draft, setDraft] = useState('')
  const [basket, showBasket] = useState(kept.basket)
  const [wish, showWish] = useState(kept.wish)
  const setBasket = (f: (b: Kept[]) => Kept[]) => { kept = { ...kept, basket: f(kept.basket) }; showBasket(kept.basket) }
  const setWish = (v: string) => { kept = { ...kept, wish: v }; showWish(v) }
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const [pick] = useState(() => (el: Element) => {
    const before = textOf(el)
    const s = sectionKey(el)
    setCur({ where: whereOf(el), before, ...(s && { key: s.key, pr: s.pr, name: s.name }) })
    setDraft(before); setNote('')
  })
  const hover = usePicking(root, true, pick)
  const add = () => {
    if (!cur || draft.trim() === cur.before) return
    setBasket((b) => [...b.filter((x) => x.where !== cur.where || x.part !== partName), { where: cur.where, before: cur.before, after: norm(draft), part: partName, ...(cur.key && { key: cur.key, pr: cur.pr, name: cur.name }) }])
    setCur(null); setDraft('')
  }
  const send = async () => {
    setBusy(true); setNote('')
    try {
      // 여러 쪽에서 담았으면 자리 이름 앞에 쪽 이름을 붙인다 (절 이름만으로는 어느 쪽인지 모른다)
      const many = new Set(basket.map((c) => c.part)).size > 1
      await api.addFeedback({
        kind: '미분류', target: fixTarget(basket, partName), route: location.hash.slice(1) || undefined,
        snippet: (basket[0] ? `${basket[0].where}: ${basket[0].after}` : wish).slice(0, 120),
        text: fixText(many ? basket.map((c) => ({ ...c, where: `${c.part} › ${c.where}` })) : basket, wish),
      })
      // 고쳐 보낸 절은 반영될 때까지 「반영 대기」
      for (const k of new Map(basket.filter((c) => c.key).map((c) => [c.key!, c.pr ?? 0]))) await setAboutCheck({ key: k[0], action: 'sent', pr: k[1] }).then(putAboutChecks).catch(() => undefined)
      setBasket(() => []); setWish('')
      setNote(t('피드백으로 보냈습니다. 다음 피드백 처리 때 소개에 반영하고, 고친 업데이트가 이력 표에 한 줄로 생깁니다.', 'Sent as feedback. It will be applied at the next round of feedback handling, and the update that applies it appears as a row in History.'))
    } catch (e) { setNote(e instanceof Error ? e.message : String(e)) }
    setBusy(false)
  }
  return (
    <div className="about-fix" data-ui="소개 고치기">
      {hover && <>
        <div className="fb-box" style={{ left: hover.box.left - 2, top: hover.box.top - 2, width: hover.box.width + 4, height: hover.box.height + 4 }} />
        <div className="fb-label" style={{ left: hover.box.left, top: Math.max(4, hover.box.top - 24) }}>{hover.name}</div>
      </>}
      {!cur && <p className="muted">{t('본문에서 고칠 곳을 누르세요. 그림 속 상자 · 표 칸 · 문단 어디든 됩니다.', 'Click the place to edit in the text: a box in a figure, a table cell or a paragraph.')}</p>}
      {cur && <>
        <b className="about-fix-where">{cur.where}</b>
        <p className="about-fix-old" data-ui="지금 글">{cur.before}</p>
        <textarea className="about-fix-new" data-ui="고친 글" value={draft} rows={4} onChange={(e) => setDraft(e.target.value)} aria-label={t('고친 글', 'Edited text')} autoFocus />
        <div className="about-fix-tools"><span className="sp" />
          <button className="btn" onClick={() => setCur(null)}>{t('취소', 'Cancel')}</button>
          <button className="btn" data-ui="담기" disabled={draft.trim() === cur.before} onClick={add}>{t('담기', 'Add')}</button>
        </div>
      </>}
      <div className="about-fix-basket" data-ui="담은 곳">
        <b>{t(`담은 곳 ${basket.length}`, `${basket.length} added`)}</b>
        {basket.length > 0 && <ul>{basket.map((c) => (
          <li key={`${c.part} ${c.where}`}><span title={`${c.before} → ${c.after}`}>{c.part === partName ? c.where : `${c.part} › ${c.where}`}</span>
            <button className="icon-btn" aria-label={t('제거', 'Remove')} data-tip={t('제거', 'Remove')} onClick={() => setBasket((b) => b.filter((x) => x !== c))}>{Icon.x}</button></li>
        ))}</ul>}
        <input className="about-fix-line" data-ui="바라는 점" value={wish} onChange={(e) => setWish(e.target.value)} disabled={busy}
          placeholder={t('바라는 점 (줄 추가 · 순서 변경처럼 글로 하기 어려운 것)', 'Other wishes (things hard to do as text, such as adding a row or reordering)')} aria-label={t('바라는 점', 'Other wishes')} />
        <div className="about-fix-tools"><span className="sp" />
          <button className="btn primary" data-ui="피드백으로 보내기" disabled={busy || (!basket.length && !wish.trim())} onClick={() => void send()}>{t('피드백으로 보내기', 'Send as feedback')}</button>
        </div>
        {note && <p className="muted">{note}</p>}
      </div>
    </div>
  )
}
