export { answerMockups } from './feedbackMockups.js'
import fs from 'node:fs'
import path from 'node:path'
import YAML from 'yaml'
import { localDate, localTime, writeAtomic } from './fsutil.js'
import { importedDayFiles } from './feedbackBundle.js'
import { t } from './i18n.js'
import { readMockups, readReplies, readRevisions } from './feedbackMockups.js'
import { agentTurns, asksUser, stamp as coreStamp } from '@rw/core'
import { FEEDBACK_KINDS, FEEDBACK_STATES, FEEDBACK_VERDICTS, type FeedbackComment, type FeedbackEntry, type FeedbackItem as FeedbackListItem, type FeedbackKind, type FeedbackMiss, type FeedbackPickableKind, type FeedbackPublished as PublishResult, type FeedbackReview, type FeedbackState, type FeedbackStatus, type FeedbackVerdict, type FeedbackVerdictEntry } from '@rw/core/contract/feedback'
export { publishFeedback, unpublishedFeedback, changedEntries, PublishError, feedbackAccount, adoptLocalFeedback } from './feedbackPublish.js'

/**
 * 앱에 대한 사용자 피드백 (피드백 모드에서 화면 부위를 눌러 남긴 코멘트).
 * 개인 저장소 사본의 feedback/YYYY-MM-DD.md에 덧붙인다 (personalRepo.ts). Claude가 이 파일을 읽고 어느 부위인지 바로 안다.
 *
 *   ## 17:45 · 디자인 · 블록 › 속성 표 › 다른 시도
 *   - 화면: #/r/alpha/b/iso
 *   - 가리킨 글자: 강한 부가법칙으로 직접 증명
 *   - 창: 1440×900 · 라이트
 *   - 앱 버전: 1f48fb4
 *
 *   칩이 너무 작다
 */
/** 피드백 모드는 등록 전에 수정 · 질문 · 제안을 고른다 (10/9: 질문을 요청으로 읽는 일을 막으려고). 처리할 때 status.yaml의 kind에 종류를 적을 수 있다. 디자인 · 버그 · 기능은 이전 기록, 미분류는 10/9 전 기록과 소개의 피드백 */
export { FEEDBACK_KINDS, FEEDBACK_MISSES, FEEDBACK_STATES, FEEDBACK_VERDICTS } from '@rw/core/contract/feedback'
export type { FeedbackKind, FeedbackState, FeedbackVerdict, FeedbackEntry, FeedbackStatus, FeedbackRevision, FeedbackReply, FeedbackVerdictEntry, FeedbackReview, FeedbackComment, MergedFeedback, FeedbackItem as FeedbackListItem, FeedbackPublished as PublishResult } from '@rw/core/contract/feedback'

export interface FeedbackInput {
  kind: FeedbackKind
  /** 화면 부위 이름 (예: 블록 › 속성 표 › 다른 시도) */
  target: string
  text: string
  route?: string
  snippet?: string
  /** 열린 노트: "프로젝트 › 노트 이름 (경로)". 어느 노트를 두고 한 말인지 에이전트가 바로 안다 (10/8 11:42) */
  note?: string
  viewport?: string
  theme?: string
  /** 피드백을 남길 때 돌고 있던 앱의 커밋 (서버가 채운다). 어느 화면 버전을 두고 한 말인지 git에서 찾을 수 있게 */
  version?: string
  /** 코멘트를 남길 때의 화면 그림 (data:image/jpeg|png;base64,…). 저장하면 feedback/pictures/에 파일로 남고 항목에는 경로만 적는다 */
  image?: string
}

const IMAGE = /^data:image\/(jpeg|png);base64,([A-Za-z0-9+/=]+)$/
const MAX_PICTURE = 4 * 1024 * 1024

const HEADING = new RegExp(`^## (\\d{2}:\\d{2}) · (${FEEDBACK_KINDS.join('|')}) · (.+)$`)
/** 항목 머리 아래 정보 줄 (appendFeedback이 쓰는 순서: 화면 · 노트 · 가리킨 글자 · 창 · 앱 버전 · 그림). 읽기와 고치기가 같은 표를 본다 */
const META_LINE = /^- (화면|노트|가리킨 글자|창|앱 버전|그림): (.*)$/
const oneLine = (s: string, max: number) => s.replace(/\s+/g, ' ').trim().slice(0, max)

export function appendFeedback(dir: string, input: FeedbackInput, now = new Date()): FeedbackEntry & { n: number } {
  const entry: FeedbackEntry = {
    kind: input.kind,
    target: oneLine(input.target, 200) || '(부위 없음)',
    text: input.text.replace(/\r\n/g, '\n').trim().slice(0, 4000),
    route: input.route ? oneLine(input.route, 300) : undefined,
    snippet: input.snippet ? oneLine(input.snippet, 120) : undefined,
    note: typeof input.note === 'string' && input.note.trim() ? oneLine(input.note, 300) : undefined,
    viewport: input.viewport ? oneLine(input.viewport, 40) : undefined,
    theme: input.theme ? oneLine(input.theme, 20) : undefined,
    version: input.version ? oneLine(input.version, 40) : undefined,
    date: localDate(now),
    time: localTime(now),
  }
  const file = path.join(dir, `${entry.date}.md`)
  const before = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : `# 피드백 ${entry.date}\n`
  // 같은 분·같은 부위로 이미 남긴 것이 있으면 몇 번째인지 (고치기·지우기에 씀)
  const n = parseFeedback(before, entry.date).filter((e) => e.time === entry.time && e.target === entry.target).length + 1
  const img = input.image ? IMAGE.exec(input.image) : null
  if (img) {
    const data = Buffer.from(img[2]!, 'base64')
    if (data.length > 0 && data.length <= MAX_PICTURE) {
      const base = `${entry.date}-${entry.time.replace(':', '')}`
      let name = `${base}.${img[1] === 'png' ? 'png' : 'jpg'}`
      for (let i = 2; fs.existsSync(path.join(dir, 'pictures', name)); i++) name = `${base}-${i}.${img[1] === 'png' ? 'png' : 'jpg'}`
      fs.mkdirSync(path.join(dir, 'pictures'), { recursive: true })
      fs.writeFileSync(path.join(dir, 'pictures', name), data)
      entry.picture = `pictures/${name}`
    }
  }
  const meta = [
    entry.route && `- 화면: ${entry.route}`,
    entry.note && `- 노트: ${entry.note}`,
    entry.snippet && `- 가리킨 글자: ${entry.snippet}`,
    (entry.viewport || entry.theme) && `- 창: ${[entry.viewport, entry.theme].filter(Boolean).join(' · ')}`,
    entry.version && `- 앱 버전: ${entry.version}`,
    entry.picture && `- 그림: ${entry.picture}`,
  ].filter(Boolean)
  const block = [`## ${entry.time} · ${entry.kind} · ${entry.target}`, ...meta, '', entry.text, ''].join('\n')
  writeAtomic(file, `${before.endsWith('\n') ? before : `${before}\n`}\n${block}`)
  return { ...entry, n }
}

/** 오늘(또는 지정한 날짜) 남긴 피드백. 최근 것부터 */
export function listFeedback(dir: string, date = localDate()): FeedbackEntry[] {
  const file = path.join(dir, `${date}.md`)
  return fs.existsSync(file) ? parseFeedback(fs.readFileSync(file, 'utf8'), date).reverse() : []
}

/** 날짜 파일 하나를 읽는다. 적힌 순서대로 */
export function parseFeedback(md: string, date: string): FeedbackEntry[] {
  const out: FeedbackEntry[] = []
  let cur: FeedbackEntry | null = null
  const body: string[] = []
  const flush = () => { if (cur) { cur.text = body.join('\n').trim(); out.push(cur) } body.length = 0 }
  for (const line of md.split('\n')) {
    const h = HEADING.exec(line)
    if (h) { flush(); cur = { date, time: h[1]!, kind: h[2] as FeedbackKind, target: h[3]! , text: '' }; continue }
    if (!cur) continue
    const m = META_LINE.exec(line)
    if (m && body.every((l) => l.trim() === '')) {
      if (m[1] === '화면') cur.route = m[2]
      else if (m[1] === '노트') cur.note = m[2]
      else if (m[1] === '가리킨 글자') cur.snippet = m[2]
      else if (m[1] === '앱 버전') cur.version = m[2]
      else if (m[1] === '그림') cur.picture = m[2]
      else cur.viewport = m[2]
    } else body.push(line)
  }
  flush()
  return out
}

/**
 * 피드백 처리 기록: feedback/status.yaml. 코딩 에이전트가 고치거나 답할 때 적는다.
 * 맥은 날짜 파일 끝에 계속 덧붙이므로, 처리 기록을 날짜 파일 안에 쓰면 앱 업데이트의 rebase에서 부딪힐 수 있다. 그래서 따로 둔다.
 *
 *   "2026-10-01 15:45 홈 › 제목":
 *     state: 반영        # 유형별 답 (10/9): 수정 → 반영 | 거절 | 확인 필요, 질문 → 답변, 제안 → 동의 | 나중에 | 거절. 보류 · 승인은 이전 기록
 *     commit: 1bd6963
 *     cause: 홈 머리줄이 제목·부제로 두 줄을 차지했다
 *     note: 제목·부제를 빼고 날짜를 머리줄로
 *   "2026-10-01 19:37 왼쪽 띠 › 설정":
 *     state: 반영
 *     merged_into: "2026-10-02 23:10 왼쪽 띠 › 설정"   # 같은 지적을 최신 항목으로 합침
 *
 * 같은 날 같은 키(같은 분·같은 부위)가 또 나오면 뒤의 것은 키 끝에 " #2"를 붙인다.
 */

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v : undefined)

export const STATUS_FILE = 'status.yaml'
/**
 * 사용자의 결정을 묻는 답 (10/9): 수정의 확인 필요, 제안의 동의, 물음(ask)이 붙은 보류 · 답변.
 * 이 답에는 진행 · 중단으로 답하고, 결과를 알린 답(반영 · 답변 · 거절 · 나중에)에는 승인 · 반려로 답한다.
 */
export const feedbackAsks = (st: FeedbackStatus | undefined): boolean => asksUser({ status: st })

/**
 * 사용자의 확인: 반영·답변한 처리를 사용자가 승인하거나 반려한다 (10/4 08:37 피드백 3, 10/4 14:40 "승인/반려로 만들자").
 * feedback/reviews.yaml에 맥 앱만 쓴다 (status.yaml은 Claude만 쓰니 서로 부딪히지 않는다). 키는 status.yaml과 같다.
 *
 *   "2026-10-04 13:52 사이드바 › 프로젝트 목차 › 목차":
 *     verdict: 승인      # 승인 | 반려 | 진행 | 중단 | 논의
 *     at: 2026-10-04T14:50:00+09:00
 *     note: 반려 이유 (있으면)
 *     history:          # 그 전의 승인·반려, 오래된 것부터 (10/4 18:11 "반려한 지적을 댓글처럼"). 위의 셋이 늘 최신
 *       - { verdict: 반려, at: 2026-10-04T13:10, note: ... }
 *
 *     comments:         # 코멘트 (10/8): 묻거나 덧붙인 말. 승인·반려는 그대로이고, Claude가 status.yaml replies에 답할 때까지 대기
 *       - { at: 2026-10-04T15:10, note: 왜 진한 회색이야? }
 *
 * 글을 고치면 그 글에 edited: <고친 시각>이 붙는다(승인·반려·코멘트 모두).
 * 반려한 항목은 Claude가 다시 처리하고 status.yaml에 rework: <그 at>을 적을 때까지 대기로 보인다.
 *
 * 결정을 묻는 답(10/9, feedbackAsks)에는 승인 · 반려 대신 진행 · 중단. 중단은 그대로 끝(승인처럼 완료). 진행(결과 답에도, 11/8) · 논의(11/8, 고치지 않고 시안 · 물음으로)는
 * 반려처럼 Claude가 다시 처리(rework)할 때까지 대기.
 */
export const REVIEW_FILE = 'reviews.yaml'

const verdictEntry = (v: unknown): FeedbackVerdictEntry | null => {
  const r = v as { verdict?: unknown; at?: unknown; note?: unknown; edited?: unknown } | null
  if (!r || typeof r !== 'object' || !FEEDBACK_VERDICTS.includes(r.verdict as FeedbackVerdict) || r.at == null) return null
  return { verdict: r.verdict as FeedbackVerdict, at: String(r.at), ...(typeof r.note === 'string' && r.note.trim() && { note: r.note }), ...(r.edited != null && { edited: String(r.edited) }) }
}
const commentEntry = (v: unknown): FeedbackComment | null => {
  const r = v as { at?: unknown; note?: unknown; edited?: unknown } | null
  if (!r || typeof r !== 'object' || r.at == null || typeof r.note !== 'string' || !r.note.trim()) return null
  return { at: String(r.at), note: r.note, ...(r.edited != null && { edited: String(r.edited) }) }
}

function readReviewFile(dir: string): Record<string, unknown> {
  const file = path.join(dir, REVIEW_FILE)
  if (!fs.existsSync(file)) return {}
  try { const raw = YAML.parse(fs.readFileSync(file, 'utf8')); return raw && typeof raw === 'object' ? raw as Record<string, unknown> : {} } catch { return {} }
}

/** 항목마다 코멘트 (시각순) */
export function readFeedbackComments(dir: string): Map<string, FeedbackComment[]> {
  const out = new Map<string, FeedbackComment[]>()
  for (const [key, v] of Object.entries(readReviewFile(dir))) {
    const c = (v as { comments?: unknown } | null)?.comments
    const list = Array.isArray(c) ? c.map(commentEntry).filter((x): x is FeedbackComment => !!x) : []
    if (list.length) out.set(key, list)
  }
  return out
}

/** reviews.yaml · status.yaml을 YAML 문서로 열어 고친 뒤 쓴다. 다른 항목과 다른 칸은 그대로 둔다 */
export function editYamlFile<T>(dir: string, name: string, edit: (doc: YAML.Document) => T): T {
  const file = path.join(dir, name)
  const doc = fs.existsSync(file) ? YAML.parseDocument(fs.readFileSync(file, 'utf8')) : new YAML.Document({})
  if (doc.errors.length) throw new Error(t(`${name}을 읽지 못했습니다: ${doc.errors[0]!.message.split('\n')[0]}`, `Could not read ${name}: ${doc.errors[0]!.message.split('\n')[0]}`))
  if (!doc.contents) doc.contents = doc.createNode({}) as never
  const r = edit(doc)
  fs.mkdirSync(dir, { recursive: true })
  writeAtomic(file, doc.toString({ lineWidth: 0 }))
  return r
}
const editReviewFile = <T>(dir: string, edit: (doc: YAML.Document) => T): T => editYamlFile(dir, REVIEW_FILE, edit)

const stamp = (now: Date) => coreStamp('t', now)

/** 코멘트를 하나 더한다 (승인·반려는 그대로) */
export function addFeedbackComment(dir: string, key: string, note: string, now = new Date()): FeedbackComment {
  const comment: FeedbackComment = { at: stamp(now), note: note.trim() }
  return editReviewFile(dir, (doc) => {
    const before = readFeedbackComments(dir).get(key) ?? []
    doc.setIn([key, 'comments'], doc.createNode([...before, comment]))
    return comment
  })
}

/**
 * 내가 쓴 글(승인·반려의 note, 코멘트)을 고친다: at으로 찾고 edited를 붙인다. 찾지 못하면 false.
 * 처리 뒤에 고친 반려 · 코멘트는 다시 Claude 차례가 된다 (feedbackBuckets).
 */
export function editFeedbackNote(dir: string, key: string, at: string, note: string, now = new Date()): boolean {
  const text = note.trim()
  if (!text) return false
  const raw = readReviewFile(dir)[key] as { at?: unknown; history?: unknown; comments?: unknown } | undefined
  if (!raw || typeof raw !== 'object') return false
  const path_ = (): (string | number)[] | null => {
    if (raw.at != null && String(raw.at) === at && verdictEntry(raw)) return [key]
    const h = Array.isArray(raw.history) ? raw.history.findIndex((x) => x && String((x as { at?: unknown }).at) === at) : -1
    if (h >= 0) return [key, 'history', h]
    const c = Array.isArray(raw.comments) ? raw.comments.findIndex((x) => x && String((x as { at?: unknown }).at) === at) : -1
    if (c >= 0) return [key, 'comments', c]
    return null
  }
  const where = path_()
  if (!where) return false
  editReviewFile(dir, (doc) => {
    doc.setIn([...where, 'note'], text)
    doc.setIn([...where, 'edited'], stamp(now))
  })
  return true
}

export function readFeedbackReviews(dir: string): Map<string, FeedbackReview> {
  const out = new Map<string, FeedbackReview>()
  for (const [key, v] of Object.entries(readReviewFile(dir))) {
    const latest = verdictEntry(v)
    if (!latest) continue
    const h = (v as { history?: unknown }).history
    const history = Array.isArray(h) ? h.map(verdictEntry).filter((x): x is FeedbackVerdictEntry => !!x) : []
    out.set(key, { ...latest, ...(history.length && { history }) })
  }
  return out
}

/**
 * 승인·반려를 적는다(verdict). 그 전의 것은 history 끝에 옮겨 남긴다.
 * null이면 마지막 것만 취소한다: history가 있으면 그 마지막이 다시 최신이 되고, 없으면 항목을 지운다.
 * YAML로 읽고 써서 다른 항목은 그대로 둔다.
 */
export function setFeedbackReview(dir: string, key: string, verdict: FeedbackVerdict | null, note?: string, now = new Date()): FeedbackReview | null {
  const before = readFeedbackReviews(dir).get(key)
  const comments = readFeedbackComments(dir).get(key)
  // 코멘트는 승인·반려를 바꾸거나 되돌려도 그대로 남긴다
  const write = (review: FeedbackReview | null) => editReviewFile(dir, (doc) => {
    if (review || comments) doc.set(key, doc.createNode({ ...review, ...(comments && { comments }) })); else doc.delete(key)
    return review
  })
  if (verdict === null) {
    const history = [...(before?.history ?? [])]
    const prev = history.pop()
    return write(prev ? { ...prev, ...(history.length && { history }) } : null)
  }
  const history = before ? [...(before.history ?? []), { verdict: before.verdict, at: before.at, ...(before.note && { note: before.note }), ...(before.edited && { edited: before.edited }) }] : []
  return write({ verdict, at: stamp(now), ...(note?.trim() && { note: note.trim() }), ...(history.length && { history }) })
}
export const feedbackKey = (e: { date: string; time: string; target: string; source?: string }) => `${e.source ? `${e.source} ` : ''}${e.date} ${e.time} ${e.target}`
/** 채팅 미리보기 댓글을 옮겨 적은 날짜 파일이 있는 하위 폴더 */
export const PREVIEW_DIR = 'preview'

/** status.yaml을 읽지 못하면 그 이유. 읽히면 null (피드백 화면이 경고로 보여 준다 — 깨진 파일을 조용히 무시하지 않게) */
export function feedbackStatusError(dir: string): string | null {
  const file = path.join(dir, STATUS_FILE)
  if (!fs.existsSync(file)) return null
  try { YAML.parse(fs.readFileSync(file, 'utf8')); return null } catch (e) { return (e as Error).message.split('\n')[0]! }
}

export function readFeedbackStatus(dir: string): Map<string, FeedbackStatus> {
  const file = path.join(dir, STATUS_FILE)
  const out = new Map<string, FeedbackStatus>()
  if (!fs.existsSync(file)) return out
  let raw: unknown
  try { raw = YAML.parse(fs.readFileSync(file, 'utf8')) } catch { return out }
  if (!raw || typeof raw !== 'object') return out
  for (const [key, v] of Object.entries(raw as Record<string, unknown>)) {
    const st = v as { state?: unknown; commit?: unknown; note?: unknown; theme?: unknown; clean?: unknown; understood?: unknown; cause?: unknown; merged_into?: unknown; area?: unknown; kind?: unknown; rework?: unknown; ask?: unknown; revised?: unknown; handled_at?: unknown; by?: unknown; version?: unknown; pictures?: unknown; mockups?: unknown; replies?: unknown } | null
    if (!st || !FEEDBACK_STATES.includes(st.state as FeedbackState)) continue
    out.set(key, {
      state: st.state as FeedbackState,
      ...(st.commit != null && { commit: String(st.commit) }),
      ...(typeof st.note === 'string' && { note: st.note }),
      ...(typeof st.theme === 'string' && { theme: st.theme }),
      ...(typeof st.clean === 'string' && { clean: st.clean }),
      ...(typeof st.understood === 'string' && { understood: st.understood }),
      ...(typeof st.cause === 'string' && { cause: st.cause }),
      ...(typeof st.merged_into === 'string' && { merged_into: st.merged_into }),
      ...(typeof st.area === 'string' && { area: st.area }),
      ...(FEEDBACK_KINDS.includes(st.kind as FeedbackKind) && { kind: st.kind as FeedbackKind }),
      ...(st.rework != null && { rework: String(st.rework) }),
      ...(typeof st.ask === 'string' && st.ask.trim() && { ask: st.ask }),
      ...(readRevisions(st.revised) && { revised: readRevisions(st.revised) }),
      ...(st.handled_at != null && { handled_at: String(st.handled_at) }),
      ...(str(st.by) && { by: st.by as string }),
      ...(st.version != null && { version: String(st.version) }),
      // 전후 그림은 feedback/ 기준 경로. 폴더를 빼고 파일 이름만 적었어도 pictures/ 안에서 찾는다 (10/10 15:07)
      ...(Array.isArray(st.pictures) && st.pictures.every((x) => typeof x === 'string') && st.pictures.length && { pictures: (st.pictures as string[]).map((x) => (x.includes('/') ? x : `pictures/${x}`)) }),
      ...(readMockups(st.mockups) && { mockups: readMockups(st.mockups) }),
      ...(readReplies(st.replies) && { replies: readReplies(st.replies) }),
    })
  }
  return out
}

/**
 * 모든 날짜의 피드백과 처리 기록. 최근 것부터. n은 같은 날 같은 키(분·부위) 중 몇 번째인지 (고치기·지우기에 씀).
 * 처리 기록에 merged_into가 있고 그 대표 항목이 있으면, 목록에서 빼고 대표 항목의 merged에 붙인다.
 */
export function listAllFeedback(dir: string): FeedbackListItem[] {
  if (!fs.existsSync(dir)) return []
  const status = readFeedbackStatus(dir)
  const reviews = readFeedbackReviews(dir)
  const comments = readFeedbackComments(dir)
  const dated = (d: string) => fs.existsSync(d) ? fs.readdirSync(d).filter((f) => /^\d{4}-\d{2}-\d{2}\.md$/.test(f)) : []
  const files: { file: string; date: string; source?: string; sender?: string }[] = [
    ...dated(dir).map((f) => ({ file: path.join(dir, f), date: f.slice(0, 10), source: undefined })),
    ...dated(path.join(dir, PREVIEW_DIR)).map((f) => ({ file: path.join(dir, PREVIEW_DIR, f), date: f.slice(0, 10), source: '미리보기' })), ...importedDayFiles(dir),
  ]
  const all = files.flatMap(({ file, date, source, sender }) => {
    // 같은 분에 같은 부위로 남긴 코멘트가 또 있으면 뒤의 것부터 " #2", " #3"
    const seen = new Map<string, number>()
    return parseFeedback(fs.readFileSync(file, 'utf8'), date).map((p) => {
      const e: FeedbackEntry = source ? { ...p, source, ...(sender && sender !== source && { sender }) } : p
      const base = feedbackKey(e)
      const n = (seen.get(base) ?? 0) + 1
      seen.set(base, n)
      const key = n > 1 ? `${base} #${n}` : base
      const st = status.get(key)
      const rv = reviews.get(key)
      const cm = comments.get(key)
      return { key, item: { ...e, n, key, ...(st && { status: st }), ...(rv && { review: rv }), ...(cm && { comments: cm }) } as FeedbackListItem }
    })
  })
  // 맥 피드백과 미리보기 댓글을 섞어 최근 것부터 (같은 시각이면 파일에 적힌 뒤의 것이 먼저)
  all.reverse().sort((a, b) => `${b.item.date} ${b.item.time}`.localeCompare(`${a.item.date} ${a.item.time}`))
  const byKey = new Map(all.map((x) => [x.key, x.item]))
  const out: FeedbackListItem[] = []
  for (const { item } of all) {
    const rep = item.status?.merged_into ? byKey.get(item.status.merged_into) : undefined
    if (!rep || rep === item) { out.push(item); continue }
    const { date, time, kind, target, text, n, picture, source } = item
    rep.merged = [...(rep.merged ?? []), { date, time, kind, target, text, n, ...(picture && { picture }), ...(source && { source }) }]
  }
  return out
}

/** 에이전트 대화가 적는 처리 기록 하나 (앱 MCP feedback_answer, docs/feedback/agent.md 3–6절) */
export interface FeedbackAnswer {
  state?: FeedbackState
  note?: string
  understood?: string
  cause?: string
  clean?: string
  ask?: string
  /** 수정 요청을 다시 처리할 때 그 전 처리가 돌려받은 까닭과 교훈 (revised에 적는다) */
  miss?: FeedbackMiss
  lesson?: string
  /** PR 번호 "#n" */
  commit?: string
  /** feedback/ 기준 [전, 후] */
  pictures?: string[]
  /** 붙인 시안 (feedback/ 기준, feedbackMockups.ts). state가 없으면 지금 처리에 더한다 */
  mockups?: string[]
  replies?: { to: string; note: string; mockups?: string[] }[]
}

/**
 * 처리 기록(status.yaml) 한 항목을 앱이 대신 적는다: 에이전트는 이 파일을 직접 고치지 않는다 (10/21 "앱 안 대화 + CI가 시험").
 * - state가 있으면 처리를 새로 적는다. 수정 요청 · 진행 · 논의로 다시 처리하는 것이면 그 전 처리를 revised에 { at: 그 답의 at, … }로 옮기고 rework를 적는다.
 * - replies는 코멘트에 단 답으로 더한다 (처리는 그대로).
 * handled_at · replies.at은 이 컴퓨터의 시간대로 시간대 표기 없이 (규약 6절). 다른 항목과 칸은 그대로 둔다.
 */
export function writeFeedbackAnswer(dir: string, key: string, a: FeedbackAnswer, by = 'claude', now = new Date()): { state?: FeedbackState; replies: number } {
  const item = listAllFeedback(dir).find((e) => e.key === key)
  if (!item) throw new Error(t(`그 피드백을 찾지 못했습니다: ${key}`, `That feedback was not found: ${key}`))
  const at = stamp(now)
  return editYamlFile(dir, STATUS_FILE, (doc) => {
    const raw = ((doc.toJS() ?? {}) as Record<string, Record<string, unknown> | undefined>)[key]
    if (a.state) {
      const back = item.review && agentTurns(item, now.getTime()).some((x) => x === 'rework' || x === 'proceed' || x === 'discuss') ? item.review.at : undefined // 논의도 다시 처리: 안 옮기면 앞 처리가 덮여 사라진다 (11/20)
      const revised = Array.isArray(raw?.revised) ? [...(raw!.revised as unknown[])] : []
      if (back && raw?.state) {
        const keep = (k: string) => (raw[k] != null && raw[k] !== '' ? { [k]: String(raw[k]) } : {})
        revised.push({ at: back, ...keep('understood'), ...keep('cause'), ...keep('note'), ...keep('commit'), ...keep('handled_at'), ...keep('by'), ...(Array.isArray(raw.pictures) && { pictures: raw.pictures }), ...(Array.isArray(raw.mockups) && { mockups: raw.mockups }), ...(a.miss && { miss: a.miss }), ...(a.lesson && { lesson: a.lesson }) })
      }
      const next: Record<string, unknown> = {
        state: a.state,
        ...(raw?.theme != null && { theme: raw.theme }),
        ...(raw?.area != null && { area: raw.area }),
        ...((a.clean ?? raw?.clean) != null && { clean: a.clean ?? raw!.clean }),
        ...(a.understood && { understood: a.understood }),
        ...(a.cause && { cause: a.cause }),
        note: a.note,
        ...(a.ask && { ask: a.ask }),
        ...(a.commit && { commit: a.commit }),
        handled_at: at,
        by,
        ...((back ?? raw?.rework) != null && { rework: back ?? raw!.rework }),
        ...(a.pictures?.length && { pictures: a.pictures }),
        ...(a.mockups?.length && { mockups: a.mockups }),
        ...(revised.length && { revised }),
        ...(Array.isArray(raw?.replies) && { replies: raw!.replies }),
        ...(raw?.merged_into != null && { merged_into: raw.merged_into }),
      }
      doc.set(key, doc.createNode(next))
    } else if (a.mockups?.length) {
      if (!raw?.state) throw new Error(t('시안을 붙일 처리가 아직 없습니다. state와 함께 보내세요', 'There is no handling to attach mockups to yet. Send them with a state'))
      doc.setIn([key, 'mockups'], doc.createNode([...(Array.isArray(raw.mockups) ? raw.mockups : []), ...a.mockups]))
    }
    const replies = a.replies ?? []
    if (replies.length) {
      const before = (doc.toJS() as Record<string, { replies?: unknown[] }>)[key]?.replies ?? []
      if (!doc.has(key)) doc.set(key, doc.createNode({}))
      doc.setIn([key, 'replies'], doc.createNode([...before, ...replies.map((r) => ({ at, to: r.to, note: r.note, by, ...(r.mockups?.length && { mockups: r.mockups }) }))]))
    }
    return { ...(a.state && { state: a.state }), replies: replies.length }
  })
}

/**
 * 남긴 피드백 하나의 글을 고치거나(text) 지운다(text === null). 화면 정보는 그대로 두고, 머리줄은 kind를 줄 때만 유형을 바꾼다.
 * 찾는 기준: 날짜 파일, 시각, 부위, 같은 키 중 몇 번째(n). 처리 기록(status.yaml)은 날짜 · 시각 · 부위로 이어져 있어 유형을 바꿔도 그대로다.
 */
export function editFeedback(dir: string, at: { date: string; time: string; target: string; n?: number }, text: string | null, kind?: FeedbackPickableKind): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(at.date)) return false
  const file = path.join(dir, `${at.date}.md`)
  if (!fs.existsSync(file)) return false
  const lines = fs.readFileSync(file, 'utf8').split('\n')
  let seen = 0
  let start = -1
  for (let i = 0; i < lines.length; i++) {
    const h = HEADING.exec(lines[i]!)
    if (h && h[1] === at.time && h[3] === at.target && ++seen === (at.n ?? 1)) { start = i; break }
  }
  if (start < 0) return false
  let end = lines.findIndex((l, i) => i > start && HEADING.test(l))
  if (end < 0) end = lines.length
  if (text === null) {
    // 앞의 빈 줄까지 함께 지운다
    const from = start > 0 && lines[start - 1] === '' ? start - 1 : start
    lines.splice(from, end - from)
  } else {
    let body = start + 1
    // 등록 때 쓴 정보 줄(appendFeedback의 meta)은 모두 건너뛴다. 하나라도 빠지면 그 아래 줄이 본문으로 읽혀 지워진다
    while (body < end && META_LINE.test(lines[body]!)) body++
    const clean = text.replace(/\r\n/g, '\n').trim().slice(0, 4000)
    if (!clean) return false
    lines.splice(body, end - body, '', ...clean.split('\n'), '')
    if (kind) lines[start] = `## ${at.time} · ${kind} · ${at.target}`
  }
  writeAtomic(file, lines.join('\n'))
  return true
}
