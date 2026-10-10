import { execFile } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import YAML from 'yaml'
import { localDate, localTime, writeAtomic } from './fsutil.js'
import { currentBranch, locate, pendingPaths, PathSyncError, publishPaths } from './pathsync.js'
import { t } from './i18n.js'

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
export const FEEDBACK_KINDS = ['디자인', '버그', '기능', '수정', '질문', '제안', '미분류'] as const
export type FeedbackKind = (typeof FEEDBACK_KINDS)[number]

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

export interface FeedbackEntry extends Omit<FeedbackInput, 'image'> {
  date: string
  time: string
  /** 화면 그림 경로 (feedback/ 기준, 예: pictures/2026-10-03-1404.jpg) */
  picture?: string
  /** 어디서 남긴 코멘트인지. 없으면 맥 앱의 피드백 모드. '미리보기'는 채팅의 앱 미리보기 댓글을 feedback/preview/날짜.md로 옮긴 것 */
  source?: '미리보기'
}

const IMAGE = /^data:image\/(jpeg|png);base64,([A-Za-z0-9+/=]+)$/
const MAX_PICTURE = 4 * 1024 * 1024

const HEADING = new RegExp(`^## (\\d{2}:\\d{2}) · (${FEEDBACK_KINDS.join('|')}) · (.+)$`)
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
    const m = /^- (화면|노트|가리킨 글자|창|앱 버전|그림): (.*)$/.exec(line)
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
export const FEEDBACK_STATES = ['반영', '거절', '확인 필요', '답변', '동의', '나중에', '보류', '승인'] as const
export type FeedbackState = (typeof FEEDBACK_STATES)[number]
export interface FeedbackStatus {
  state: FeedbackState; commit?: string; note?: string
  /** 주제 (피드백 요구의 묶음) */
  theme?: string
  /** 원문을 문법에 맞게 교정한 문장. 원문은 날짜 파일에 그대로 둔다 */
  clean?: string
  /** 이 피드백에서 읽어 낸 요구 — 틀렸으면 사용자가 고쳐 준다 */
  understood?: string
  /** 왜 그랬는지 (지적 / 원인 / 처리의 원인). 처리는 note와 commit */
  cause?: string
  /** 같은 지적이 되풀이되면 최신 항목 하나로 합친다: 합쳐진 쪽에 대표(최신) 항목의 키를 적는다. 원문은 날짜 파일에 그대로 */
  merged_into?: string
  /** 지적한 화면 부위 (지금 앱 화면의 이름: 홈, 사이드바, 프로젝트 첫 화면 …). 피드백 화면의 기본 묶기 */
  area?: string
  /** Claude가 가린 종류 (디자인·버그·기능·질문). 있으면 날짜 파일의 종류 대신 쓴다 */
  kind?: FeedbackKind
  /** 보류 항목에서 사용자에게 묻는 것 (한 문장). 있으면 피드백 화면의 "내 차례"와 왼쪽 띠의 수에 들어간다 */
  ask?: string
  /** 사용자가 반려한 처리를 다시 했을 때, 그 반려의 시각(reviews.yaml의 at). 같으면 반려가 처리된 것 */
  rework?: string
  /**
   * 다시 처리하기 전의 처리들 (10/8 11:28 대화 형식). 다시 처리할 때 Claude가 지금의 understood · cause · note · commit을
   * 그 반려의 at과 함께 여기 끝에 옮겨 적고 위 칸을 새 글로 바꾼다. 피드백 화면이 주고받음마다 예전 글과 고친 칸을 보인다
   */
  revised?: FeedbackRevision[]
  /** 이 처리(understood · cause · note)를 적은 시각 (2026-10-04T11:20). 피드백 화면의 요약 칸 시각. 다시 처리하면 revised로 함께 옮긴다 */
  handled_at?: string
  /** 처리한 에이전트 (claude · codex). 피드백 화면에 "관리자 (claude)"로 보인다 */
  by?: string
  /** 고친 코드가 들어간 앱 버전 (있으면 commit 대신 보인다) */
  version?: string
  /** 화면을 바꾼 처리의 전후 그림 (feedback/ 기준 경로, [전, 뒤]). 합칠 때 에이전트가 찍어 둔 그림을 feedback/pictures/에 옮겨 적는다 */
  pictures?: string[]
  /** 사용자의 코멘트(reviews.yaml comments)에 단 답. to = 그 코멘트의 at. 답이 없는 코멘트가 있으면 대기 */
  replies?: FeedbackReply[]
}
export interface FeedbackRevision {
  /** 이 처리를 되돌려 보낸 반려의 시각 (reviews.yaml의 at) */
  at: string
  understood?: string
  cause?: string
  note?: string
  commit?: string
  handled_at?: string
  by?: string
}
export interface FeedbackReply {
  /** 답한 시각 */
  at: string
  /** 답한 코멘트의 at */
  to: string
  note: string
  by?: string
}

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v : undefined)

function readReplies(v: unknown): FeedbackReply[] | undefined {
  if (!Array.isArray(v)) return undefined
  const out = (v as Record<string, unknown>[]).flatMap((r) => (r && typeof r === 'object' && r.at != null && r.to != null && str(r.note)
    ? [{ at: String(r.at), to: String(r.to), note: r.note as string, ...(str(r.by) && { by: r.by as string }) }]
    : []))
  return out.length ? out : undefined
}

function readRevisions(v: unknown): FeedbackRevision[] | undefined {
  if (!Array.isArray(v)) return undefined
  const out: FeedbackRevision[] = []
  for (const r of v as Record<string, unknown>[]) {
    if (!r || typeof r !== 'object' || r.at == null) continue
    out.push({
      at: String(r.at),
      ...(typeof r.understood === 'string' && { understood: r.understood }),
      ...(typeof r.cause === 'string' && { cause: r.cause }),
      ...(typeof r.note === 'string' && { note: r.note }),
      ...(r.commit != null && { commit: String(r.commit) }),
      ...(r.handled_at != null && { handled_at: String(r.handled_at) }),
      ...(str(r.by) && { by: r.by as string }),
    })
  }
  return out.length ? out : undefined
}
export const STATUS_FILE = 'status.yaml'
/**
 * 사용자의 결정을 묻는 답 (10/9): 수정의 확인 필요, 제안의 동의, 물음(ask)이 붙은 보류 · 답변.
 * 이 답에는 진행 · 중단으로 답하고, 결과를 알린 답(반영 · 답변 · 거절 · 나중에)에는 승인 · 반려로 답한다.
 */
export const feedbackAsks = (st: { state?: string; ask?: string } | undefined): boolean =>
  !!st && (st.state === '확인 필요' || st.state === '동의' || ((st.state === '보류' || st.state === '답변') && !!st.ask))

/**
 * 사용자의 확인: 반영·답변한 처리를 사용자가 승인하거나 반려한다 (10/4 08:37 피드백 3, 10/4 14:40 "승인/반려로 만들자").
 * feedback/reviews.yaml에 맥 앱만 쓴다 (status.yaml은 Claude만 쓰니 서로 부딪히지 않는다). 키는 status.yaml과 같다.
 *
 *   "2026-10-04 13:52 사이드바 › 프로젝트 목차 › 목차":
 *     verdict: 승인      # 승인 | 반려 | 진행 | 중단
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
 * 결정을 묻는 답(10/9, feedbackAsks)에는 승인 · 반려 대신 진행 · 중단으로 답한다.
 * 진행은 반려처럼 Claude가 다시 처리(rework)할 때까지 대기, 중단은 그대로 끝(승인처럼 완료).
 */
export const REVIEW_FILE = 'reviews.yaml'
export const FEEDBACK_VERDICTS = ['승인', '반려', '진행', '중단'] as const
export type FeedbackVerdict = (typeof FEEDBACK_VERDICTS)[number]
/** 승인·반려 한 번 */
export interface FeedbackVerdictEntry { verdict: FeedbackVerdict; at: string; note?: string; edited?: string }
/** 한 항목의 최신 승인·반려와 그 전의 것들(history, 오래된 것부터). history가 없는 예전 파일도 그대로 읽는다 */
export interface FeedbackReview extends FeedbackVerdictEntry { history?: FeedbackVerdictEntry[] }
/** 코멘트 한 번: 승인·반려를 바꾸지 않는 말 */
export interface FeedbackComment { at: string; note: string; edited?: string }

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

/** reviews.yaml을 YAML 문서로 열어 고친 뒤 쓴다. 다른 항목과 다른 칸은 그대로 둔다 */
function editReviewFile<T>(dir: string, edit: (doc: YAML.Document) => T): T {
  const file = path.join(dir, REVIEW_FILE)
  const doc = fs.existsSync(file) ? YAML.parseDocument(fs.readFileSync(file, 'utf8')) : new YAML.Document({})
  if (doc.errors.length) throw new Error(t(`${REVIEW_FILE}을 읽지 못했습니다: ${doc.errors[0]!.message.split('\n')[0]}`, `Could not read ${REVIEW_FILE}: ${doc.errors[0]!.message.split('\n')[0]}`))
  if (!doc.contents) doc.contents = doc.createNode({}) as never
  const r = edit(doc)
  fs.mkdirSync(dir, { recursive: true })
  writeAtomic(file, doc.toString({ lineWidth: 0 }))
  return r
}

const stamp = (now: Date) => `${localDate(now)}T${localTime(now)}`

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
    const st = v as { state?: unknown; commit?: unknown; note?: unknown; theme?: unknown; clean?: unknown; understood?: unknown; cause?: unknown; merged_into?: unknown; area?: unknown; kind?: unknown; rework?: unknown; ask?: unknown; revised?: unknown; handled_at?: unknown; by?: unknown; version?: unknown; pictures?: unknown; replies?: unknown } | null
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
      ...(Array.isArray(st.pictures) && st.pictures.every((x) => typeof x === 'string') && st.pictures.length && { pictures: st.pictures as string[] }),
      ...(readReplies(st.replies) && { replies: readReplies(st.replies) }),
    })
  }
  return out
}

/** 다른 항목으로 합쳐진 원래 코멘트 (대표 항목 아래에 원문 그대로 보인다) */
export type MergedFeedback = Pick<FeedbackEntry, 'date' | 'time' | 'kind' | 'target' | 'text' | 'source'> & { n: number; picture?: string }
export type FeedbackListItem = FeedbackEntry & {
  n: number; key: string; status?: FeedbackStatus; review?: FeedbackReview; comments?: FeedbackComment[]; merged?: MergedFeedback[]
  /** 반영 커밋이 돌고 있는 앱에 들어 있는가 (서버가 채운다, 모르면 없음) */
  inApp?: boolean
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
  const files = [
    ...dated(dir).map((f) => ({ file: path.join(dir, f), date: f.slice(0, 10), source: undefined })),
    ...dated(path.join(dir, PREVIEW_DIR)).map((f) => ({ file: path.join(dir, PREVIEW_DIR, f), date: f.slice(0, 10), source: '미리보기' as const })),
  ]
  const all = files.flatMap(({ file, date, source }) => {
    // 같은 분에 같은 부위로 남긴 코멘트가 또 있으면 뒤의 것부터 " #2", " #3"
    const seen = new Map<string, number>()
    return parseFeedback(fs.readFileSync(file, 'utf8'), date).map((p) => {
      const e: FeedbackEntry = source ? { ...p, source } : p
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

/**
 * 남긴 피드백 하나의 글을 고치거나(text) 지운다(text === null). 머리줄과 화면 정보는 그대로 둔다.
 * 찾는 기준: 날짜 파일, 시각, 부위, 같은 키 중 몇 번째(n).
 */
export function editFeedback(dir: string, at: { date: string; time: string; target: string; n?: number }, text: string | null): boolean {
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
    while (body < end && /^- (화면|가리킨 글자|창|앱 버전): /.test(lines[body]!)) body++
    const clean = text.replace(/\r\n/g, '\n').trim().slice(0, 4000)
    if (!clean) return false
    lines.splice(body, end - body, '', ...clean.split('\n'), '')
  }
  writeAtomic(file, lines.join('\n'))
  return true
}

export interface PublishResult {
  /** 이번에 새로 만든 커밋 (없으면 null) */
  commit: string | null
  pushed: boolean
  message: string
}

/**
 * 피드백 폴더만 커밋하고 GitHub(추적 중인 원격 브랜치)에 올린다. 클라우드의 에이전트가 읽을 수 있게.
 * - 피드백 폴더 밖의 파일은 커밋하지도 올리지도 않는다. 이미 스테이징된 다른 변경도 그대로 둔다.
 * - 원격에 더 새 커밋이 있어도 작업 트리는 바꾸지 않고, 원격 최신 커밋 위에 피드백만 얹어 올린다(pathsync.ts).
 *   원격에서도 같은 피드백 파일이 다르게 바뀌었으면 멈춘다.
 */
export async function publishFeedback(dir: string, now = new Date()): Promise<PublishResult> {
  if (!fs.existsSync(dir)) return { commit: null, pushed: false, message: t('아직 남긴 피드백이 없습니다', 'No feedback yet') }
  const where = await feedbackRepo(dir)
  // 앱 폴더가 다른 브랜치에 있으면(손으로 바꿔 둔 경우) 그 브랜치에 커밋하지 않는다
  const branch = await currentBranch(where.top)
  if (branch !== 'main') throw new PublishError(t(`앱 폴더가 main이 아닌 ${branch || '분리된 HEAD'}에 있어 피드백을 올리지 않았습니다. 터미널에서 git switch main 뒤 다시 올려 주세요`, `Feedback not pushed: the app folder is on ${branch || 'a detached HEAD'}, not main. Run git switch main in a terminal, then push again`), null)
  try {
    const r = await publishPaths(where.top, [where.rel], { message: `Add app feedback (${localDate(now)})` })
    return {
      commit: r.commit, pushed: r.pushed,
      message: r.pushed ? t(`피드백을 GitHub에 올렸습니다${r.commit ? ` (${r.commit})` : ''}`, `Pushed feedback to GitHub${r.commit ? ` (${r.commit})` : ''}`) : t('올릴 피드백이 없습니다. 이미 GitHub에 있습니다', 'No feedback to push. It is already on GitHub'),
    }
  } catch (e) {
    if (e instanceof PathSyncError) throw new PublishError(e.message, e.commit)
    throw e
  }
}

/** 아직 GitHub에 올리지 않은 피드백 파일 (저장소 기준 경로). 원격은 확인하지 않는다 */
export async function unpublishedFeedback(dir: string): Promise<string[]> {
  if (!fs.existsSync(dir)) return []
  const where = await feedbackRepo(dir).catch(() => null)
  return where ? pendingPaths(where.top, [where.rel]) : []
}

async function feedbackRepo(dir: string): Promise<{ top: string; rel: string }> {
  try { return await locate(dir) } catch { throw new PublishError(t('피드백 폴더가 git 저장소 안에 있지 않습니다', 'The feedback folder is not inside a git repository')) }
}

export class PublishError extends Error {
  constructor(message: string, readonly commit: string | null = null) { super(message) }
}

/**
 * 피드백을 남기는 사람의 GitHub 계정: 피드백 폴더가 든 저장소의 origin 주인 (github.com/<계정>/…).
 * 피드백 화면에 "사용자 (<계정>)"로 보인다. 모르면 null
 */
export async function feedbackAccount(dir: string): Promise<string | null> {
  try {
    const { top } = await locate(dir)
    const url = await new Promise<string>((ok, no) => execFile('git', ['-C', top, 'remote', 'get-url', 'origin'], (e, out) => (e ? no(e) : ok(out.trim()))))
    return /github\.com[:/]([^/]+)\//.exec(url)?.[1] ?? null
  } catch { return null }
}
