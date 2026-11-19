// 오른쪽 사이드바 › 터미널: 이 컴퓨터의 셸 (서버 routes/terminal.ts). 사용자가 직접 치는 창이라 에이전트 권한과 상관없다.
// 폰 · 다른 기기에서 연 화면은 서버가 막으므로 탭을 보이지 않는다. 고른 출력은 「대화에 붙이기」로 이 프로젝트의 에이전트 입력란에 붙인다
import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Terminal, type ITheme } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { TerminalOutput, terminalApi, type TerminalInput } from './api'
import { sendToAgent } from './ChatComposer'
import { t } from './i18n'
import { openRight } from './noteScreen'
import { qk } from './queries'

/** 이 화면에서 터미널을 쓸 수 있는지 (모르는 동안은 false) */
export function useTerminalAvailable(): boolean {
  return useQuery({ queryKey: qk.terminal, queryFn: () => terminalApi.status(), staleTime: Infinity }).data?.available === true
}

/** 대화에 붙이는 출력의 끝 글자 수 (첨부 글 한도) */
const ATTACH_MAX = 4000

const css = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim()
/** 앱 색(tokens.css)으로 그린다. 테마를 바꾸면 다시 읽는다 */
const themeOf = (): ITheme => ({ background: css('--bg-sunken'), foreground: css('--text'), cursor: css('--text'), cursorAccent: css('--bg-sunken'), selectionBackground: css('--select-bg') })

/** 대화의 코드 블록 「터미널에서 실행」(CodeBlock.tsx)이 넣을 글. 보이는 터미널이 받아 넣기만 하고, Enter는 사용자가 누른다 */
const TERMINAL_PUT = 'rw-terminal-put'
let waiting: string | null = null
export function putInTerminal(text: string) {
  waiting = text.replace(/\s+$/, '')
  openRight('terminal')
  window.dispatchEvent(new CustomEvent(TERMINAL_PUT))
}

type State = { k: 'connecting' } | { k: 'open'; cwd: string } | { k: 'exit'; code: number } | { k: 'error'; message: string } | { k: 'closed' }

/** 폴더 이름 (경로의 끝) */
const folderName = (cwd: string) => cwd.split(/[\\/]/).filter(Boolean).pop() ?? cwd

function parse(raw: unknown): TerminalOutput | null {
  try { const r = TerminalOutput.safeParse(JSON.parse(String(raw))); return r.success ? r.data : null } catch { return null }
}

/** 셸 하나. 열 때(다시 열기 포함)의 rid 폴더에서 연다: 프로젝트는 그 저장소, 중앙은 앱 저장소, 없거나 못 찾으면 홈 (서버 folderFor).
 *  rid가 바뀌어도 열린 셸은 그대로 둔다(사용자가 cd한 것을 바꾸지 않는다). 그때 「터미널에서 실행」은 넣기만 하고 열린 폴더를 알린다.
 *  attach면 고른 출력을 그 프로젝트 대화에 붙인다 */
export function TerminalPane({ rid, attach: canAttach = false }: { rid?: string; attach?: boolean }) {
  const box = useRef<HTMLDivElement>(null)
  const ridRef = useRef(rid)
  ridRef.current = rid
  const termRef = useRef<Terminal | null>(null)
  const [session, setSession] = useState(0)
  const [state, setState] = useState<State>({ k: 'connecting' })
  const [picked, setPicked] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  useEffect(() => {
    const host = box.current
    if (!host) return
    setState({ k: 'connecting' })
    const term = new Terminal({ fontFamily: css('--editor-font') || 'monospace', fontSize: 12, cursorBlink: true, scrollback: 5000, theme: themeOf() })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(host)
    const refit = () => { if (host.clientWidth > 0 && host.clientHeight > 0) fit.fit() }
    refit()
    termRef.current = term
    // 넣을 글이 있으면: 셸이 뜨고 출력이 잠잠해진 뒤, 보이는 창(가려진 탭이 아닌)에 붙여 넣는다.
    // 여러 줄은 셸이 붙여 넣기 모드(bracketed paste)를 켰을 때만 넣는다. 아니면 줄마다 바로 돌아가니 복사만 한다
    let ready = false
    let where = ''
    const openedFor = ridRef.current
    let settle: ReturnType<typeof setTimeout> | undefined
    const take = () => {
      if (!ready || waiting === null || host.getClientRects().length === 0) return
      const text = waiting
      waiting = null
      if (text.includes('\n') && !term.modes.bracketedPasteMode) {
        void navigator.clipboard?.writeText(text)
        setNote(t('이 셸은 여러 줄을 넣으면 바로 실행해서 복사만 했습니다', 'This shell runs pasted lines at once, so the block was only copied'))
      } else {
        term.paste(text)
        term.focus()
        if (ridRef.current !== openedFor) setNote(t(`이 셸은 ${where}에서 열렸습니다. 폴더를 확인하고 Enter를 누르세요`, `This shell was opened in ${where}. Check the folder, then press Enter`))
      }
    }
    const later = (ms: number) => { clearTimeout(settle); settle = setTimeout(take, ms) }
    const onPut = () => later(50)
    window.addEventListener(TERMINAL_PUT, onPut)
    const ws = terminalApi.socket(openedFor, term.cols, term.rows)
    const send = (m: TerminalInput) => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m)) }
    ws.onopen = () => send({ t: 'size', cols: term.cols, rows: term.rows })
    ws.onmessage = (e) => {
      const m = parse(e.data)
      if (!m) return
      if (m.t === 'out') { term.write(m.d); if (waiting !== null) later(300) }
      else if (m.t === 'start') { ready = true; where = folderName(m.cwd); later(300); setState({ k: 'open', cwd: m.cwd }); term.focus() }
      else if (m.t === 'exit') setState({ k: 'exit', code: m.code })
      else setState({ k: 'error', message: m.message })
    }
    ws.onclose = () => { ready = false; setState((s) => (s.k === 'open' || s.k === 'connecting' ? { k: 'closed' } : s)) }
    const subs = [term.onData((d) => { setNote(null); send({ t: 'in', d }) }), term.onResize(({ cols, rows }) => send({ t: 'size', cols, rows })), term.onSelectionChange(() => setPicked(term.hasSelection()))]
    const ro = new ResizeObserver(() => { refit(); take() })
    ro.observe(host)
    const mo = new MutationObserver(() => { term.options.theme = themeOf() })
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-accent'] })
    return () => { clearTimeout(settle); window.removeEventListener(TERMINAL_PUT, onPut); ro.disconnect(); mo.disconnect(); subs.forEach((s) => s.dispose()); ws.close(); term.dispose(); termRef.current = null; setPicked(false) }
  }, [session])

  const attach = () => {
    const text = termRef.current?.getSelection().replace(/\s+$/, '') ?? ''
    if (!rid || !canAttach || !text) return
    const shown = text.length > ATTACH_MAX ? text.slice(-ATTACH_MAX) : text
    const first = shown.split('\n').find((l) => l.trim())?.trim() ?? ''
    sendToAgent(rid, { kind: 'terminal', ref: (state.k === 'open' ? state.cwd : '').slice(0, 400), label: first.slice(0, 200), text: shown })
  }
  const ended = state.k === 'exit' || state.k === 'error' || state.k === 'closed'
  return (
    <div className="term" data-ui="터미널">
      <div className="term-bar">
        <span className="term-where mono" title={state.k === 'open' ? state.cwd : undefined}>
          {state.k === 'open' ? folderName(state.cwd)
            : state.k === 'connecting' ? t('여는 중…', 'Starting…')
            : state.k === 'exit' ? t(`끝남 (${state.code})`, `Exited (${state.code})`)
            : state.k === 'error' ? state.message : t('끊김', 'Disconnected')}
        </span>
        {note && <span className="term-note">{note}</span>}
        <span className="sp" />
        {rid && canAttach && <button className="btn sm" data-ui="터미널 출력 대화에 붙이기" disabled={!picked} title={t('고른 출력을 이 프로젝트의 에이전트 입력란에 붙입니다', 'Attach the selected output to this project\'s agent input')} onClick={attach}>{t('대화에 붙이기', 'Attach to chat')}</button>}
        {ended && <button className="btn sm" data-ui="터미널 다시 열기" onClick={() => setSession((n) => n + 1)}>{t('다시 열기', 'Restart')}</button>}
      </div>
      <div className="term-screen" ref={box} />
    </div>
  )
}
