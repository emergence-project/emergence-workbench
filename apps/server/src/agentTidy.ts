/**
 * 오래된 대화 정리와 압축 (11/16 시안 https://claude.ai/artifact/9x2Bud4dVQyYkS6RhdnbAG §6 · §9 ④).
 *
 * - 끝난 대화(일하지 않고 사용자 차례도 아님, 에이전트가 묻고 끝낸 대화도 아님)가 TIDY_DAYS 동안 손대지 않으면 보관한다. 합쳐지지 않은 PR이 있는 앱 고치기 대화와 중앙 대화는 두지 않는다.
 * - 보관한 대화는 결과 요약(작은 모델, 서너 줄)을 남기고, 원문(대화 줄)은 같은 폴더의 <id>.items.json.gz로 압축해 메모리에서 뺀다.
 *   지우지 않는다: 그 대화를 열면(must) 다시 풀어 그대로 보인다. 지우기는 사용자가 보관함에서 고를 때만.
 * - 요약은 색인일 뿐 정본이 아니다: 고친 코드는 PR, 노트는 노트와 수정 검토, 답은 기록에 있다.
 */
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { agentAsks } from '@rw/core'
import { CENTRAL_RID, type CentralMemo, type ChatItem } from '@rw/core/contract/agentChats'

/** 끝난 대화를 보관할 때까지 (일) */
export const TIDY_DAYS = 7
/** 한 번 정리할 때 쓰는 요약 수 (작은 모델이라도 한꺼번에 많이 부르지 않게) */
export const TIDY_SUMMARIES = 5

interface Tidyable { id: string; rid: string; state: string; updated: string; archived?: boolean; pr?: unknown; merged?: string; items: ChatItem[]; packed?: number }

export const packFile = (dir: string, id: string) => path.join(dir, `${id}.items.json.gz`)

/** 저절로 보관할 대화인가 */
export function due(c: Tidyable, now = Date.now()): boolean {
  if (c.archived || c.rid === CENTRAL_RID || !['idle', 'stopped', 'error'].includes(c.state)) return false
  if (c.pr && !c.merged) return false
  // 에이전트가 묻고 끝낸 대화는 사용자가 답할 때까지 둔다 (11/24)
  if (agentAsks(c.items)) return false
  return now - Date.parse(c.updated) >= TIDY_DAYS * 86_400_000
}

/** 원문을 압축해 두고 메모리에서 뺀다. 이미 뺐거나 줄이 없으면 그대로 */
export function pack(dir: string, c: Tidyable): boolean {
  if (c.packed || !c.items.length) return false
  fs.writeFileSync(packFile(dir, c.id), zlib.gzipSync(JSON.stringify(c.items)))
  c.packed = c.items.length
  c.items = []
  return true
}

/** 압축해 둔 원문을 다시 넣는다 (그 대화를 열 때). 압축 파일은 둔다: 다시 쓸 때까지 디스크의 대화 파일은 줄이 빈 채라서 */
export function unpack(dir: string, c: Tidyable): void {
  if (!c.packed) return
  try {
    const items: unknown = JSON.parse(zlib.gunzipSync(fs.readFileSync(packFile(dir, c.id))).toString('utf8'))
    if (Array.isArray(items)) c.items = items
  } catch { /* 압축 파일이 없거나 깨졌으면 빈 대화로 */ }
  delete c.packed
}

// ---------- 중앙 메모 (시안 §9 ⑤) ----------

/** 중앙 메모 파일: 개인 저장소가 있으면 거기(두 맥이 함께 읽음), 없으면 이 컴퓨터 설정 폴더. publish = 쓴 뒤 올리기 */
export interface CentralMemoDeps { file: string; where: 'personal' | 'local'; publish?: () => Promise<unknown>; /** 의도 장부 (agentCentralReview.ts), 같은 자리 */ decisions?: Omit<CentralMemoDeps, 'decisions'> }
/** 중앙 메모 길이 한도 (매 대화 처음에 읽는 글이라 짧게) */
export const MEMO_MAX = 4000

/** 중앙 메모 (없으면 빈 글) */
export function readMemo(d?: CentralMemoDeps): CentralMemo {
  if (!d) return { text: '', where: 'local' }
  try {
    const st = fs.statSync(d.file)
    return { text: fs.readFileSync(d.file, 'utf8').trim(), where: d.where, updated: st.mtime.toISOString() }
  } catch { return { text: '', where: d.where } }
}

/** 중앙 메모를 통째로 바꾼다. 개인 저장소면 저절로 올린다. 너무 길면 false */
export function writeMemo(d: CentralMemoDeps, text: string): boolean {
  const body = text.trim()
  if (body.length > MEMO_MAX) return false
  fs.mkdirSync(path.dirname(d.file), { recursive: true })
  fs.writeFileSync(d.file, body ? `${body}\n` : '')
  void d.publish?.().catch(() => undefined)
  return true
}

/** 안내 뒤에 붙이는 메모 (없으면 빈 글). first = 안내 바로 뒤 (아니면 바뀐 메모) */
export function memoBlock(m: string, first = true): string {
  if (!m) return first ? '' : '[Central memo: now empty]'
  return `${first ? '\n\n' : ''}[Central memo${first ? '' : ' (updated)'}]\n${m}`
}
