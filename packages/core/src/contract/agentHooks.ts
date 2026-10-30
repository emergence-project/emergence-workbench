/**
 * 밖에서 도는 에이전트의 상태 (설정 › 에이전트 › 상태 알리기, 서버 routes/agentHooks.ts · 화면 api/agentHooks.ts).
 * 터미널의 Claude Code 훅과 Codex notify가 앱 서버에 한 줄씩 알리고(10/30, 오르카의 에이전트 상태 훅), 앱은 세션마다 마지막 상태만 둔다.
 */
import { z } from 'zod'

export const HOOK_AGENTS = ['claude-code', 'codex'] as const
export const HOOK_STATES = ['working', 'waiting', 'done'] as const

export const HookSession = z.object({
  agent: z.enum(HOOK_AGENTS),
  /** 그 에이전트의 세션 id (없으면 폴더) */
  session: z.string(),
  /** 에이전트가 일하는 폴더 */
  cwd: z.string(),
  /** 등록한 프로젝트 안이면 그 id와 이름 */
  rid: z.string().optional(),
  project: z.string().optional(),
  /** working 일하는 중 · waiting 사용자를 기다림(허락 · 입력) · done 차례가 끝남 */
  state: z.enum(HOOK_STATES),
  /** 마지막으로 알린 때 (ISO) */
  at: z.string(),
  /** 기다릴 때 에이전트가 보낸 말 (예: 허락 요청) */
  note: z.string().optional(),
}).strict()

export const HookView = z.object({
  /** 에이전트마다 앱이 넣은 훅이 있는지. busy = 그 설정에 다른 notify가 있어 넣지 않음(Codex) */
  installed: z.object({ 'claude-code': z.boolean(), codex: z.union([z.boolean(), z.literal('busy')]) }).strict(),
  /** 최근 12시간에 알린 세션 (최근 것부터) */
  sessions: z.array(HookSession),
}).strict()

/** POST /api/agent-hooks/install: 켜기 · 끄기 */
export const HookInstallBody = z.object({ agent: z.enum(HOOK_AGENTS), on: z.boolean() }).strict()
export const HookReceived = z.object({ ok: z.literal(true) }).strict()

export type HookSession = z.infer<typeof HookSession>
export type HookView = z.infer<typeof HookView>
export type HookInstallBody = z.input<typeof HookInstallBody>
export type HookReceived = z.infer<typeof HookReceived>
