import fs from 'node:fs'
import path from 'node:path'
import YAML from 'yaml'
import { writeAtomic } from './fsutil.js'

/**
 * 피드백 맡기기를 한 컴퓨터만 (10/22 "두 맥 동기화와 충돌 대비"): 앱 고치기 대화는 컴퓨터마다 따로라,
 * 두 맥에서 "바로 맡기기"를 켜면 같은 피드백을 두 에이전트가 맡았다. 맡기 전에 개인 저장소의 feedback/handoff.yaml에
 * 이 컴퓨터를 적어 올리고, 올린 뒤에도 이 컴퓨터가 남아 있을 때만 맡는다. 두 컴퓨터가 함께 적으면 합칠 때
 * 먼저 적은 쪽이 남는다(feedbackMerge.ts). GitHub에 올리기는 한 번에 한 쪽만 되므로 둘 다 맡는 일이 없다.
 *
 *   <피드백 키>: { machine: <컴퓨터 이름>, at: <ISO 시각, 시간대 포함> }
 *
 * 맡은 뒤에 사용자가 다시 답하면(반려 · 코멘트 등) 새 차례이므로, at이 그 항목의 마지막 손댄 때보다 앞선 적음은 보지 않는다.
 */
export const HANDOFF_FILE = 'handoff.yaml'

export interface Claim { machine: string; at: string }

export function readClaims(dir: string): Record<string, Claim> {
  try {
    const doc = YAML.parse(fs.readFileSync(path.join(dir, HANDOFF_FILE), 'utf8')) as unknown
    return doc && typeof doc === 'object' && !Array.isArray(doc) ? doc as Record<string, Claim> : {}
  } catch { return {} }
}

/** 이번 차례(since 뒤)에 다른 컴퓨터가 맡았으면 그 컴퓨터 이름 */
export function claimedElsewhere(dir: string, key: string, machine: string, since: number): string | null {
  const c = readClaims(dir)[key]
  if (!c || typeof c.machine !== 'string' || c.machine === machine) return null
  const at = Date.parse(String(c.at))
  return Number.isFinite(at) && at >= since ? c.machine : null
}

export function writeClaim(dir: string, key: string, machine: string, now = new Date()): void {
  const file = path.join(dir, HANDOFF_FILE)
  const doc = fs.existsSync(file) ? YAML.parseDocument(fs.readFileSync(file, 'utf8')) : new YAML.Document({})
  doc.set(key, { machine, at: now.toISOString() })
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
