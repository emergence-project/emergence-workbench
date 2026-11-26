import fs from 'node:fs'
import path from 'node:path'
import YAML from 'yaml'
import { FEEDBACK_MISSES, FEEDBACK_STATES } from '@rw/core/contract/feedback'
import { STATUS_FILE } from './feedback.js'

/**
 * 읽히지만 앱이 모르는 state를 적은 항목 (오타 등). readFeedbackStatus는 이런 항목을 처리 기록 없는 것으로 보므로
 * 에이전트가 같은 항목을 새 것으로 다시 처리하지 않게 pnpm agent:feedback이 먼저 알린다
 */
export function feedbackStatusWarnings(dir: string): string[] {
  const file = path.join(dir, STATUS_FILE)
  if (!fs.existsSync(file)) return []
  let raw: unknown
  try { raw = YAML.parse(fs.readFileSync(file, 'utf8')) } catch { return [] }
  if (!raw || typeof raw !== 'object') return []
  const field = (v: unknown, k: string): unknown => (v && typeof v === 'object' ? Object.entries(v).find(([n]) => n === k)?.[1] : undefined)
  const entries = Object.entries(raw)
  const states = entries.flatMap(([key, v]) => {
    const state = field(v, 'state')
    return FEEDBACK_STATES.some((x) => x === state) ? [] : [`${key}: state ${state === undefined ? '없음' : JSON.stringify(state)} (쓸 수 있는 값: ${FEEDBACK_STATES.join(' · ')})`]
  })
  // 아래 둘은 11/27까지 pnpm test가 맥의 실제 기록을 검사하던 것: 이제 이 경고로만 알린다 (피드백 화면은 area로 묶고, 모르는 miss는 교훈 요약에서 빠진다)
  const noArea = entries.filter(([, v]) => { const area = field(v, 'area'); return typeof area !== 'string' || !area }).map(([key]) => key)
  const badMiss = entries.filter(([, v]) => {
    const revised = field(v, 'revised')
    return Array.isArray(revised) && revised.some((r) => { const miss = field(r, 'miss'); return miss != null && !FEEDBACK_MISSES.some((m) => m === miss) })
  }).map(([key]) => key)
  const few = (keys: string[]) => keys.slice(0, 3).join(', ') + (keys.length > 3 ? ` 외 ${keys.length - 3}개` : '')
  return [
    ...states,
    ...(noArea.length ? [`area(화면 부위)가 없는 항목 ${noArea.length}개: ${few(noArea)}`] : []),
    ...(badMiss.length ? [`revised의 miss를 알아보지 못한 항목 ${badMiss.length}개 (쓸 수 있는 값: ${FEEDBACK_MISSES.join(' · ')}): ${few(badMiss)}`] : []),
  ]
}
