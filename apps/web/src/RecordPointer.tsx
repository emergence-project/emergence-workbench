import { useEffect, useState } from 'react'
import { snippetOf, uiPath } from './FeedbackMode'
import { uiShown } from './uiNames'
import { t } from './i18n'

/** 가리킨 화면 부위 (피드백 모드와 같은 부위 이름) */
export interface PointedPart { part: string; partText: string }

const own = (target: EventTarget | null) => target instanceof Element && !!target.closest('[data-pointer-ui]')

/**
 * 기록의 가리키기 (10/15 피드백: 피드백 모드처럼 기록이 화면 어디에 대한 것인지 남긴다).
 * 켜져 있는 동안 화면 부위(data-ui)에 마우스를 올리면 이름표가 뜨고, 누르면 그 부위 이름과 글자를 돌려준다.
 * 누른 순간의 앱 동작(버튼, 점 고르기)은 막는다. Esc나 아래 막대의 취소로 끈다.
 */
export function RecordPointer({ onPick, onCancel }: { onPick(p: PointedPart): void; onCancel(): void }) {
  const [hover, setHover] = useState<{ rect: DOMRect; path: string } | null>(null)
  useEffect(() => {
    const target = (e: Event) => (e.target instanceof Element ? e.target.closest('[data-ui]') : null)
    const move = (e: MouseEvent) => {
      if (own(e.target)) { setHover(null); return }
      const el = target(e)
      setHover(el ? { rect: el.getBoundingClientRect(), path: uiPath(el) } : null)
    }
    const block = (e: Event) => { if (own(e.target)) return; e.preventDefault(); e.stopPropagation() }
    const click = (e: MouseEvent) => {
      if (own(e.target)) return
      block(e)
      const el = target(e)
      if (el) onPick({ part: uiPath(el), partText: snippetOf(el) })
    }
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onCancel() } }
    const events = ['mousedown', 'mouseup', 'pointerdown', 'pointerup', 'dblclick'] as const
    window.addEventListener('mousemove', move, true)
    for (const name of events) window.addEventListener(name, block, true)
    window.addEventListener('click', click, true)
    window.addEventListener('keydown', key, true)
    document.body.classList.add('record-pointing')
    return () => {
      window.removeEventListener('mousemove', move, true)
      for (const name of events) window.removeEventListener(name, block, true)
      window.removeEventListener('click', click, true)
      window.removeEventListener('keydown', key, true)
      document.body.classList.remove('record-pointing')
    }
  }, [onPick, onCancel])
  return <>
    {hover && <>
      <div className="fb-box" style={{ left: hover.rect.left - 2, top: hover.rect.top - 2, width: hover.rect.width + 4, height: hover.rect.height + 4 }} />
      <div className="fb-label" style={{ left: Math.max(4, hover.rect.left - 2), top: hover.rect.top > 28 ? hover.rect.top - 24 : hover.rect.bottom + 4 }}>{uiShown(hover.path)}</div>
    </>}
    <div className="fb-bar" data-pointer-ui role="status">
      <b>{t('가리키기', 'Point')}</b><span>{t('기록이 가리킬 화면 한 곳을 누르세요 · Esc 취소', 'Click the part of the screen this record is about · Esc to cancel')}</span>
      <button className="btn sm" onClick={onCancel}>{t('취소', 'Cancel')}</button>
    </div>
  </>
}
