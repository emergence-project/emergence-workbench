// 피드백 바로 보내기 (11/8 "앱에 대한 피드백을 온라인상으로 여러 명으로부터"): GitHub 없이 쓰는 앱이 남긴 피드백을 관리자의 중계 서버(relay/feedback-worker.js)로 보낸다.
// 중계 서버가 관리자 개인 저장소의 feedback/from/<보낸 사람>-<번호>/에 커밋하고, 관리자 앱은 개인 저장소를 받을 때 그것을 함께 본다.
// 보낸 기록(feedback-relay.json, 앱 설정 폴더)에 날짜 파일마다 내용 해시와 보낸 그림을 적어 바뀐 날짜와 새 그림만 보낸다.
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { bundleFeedback } from './feedbackBundle.js'
import { writeAtomic } from './fsutil.js'
import { t } from './i18n.js'
import { WorkbenchError } from './workbench.js'

/** 관리자가 띄운 중계 서버 주소. 비어 있으면 바로 보내기를 쓰지 않는다 (RW_FEEDBACK_RELAY로 바꿀 수 있다) */
export const FEEDBACK_RELAY_URL = ''

interface Sent { days: Record<string, string>; pictures: string[]; at?: number; error?: string | null }

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
      return { days: Object.fromEntries(Object.entries(v.days).filter((e): e is [string, string] => typeof e[1] === 'string')), pictures: v.pictures.filter((x): x is string => typeof x === 'string'), ...('at' in v && typeof v.at === 'number' && { at: v.at }), ...('error' in v && typeof v.error === 'string' && { error: v.error }) }
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

/** 보내기 상태: 마지막으로 보낸 때와 실패 문장, 보낼 항목 수 */
export function relayStatus(dir: string, configDir: string) {
  const sent = readSent(configDir)
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /^\d{4}-\d{2}-\d{2}\.md$/.test(f)) : []
  const pending = files.reduce((n, f) => {
    const text = fs.readFileSync(path.join(dir, f), 'utf8')
    return sent.days[f.slice(0, 10)] === hash(text) ? n : n + (text.match(/^## /gm)?.length ?? 0)
  }, 0)
  return { pending, at: sent.at ?? null, error: sent.error ?? null }
}

/** 중계 서버로 보낸다. 보낼 것이 없으면 부르지 않는다 */
export async function sendToRelay(dir: string, configDir: string, from: string, url: string, fetchFn: typeof fetch = fetch): Promise<{ count: number; message: string }> {
  const { bundle, count, sent } = pendingBundle(dir, configDir, from)
  if (!Object.keys(bundle.days).length) return { count: 0, message: t('보낼 피드백이 없습니다. 모두 보냈습니다', 'Nothing to send. All feedback has been sent') }
  const fail = (msg: string): never => {
    writeAtomic(sentFile(configDir), JSON.stringify({ ...sent, at: Date.now(), error: msg }) + '\n')
    throw new WorkbenchError(502, msg)
  }
  let res: Response
  try {
    res = await fetchFn(`${url.replace(/\/+$/, '')}/feedback`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(bundle), signal: AbortSignal.timeout(120_000) })
  } catch (e) { return fail(t(`관리자 서버에 닿지 못했습니다: ${e instanceof Error ? e.message : String(e)}`, `Could not reach the maintainer's server: ${e instanceof Error ? e.message : String(e)}`)) }
  const body: { error?: string } = await res.json().catch(() => ({}))
  if (!res.ok) return fail(t(`관리자 서버가 받지 않았습니다 (${res.status}): ${body.error ?? ''}`, `The maintainer's server refused it (${res.status}): ${body.error ?? ''}`))
  const days = { ...sent.days, ...Object.fromEntries(Object.entries(bundle.days).map(([d, text]) => [d, hash(text)])) }
  writeAtomic(sentFile(configDir), JSON.stringify({ days, pictures: [...new Set([...sent.pictures, ...Object.keys(bundle.pictures)])], at: Date.now(), error: null }) + '\n')
  return { count, message: t(`피드백 ${count}개를 관리자에게 보냈습니다`, `Sent ${count} feedback items to the maintainer`) }
}
