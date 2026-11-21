/**
 * 중앙 방의 받는 이 (11/20 사용자 결정 "그냥 답변하면 메인 에이전트가 받고, @을 하면 특정 에이전트만 받고, 전체한테 말하는 것도 두자"):
 * 그냥 → 방장, @이름 → 부른 사람만, @모두 · @all → 모두(방장은 마지막, @all도 받자는 11/20 사용자 요청). 서버(agentRoom.ts)와 입력란의 「받는 이」가 같은 계산을 쓴다
 */
import type { AgentKind, RoomState, RoomVerdict } from './contract/agentChats.js'

const ALIAS: Record<string, AgentKind | 'all'> = { claude: 'claude-code', codex: 'codex', gemini: 'gemini', 모두: 'all', all: 'all', everyone: 'all' }
/** 방에서 부르는 이름 */
export const ROOM_NAME: Record<AgentKind, string> = { 'claude-code': 'Claude', codex: 'Codex', gemini: 'Gemini' }

/** 글에서 부른 이름: @Claude · @Codex · @Gemini · @모두(@all). 앞은 줄 처음이나 빈칸, 뒤는 빈칸 · 문장 부호 · 끝 */
export function mentionsOf(text: string): (AgentKind | 'all')[] {
  const out = new Set<AgentKind | 'all'>()
  for (const m of text.matchAll(/(?:^|\s)@([A-Za-z]+|모두)(?=$|[\s.,!?:;)])/g)) { const a = ALIAS[m[1]!.toLowerCase()]; if (a) out.add(a) }
  return [...out]
}

/**
 * 기록에서 에이전트를 부른 글인가 (11/21 시안 「기록과 에이전트의 경계」 안 A3): 메모에 @claude · @codex · @gemini를 적으면 그 에이전트가,
 * 이름 없는 @(뒤가 빈칸 · 쌍점 · 끝)나 @모두는 기본 에이전트('default')가 읽고 답한다. 부르지 않은 글은 null (그냥 남기는 메모는 답하지 않는다)
 */
export function calledAgent(text: string): AgentKind | 'default' | null {
  const named = mentionsOf(text)
  const one = named.find((a): a is AgentKind => a !== 'all')
  if (one) return one
  return named.length || /(?:^|\s)@(?=$|[\s:：])/.test(text) ? 'default' : null
}

/** 받는 이: others = 방장이 아닌 부른 사람(방에 있는 사람만), host = 방장도 받는가. 부른 사람이 방에 없으면 방장이 받는다 */
export function routeOf(text: string, room: Pick<RoomState, 'host' | 'members'>): { others: AgentKind[]; host: boolean; all: boolean } {
  const named = mentionsOf(text), all = named.includes('all')
  const inRoom = room.members.map((m) => m.agent).filter((a) => a !== room.host)
  const others = all ? inRoom : inRoom.filter((a) => named.includes(a))
  return { others, host: all || named.includes(room.host) || !others.length, all }
}

/** 판정 (11/20 2단계 "판정 · 검증에만 씀"): 방 사람 답의 첫 줄 「판정: 맞음 | 틀림 | 모름 — 근거」(영어 Verdict: right | wrong | unsure) */
const VERDICT_WORD: Record<string, RoomVerdict> = { 맞음: 'yes', 예: 'yes', right: 'yes', yes: 'yes', correct: 'yes', 틀림: 'no', 아니오: 'no', wrong: 'no', no: 'no', incorrect: 'no', 모름: 'unsure', unsure: 'unsure', unknown: 'unsure' }
/** 답 글의 판정 (첫 줄에 없으면 없음: 판정이 아닌 물음에는 칩을 그리지 않는다) */
export function verdictOf(text: string): RoomVerdict | undefined {
  const m = /^[\s*_>#-]*(?:판정|verdict)\s*[:：]\s*\**\s*([가-힣]+|[A-Za-z]+)/i.exec(text.trimStart().split('\n')[0] ?? '')
  return m ? VERDICT_WORD[m[1]!.toLowerCase()] : undefined
}
/** 한 차례의 판정 모음: 일치(같은 판정이 모두) · 엇갈림 */
export function tallyOf(votes: RoomVerdict[]): { agree: boolean; top: RoomVerdict; count: number; total: number } | undefined {
  const known = votes.filter((v) => v !== 'unsure')
  if (!votes.length) return undefined
  const n = (v: RoomVerdict) => votes.filter((x) => x === v).length
  const top = (['yes', 'no', 'unsure'] as const).reduce((a, b) => (n(b) > n(a) ? b : a))
  return { agree: known.length > 0 && known.every((v) => v === known[0]) && known.length === votes.length, top, count: n(top), total: votes.length }
}
