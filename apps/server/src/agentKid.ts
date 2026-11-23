// 중앙 대화가 보는 하위 대화 한 줄 (agentCentral.ts에서 옮김): 열린 허락 카드 · 크리티컬 판정 · 줄 만들기
import { APP_RID, type CentralKid, type ChatItem } from '@rw/core/contract/agentChats'
import type { Stored } from './agentChats.js'
import { kidReport, lastReport } from './agentCentralDigest.js'
import { crashesOf, lastCrash } from './agentCrash.js'
import { touchesSecret } from '@rw/core'
import { CRITICAL, type Critical } from './critical.js'

export type Ask = Extract<ChatItem, { kind: 'ask' }>

/** 아직 답하지 않은 허락 · 계획 카드 (마지막 것) */
export function openAsk(c: Stored): Ask | undefined {
  let a: Ask | undefined
  for (const it of c.items) if (it.kind === 'ask' && !it.answer) a = it
  return a
}

/** 그 허락이 크리티컬하면 그 까닭 (CRITICAL 가운데 하나). 연구 프로젝트에서 고치기는 노트 변경이라 크리티컬 */
export function criticalOf(a: Ask, kid: Pick<Stored, 'rid'>): Critical | undefined {
  const of = (key: Critical['key']) => CRITICAL.find((x) => x.key === key)
  if (a.does === 'delete') return of('delete')
  if (a.does === 'outside') return of('outside')
  if (kid.rid !== APP_RID && a.does === 'edit') return of('notes')
  // 비밀이 든 곳 읽기는 계정 일이다. 웹 보기는 검색어의 낱말(token · cost)로 크리티컬하게 보지 않는다 (11/23)
  if (touchesSecret(a.summary)) return of('money')
  if (a.does === 'web' || /^Web(Search|Fetch)$/.test(a.tool)) return undefined
  const s = `${a.tool} ${a.summary}`
  return CRITICAL.find((x) => x.re.test(s))
}

/** 하위 대화 한 줄 */
export function kidOf(c: Stored): CentralKid {
  const a = openAsk(c)
  const wait = a && (a.plan !== undefined ? 'plan' : 'ask')
  const crit = a && criticalOf(a, c)
  const own = kidReport(c.items)
  const report = own ?? lastReport(c.items)
  const crashes = c.state === 'error' && lastCrash(c.items) ? crashesOf(c.items).length : 0
  return {
    id: c.id, rid: c.rid, title: c.title, state: c.state, ...(c.state === 'waiting' && wait && { wait }),
    ...(c.state === 'waiting' && a && { ask: { id: a.id, ...(crit && { critical: crit.ko }) } }),
    ...(c.pr && { pr: { ...c.pr } }), ...(c.merged && { merged: c.merged }), ...(c.feedback && { feedback: c.feedback }), ...(c.bundle && { bundle: [...c.bundle] }),
    archived: !!c.archived, ...(c.summary && { summary: c.summary }), ...(report && { report }), ...(own && { reported: true }), updated: c.updated,
    ...(c.pr && c.ci && !c.merged && { ci: c.ci }), ...(c.todos.length && { todos: { done: c.todos.filter((x) => x.state === 'completed').length, total: c.todos.length } }), ...(crashes && { crashes }), ...(c.scope.app && { app: c.scope.app }),
  }
}
