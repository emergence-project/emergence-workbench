/**
 * 자리를 기다리는 앱 고치기(held)의 여는 순서 바꾸기 (chat_priority, 11/20 사용자 "대기 대화의 우선순위 조정도 가능해").
 * 남은 메모리가 모자라 열지 못한 앱 고치기는 중앙 대화의 held 줄에 맡긴 차례대로 서 있고, 자리가 나면 맨 앞부터 열린다(agentCentral.ts openHeld).
 * 중앙은 그 줄의 한 일을 다른 자리로 옮길 수 있다. 버리거나 지우지는 않는다
 */
import type { CentralHeldOrder, CentralPriorityBody } from '@rw/core/contract/agentChats'
import type { Stored } from './agentChats.js'
import { t } from './i18n.js'
import { WorkbenchError } from './workbench.js'

/** 기다리는 일 하나를 to번째(1 = 맨 앞)로 옮기고 중앙 대화에 「자동: 순서 · …」 줄을 남긴다. title은 정확히, 아니면 한 개만 맞는 일부 */
export function moveHeld(c: Stored | undefined, b: CentralPriorityBody): CentralHeldOrder {
  const held = c?.held ?? []
  if (!c || !held.length) throw new WorkbenchError(409, t('기다리는 앱 고치기가 없습니다', 'No app task is waiting'))
  const want = b.title.trim()
  let i = held.findIndex((h) => h.title === want)
  if (i < 0) {
    const hits = held.flatMap((h, k) => (h.title.includes(want) ? [k] : []))
    if (hits.length !== 1) throw new WorkbenchError(hits.length ? 409 : 404, hits.length ? t(`「${want}」에 맞는 일이 여럿입니다. 제목을 정확히 주세요`, `Several waiting tasks match "${want}"; give the exact title`) : t(`기다리는 일 가운데 「${want}」이 없습니다`, `No waiting task matches "${want}"`))
    i = hits[0]!
  }
  const to = Math.min(b.to, held.length) - 1
  const it = held.splice(i, 1)[0]!
  held.splice(to, 0, it)
  c.items.push({ kind: 'text', at: new Date().toISOString(), text: t(`자동: 순서 · ${it.title} ${i + 1}번째 → ${to + 1}번째 · ${b.reason.trim()}`, `Automatic: order · ${it.title} #${i + 1} → #${to + 1} · ${b.reason.trim()}`) })
  return { held: held.map((h) => h.title) }
}
