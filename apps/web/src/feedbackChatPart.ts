// 피드백 항목 옆에 붙이는 맡은 대화에서 그 항목 몫만 고르기 (11/23 "피드백 옆에 대화"). 화면은 FeedbackChat.tsx
import type { ChatItem } from './api/agentChats'

const ANSWER = 'feedback_answer'

/** feedback_answer 단계 줄(summary = "key · 상태", agentPolicy describeStep)이 기록한 항목 */
function answeredKey(it: ChatItem, keys: readonly string[]): string | undefined {
  if (it.kind !== 'step' || it.tool !== ANSWER) return undefined
  return keys.find((k) => it.summary === k || it.summary.startsWith(`${k} · `))
}

function mentions(it: ChatItem, key: string): boolean {
  return (it.kind === 'text' || it.kind === 'user') && it.text.includes(key)
}

/**
 * 맡은 대화의 항목 가운데 피드백 key의 몫.
 * 맡길 때의 첫 지시(긴 안내문)는 빼고 본다: 머리 줄의 「맡김」 시각이 그 자리다.
 * 묶음이 아니면 나머지 전부. 묶음(bundle 둘 이상)이면 feedback_answer 기록이 끊는 마디로 나눠,
 * 그 마디를 끝낸 기록의 key가 임자다 (기록 여럿이 잇달아 오면 같은 마디를 함께 가진다).
 * 아직 기록이 없는 마지막 마디는, 이 항목이 아직 기록 전이거나 그 마디가 이 key를 말하면 이 항목 몫이다.
 * 어느 기록에도 key가 없으면(key를 적기 전의 대화) 나눌 수 없어 전부 보인다.
 */
export function feedbackChatPart(items: readonly ChatItem[], key: string, bundle?: readonly string[]): { items: ChatItem[]; whole: boolean } {
  const body = items[0]?.kind === 'user' ? items.slice(1) : items.slice()
  const keys = bundle ?? []
  if (keys.length < 2) return { items: body, whole: true }
  const chunks: { items: ChatItem[]; owners: Set<string> }[] = []
  let cur: ChatItem[] = []
  let owners = new Set<string>()
  for (const it of body) {
    const k = answeredKey(it, keys)
    // 기록 뒤에 단계 아닌 것이 오면 마디가 닫힌다
    if (owners.size && it.kind !== 'step') { chunks.push({ items: cur, owners }); cur = []; owners = new Set() }
    cur.push(it)
    if (k) owners.add(k)
  }
  if (cur.length) chunks.push({ items: cur, owners })
  if (!chunks.some((c) => c.owners.size)) return { items: body, whole: true }
  const answered = chunks.some((c) => c.owners.has(key))
  const out: ChatItem[] = []
  for (const c of chunks) {
    const mine = c.owners.size ? c.owners.has(key) : !answered || c.items.some((it) => mentions(it, key))
    if (mine) out.push(...c.items)
  }
  return { items: out, whole: false }
}
