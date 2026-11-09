// 피드백 바로 보내기 (11/8 "앱에 대한 피드백을 온라인상으로 여러 명으로부터"): GitHub 없이 쓰는 앱이 남긴 피드백을 관리자의 중계 서버(relay/feedback-worker.js)로 보낸다.
// 중계 서버가 관리자 개인 저장소의 feedback/from/<보낸 사람>-<번호>/에 커밋하고, 관리자 앱은 개인 저장소를 받을 때 그것을 함께 본다.
// 보낸 기록(feedback-relay.json, 앱 설정 폴더)에 날짜 파일마다 내용 해시와 보낸 그림을 적어 바뀐 날짜와 새 그림만 보낸다.
// 이미 보낸 날짜는 그때의 이름으로 다시 보낸다(as): 나중에 이름을 넣어도 관리자 쪽에 같은 항목이 두 폴더로 갈라지지 않게 (11/9).
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { bundleFeedback } from './feedbackBundle.js'
import { writeAtomic } from './fsutil.js'
import { t } from './i18n.js'
import { WorkbenchError } from './workbench.js'

/** 관리자가 띄운 중계 서버 주소 (relay/README.md). 비우면 바로 보내기를 쓰지 않는다 (RW_FEEDBACK_RELAY로 바꿀 수 있다) */
export const FEEDBACK_RELAY_URL = 'https://workbench-feedback.sungmin-park-0226.workers.dev'

interface Sent { days: Record<string, string>; pictures: string[]; as?: Record<string, string>; at?: number; error?: string | null }

const senderFile = (configDir: string) => path.join(configDir, 'feedback-sender.json')
const sentFile = (configDir: string) => path.join(configDir, 'feedback-relay.json')
const hash = (s: string) => crypto.createHash('sha1').update(s).digest('hex').slice(0, 16)

/** 이 앱의 번호: 처음 보낼 때 정하고 계속 쓴다 (이름이 같은 사람을 가른다) */
export function senderId(configDir: string): string {
  try {
    const v: unknown = JSON.parse(fs.readFileSync(senderFile(configDir), 'utf8'))
    if (v && typeof v === 'object' && 'id' in v && typeof v.id === 'string' && /^[a-z0-9]{6,32}$/.test(v.id)) return v.id
  } catch { /* 처음 */ }
  const id = crypto.randomBytes(6).toString('hex')
  fs.mkdirSync(configDir, { recursive: true })
  writeAtomic(senderFile(configDir), JSON.stringify({ id }) + '\n')
  return id
}

function readSent(configDir: string): Sent {
  try {
    const v: unknown = JSON.parse(fs.readFileSync(sentFile(configDir), 'utf8'))
    if (v && typeof v === 'object' && 'days' in v && v.days && typeof v.days === 'object' && 'pictures' in v && Array.isArray(v.pictures)) {
      const strings = (o: object) => Object.fromEntries(Object.entries(o).filter((e): e is [string, string] => typeof e[1] === 'string'))
      return { days: strings(v.days), pictures: v.pictures.filter((x): x is string => typeof x === 'string'), ...('as' in v && typeof v.as === 'object' && v.as !== null ? { as: strings(v.as) } : {}), ...('at' in v && typeof v.at === 'number' && { at: v.at }), ...('error' in v && typeof v.error === 'string' && { error: v.error }) }
    }
  } catch { /* 없음 */ }
  return { days: {}, pictures: [] }
}

/** 아직 보내지 않은 날짜 파일과 그림만 담은 묶음, 그리고 그 안의 항목 수 */
export function pendingBundle(dir: string, configDir: string, from: string, now = new Date()) {
  const full = bundleFeedback(dir, from, now, senderId(configDir))
  const sent = readSent(configDir)
  const days = Object.fromEntries(Object.entries(full.days).filter(([d, text]) => sent.days[d] !== hash(text)))
  const pictures = Object.fromEntries(Object.entries(full.pictures).filter(([name]) => !sent.pictures.includes(name) && Object.values(days).some((text) => text.includes(`pictures/${name}`))))
  // 항목 수: 보낸 해시와 달라진 날짜에서 새로 생긴 "## " 머리만 세면 고친 항목이 빠지므로, 바뀐 날짜의 항목 모두를 센다
  const count = Object.values(days).reduce((n, text) => n + (text.match(/^## /gm)?.length ?? 0), 0)
  return { bundle: { ...full, days, pictures }, count, sent }
}

/** 보내기 상태: 마지막으로 보낸 때와 실패 문장, 보낼 항목 수, 보내는 이름(named: 내 이름이나 GitHub 계정에서 왔는지) */
export function relayStatus(dir: string, configDir: string, sender: { from: string; named: boolean }) {
  const sent = readSent(configDir)
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /^\d{4}-\d{2}-\d{2}\.md$/.test(f)) : []
  const pending = files.reduce((n, f) => {
    const text = fs.readFileSync(path.join(dir, f), 'utf8')
    return sent.days[f.slice(0, 10)] === hash(text) ? n : n + (text.match(/^## /gm)?.length ?? 0)
  }, 0)
  return { pending, at: sent.at ?? null, error: sent.error ?? null, ...sender }
}

/**
 * 이미 보낸 날짜를 보낼 이름: 그때 쓴 이름. 이름을 기록하기 전(11/9 전)에 보낸 날짜는 그때 규칙대로 내 이름이 비어 이 컴퓨터 사용자 이름이었다고 본다
 */
const nameFor = (sent: Sent, day: string, from: string) => sent.as?.[day] ?? (sent.days[day] ? os.userInfo().username : from)

/** 중계 서버로 보낸다. 보낼 것이 없으면 부르지 않는다. 날짜마다 보낼 이름이 다르면 이름마다 따로 보낸다 */
export async function sendToRelay(dir: string, configDir: string, from: string, url: string, fetchFn: typeof fetch = fetch): Promise<{ count: number; message: string }> {
  const { bundle, count, sent } = pendingBundle(dir, configDir, from)
  if (!Object.keys(bundle.days).length) return { count: 0, message: t('보낼 피드백이 없습니다. 모두 보냈습니다', 'Nothing to send. All feedback has been sent') }
  const done: Sent = { ...sent, days: { ...sent.days }, pictures: [...sent.pictures], as: { ...sent.as } }
  const fail = (msg: string): never => {
    writeAtomic(sentFile(configDir), JSON.stringify({ ...done, at: Date.now(), error: msg }) + '\n')
    throw new WorkbenchError(502, msg)
  }
  const groups = new Map<string, string[]>()
  for (const d of Object.keys(bundle.days)) { const name = nameFor(sent, d, from); groups.set(name, [...(groups.get(name) ?? []), d]) }
  for (const [name, days] of groups) {
    const part = Object.fromEntries(days.map((d) => [d, bundle.days[d]!]))
    const pictures = Object.fromEntries(Object.entries(bundle.pictures).filter(([p]) => Object.values(part).some((text) => text.includes(`pictures/${p}`))))
    let res: Response
    try {
      res = await fetchFn(`${url.replace(/\/+$/, '')}/feedback`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...bundle, from: name, days: part, pictures }), signal: AbortSignal.timeout(120_000) })
    } catch (e) { return fail(t(`관리자 서버에 닿지 못했습니다: ${e instanceof Error ? e.message : String(e)}`, `Could not reach the maintainer's server: ${e instanceof Error ? e.message : String(e)}`)) }
    const body: { error?: string } = await res.json().catch(() => ({}))
    if (!res.ok) return fail(t(`관리자 서버가 받지 않았습니다 (${res.status}): ${body.error ?? ''}`, `The maintainer's server refused it (${res.status}): ${body.error ?? ''}`))
    for (const d of days) { done.days[d] = hash(part[d]!); done.as![d] = name }
    done.pictures = [...new Set([...done.pictures, ...Object.keys(pictures)])]
    // 한 무리를 보낼 때마다 적는다: 다음 무리가 실패해도 보낸 것을 다시 보내지 않게
    writeAtomic(sentFile(configDir), JSON.stringify({ ...done, at: Date.now(), error: null }) + '\n')
  }
  return { count, message: t(`피드백 ${count}개를 관리자에게 보냈습니다`, `Sent ${count} feedback items to the maintainer`) }
}
