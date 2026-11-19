// 중앙 대화가 하위 대화를 한 줄로 읽는 것 (agentCentral.ts에서 떼어 냄, 11/19): 크리티컬한 허락 · 하위 대화 줄. 요약 글은 agentCentralDigest.ts
import { APP_RID, type CentralKid, type ChatItem } from '@rw/core/contract/agentChats'
import type { Stored } from './agentChats.js'
import { kidReport, lastReport } from './agentCentralDigest.js'

/**
 * 크리티컬한 허락 (11/18 사용자 "허락이 크리티컬한 것이 아니면 자동이면 좋을 것 같아").
 * 이것만 사용자에게 남기고, 나머지(일반 계획 승인 · 일상적인 확인)는 중앙이 사용자 말을 근거로 chat_answer로 답한다.
 * 중앙의 답은 앱이 이 목록으로 다시 가린다 (criticalOf: 맞으면 409)
 */
export const CRITICAL = [
  // squash 합치기는 중앙 · 하위 대화가 CI 통과 뒤 직접 한다 (11/19 "중앙은 깃 편집 권한"): squash가 아닌 합치기와 main에 바로 푸시만 남긴다
  { key: 'merge', ko: 'squash가 아닌 PR 합치기 · main에 바로 푸시', en: 'merging a pull request other than by squash, or pushing straight to main', re: /\bgh\s+pr\s+merge\b(?!.*(--squash\b|\s-s\b))|\bgit\s+push\b.*\b(main|master)\b/i },
  { key: 'restart', ko: '앱 다시 시작', en: 'restarting the app', re: /service:restart|launchctl|\brestart\b|다시 시작|재시작/i },
  { key: 'delete', ko: '지우기 · 덮어쓰기', en: 'deleting or overwriting', re: /\brm\s|\brmdir\b|\bgit\s+(reset\s+--hard|clean|checkout\s+--|restore)\b|--force\b|\bpush\s+-f\b|overwrite|덮어|지우/i },
  { key: 'outside', ko: '외부로 내보내기', en: 'sending something outside', re: /\b(curl|wget|scp|rsync|ssh)\b|\bnpm\s+publish\b|\bgh\s+(issue|release|gist|api|pr\s+(comment|review|close|edit))\b/i },
  { key: 'notes', ko: '연구 노트 · 개념 노트 변경 확정', en: 'changing research or concept notes', re: /edit_note|new_note|edit_concept|edit_review/i },
  { key: 'money', ko: '돈 · 계정', en: 'money or accounts', re: /billing|payment|subscri|password|credential|secret|api[ _-]?key|\btoken\b|\blogin\b|keychain|결제|구독|계정|비밀번호|토큰/i },
] as const
export type Critical = (typeof CRITICAL)[number]

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
  return {
    id: c.id, rid: c.rid, title: c.title, state: c.state, ...(c.state === 'waiting' && wait && { wait }),
    ...(c.state === 'waiting' && a && { ask: { id: a.id, ...(crit && { critical: crit.ko }) } }),
    ...(c.pr && { pr: { ...c.pr } }), ...(c.merged && { merged: c.merged }), ...(c.feedback && { feedback: c.feedback }), ...(c.bundle && { bundle: [...c.bundle] }),
    archived: !!c.archived, ...(c.summary && { summary: c.summary }), ...(report && { report }), ...(own && { reported: true }), updated: c.updated,
    ...(c.pr && c.ci && !c.merged && { ci: c.ci }), ...(c.todos.length && { todos: { done: c.todos.filter((x) => x.state === 'completed').length, total: c.todos.length } }),
  }
}
