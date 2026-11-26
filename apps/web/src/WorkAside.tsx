import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react'
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

/** 에이전트 화면에서 사이드바 맨 위 아이콘 줄의 「>_」로 작업 상태 칸 자리를 바꾸는 터미널 (11/19 사용자 결정 B1, 11/23 단추를 머리에서 사이드바로).
 *  맨 위 아이콘 줄 · 「터미널」 · 크게 · 닫기. 한 번 열면 작업 상태로 돌아가거나 다른 대화로 가도 셸을 숨겨 둔다(hidden) */
export function TerminalColumn({ rid, hidden, onClose, tabs }: { rid: string; hidden: boolean; onClose(): void; tabs?: ReactNode }) {
  const [wide, setWide] = useState(false)
  const tools = <>
    <button className={`icon-btn sm${wide ? ' on' : ''}`} data-ui="터미널 크게" aria-pressed={wide} data-tip={wide ? t('원래 폭', 'Normal width') : t('크게 (화면 절반)', 'Wide (half the screen)')} aria-label={t('크게', 'Wide')} onClick={() => setWide(!wide)}>{wide ? Icon.minimize : Icon.maximize}</button>
    <button className="icon-btn sm" data-ui="터미널 닫기" data-tip={t('닫기 (셸은 그대로)', 'Close (the shell keeps running)')} aria-label={t('닫기', 'Close')} onClick={onClose}>{Icon.x}</button>
  </>
  return (
    <WorkAside ui="터미널 칸" className="ac-term-col" hidden={hidden} wide={wide}>
      {tabs}
      <TerminalPane rid={rid} attach title tools={tools} />
    </WorkAside>
  )
}

/** 사이드바 맨 위 아이콘 줄의 한 칸 */
export type SideTab = { key: string; ui: string; icon: ReactNode; tip: string; label: string; on: boolean; onClick(): void; /** 이 칸부터 줄의 오른쪽 끝으로 */ end?: boolean }
/** 사이드바 맨 위 아이콘 줄 (11/23 시안 chat-head-icons 안 B): 왼쪽 이 대화 · 검토, 오른쪽 끝(end부터) 변경사항 · 터미널. 누르면 그 칸으로 바뀐다 */
export function SideTabs({ tabs }: { tabs: SideTab[] }) {
  return (
    <div className="ac-side-tabs" data-ui="사이드바 아이콘 줄" role="tablist">
      {tabs.map((x) => (
        <button key={x.key} role="tab" aria-selected={x.on} className={`ac-side-tab${x.on ? ' on' : ''}${x.end ? ' end' : ''}`} data-ui={x.ui} data-tip={x.tip} aria-label={x.label} onClick={x.onClick}>{x.icon}</button>
      ))}
    </div>
  )
}

/** 세부 패널의 칸: 이 대화(정보 · 잡은 파일 · 권한) · 변경사항 · 검토 */
export type PaneTab = 'info' | 'changes' | 'review'
const TAB_KEY = 'rw-agent-pane-tab'

/** 에이전트 화면(AgentPage)의 오른쪽 칸: 세부 패널과 터미널 중 하나 (11/19 B1: 「>_」를 누르면 칸이 터미널로 바뀐다).
 *  pane은 세부 패널을 여는지(기억한다), tab은 세부 패널의 어느 칸인지(기억한다). 터미널은 한 번 열면 가려도 셸을 살려 둔다. rid는 터미널을 열 폴더(대화의 프로젝트) */
export function useSideColumn(chatPage: boolean, rid?: string) {
  const [pane, setPaneState] = useState(() => store.get<boolean>(PANE_KEY, true))
  const setPane = (v: boolean) => { setPaneState(v); store.set(PANE_KEY, v) }
  const [tab, setTabState] = useState<PaneTab>(() => store.get<PaneTab>(TAB_KEY, 'info'))
  const [term, setTerm] = useState(false)
  const [opened, setOpened] = useState(false)
  const canTerm = useTerminalAvailable()
  const openTerm = () => { setTerm(true); setOpened(true) }
  // 대화 코드 블록의 「터미널에서 실행」(TerminalPane.tsx의 putInTerminal)도 이 칸을 터미널로 바꾼다
  useEffect(() => {
    if (!chatPage || !canTerm) return
    const on = () => { if (rightModeNow() === 'terminal') openTerm() }
    window.addEventListener(OPEN_RIGHT, on)
    return () => window.removeEventListener(OPEN_RIGHT, on)
  }, [chatPage, canTerm])
  const showTerm = term && canTerm
  const work = pane && !showTerm
  // 사이드바가 열려 있으면(세부 패널이든 터미널이든) 닫고, 닫혀 있으면 세부 패널을 연다
  const togglePane = () => { if (showTerm) { setTerm(false); setPane(false) } else setPane(!pane) }
  /** 세부 패널을 열고 그 칸으로 (터미널이 열려 있으면 세부 패널로 돌아온다) */
  const show = (v: PaneTab) => { setTerm(false); setPane(true); setTabState(v); store.set(TAB_KEY, v) }
  // 대화 머리에는 사이드바 여닫기만 둔다. 터미널은 사이드바 아이콘 줄에 (11/23 사용자 결정)
  const tools = <button className={`icon-btn sm${work || showTerm ? ' on' : ''}`} data-ui="세부 패널 버튼" aria-pressed={work || showTerm} data-tip={t('사이드바 (이 대화 · 변경사항 · 검토 · 터미널)', 'Sidebar (this conversation, changes, review, terminal)')} aria-label={t('사이드바', 'Sidebar')} onClick={togglePane}>{Icon.panelRight}</button>
  /** 아이콘 줄 끝의 터미널 칸 (이 컴퓨터에서 터미널을 쓸 수 있을 때) */
  const termTab: SideTab | null = canTerm ? { key: 'terminal', ui: '터미널 버튼', icon: Icon.terminal, tip: t('터미널 (이 대화의 프로젝트 폴더)', 'Terminal (this conversation\'s project folder)'), label: t('터미널', 'Terminal'), on: showTerm, onClick: openTerm } : null
  // 처음 여는 대화는 받는 동안 rid가 잠깐 비는데, 그때 칸을 빼면 셸이 죽는다: 마지막으로 안 rid로 그대로 둔다
  const lastRid = useRef(rid)
  if (rid) lastRid.current = rid
  const termRid = rid ?? lastRid.current
  const terminal = (tabs?: ReactNode) => (opened && canTerm && termRid ? <TerminalColumn rid={termRid} hidden={!showTerm} onClose={() => setTerm(false)} tabs={tabs} /> : null)
  return { work, togglePane, tools, terminal, tab: showTerm ? null : tab, show, termTab }
}
