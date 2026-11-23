/**
 * 다른 에이전트의 검토 (11/9 "Claude가 쓰고 Codex가 검토", 11/23 "여러 에이전트에게 동시 검토, 각각 독립 검토"):
 * 검토자(Codex · Gemini)에게 같은 글을 따로 한 번 묻고 답을 검토 카드에 채운다. agentChats.ts의 review가 부른다.
 * readOnlyAsk는 토론 방의 한 번 묻기(agentRoom.ts)도 쓴다.
 */
import { ROOM_NAME } from '@rw/core'
import type { ChatEffort, ChatItem, Reviewer } from '@rw/core/contract/agentChats'
import type { AgentRunner, OneShot } from './agentRun.js'
import { clip } from './agentPolicy.js'
import { t } from './i18n.js'

export type Ask = (prompt: string, cwd: string) => Promise<string>
export const reviewerName = (a: Reviewer) => ROOM_NAME[a]

/** 한 번 묻고 답 글만 받는다: ACP 실행기(Codex · Gemini)를 읽기만으로 돌린다 */
export async function readOnlyAsk(run: AgentRunner, prompt: string, cwd: string, pick: { model?: string; effort?: ChatEffort } = {}): Promise<string> {
  const ac = new AbortController(), out: string[] = []
  for await (const e of run({ prompt, mode: 'edit', model: pick.model ?? 'default', effort: pick.effort ?? 'medium', cwd, extraDirs: [], brief: '', write: 'read', signal: ac.signal, canUseTool: async () => ({ allow: false, message: 'Read only: answer in text.' }) })) {
    if (e.type === 'text' && !e.sub) out.push(e.text)
    if (e.type === 'result' && !e.ok && e.error && !out.length) throw new Error(e.error)
  }
  return out.join('\n\n')
}

/** 검토자에게 묻는 법: Codex는 읽기 전용 codex exec(review), Gemini는 ACP 실행기를 읽기만으로. 쓸 수 없으면 undefined */
export function reviewerOf(a: Reviewer, deps: { review?: (o: OneShot) => Promise<string>; others?: Partial<Record<'codex' | 'gemini', AgentRunner>> }): Ask | undefined {
  if (a === 'codex') { const ask = deps.review; return ask && ((prompt, cwd) => ask({ prompt, cwd })) }
  const run = deps.others?.[a]
  return run && ((prompt, cwd) => readOnlyAsk(run, prompt, cwd))
}

/** 묻고 답(또는 오류)과 걸린 초를 카드에 채운 뒤 done (저장 · 알림) */
export function fillReview(ask: Ask, prompt: string, cwd: string, it: Extract<ChatItem, { kind: 'review' }>, done: () => void): void {
  const t0 = Date.now()
  void ask(prompt, cwd)
    .then((x) => { it.text = clip(x.trim() || t('(검토가 비었습니다)', '(empty review)'), 8000) })
    .catch((e: Error) => { it.error = clip(e.message, 500) })
    .finally(() => { it.seconds = Math.round((Date.now() - t0) / 1000); done() })
}
