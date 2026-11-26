/** 중앙을 저절로 깨우는 글 (agentCentral.ts에서 나눔): 모아 둔 하위 대화의 바뀜을 화면 한 줄과 중앙에게 줄 글로 */
import { APP_RID } from '@rw/core/contract/agentChats'
import type { Stored } from './agentChats.js'
import { t } from './i18n.js'
import { cut, kidReport, lastReport, stateWord, tail } from './agentCentralDigest.js'
import { crashesOf, crashLines, lastCrash } from './agentCrash.js'
import { criticalOf, openAsk } from './agentKid.js'

/** 중앙을 저절로 깨울 때 넘기는 마지막 글 · CI 기록 길이 (11/18) */
const REPORT_FULL = 4000
const LOG_TAIL = 3000

/** 깨울 까닭 하나 */
export type Wake = { kind: 'end' | 'ask' | 'ci' | 'merged' | 'help' | 'crash' | 'review'; log?: string; text?: string }
/** digested: 중앙 대화 id별로 마지막으로 넘긴 하위 대화마다의 kidSig */ export type WakeState = { prev: Map<string, Stored['state']>; events: Map<string, Wake[]>; seen: Set<string>; timer?: ReturnType<typeof setTimeout>; auto: boolean; sends: Map<string, number>; digested: Map<string, Map<string, string>> }

/** 모아 둔 깨우기의 화면 글(한국어 한 줄)과 중앙에게 줄 글. 다시 일하는 하위 대화는 끝날 때 다시 알리려고 남긴다 */
export function wakeTextOf(w: WakeState, chats: ReadonlyMap<string, Stored>, central: Stored | undefined): { ko: string; en: string } | undefined {
  const centralId = central?.id
  const ko: string[] = []
  const en: string[] = []
  for (const [id, evs] of w.events) {
    const k = chats.get(id)
    // 다시 일하는 대화는 끝날 때 다시 알린다. 중재 요청은 일하는 중에 보낸 것이라 바로
    const busy = !!k && (k.state === 'running' || k.state === 'queued')
    if (busy && !evs.some((e) => e.kind === 'help')) continue
    const later = busy ? evs.filter((e) => e.kind !== 'help') : []
    if (later.length) w.events.set(id, later)
    else w.events.delete(id)
    if (!k || k.archived) continue
    const head = `- ${k.id} · ${k.rid === APP_RID ? (k.scope.app ? `app:${k.scope.app}` : 'app') : k.rid} · "${k.title}"${k.pr ? ` · PR #${k.pr.number}` : ''}`
    // 보고 절이 있으면 그것을 줄바꿈 그대로, 없으면 마지막 글 (보고를 빠뜨린 대화)
    const own = kidReport(k.items)
    const report = own ? undefined : lastReport(k.items, REPORT_FULL)
    const lines: string[] = []
    const crashed = evs.some((e) => e.kind === 'crash')
    for (const e of evs) {
      if (busy && e.kind !== 'help') continue
      if (e.kind === 'crash') {
        const x = lastCrash(k.items)
        if (!x) continue
        const n = crashesOf(k.items).length
        ko.push(`「${k.title}」 비정상 종료${n > 1 ? ` (${n}번째)` : ''}`)
        lines.push(...crashLines(k.id, k.items, x))
        if (k.parent !== centralId) lines.push('not your sub-conversation, so chat_send cannot reach it: tell the user, or open an app sub-conversation for an app bug.')
        continue
      }
      if (e.kind === 'help') {
        ko.push(`「${k.title}」 중재 요청`)
        lines.push(`asks you to mediate (outside the projects it may change, or an app bug)${k.parent === centralId ? '' : ' — not your sub-conversation, so chat_send cannot reach it'}: ${cut(e.text ?? '', REPORT_FULL)}`)
        lines.push('Open a sub-conversation for it (role app for an app bug, role project for another project; check chat_list first), or tell the user when the user must decide.')
      } else if (e.kind === 'end') {
        if (k.state === 'waiting' || crashed) continue
        ko.push(`「${k.title}」 ${k.state === 'error' ? '실패' : k.state === 'stopped' ? '멈춤' : '차례 끝남'}`)
        lines.push(`ended its turn (${stateWord[k.state] ?? k.state})`)
      } else if (e.kind === 'ask') {
        const a = openAsk(k)
        if (!a) continue
        const crit = criticalOf(a, k)
        const plan = a.plan !== undefined
        ko.push(`「${k.title}」 ${plan ? '계획 승인' : '허락'} 기다림${crit ? ` (크리티컬: ${crit.ko})` : ''}`)
        lines.push(`waits for ${plan ? 'plan approval' : 'permission'}: ask ${a.id} · ${a.tool} · ${a.summary}`)
        if (plan) lines.push(`plan:\n${cut(a.plan ?? '', REPORT_FULL)}`)
        lines.push(crit ? `critical (${crit.en}): leave it to the user, do not answer it` : 'not critical: answer it yourself with chat_answer, from what the user asked')
      } else if (e.kind === 'review') {
        const mine = k.parent === centralId
        ko.push(`「${k.title}」 깊은 검토 ${e.log ? '실패' : e.text ? '찾음' : '이상 없음'}`)
        if (e.log) lines.push(`deep review failed: ${cut(e.log, 500)}. The hold is released.`)
        else if (e.text) lines.push(`deep review confirmed (hold released):\n${e.text}`, `버그/규칙: ${mine ? 'chat_send the fix to it' : 'not your sub-conversation: open an app sub-conversation for the fix or tell the user'}. 의도: ask the user ("지금 확인할 것"), never block it yourself.`)
        else lines.push(`deep review found nothing; the hold is released. Its app_merge was refused during the hold: ${mine ? 'chat_send it one line to call app_merge again' : 'tell the user it can merge now'}.`)
      } else if (e.kind === 'ci') {
        ko.push(`「${k.title}」 CI 실패`)
        lines.push(`pull request check failed. Log tail:\n${tail(e.log ?? '', LOG_TAIL)}`)
      } else {
        ko.push(`「${k.title}」 ${k.pr ? `PR #${k.pr.number} ` : ''}합쳐짐`)
        lines.push('its pull request was merged: close it with chat_close and a three-line summary')
      }
    }
    if (!lines.length) continue
    en.push(head, ...lines.map((l) => `  ${l}`), ...(own ? ['  report:', ...own.split('\n').map((l) => `    ${l}`)] : report ? [`  last text (no report section): ${report}`] : []))
  }
  if (!ko.length) return undefined
  return {
    ko: `${t('자동 알림', 'Automatic')} · ${ko.join(' · ')}`,
    en: ['[Automatic wake-up from the app, not written by the user. Sub-conversations changed:]', ...en,
      '[Do the routine work yourself as the brief says (check failed: chat_send a fix; merged: chat_close; non-critical wait: chat_answer). The user sees the stages on the task checklist, so reply as short as possible: "지금 확인할 것: …" lines only if the user must act, one line per merged one on what changed, else one short line on what you did]'].join('\n'),
  }
}
