import fs from 'node:fs'
import path from 'node:path'
import YAML from 'yaml'
import { writeAtomic } from './fsutil.js'
import type { FeedbackListItem } from './feedback.js'

/**
 * 피드백 맡기기를 한 컴퓨터만 (10/22 "두 맥 동기화와 충돌 대비"): 앱 고치기 대화는 컴퓨터마다 따로라,
 * 두 맥에서 "바로 맡기기"를 켜면 같은 피드백을 두 에이전트가 맡았다. 맡기 전에 개인 저장소의 feedback/handoff.yaml에
 * 이 컴퓨터를 적어 올리고, 올린 뒤에도 이 컴퓨터가 남아 있을 때만 맡는다. 두 컴퓨터가 함께 적으면 합칠 때
 * 먼저 적은 쪽이 남는다(feedbackMerge.ts). GitHub에 올리기는 한 번에 한 쪽만 되므로 둘 다 맡는 일이 없다.
 *
 *   <피드백 키>: { machine: <컴퓨터 이름>, at: <ISO 시각, 시간대 포함>, until: <풀리는 시각> }
 *
 * until은 읽는 쪽(에이전트 · 사람)이 계산 없이 보라고 적는다. 적을 때 풀린 줄은 지워 파일에는 살아 있는 맡음만 남는다.
 *
 * 맡은 뒤에 사용자가 다시 답하면(반려 · 코멘트 등) 새 차례이므로, at이 그 항목의 마지막 손댄 때보다 앞선 적음은 보지 않는다.
 * 맡은 쪽이 끝내지 못하고 사라져도 항목이 묶이지 않게 맡음은 CLAIM_TTL_MS 뒤 풀린다(11/9 사용자 "맡은 스레드를 잃어버리면").
 * 같은 이름으로 다시 맡으면 시각이 새로 적혀 늘어난다. 피드백 화면에 맡음과 풀리는 때가 보이고 「맡음 풀기」로 바로 풀 수 있다.
 */
/** 피드백 하나에서 사용자 쪽 마지막 일(남김 · 답 · 코멘트 · 고친 글)의 시각 (이 컴퓨터 시간대). 맡은 일을 두 번 맡지 않게 */
export function lastTouched(e: Pick<FeedbackListItem, 'date' | 'time' | 'review' | 'comments'>): number {
  const at = [`${e.date}T${e.time}`, e.review?.at, e.review?.edited, ...(e.comments ?? []).flatMap((c) => [c.at, c.edited])]
  return Math.max(...at.filter((x): x is string => !!x).map((x) => new Date(x).getTime()).filter((n) => !Number.isNaN(n)))
}

export const HANDOFF_FILE = 'handoff.yaml'
/** 맡음이 저절로 풀리기까지 (한 번 처리는 보통 한 시간 안, PR CI를 기다려도 세 시간이면 넉넉하다) */
export const CLAIM_TTL_MS = 3 * 60 * 60 * 1000

export interface Claim { machine: string; at: string; until?: string }

/** 이번 차례(since 뒤)에 적었고 아직 풀리지 않은 맡음인가 */
export function isLiveClaim(c: unknown, since: number, now = Date.now()): c is Claim {
  if (!c || typeof c !== 'object' || !('machine' in c) || typeof c.machine !== 'string' || !('at' in c)) return false
  const at = Date.parse(String(c.at))
  return Number.isFinite(at) && at >= since && now - at < CLAIM_TTL_MS
}

export function readClaims(dir: string): Record<string, Claim> {
  try {
    const doc = YAML.parse(fs.readFileSync(path.join(dir, HANDOFF_FILE), 'utf8')) as unknown
    return doc && typeof doc === 'object' && !Array.isArray(doc) ? doc as Record<string, Claim> : {}
  } catch { return {} }
}

/** 이번 차례(since 뒤)에 다른 컴퓨터가 맡았으면 그 컴퓨터 이름 */
export function claimedElsewhere(dir: string, key: string, machine: string, since: number): string | null {
  const c = readClaims(dir)[key]
  return isLiveClaim(c, since) && c.machine !== machine ? c.machine : null
}

/** 맡음을 지운다. machine을 주면 그 이름이 맡은 것만. 지운 수 */
export function releaseClaims(dir: string, keys: string[] | null, machine?: string): number {
  const file = path.join(dir, HANDOFF_FILE)
  if (!fs.existsSync(file)) return 0
  const doc = YAML.parseDocument(fs.readFileSync(file, 'utf8'))
  const claims = readClaims(dir)
  let n = 0
  for (const [k, c] of Object.entries(claims)) {
    if ((keys && !keys.includes(k)) || (machine && c?.machine !== machine)) continue
    doc.delete(k); n++
  }
  if (n) writeAtomic(file, doc.toString({ lineWidth: 0 }))
  return n
}

export function writeClaim(dir: string, key: string, machine: string, now = new Date()): void {
  const file = path.join(dir, HANDOFF_FILE)
  const doc = fs.existsSync(file) ? YAML.parseDocument(fs.readFileSync(file, 'utf8')) : new YAML.Document({})
  for (const [k, c] of Object.entries(readClaims(dir))) if (!isLiveClaim(c, 0, now.getTime())) doc.delete(k)
  doc.set(key, { machine, at: now.toISOString(), until: new Date(now.getTime() + CLAIM_TTL_MS).toISOString() })
  writeAtomic(file, doc.toString({ lineWidth: 0 }))
}

export interface ClaimDeps {
  dir: string
  machine: string
  /** GitHub의 새 내용을 받는다 (개인 저장소 받기) */
  pull(): Promise<{ ok: boolean }>
  /** 피드백 폴더를 올린다. 올리지 못하면 던진다 */
  publish(): Promise<unknown>
}

/**
 * 이 컴퓨터가 그 피드백을 맡는다. 받고 → 다른 컴퓨터가 이번 차례에 맡았으면 false → 적고 올린 뒤 → 이 컴퓨터가 남았으면 true.
 * 받기나 올리기가 안 되면 false (다음 차례에 다시 해 본다)
 */
export async function claimFeedback(d: ClaimDeps, key: string, since: number): Promise<boolean> {
  if (!(await d.pull()).ok) return false
  if (claimedElsewhere(d.dir, key, d.machine, since)) return false
  writeClaim(d.dir, key, d.machine)
  try { await d.publish() } catch { return false }
  return readClaims(d.dir)[key]?.machine === d.machine
}
