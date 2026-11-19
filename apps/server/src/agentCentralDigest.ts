/**
 * 중앙에게 넘기는 하위 대화 요약 글 (agentCentral.ts에서 떼어 냄, 11/20). 상태 없는 순수 함수만 둔다:
 * 보고 절 찾기(kidReport) · 마지막 글(lastReport) · 한 줄 표지(kidSig) · 요약(digestOf) · 자르기(cut · tail).
 */
import { APP_RID, type CentralKid, type ChatItem } from '@rw/core/contract/agentChats'

/** 중앙에게 넘기는 하위 대화 한 줄의 마지막 글 길이 */
export const REPORT_CHARS = 300
/** 하위 대화가 차례 끝에 남기는 보고(「## 보고」 절)의 길이 상한. 깨우기 · chat_list에 이 안에서 자르지 않고 싣는다 (11/19) */
export const KID_REPORT_MAX = 2000

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

export function tail(s: string, n: number): string {
  return s.length > n ? `…${s.slice(-n)}` : s
}
