import fs from 'node:fs'
import path from 'node:path'
import { COMMENTS_DIR, commentsFile, isAgentKind, parseComments, type CommentEntry, type CommentFile } from './comments.js'
import { isBackupCopy, writeAtomic } from './fsutil.js'
import { WorkbenchError } from './workbench.js'
import { t } from './i18n.js'

/**
 * 완료한 기록 보관 (2026-11-23 사용자 결정 "보관으로 옮기고"):
 * 오래된 완료 기록을 `comments/archive/<대상>.md`로 옮긴다. 지우지 않는다. 형식은 기록 파일과 같고(§6.5),
 * 기록 목록 · 에이전트 읽기(listComments)는 `comments/` 바로 아래만 읽으므로 보관한 것은 거기서 빠진다.
 * 옮길 때는 보관 파일을 먼저 쓰고 원래 파일에서 뺀다: 사이에 멈춰도 기록은 남고(두 곳에), 다음 정리가 겹친 것을 한쪽만 남긴다.
 */
export const ARCHIVE_DIR = 'archive'
/** 마지막 글(기록을 쓴 때, 답이 있으면 마지막 답)에서 이만큼 지난 완료 기록을 옮긴다 */
export const ARCHIVE_AFTER_DAYS = 90

/** 완료 기록이 이만큼 쌓이면 종이 정리를 권한다 */
export const TIDY_HINT_AT = 200

const HEAD_RE = /^## (c-[\w-]+) · /
const TARGET_RE = /^[a-z]+(?:-[A-Za-z0-9._-]{1,160})?$/
const DAY = 24 * 3600_000

/** 완료: 끝냄, 그리고 에이전트가 물은 것에 사용자가 답한 것 (화면 recordsPanelHelpers.isDoneRecord와 같은 규칙) */
export const isDoneRecord = (c: Pick<CommentEntry, 'state' | 'kind' | 'by'>) => c.state === '끝냄' || (isAgentKind(c.kind) && Boolean(c.by) && c.state === '답함')

/** 기록의 마지막 글 시각 (ms). 읽지 못하면 null: 그 기록은 옮기지 않는다 */
export function lastWritten(c: Pick<CommentEntry, 'id' | 'answers'>): number | null {
  const m = /^c-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})/.exec(c.id)
  if (!m) return null
  let at = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5])).getTime()
  for (const a of c.answers) {
    const d = /^(\d{4})-(\d{2})-(\d{2})(?: (\d{2}):(\d{2}))?/.exec(a.at)
    if (d) at = Math.max(at, new Date(Number(d[1]), Number(d[2]) - 1, Number(d[3]), Number(d[4] ?? 0), Number(d[5] ?? 0)).getTime())
  }
  return Number.isNaN(at) ? null : at
}

/** 한 파일에서 옮길 기록 id. 할 일과 그 할 일에 대해 물은 기록은 한 묶음이라 모두 옮길 수 있을 때만 옮긴다 */
export function archivable(file: Pick<CommentFile, 'comments'>, now: number, days = ARCHIVE_AFTER_DAYS): string[] {
  const old = (c: CommentEntry) => { const at = lastWritten(c); return isDoneRecord(c) && at !== null && now - at > days * DAY }
  const ok = new Set(file.comments.filter(old).map((c) => c.id))
  const groupOf = (c: CommentEntry) => c.todo ?? c.id
  const broken = new Set(file.comments.filter((c) => !ok.has(c.id)).map(groupOf))
  return file.comments.filter((c) => ok.has(c.id) && !broken.has(groupOf(c))).map((c) => c.id)
}

const archiveFile = (root: string, target: string) => path.join(path.dirname(commentsFile(root, target)), ARCHIVE_DIR, `${target}.md`)

/** 파일을 머리(첫 기록 앞)와 기록 덩어리로 나눈다. 덩어리는 `## c-…` 줄부터 다음 머리 앞까지 그대로 */
function split(text: string): { head: string[]; sections: { id: string; lines: string[] }[] } {
  const head: string[] = []
  const sections: { id: string; lines: string[] }[] = []
  for (const line of text.split('\n')) {
    const m = HEAD_RE.exec(line.replace(/\r$/, ''))
    if (m) sections.push({ id: m[1]!, lines: [line] })
    else if (sections.length) sections.at(-1)!.lines.push(line)
    else head.push(line)
  }
  return { head, sections }
}
const join = (head: string[], sections: { lines: string[] }[]) => {
  const body = [...head, ...sections.flatMap((s) => s.lines)].join('\n')
  return body.endsWith('\n') ? body : `${body}\n`
}
/** 덩어리 끝에 빈 줄 하나: 다른 파일 끝에 붙여도 다음 머리와 붙지 않게 */
const padded = (lines: string[]) => { const out = [...lines]; while (out.length && !out.at(-1)!.trim()) out.pop(); return [...out, ''] }

function targetsIn(dir: string): string[] {
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir).filter((n) => n.endsWith('.md') && !n.startsWith('.') && !isBackupCopy(n)).map((n) => n.slice(0, -3)).filter((x) => TARGET_RE.test(x)).sort()
}

/** 덩어리의 글 (끝 빈 줄을 맞춰 견준다) */
const bodyOf = (lines: string[]) => padded(lines).join('\n')
/** 보관 파일에 같은 id의 다른 글이 있어 옮기지 않을 기록 (move가 그대로 두는 것) */
function clashing(text: string, to: string): Set<string> {
  if (!fs.existsSync(to)) return new Set()
  const have = new Map(split(fs.readFileSync(to, 'utf8')).sections.map((s) => [s.id, bodyOf(s.lines)]))
  return new Set(split(text).sections.filter((s) => have.has(s.id) && have.get(s.id) !== bodyOf(s.lines)).map((s) => s.id))
}

/** from 파일의 기록 ids를 to 파일 끝으로 옮긴다. to에 같은 id · 같은 글이 이미 있으면 다시 쓰지 않고 from에서만 뺀다.
 *  같은 id인데 글이 다르면 옮기지 않고 from에 그대로 둔다(빼면 그 글이 어디에도 남지 않는다). 옮긴 id들 */
function move(from: string, to: string, ids: Set<string>): string[] {
  if (!fs.existsSync(from)) return []
  const src = split(fs.readFileSync(from, 'utf8'))
  const moving = src.sections.filter((s) => ids.has(s.id))
  if (!moving.length) return []
  const dst = fs.existsSync(to) ? split(fs.readFileSync(to, 'utf8')) : { head: padded(src.head), sections: [] }
  const have = new Map(dst.sections.map((s) => [s.id, bodyOf(s.lines)]))
  const gone = new Set(moving.filter((s) => !have.has(s.id) || have.get(s.id) === bodyOf(s.lines)))
  if (!gone.size) return []
  const added = [...gone].filter((s) => !have.has(s.id)).map((s) => ({ id: s.id, lines: padded(s.lines) }))
  fs.mkdirSync(path.dirname(to), { recursive: true })
  if (added.length) writeAtomic(to, join(dst.sections.length ? [...dst.head] : padded(dst.head), [...dst.sections.map((s) => ({ ...s, lines: padded(s.lines) })), ...added]))
  writeAtomic(from, join(src.head, src.sections.filter((s) => !gone.has(s))))
  return [...gone].map((s) => s.id)
}

export interface ArchiveMove { target: string; ids: string[] }

/** 옮길 것만 센다 (화면이 옮기기 전에 수를 보인다). 보관 파일의 같은 id와 글이 달라 옮기지 않을 기록은 뺀다 (11/26: 전에는 세어서, 정리해도 줄지 않는 수가 남았다) */
export function archivePlan(root: string, now = Date.now(), days = ARCHIVE_AFTER_DAYS): ArchiveMove[] {
  const dir = path.join(root, COMMENTS_DIR)
  return targetsIn(dir).map((target) => {
    const text = fs.readFileSync(path.join(dir, `${target}.md`), 'utf8')
    const stay = clashing(text, archiveFile(root, target))
    return { target, ids: archivable(parseComments(target, text), now, days).filter((id) => !stay.has(id)) }
  }).filter((m) => m.ids.length)
}

/** 오래된 완료 기록을 보관 파일로 옮긴다. 무엇을 옮겼는지 돌려준다(되돌리기에 쓴다) */
export function archiveRecords(root: string, now = Date.now(), days = ARCHIVE_AFTER_DAYS): ArchiveMove[] {
  const plan = archivePlan(root, now, days)
  return plan.map((m) => ({ target: m.target, ids: move(commentsFile(root, m.target), archiveFile(root, m.target), new Set(m.ids)) })).filter((m) => m.ids.length)
}

/** 보관한 기록을 원래 파일로 되돌린다. 되돌린 수 */
export function restoreRecords(root: string, moves: ArchiveMove[]): number {
  let n = 0
  for (const m of moves) {
    const from = archiveFile(root, m.target)
    if (!fs.existsSync(from)) throw new WorkbenchError(404, t(`보관한 기록이 없음: ${m.target}`, `No archived records: ${m.target}`))
    n += move(from, commentsFile(root, m.target), new Set(m.ids)).length
    // 다 꺼낸 보관 파일은 머리만 남으므로 지운다
    if (!split(fs.readFileSync(from, 'utf8')).sections.length) fs.rmSync(from)
  }
  return n
}

/** 보관한 기록 (읽기 전용 목록) */
export function listArchived(root: string): CommentFile[] {
  const dir = path.join(root, COMMENTS_DIR, ARCHIVE_DIR)
  return targetsIn(dir).map((target) => parseComments(target, fs.readFileSync(path.join(dir, `${target}.md`), 'utf8'))).filter((f) => f.comments.length > 0)
}

/** 정리를 권할 곳인가: 완료 기록이 TIDY_HINT_AT개를 넘고 그중 옮길 수 있는 것이 있을 때만 수를 돌려준다 */
export function tidyHint(files: Pick<CommentFile, 'comments'>[], now = Date.now(), planned?: () => number): { done: number; ready: number } | null {
  const done = files.reduce((n, f) => n + f.comments.filter(isDoneRecord).length, 0)
  if (done < TIDY_HINT_AT) return null
  // planned = 실제로 옮길 수 (archivePlan: 보관 파일과 글이 달라 옮기지 않을 기록을 뺀다). 권할 때만 센다
  const ready = planned ? planned() : files.reduce((n, f) => n + archivable(f, now).length, 0)
  return ready ? { done, ready } : null
}
