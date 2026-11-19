import { useState, type PointerEvent, type ReactNode } from 'react'
import { t } from './i18n'
import { store } from './store'

const WORK_W_KEY = 'rw-agent-work-width'
const WORK_MIN = 280

/** 에이전트 화면 오른쪽 작업 상태 칸. 왼쪽 경계를 끌면 폭이 280px에서 화면 절반까지 바뀌고, 두 번 누르면 처음 폭(0 = CSS 기본)으로 (11/19 제안) */
export function WorkAside({ children }: { children: ReactNode }) {
  const [width, setWidth] = useState(() => store.get<number>(WORK_W_KEY, 0))
  const save = (w: number) => { setWidth(w); store.set(WORK_W_KEY, w) }
  const start = (e: PointerEvent<HTMLDivElement>) => {
    const x0 = e.clientX
    const w0 = e.currentTarget.nextElementSibling?.getBoundingClientRect().width ?? 360
    let w = w0
    const move = (ev: globalThis.PointerEvent) => {
      w = Math.round(Math.min(window.innerWidth / 2, Math.max(WORK_MIN, w0 - (ev.clientX - x0))))
      setWidth(w)
    }
    const up = () => {
      document.body.classList.remove('resizing')
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      save(w)
    }
    document.body.classList.add('resizing')
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }
  return (
    <>
      <div className="ac-work-resize" data-ui="작업 상태 폭 조절" role="separator" aria-orientation="vertical"
        title={t('끌어 폭 바꾸기 · 두 번 누르면 처음 폭', 'Drag to resize · double-click to reset')}
        onPointerDown={start} onDoubleClick={() => save(0)} />
      <aside className="ac-work" data-ui="작업 상태" style={width ? { width } : undefined}>{children}</aside>
    </>
  )
}
