import katex from 'katex'
import 'katex/dist/katex.min.css'
import { useLayoutEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import { useConceptMacros } from './conceptMacros'
import { t } from './i18n'

/**
 * 주제 카드 · 노트 카드가 함께 쓰는 작은 부품 (10/5 시안 "공통"·"카드 미리보기").
 * 태그는 늘 한 줄(넘치면 마지막 태그를 …로 줄이고, 아예 안 보이는 태그가 있으면 +n), 설명은 앞 몇 줄, 시각은 "10/5 09:40".
 */

/** 카드의 최근 시각: "10/5 09:40" (올해가 아니면 "2025/10/5") */
export function cardTime(ms: number | undefined, now = new Date()): string {
  if (!ms) return ''
  const d = new Date(ms)
  const p = (n: number) => String(n).padStart(2, '0')
  if (d.getFullYear() !== now.getFullYear()) return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`
  return `${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`
}

/** 설명 글을 카드에 보일 줄로: 빈 줄은 빼고, "- " 목록은 글머리표로 */
export function descriptionLines(text: string | undefined): { text: string; bullet: boolean }[] {
  return (text ?? '').split('\n').map((l) => l.trim()).filter(Boolean)
    .map((l) => (/^[-*]\s+/.test(l) ? { text: l.replace(/^[-*]\s+/, ''), bullet: true } : { text: l, bullet: false }))
}

/**
 * 카드의 설명: 앞 n줄만 (넘치면 …). `$…$`는 미리보기처럼 KaTeX로 그린다 (10/5: 본문에서 뽑은 설명이 수식을 그대로 둔다).
 * 공유 기호 파일의 정의를 쓰고, 그래도 그리지 못하는 수식 조각(프로젝트에만 있는 \kc 같은 명령)은 뺀다.
 */
export function CardDescription({ text, lines, className = '' }: { text?: string; lines: 2 | 3; className?: string }) {
  const macros = useConceptMacros()
  const rows = descriptionLines(text)
  if (!rows.length) return <span className={`kc-desc l${lines} ${className}`} />
  return (
    <span className={`kc-desc l${lines} ${className}`}>
      {rows.map((r, i) => <span key={i} className={`kc-dl${r.bullet ? ' b' : ''}`}><MathText text={r.text} macros={macros} dropBad /></span>)}
    </span>
  )
}

/** 글자 수 (서버와 같게 줄바꿈은 세지 않고, 한글·기호는 한 글자) */
/** 글자 수: 줄바꿈은 세지 않고 $…$ 수식은 보이는 글자만 (@rw/core, 서버와 같은 기준) */
export { charCount } from '@rw/core'

/** 수식 조각 하나를 KaTeX로. dropBad면 그리지 못하는 조각은 빈 글(null) */
function renderMath(tex: string, macros: Record<string, string> | undefined, dropBad: boolean): string | null {
  // KaTeX는 macros 객체에 \gdef를 적어 넣을 수 있어 조각마다 새로 복사한다
  const opts = { ...(macros && { macros: { ...macros } }) }
  if (!dropBad) return katex.renderToString(tex, { ...opts, throwOnError: false })
  try { return katex.renderToString(tex, { ...opts, throwOnError: true }) } catch { return null }
}

/** 미리보기 글 · 카드 설명: `$…$` 안은 수식(KaTeX), 밖은 글 */
export function MathText({ text, macros, dropBad = false }: { text: string; macros?: Record<string, string>; dropBad?: boolean }) {
  const parts = useMemo(() => {
    const out: { math: boolean; s: string }[] = []
    const re = /\$([^$]+)\$/g
    let at = 0
    for (let m = re.exec(text); m; m = re.exec(text)) {
      if (m.index > at) out.push({ math: false, s: text.slice(at, m.index) })
      out.push({ math: true, s: m[1]! })
      at = m.index + m[0].length
    }
    if (at < text.length) out.push({ math: false, s: text.slice(at) })
    return out
  }, [text])
  return <>{parts.map((p, i) => {
    if (!p.math) return <span key={i} className="kc-text">{p.s}</span>
    const html = renderMath(p.s, macros, dropBad)
    return html === null ? null : <span key={i} className="kc-math" dangerouslySetInnerHTML={{ __html: html }} />
  })}</>
}

/**
 * 태그 한 줄: 들어가는 만큼만 보이고, 마지막 보이는 태그는 …로 줄고, 안 보이는 태그는 "+n"(가리키면 나머지 이름).
 * 처음에 모두 그려 너비를 잰 뒤 보일 수를 정한다 (카드 폭이 고정이라 한 번 재면 된다)
 */
export function TagLine({ tags, className = '' }: { tags: { key: string; label: string; cls?: string }[]; className?: string }) {
  const box = useRef<HTMLSpanElement>(null)
  const sig = tags.map((t) => `${t.label}\u0000${t.cls ?? ''}`).join('\u0001')
  const [shown, setShown] = useState(tags.length)
  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const measure = () => {
      const ruler = el.querySelector<HTMLElement>('.kc-ruler')
      if (!ruler) return
      const widths = [...ruler.children].map((c) => (c as HTMLElement).offsetWidth)
      const more = (ruler.lastElementChild as HTMLElement | null)?.offsetWidth ?? 0
      const W = el.clientWidth
      if (!W) return setShown(tags.length)
      const gap = parseFloat(getComputedStyle(el).columnGap) || 4
      const MIN = 34
      const total = widths.slice(0, tags.length).reduce((a, w, i) => a + w + (i ? gap : 0), 0)
      if (total <= W) return setShown(tags.length)
      let x = 0
      let n = 0
      for (let i = 0; i < tags.length; i++) {
        const start = x + (i ? gap : 0)
        const rest = i < tags.length - 1 ? more + gap : 0
        if (start + widths[i]! + rest <= W) { x = start + widths[i]!; n = i + 1; continue }
        // 다 들어가지 않으면 적어도 MIN만큼 보일 때 …로 줄여 보인다
        if (start + MIN + rest <= W) n = i + 1
        break
      }
      setShown(Math.max(n, Math.min(1, tags.length)))
    }
    measure()
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    ro?.observe(el)
    return () => ro?.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig])
  const hidden = tags.slice(shown)
  return (
    <span ref={box} className={`kc-tags ${className}`}>
      <span className="kc-ruler" aria-hidden>{tags.map((t) => <span key={t.key} className={t.cls}>{t.label}</span>)}<span className="kc-more">+{tags.length}</span></span>
      {tags.slice(0, shown).map((t, i) => <span key={t.key} className={`${t.cls ?? ''}${i === shown - 1 ? ' kc-last' : ''}`} title={t.label}>{t.label}</span>)}
      {hidden.length > 0 && <span className="kc-more" title={hidden.map((t) => t.label).join(' · ')}>+{hidden.length}</span>}
    </span>
  )
}

/** 카드의 ☆ 즐겨찾기 (회색, 누르면 바로 켜고 끔) */
export function CardStar({ on, onToggle, name }: { on: boolean; onToggle?(): void; name: string }) {
  if (!onToggle) return on ? <span className="kc-star on" aria-label={t('즐겨찾기', 'Favorite')}>★</span> : null
  return (
    <button type="button" className={`kc-star${on ? ' on' : ''}`} data-ui="중요 표시" aria-pressed={on} aria-label={`${on ? t('즐겨찾기 빼기', 'Unfavorite') : t('즐겨찾기', 'Favorite')}: ${name}`}
      title={on ? t('즐겨찾기 빼기', 'Unfavorite') : t('즐겨찾기 (어느 정렬에서도 앞에 둡니다)', 'Favorite (kept first in any sort)')}
      onClick={(e: MouseEvent) => { e.stopPropagation(); onToggle() }}
      onKeyDown={(e) => e.stopPropagation()}>{on ? '★' : '☆'}</button>
  )
}
