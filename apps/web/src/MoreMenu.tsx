import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Icon } from './icons'
import { t } from './i18n'
import { useDismiss } from './useDismiss'

export interface MoreItem {
  label: string
  /** 체크 항목(필터 메뉴): 켜짐 · 꺼짐을 앞에 보이고, 눌러도 메뉴가 닫히지 않는다 */
  checked?: boolean
  /** 항목 오른쪽의 옅은 글 (수 등) */
  note?: string
  /** 이 항목 위에 구분선 */
  divider?: boolean
  danger?: boolean
  disabled?: boolean
  ui?: string
  onClick(): void
}

/**
 * 버튼 하나와 그 아래 메뉴 (11/28 「카드의 그 밖의 행동은 ⋯ 안」, 둘째 줄의 필터 · 정렬).
 * 메뉴는 창 기준 자리에 띄워 좁은 사이드바 · 스크롤 칸에 잘리지 않고, 아래에 자리가 없으면 위로 연다.
 */
export function MoreMenu({ items, icon = Icon.more, tip = t('더 보기', 'More'), ui = '더 보기 메뉴', small = false, on = false, disabled = false }: {
  items: MoreItem[]; icon?: ReactNode; tip?: string; ui?: string; small?: boolean
  /** 메뉴가 닫혀 있어도 불을 켠다 (필터가 걸려 있을 때) */
  on?: boolean; disabled?: boolean
}) {
  const [at, setAt] = useState<{ right: number; top?: number; bottom?: number } | null>(null)
  const box = useRef<HTMLSpanElement>(null)
  const close = () => setAt(null)
  useDismiss(at !== null, box, close)
  useEffect(() => {
    if (!at) return
    // 목록이 굴러가면 버튼과 메뉴가 어긋나니 닫는다
    const scroll = (e: Event) => { if (!(e.target instanceof Node && box.current?.contains(e.target))) close() }
    document.addEventListener('scroll', scroll, true)
    window.addEventListener('resize', close)
    return () => { document.removeEventListener('scroll', scroll, true); window.removeEventListener('resize', close) }
  }, [at])
  const toggle = () => {
    if (at) return close()
    const r = box.current!.getBoundingClientRect()
    const height = items.length * 32 + 12
    const right = Math.max(4, window.innerWidth - r.right)
    setAt(r.bottom + height + 8 > window.innerHeight && r.top > height ? { right, bottom: window.innerHeight - r.top + 4 } : { right, top: r.bottom + 4 })
  }
  return <span className="more-menu" ref={box}>
    <button type="button" className={`icon-btn${small ? ' sm' : ''}${at || on ? ' on' : ''} tip-end`} data-ui={ui} data-tip={tip} aria-label={tip} aria-haspopup="menu" aria-expanded={at !== null} disabled={disabled} onClick={toggle}>{icon}</button>
    {at && <div className="menu more-menu-pop" role="menu" data-ui="더 보기 항목" style={at}>
      {items.map((it) => <button key={it.label} type="button" role={it.checked === undefined ? 'menuitem' : 'menuitemcheckbox'} aria-checked={it.checked} data-ui={it.ui} disabled={it.disabled}
        className={`${it.divider ? 'divided' : ''}${it.danger ? ' danger' : ''}`} onClick={() => { if (it.checked === undefined) close(); it.onClick() }}>
        {it.checked !== undefined && <span className="more-menu-check" aria-hidden>{it.checked ? Icon.check : null}</span>}
        <span className="more-menu-label">{it.label}</span>{it.note && <span className="more-menu-note">{it.note}</span>}
      </button>)}
    </div>}
  </span>
}
