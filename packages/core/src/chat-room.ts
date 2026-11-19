/**
 * 중앙 방의 받는 이 (11/20 사용자 결정 "그냥 답변하면 메인 에이전트가 받고, @을 하면 특정 에이전트만 받고, 전체한테 말하는 것도 두자"):
 * 그냥 → 방장, @이름 → 부른 사람만, @모두 → 모두(방장은 마지막). 서버(agentRoom.ts)와 입력란의 「받는 이」가 같은 계산을 쓴다
 */
import type { AgentKind, RoomState } from './contract/agentChats.js'

const ALIAS: Record<string, AgentKind | 'all'> = { claude: 'claude-code', codex: 'codex', gemini: 'gemini', 모두: 'all', all: 'all', everyone: 'all' }
/** 방에서 부르는 이름 */
export const ROOM_NAME: Record<AgentKind, string> = { 'claude-code': 'Claude', codex: 'Codex', gemini: 'Gemini' }

/** 글에서 부른 이름: @Claude · @Codex · @Gemini · @모두(@all). 앞은 줄 처음이나 빈칸, 뒤는 빈칸 · 문장 부호 · 끝 */
export function mentionsOf(text: string): (AgentKind | 'all')[] {
  const out = new Set<AgentKind | 'all'>()
  for (const m of text.matchAll(/(?:^|\s)@([A-Za-z]+|모두)(?=$|[\s.,!?:;)])/g)) { const a = ALIAS[m[1]!.toLowerCase()]; if (a) out.add(a) }
  return [...out]
}

/** 받는 이: others = 방장이 아닌 부른 사람(방에 있는 사람만), host = 방장도 받는가. 부른 사람이 방에 없으면 방장이 받는다 */
export function routeOf(text: string, room: Pick<RoomState, 'host' | 'members'>): { others: AgentKind[]; host: boolean; all: boolean } {
  const named = mentionsOf(text), all = named.includes('all')
  const inRoom = room.members.map((m) => m.agent).filter((a) => a !== room.host)
  const others = all ? inRoom : inRoom.filter((a) => named.includes(a))
  return { others, host: all || named.includes(room.host) || !others.length, all }
}
