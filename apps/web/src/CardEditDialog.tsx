import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { isDialogHostDisplayed } from './dialogVisibility'
import { t } from './i18n'

/**
 * 주제 · 프로젝트 고치기: 같은 머리, 두 칸, 맨 아랫줄에 취소 · 저장 (10/10 A안).
 * 윗줄은 왼쪽 이름 · 설명과 오른쪽 카드 미리보기, 아랫줄은 왼쪽 나머지 칸(lower)과 오른쪽 카드 모양(look)이 같은 높이에서 시작해 줄이 맞는다.
 */
export function CardEditDialog({ title, location, pc, ui, className = '', children, lower, preview, look, foot, canSave, onSave, onClose }: {
  title: string
  location: string
  pc: string
  ui: string
  className?: string
  /** 윗줄 왼쪽: 이름 · 설명 */
  children: ReactNode
  /** 아랫줄 왼쪽: 나머지 칸 (오른쪽 look과 줄을 맞춘다) */
  lower?: ReactNode
  preview: ReactNode
  /** 미리보기 바로 아래: 카드 그림 · 색처럼 카드 모양을 고르는 칸 (고르는 대로 위 카드가 바뀐다) */
  look?: ReactNode
  /** 맨 아랫줄 왼쪽 (오른쪽은 취소 · 저장): 아랫줄 두 칸의 줄 수를 맞추려고 왼쪽에만 있는 한 줄을 여기 둔다 */
  foot?: ReactNode
  canSave: boolean
  onSave(): void
  onClose(): void
}) {
  const host = useRef<HTMLSpanElement>(null)
  const [displayed, setDisplayed] = useState(false)
  const dialog = useRef<HTMLDivElement>(null)
  const opener = useRef(document.activeElement)

  // Workspace는 비활성 탭을 지우지 않고 숨긴다. 포털만 숨겨 부모의 초안은 유지한다.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- 숨긴 탭이 다시 보일 때를 잡으려고 렌더마다 잰다 (같은 값이면 다시 그리지 않는다)
  useLayoutEffect(() => { setDisplayed(isDialogHostDisplayed(host.current)) })
  useLayoutEffect(() => {
    const sentinel = host.current
    if (!sentinel) return
    const refresh = () => setDisplayed(isDialogHostDisplayed(sentinel))
    const observer = new ResizeObserver(refresh)
    observer.observe(sentinel)
    let frame = 0
    const onRoute = () => {
      refresh()
      cancelAnimationFrame(frame)
      // hashchange를 받은 라우터가 페이지 표시를 바꾼 뒤에도 확인한다.
      frame = requestAnimationFrame(refresh)
    }
    window.addEventListener('hashchange', onRoute)
    return () => {
      observer.disconnect()
      window.removeEventListener('hashchange', onRoute)
      cancelAnimationFrame(frame)
    }
  }, [])

  useEffect(() => {
    if (!displayed) return
    const previous = opener.current
    const first = dialog.current?.querySelector<HTMLElement>('input:enabled') ?? dialog.current?.querySelector<HTMLElement>('button:enabled')
    first?.focus()
    return () => { if (previous instanceof HTMLElement && isDialogHostDisplayed(previous)) previous.focus() }
  }, [displayed])

  // page-body의 컨테이너와 스크롤 영역 밖에 띄워 사이드바에 가려지지 않게 한다.
  return <>
    <span ref={host} className="td-host" aria-hidden="true" />
    {displayed && createPortal(
      <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
        <div ref={dialog} className={`dialog topic-dialog ${className}`} role="dialog" aria-modal="true" aria-label={title} data-ui={ui}
          onKeyDown={(e) => {
            if (!isDialogHostDisplayed(host.current) || e.nativeEvent.isComposing || e.defaultPrevented) return
            if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose() }
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); e.stopPropagation(); if (canSave) onSave() }
            if (e.key === 'Tab') {
              const controls = [...(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex="0"]') ?? [])]
                .filter((el) => el.getClientRects().length > 0)
              const first = controls[0], last = controls[controls.length - 1]
              if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus() }
              else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus() }
            }
          }}>
          <div className="td-head">
            <span className="td-band" style={{ ['--pc' as string]: pc } as CSSProperties} aria-hidden />
            <div className="td-titles"><b>{title}</b><span>{location}</span></div>
            <button type="button" className="icon-btn td-x" aria-label={t('닫기', 'Close')} title={t('닫기 (Esc)', 'Close (Esc)')} onClick={onClose}>×</button>
          </div>
          <div className="td-grid">
            <div className="td-fields td-top">{children}</div>
            <div className="td-card">{preview}</div>
            {lower && <div className="td-fields td-low">{lower}</div>}
            {look && <div className="td-look">{look}</div>}
            {foot && <div className="td-foot">{foot}</div>}
            <div className="td-acts">
              <button type="button" className="btn" onClick={onClose}>{t('취소', 'Cancel')} <span className="td-key">Esc</span></button>
              <button type="button" className="btn primary" disabled={!canSave} onClick={onSave}>{t('저장', 'Save')} <span className="td-key">⌘↵</span></button>
            </div>
          </div>
        </div>
      </div>, document.body,
    )}
  </>
}
