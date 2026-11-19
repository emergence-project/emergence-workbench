/**
 * 피드백 묶어 맡기기 (11/19 사용자 결정 "둘 다 묶기", 11/16 "피드백은 한 차례에 하위 대화 하나").
 *
 * 전에는 피드백 하나마다 대화 하나를 열어, 대화마다 작업 폴더 · 의존성 설치 · 규칙 읽기 · PR · CI를 처음부터 했다.
 * 이제 에이전트 차례인 항목을 묶어 한 대화에 맡긴다:
 * - 답만 하는 묶음: 질문 · 제안(진행 전)은 코드를 고치지 않으므로 모두 한 대화가 답한다.
 * - 고치는 묶음: 수정(과 진행한 제안)은 같은 화면(부위 이름의 첫 마디, 예 「피드백 › 머리줄」의 「피드백」)끼리 한 대화 · 한 PR로.
 * 한 묶음은 BUNDLE_MAX개까지. 묶음 순서는 그 안에서 가장 오래 기다린 항목 순서다.
 */
import fs from 'node:fs'
import path from 'node:path'
import { agentTurnReasons } from '@rw/core'
import type { ImageIn } from '@rw/core/contract/agentChats'
import { feedbackBundlePrompt, feedbackPrompt, pictureImage } from './agentPrompts.js'
import type { FeedbackListItem } from './feedback.js'
import { lastTouched } from './feedbackClaims.js'
import { t } from './i18n.js'
import { WorkbenchError } from './workbench.js'

export const BUNDLE_MAX = 5

/** 대화가 맡은 피드백 키 (묶음이면 모두, 아니면 하나) */
export function keysOf(c: { feedback?: string; bundle?: string[] }): string[] {
  return c.bundle?.length ? c.bundle : c.feedback ? [c.feedback] : []
}

/** 코드를 고쳐야 하는 항목: 수정, 또는 사용자가 「진행」한 제안 (그 뒤로 처리하지 않은 것) */
export function needsCode(e: Pick<FeedbackListItem, 'kind' | 'status' | 'review'>): boolean {
  const kind = e.status?.kind ?? e.kind
  if (kind === '수정' || !kind) return true
  const fresh = !!e.review && (!e.status?.handled_at || e.review.at > e.status.handled_at)
  return kind === '제안' && fresh && e.review?.verdict === '진행'
}

/** 화면: 부위 이름의 첫 마디 */
export function screenOf(e: Pick<FeedbackListItem, 'target'>): string {
  return e.target.split('›')[0]!.trim() || e.target
}

export type Bundle = { code: boolean; screen?: string; items: FeedbackListItem[] }

/** 맡길 항목을 묶는다 (오래 기다린 항목이 든 묶음부터) */
export function bundlesOf(items: FeedbackListItem[]): Bundle[] {
  const sorted = [...items].sort((a, b) => lastTouched(a) - lastTouched(b))
  const out: Bundle[] = []
  for (const e of sorted) {
    const code = needsCode(e)
    const screen = code ? screenOf(e) : undefined
    const b = out.find((x) => x.code === code && x.screen === screen && x.items.length < BUNDLE_MAX)
    if (b) b.items.push(e)
    else out.push({ code, ...(screen && { screen }), items: [e] })
  }
  return out
}

/**
 * 맡길 피드백(들)의 첫 지시 · 제목 · 그림 (agentChats.ts의 handOff). 하나면 그 항목 그대로, 여럿이면 묶음 지시.
 * busy = 그 키를 맡아 일하는 대화의 이름 (있으면 거절). 에이전트 차례가 아닌 항목 · 모르는 키도 거절
 */
export function handOffPlan(all: FeedbackListItem[], dir: string, keys: string[], busy: (key: string) => string | undefined): { text: string; title: string; images: ImageIn[]; keys: string[] } {
  const list = [...new Set(keys)].map((key) => {
    const who = busy(key)
    if (who) throw new WorkbenchError(409, t(`이 피드백을 맡은 대화(「${who}」)가 일하는 중입니다`, `A conversation ("${who}") is already working on this feedback`))
    const e = all.find((x) => x.key === key)
    if (!e) throw new WorkbenchError(404, t('그 피드백을 찾지 못했습니다', 'That feedback was not found'))
    const reasons = agentTurnReasons(e)
    if (!reasons.length) throw new WorkbenchError(400, t('에이전트 차례가 아닌 피드백입니다', 'This feedback is not the agent\'s turn'))
    const picture = e.picture ? path.join(dir, e.picture) : undefined
    return { e, reasons, ...(picture && fs.existsSync(picture) && { picture }) }
  })
  const first = list[0]!
  const images = list.flatMap((x) => (x.picture && pictureImage(x.picture)) || []).slice(0, 4)
  const code = list.some((x) => needsCode(x.e))
  const title = list.length === 1
    ? `${t('피드백', 'Feedback')} · ${(first.e.status?.clean ?? first.e.text).replace(/\s+/g, ' ').trim()}`
    : `${t(`피드백 ${list.length}개`, `${list.length} feedback items`)} · ${code ? screenOf(first.e) : t('질문 · 제안', 'questions · suggestions')}`
  const text = list.length === 1 ? feedbackPrompt(first.e, first.reasons, first.picture) : feedbackBundlePrompt(list, code)
  return { text, title: title.slice(0, 60), images, keys: list.map((x) => x.e.key) }
}
