import { useEffect, useState, type RefObject } from 'react'
import { api, setAboutCheck } from './api'
import { putAboutChecks } from './aboutChecks'
import { t } from './i18n'

/**
 * 소개 글 제자리 고치기 (11/13 23:41 질문 → 11/16 「시안은 다 추천대로」, 시안 1-2절 안 C).
 * 연필을 누르면 그 절 본문이 그 자리에서 고치기 모드가 된다: 보이는 글 · 표 칸을 그대로 고치고, 그림은 잠근다.
 * 소개 글은 앱 코드(about/<쪽>/<절>.tsx)에 있어 바로 저장하지 않고, 바뀐 곳만(어디 · 전 · 후) 뽑아 피드백으로 남긴다.
 * 다음 피드백 처리 때 에이전트가 코드에 반영한다. 예전에는 절 전체 글(그림 속 글자 · 탭으로 이은 표 칸까지)을 입력란에 넣었다.
 */

/** 글 단위: 목록 항목 · 표 칸 · 문단. 다른 단위를 품은 것과 그림 안의 것은 뺀다 */
const UNIT = 'li, td, th, p, dt, dd, h3, h4, caption'
const LOCK = 'figure, svg, img'
const norm = (s: string) => s.replace(/\s+/g, ' ').trim()
const clip = (s: string, n = 14) => (s.length > n ? `${s.slice(0, n)}…` : s)

export interface FixUnit { el: HTMLElement; before: string; where: string }
export interface FixChange { where: string; before: string; after: string }

/** 고치기를 시작할 때: 그림을 잠그고 글 단위마다 처음 글과 자리 이름을 적어 둔다 */
export function prepareFix(root: HTMLElement): { units: FixUnit[]; figures: number } {
  const locked = [...root.querySelectorAll<HTMLElement>(LOCK)].filter((el) => !el.parentElement?.closest(LOCK))
  for (const el of locked) { el.contentEditable = 'false'; el.classList.add('about-locked') }
  const units = [...root.querySelectorAll<HTMLElement>(UNIT)].filter((el) => !el.closest(LOCK) && !el.querySelector(UNIT)).map((el, i) => {
    el.dataset.fixUnit = String(i)
    const before = norm(el.innerText)
    return { el, before, where: whereOf(el, before) }
  })
  return { units, figures: locked.filter((el) => el.tagName.toLowerCase() === 'figure' || !el.closest('figure')).length }
}

/** 사용자가 찾을 수 있는 자리 이름: 표는 줄(첫 칸) · 칸(머리), 목록은 몇째 항목, 그 밖은 문단 첫 말 */
function whereOf(el: HTMLElement, before: string): string {
  const cell = el.closest('td, th') as HTMLTableCellElement | null
  if (cell) {
    const row = cell.parentElement as HTMLTableRowElement
    if (row.parentElement?.tagName === 'THEAD') return t(`표 머리 「${clip(before)}」 칸`, `Table header "${clip(before)}"`)
    const head = norm(cell.closest('table')?.querySelector('thead tr')?.children[cell.cellIndex]?.textContent ?? '')
    const name = norm(row.cells[0]?.innerText ?? '')
    return head ? t(`표 「${clip(name)}」 줄 · 「${clip(head)}」 칸`, `Table row "${clip(name)}", column "${clip(head)}"`) : t(`표 「${clip(name)}」 줄 ${cell.cellIndex + 1}번째 칸`, `Table row "${clip(name)}", cell ${cell.cellIndex + 1}`)
  }
  if (el.tagName === 'LI') {
    const k = [...(el.parentElement?.children ?? [])].indexOf(el) + 1
    return t(`목록 ${k}번째 항목 「${clip(before)}」`, `List item ${k} "${clip(before)}"`)
  }
  return t(`문단 「${clip(before)}」`, `Paragraph "${clip(before)}"`)
}

/** 지금 바뀐 곳: 글이 달라진 단위, 지운 단위, 새로 생긴 문단. 바뀐 단위에는 표시를 단다 */
export function collectFix(root: HTMLElement, units: FixUnit[]): FixChange[] {
  const out: FixChange[] = []
  let last = ''
  for (const u of units) {
    const alive = root.contains(u.el)
    const after = alive ? norm(u.el.innerText) : ''
    if (alive) u.el.classList.toggle('about-fix-changed', after !== u.before)
    if (after !== u.before) out.push({ where: u.where, before: u.before, after })
    if (alive) last = u.before
  }
  // Enter로 생긴 새 문단: 어느 단위에도 속하지 않은 글. 브라우저는 Enter로 항목을 나눌 때 표시(data-fix-unit)까지 복사하므로 처음 그 요소인지로 가린다
  const own = new Set(units.map((u) => u.el))
  const inOwn = (el: HTMLElement) => { for (let x: HTMLElement | null = el; x && x !== root; x = x.parentElement) if (own.has(x)) return true; return false }
  const fresh = new Set([...root.querySelectorAll<HTMLElement>(`p, div, li, ${UNIT}`)].filter((el) =>
    !inOwn(el) && !el.closest(LOCK) && !el.querySelector(LOCK) && ![...own].some((u) => el.contains(u)) && norm(el.innerText)))
  // 새 요소 안의 새 요소는 바깥 것 하나로
  const added = [...fresh].filter((el) => { for (let x = el.parentElement; x && x !== root; x = x.parentElement) if (fresh.has(x)) return false; return true })
  for (const el of added) {
    const prev = el.previousElementSibling as HTMLElement | null
    const near = prev && own.has(prev) ? units[Number(prev.dataset.fixUnit)]?.before ?? last : last
    out.push({ where: near ? t(`새 문단 (「${clip(near)}」 다음)`, `New paragraph (after "${clip(near)}")`) : t('새 문단', 'New paragraph'), before: '', after: norm(el.innerText) })
  }
  return out
}

/** 피드백으로 남길 글 (에이전트가 읽는다: 한국어 그대로) */
export function fixText(changes: FixChange[], figure: string, wish: string): string {
  const lines = [`소개 글을 이렇게 고쳐 줘. (제자리 고치기, 변경사항 ${changes.length})`, '']
  changes.forEach((c, i) => lines.push(`${i + 1}. ${c.where}`, `   전: ${c.before || '(없음)'}`, `   후: ${c.after || '(지움)'}`, ''))
  if (figure.trim()) lines.push(`그림에 대한 말: ${figure.trim()}`)
  if (wish.trim()) lines.push(`바라는 점: ${wish.trim()}`)
  return lines.join('\n').trim()
}

export interface FixCheck { key: string; enabled: boolean; prs: number[] }

/** 고치는 중인 절 아래의 칸: 그림에 대한 말 · 바라는 점 · 취소 · 보내기 */
export function AboutFixBar({ part, name, root, units, figures, check, onClose }: {
  part: string; name: string; root: RefObject<HTMLDivElement | null>; units: FixUnit[]; figures: number; check?: FixCheck; onClose(): void
}) {
  const [count, setCount] = useState(0)
  const [figure, setFigure] = useState('')
  const [wish, setWish] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    const el = root.current
    if (!el) return
    const on = () => setCount(collectFix(el, units).length)
    el.addEventListener('input', on)
    return () => el.removeEventListener('input', on)
  }, [root, units])
  const ready = count > 0 || !!figure.trim() || !!wish.trim()
  const submit = async () => {
    const el = root.current
    if (!el) return
    const changes = collectFix(el, units)
    setBusy(true); setError('')
    try {
      await api.addFeedback({
        kind: '미분류', target: `소개 › ${part} › ${name}`, route: location.hash.slice(1) || undefined,
        snippet: (changes[0] ? `${changes[0].where}: ${changes[0].after}` : wish || figure).slice(0, 120),
        text: fixText(changes, figure, wish),
      })
      // 고쳐 보낸 절은 반영될 때까지 「반영 대기」 (11/11 안 C′ ⑤)
      if (check?.enabled) await setAboutCheck({ key: check.key, action: 'sent', pr: check.prs[check.prs.length - 1] ?? 0 }).then(putAboutChecks).catch(() => undefined)
      onClose()
      alert(t('고친 곳을 피드백으로 남겼습니다. 다음 피드백 처리 때 소개에 반영합니다.', 'Your edits were saved as feedback. They will be applied to this page at the next round of feedback handling.'))
    } catch (e) { setError((e as Error).message); setBusy(false) }
  }
  return (
    <div className="about-fix-box" data-ui="소개 고치기">
      <p className="muted">{t('본문을 그 자리에서 고치세요. 보내면 변경사항만 피드백으로 남고, 다음 피드백 처리 때 소개에 반영됩니다.', 'Edit the text in place. When you send, only the changed parts are saved as feedback and applied at the next round of feedback handling.')}</p>
      {figures > 0 && <input className="about-fix-line" data-ui="그림에 대한 말" value={figure} onChange={(e) => setFigure(e.target.value)} disabled={busy}
        placeholder={t('그림에 대한 말 (그림은 고칠 수 없습니다)', 'About the figure (figures cannot be edited)')} aria-label={t('그림에 대한 말', 'About the figure')} />}
      <input className="about-fix-line" data-ui="바라는 점" value={wish} onChange={(e) => setWish(e.target.value)} disabled={busy}
        placeholder={t('바라는 점 (표의 줄 추가 · 순서 변경처럼 글로 하기 어려운 것)', 'Other wishes (things hard to do as text, such as adding a table row or reordering)')} aria-label={t('바라는 점', 'Other wishes')} />
      {error && <p className="muted">{error}</p>}
      <div className="about-fix-tools">
        <span className="muted about-fix-count">{t(`변경사항 ${count}`, `${count} changes`)}</span><span className="sp" />
        <button className="btn" onClick={onClose} disabled={busy}>{t('취소', 'Cancel')}</button>
        <button className="btn primary" onClick={() => void submit()} disabled={busy || !ready}>{t('보내기', 'Send')}</button>
      </div>
    </div>
  )
}
