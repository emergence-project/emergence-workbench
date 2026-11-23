import { useEffect, useState, type PointerEvent, type ReactNode } from 'react'
import { t } from './i18n'
import { Icon } from './icons'
import { store } from './store'
import { OPEN_RIGHT, rightModeNow } from './noteScreen'
import { TerminalPane, useTerminalAvailable } from './TerminalPane'

const WORK_W_KEY = 'rw-agent-work-width'
const WORK_MIN = 280
const PANE_KEY = 'rw-agent-pane'

/** 에이전트 화면 오른쪽 작업 상태 칸. 왼쪽 경계를 끌면 폭이 280px에서 화면 절반까지 바뀌고, 두 번 누르면 처음 폭(0 = CSS 기본)으로 (11/19 제안).
 *  터미널 칸(TerminalColumn)도 같은 자리 · 같은 폭을 쓴다. wide면 화면 절반 */
export function WorkAside({ children, ui = '작업 상태', className, hidden, wide }: { children: ReactNode; ui?: string; className?: string; hidden?: boolean; wide?: boolean }) {
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
      <div className="ac-work-resize" data-ui="작업 상태 폭 조절" role="separator" aria-orientation="vertical" hidden={hidden}
        title={t('끌어 폭 바꾸기 · 두 번 누르면 처음 폭', 'Drag to resize · double-click to reset')}
        onPointerDown={start} onDoubleClick={() => save(0)} />
      <aside className={`ac-work${className ? ` ${className}` : ''}`} data-ui={ui} hidden={hidden} style={wide ? { width: '50vw' } : width ? { width } : undefined}>{children}</aside>
    </>
  )
}

/** 에이전트 화면에서 대화 머리의 「>_」로 작업 상태 칸 자리를 바꾸는 터미널 (11/19 사용자 결정 B1).
 *  맨 위 「터미널」 · 크게 · 닫기. 한 번 열면 작업 상태로 돌아가거나 다른 대화로 가도 셸을 숨겨 둔다(hidden) */
export function TerminalColumn({ rid, hidden, onClose }: { rid: string; hidden: boolean; onClose(): void }) {
  const [wide, setWide] = useState(false)
  const tools = <>
    <button className={`icon-btn sm${wide ? ' on' : ''}`} data-ui="터미널 크게" aria-pressed={wide} data-tip={wide ? t('원래 폭', 'Normal width') : t('크게 (화면 절반)', 'Wide (half the screen)')} aria-label={t('크게', 'Wide')} onClick={() => setWide(!wide)}>{wide ? Icon.minimize : Icon.maximize}</button>
    <button className="icon-btn sm" data-ui="터미널 닫기" data-tip={t('닫기 (셸은 그대로)', 'Close (the shell keeps running)')} aria-label={t('닫기', 'Close')} onClick={onClose}>{Icon.x}</button>
  </>
  return (
    <WorkAside ui="터미널 칸" className="ac-term-col" hidden={hidden} wide={wide}>
      <TerminalPane rid={rid} attach title tools={tools} />
    </WorkAside>
  )
}

export type SideView = 'info' | 'changes' | 'terminal'
const VIEW_KEY = 'rw-agent-view'

/** 정보 · 변경사항 · 터미널 중 지금 보일 것. 고른 것이 없는 대화(변경사항이 없거나 터미널을 못 쓰면)에서는 정보로 */
export function shownView(view: SideView | null, can: { changes: boolean; terminal: boolean }): SideView | null {
  if (view === 'changes' && !can.changes) return 'info'
  if (view === 'terminal' && !can.terminal) return 'info'
  return view
}

/** 에이전트 화면(AgentPage)의 오른쪽 칸: 정보 · 변경사항 · 터미널 세 보기 중 하나 (11/23 시안 agent-side-views).
 *  대화 머리의 아이콘 묶음이 보기를 돌리고, 켜진 것을 다시 누르면 칸을 닫는다(고른 보기는 기억한다).
 *  터미널은 한 번 열면 다른 보기로 가도 셸을 살려 둔다(11/19 B1). rid는 터미널을 열 폴더, delta는 변경사항 아이콘에 붙일 +n −n(없으면 아이콘도 없다) */
export function useSideColumn(chatPage: boolean, rid?: string, delta?: ReactNode) {
  // 정보 · 변경사항 · 닫힘은 기억하고, 터미널은 이 화면에서만 (다음에 열면 기억한 보기로)
  const [view, setViewState] = useState<SideView | null>(() => store.get<SideView | null>(VIEW_KEY, store.get<boolean>(PANE_KEY, true) ? 'info' : null))
  const [term, setTerm] = useState(false)
  const [opened, setOpened] = useState(false)
  const canTerm = useTerminalAvailable()
  const shown = shownView(term ? 'terminal' : view, { changes: !!delta, terminal: canTerm })
  const openTerm = () => { setTerm(true); setOpened(true) }
  const setView = (v: SideView | null) => {
    if (v === 'terminal') return openTerm()
    setTerm(false); setViewState(v); store.set(VIEW_KEY, v)
  }
  const toggle = (v: SideView) => setView(shown === v ? null : v)
  // 대화 코드 블록의 「터미널에서 실행」(TerminalPane.tsx의 putInTerminal)도 이 칸을 터미널로 바꾼다
  useEffect(() => {
    if (!chatPage || !canTerm) return
    const on = () => { if (rightModeNow() === 'terminal') openTerm() }
    window.addEventListener(OPEN_RIGHT, on)
    return () => window.removeEventListener(OPEN_RIGHT, on)
  }, [chatPage, canTerm])
  const btn = (v: SideView, ui: string, label: string, tip: string, body: ReactNode, cls = '') => (
    <button className={`icon-btn sm${cls}${shown === v ? ' on' : ''}`} data-ui={ui} aria-pressed={shown === v} aria-label={label}
      data-tip={shown === v ? t(`${tip} · 다시 누르면 닫기`, `${tip} · click again to close`) : tip} onClick={() => toggle(v)}>{body}</button>
  )
  const tools = (
    <span className="ac-views" role="group" aria-label={t('오른쪽 칸 보기', 'Side column view')} data-ui="오른쪽 칸 보기">
      {btn('info', '정보 보기 버튼', t('정보', 'Info'), t('이 대화 정보', 'About this conversation'), Icon.info)}
      {delta && btn('changes', '변경사항 보기 버튼', t('변경사항', 'Changes'), t('변경사항', 'Changes'), <>{Icon.review}{delta}</>, ' wide')}
      {canTerm && btn('terminal', '터미널 버튼', t('터미널', 'Terminal'), t('터미널 (이 대화의 프로젝트 폴더)', 'Terminal (this conversation\'s project folder)'), Icon.terminal)}
    </span>
  )
  const terminal = opened && canTerm && rid ? <TerminalColumn rid={rid} hidden={shown !== 'terminal'} onClose={() => setView(null)} /> : null
  return { view: shown === 'terminal' ? null : shown, open: (v: SideView) => setView(v), tools, terminal }
}
