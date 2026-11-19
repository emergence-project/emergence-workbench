// 중앙 대화가 하위 대화를 한 줄로 읽는 것 (agentCentral.ts에서 떼어 냄, 11/19): 보고 절 · 마지막 글 · 크리티컬한 허락 · 하위 대화 줄 · 중앙에게 넘기는 요약
import { APP_RID, type CentralKid, type ChatItem } from '@rw/core/contract/agentChats'
import type { Stored } from './agentChats.js'

/** 중앙에게 넘기는 하위 대화 한 줄의 마지막 글 길이 */
const REPORT_CHARS = 300
/** 하위 대화가 차례 끝에 남기는 보고(「## 보고」 절)의 길이 상한. 깨우기 · chat_list에 이 안에서 자르지 않고 싣는다 (11/19) */
export const KID_REPORT_MAX = 2000

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

/** 보고 절의 머리 줄: 「## 보고」 (굵게 · 쌍점도 받는다) */
const REPORT_HEAD = /^\s*(#{1,4}\s*|\*\*)(보고|Report)[:：]?(\*\*)?\s*$/

/**
 * 하위 대화가 차례 끝에 남긴 보고 (agentPrompts.ts REPORT_BRIEF의 「## 보고」 절, 11/19 사용자 "하위대화가 요약해서 보고").
 * 마지막 사용자 말 뒤의 에이전트 글 가운데 가장 늦은 것. 마지막 글만 보면 앱이 덧붙인 글(합침 알림 등)에 가려서 거슬러 찾는다
 */
export function kidReport(items: ChatItem[]): string | undefined {
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i]!
    if (it.kind === 'user') return undefined
    if (it.kind !== 'text' || it.sub) continue
    const lines = it.text.split('\n')
    let h = -1
    lines.forEach((l, j) => { if (REPORT_HEAD.test(l)) h = j })
    const s = h < 0 ? '' : lines.slice(h + 1).join('\n').trim()
    if (s) return cut(s, KID_REPORT_MAX)
  }
  return undefined
}

export const stateWord: Record<string, string> = { running: 'working', waiting: 'waiting for the user', queued: 'queued', idle: 'done with its turn', stopped: 'stopped', error: 'failed' }

/** 대화의 마지막 에이전트 글 (한 줄로 줄임). 보고 절이 없을 때 대신 쓴다 */
export function lastReport(items: ChatItem[], n = REPORT_CHARS): string | undefined {
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i]!
    if (it.kind === 'text' && !it.sub && it.text.trim()) return oneLine(it.text, n)
  }
  return undefined
}

export function oneLine(s: string, n: number): string {
  return cut(s.replace(/\s+/g, ' ').trim(), n)
}

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

/** 하위 대화 한 줄의 표지: 상태 · 기다림 · PR · 보고가 같으면 같다 (digestOf가 바뀐 것만 자세히 싣는다) */
export const kidSig = (k: CentralKid) => JSON.stringify([k.state, k.wait, k.ask?.id, k.pr?.number, k.merged, k.report])

/**
 * 중앙에게 넘기는 하위 대화 요약 (보관한 것은 빼고). held = 자리를 기다리는 앱 고치기 수.
 * seen(대화 id → 지난 차례에 넘긴 kidSig)을 주면 그 뒤 바뀐 대화만 자세히(PR · 보고), 나머지는 id · 제목 · 상태 한 줄 (토큰 아끼기, 11/20)
 */
export function digestOf(kids: CentralKid[], held = 0, seen?: ReadonlyMap<string, string>): string {
  const open = kids.filter((k) => !k.archived)
  const wait = held ? `\n[Held app tasks waiting for free memory: ${held}; the app opens them]` : ''
  if (!open.length) return `[Sub-conversations: none open]${wait}`
  const same = seen ? open.filter((k) => seen.get(k.id) === kidSig(k)).length : 0
  return [same ? '[Sub-conversations; "unchanged" = same as your last turn]' : '[Sub-conversations]', ...open.map((k) => {
    if (seen?.get(k.id) === kidSig(k)) return `- ${k.id} · "${k.title}" · ${stateWord[k.state] ?? k.state} · unchanged`
    const pr = k.pr ? ` · PR #${k.pr.number}${k.merged ? ' merged' : ''}` : ''
    const w = k.wait ? `waiting for ${k.wait === 'plan' ? 'plan approval' : 'permission'}${k.ask ? ` (ask ${k.ask.id}${k.ask.critical ? ', critical: leave to the user' : ''})` : ''}` : stateWord[k.state] ?? k.state
    return `- ${k.id} · ${k.rid === APP_RID ? 'app' : k.rid} · "${k.title}" · ${w}${pr}${k.report ? ` · ${k.reported ? 'report' : 'last'}: ${oneLine(k.report, REPORT_CHARS)}` : ''}`
  })].join('\n') + wait
}

export function cut(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n)}…` : s
}
