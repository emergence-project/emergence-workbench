// ---------- 터미널 (이 컴퓨터의 셸, 서버 routes/terminal.ts) ----------
import type { TerminalStatus } from '@rw/core/contract/terminal'
import { json, req } from './http'

export { TerminalOutput } from '@rw/core/contract/terminal'
export type { TerminalInput, TerminalStatus } from '@rw/core/contract/terminal'
export const terminalApi = {
  status: () => req('/api/terminal').then((r) => json<TerminalStatus>(r)),
  /** 셸 하나를 잇는 웹소켓. rid의 폴더에서 연다 (없으면 홈) */
  socket: (rid: string | undefined, cols: number, rows: number) =>
    new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/terminal/ws?${new URLSearchParams({ ...(rid && { rid }), cols: String(cols), rows: String(rows) })}`),
}
