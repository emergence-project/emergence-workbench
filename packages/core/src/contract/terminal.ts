/**
 * 터미널 API의 계약 (오른쪽 사이드바 › 터미널, 서버 routes/terminal.ts · 화면 api/terminal.ts).
 * 셸은 화면을 연 그 컴퓨터에서만 돈다: 이 컴퓨터의 주소(localhost · 127.0.0.1)로 연 화면만 쓸 수 있다.
 */
import { z } from 'zod'

/** GET /terminal: 이 화면에서 터미널을 쓸 수 있는지 */
export const TerminalStatus = z.object({
  available: z.boolean(),
  /** 쓸 수 없을 때 그 까닭 (원격 화면, 터미널 부품이 없음) */
  reason: z.string().optional(),
}).strict()
export type TerminalStatus = z.infer<typeof TerminalStatus>

/** 웹소켓 /terminal/ws 화면 → 서버: 친 글자, 창 크기 */
export const TerminalInput = z.discriminatedUnion('t', [
  z.object({ t: z.literal('in'), d: z.string().max(64 * 1024) }).strict(),
  z.object({ t: z.literal('size'), cols: z.number().int().min(2).max(1000), rows: z.number().int().min(1).max(1000) }).strict(),
])
export type TerminalInput = z.infer<typeof TerminalInput>

/** 웹소켓 /terminal/ws 서버 → 화면: 셸 출력, 시작한 폴더, 셸이 끝남 */
export const TerminalOutput = z.discriminatedUnion('t', [
  z.object({ t: z.literal('out'), d: z.string() }),
  z.object({ t: z.literal('start'), cwd: z.string(), shell: z.string() }),
  z.object({ t: z.literal('exit'), code: z.number() }),
  z.object({ t: z.literal('error'), message: z.string() }),
])
export type TerminalOutput = z.infer<typeof TerminalOutput>
