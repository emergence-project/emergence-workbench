/**
 * 에이전트가 사용자에게 묻고 차례를 끝낸 대화 (11/24 피드백 「답해야 하는 대화가 읽기만 했는데 종료 처리된다」).
 * 마지막 내 말 뒤에 에이전트가 쓴 마지막 글이 물음이면, 사용자가 답할 때까지 「내 차례 · 답 기다림」으로 둔다.
 * 읽기만 해서는 풀리지 않고, 저절로 보관하지도 않는다.
 */
import type { ChatItem } from './contract/agentChats.js'

/** 끝 문단이 사용자에게 묻거나 정해 달라는 말인가 */
export function isQuestion(text: string): boolean {
  const paras = text.trim().split(/\n\s*\n/)
  const last = (paras[paras.length - 1] ?? '').trim()
  if (!last) return false
  if (/[?？]/.test(last)) return true
  return /(주세요|주십시오|주시겠어요|할까요|될까요|드릴까요|갈까요|볼까요|please (confirm|choose|decide|let me know)|let me know)[.!。]?\s*$/i.test(last)
}

/** 마지막 내 말 뒤에 에이전트가 쓴 마지막 글이 물음인가 */
export function agentAsks(items: readonly ChatItem[]): boolean {
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i]!
    if (it.kind === 'user') return false
    if (it.kind === 'text' && !it.sub) return isQuestion(it.text)
  }
  return false
}
