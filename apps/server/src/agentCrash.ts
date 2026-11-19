/**
 * 비정상 종료 (11/20 사용자 "Claude Code process exited with code 1 이렇게 비정상적으로 종료되면 버그와 그 이력을 중앙대화에 전달").
 * 에이전트 프로세스가 사용자가 멈추지 않았는데 끝나면 agentChats.ts가 오류 줄에 crash를 달아 대화 기록에 남긴다(앱을 다시 켜도 이력이 남는다).
 * 여기는 그 기록에서 알림 글을 만드는 순수 함수만 둔다: 지금 오류가 비정상 종료인지 · 몇 번째인지 · 그때 하던 일.
 */
import type { ChatItem } from '@rw/core/contract/agentChats'
import { cut, oneLine, tail } from './agentCentralDigest.js'

type Err = Extract<ChatItem, { kind: 'error' }>

/** 중앙에게 싣는 오류 글(stderr 포함) · 마지막 지시 길이, 하던 도구 호출 수, 이력에 적는 시각 수 */
const ERROR_CHARS = 1500
const PROMPT_CHARS = 400
const STEPS = 5
const TIMES = 5

/** 이 대화의 비정상 종료 이력 (오래된 것이 앞) */
export function crashesOf(items: readonly ChatItem[]): Err[] {
  return items.filter((it): it is Err => it.kind === 'error' && !!it.crash)
}

/** 마지막 지시 뒤에 비정상 종료가 있으면 그것 (다시 지시해 이어 갔으면 없음) */
export function lastCrash(items: readonly ChatItem[]): Err | undefined {
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i]!
    if (it.kind === 'user') return undefined
    if (it.kind === 'error' && it.crash) return it
  }
  return undefined
}

/** 비정상 종료 하나를 중앙에게 알리는 줄 (영어, 앞에 두 칸 들여 쓴다): 오류 · 하던 일 · 이력 */
export function crashLines(id: string, items: readonly ChatItem[], crash: Err): string[] {
  const at = items.indexOf(crash)
  const before = at < 0 ? items : items.slice(0, at)
  let prompt: string | undefined
  for (let i = before.length - 1; i >= 0 && prompt === undefined; i--) {
    const it = before[i]!
    if (it.kind === 'user') prompt = it.text
  }
  const steps = before.filter((it): it is Extract<ChatItem, { kind: 'step' }> => it.kind === 'step').slice(-STEPS)
  const all = crashesOf(items)
  const earlier = all.filter((x) => x !== crash)
  return [
    `crashed: the agent process ended abnormally (the user did not stop it). Open it: #/agent/${id}`,
    `error: ${tail(crash.text, ERROR_CHARS)}`,
    `last instruction: ${prompt === undefined ? '(none)' : cut(oneLine(prompt, PROMPT_CHARS * 2), PROMPT_CHARS)}`,
    `last tool calls: ${steps.length ? steps.map((s) => `${s.tool} ${oneLine(s.summary, 120)}`).join(' | ') : '(none)'}`,
    `history: ${earlier.length ? `crashed ${earlier.length} time${earlier.length > 1 ? 's' : ''} before in this conversation (${earlier.slice(-TIMES).map((x) => x.at).join(', ')})` : 'first crash in this conversation'}`,
    all.length > 1
      ? 'It crashed again: do not just resend. If it looks like an app bug, open an app sub-conversation (role app) with this error and history; else tell the user in one line.'
      : 'If it looks like an app bug, open an app sub-conversation (role app) with this error; if it is passing (network, rate limit), send it one line to continue, or tell the user.',
  ]
}
