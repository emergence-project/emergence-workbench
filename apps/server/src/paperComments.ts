import fs from 'node:fs'
import path from 'node:path'
import YAML from 'yaml'
import type { CommentEntry, CommentFile } from './comments.js'
import { ANSWER_RE, answerHead, isCommentState } from './commentFormat.js'
import { hashOf, localDate, localTime, writeAtomic } from './fsutil.js'
import { PAPER_COMMENTS_DIR, isSafeKey } from './papers.js'
import { ConflictError, WorkbenchError } from './workbench.js'
import { t } from './i18n.js'
import { frontMatter } from '@rw/core'

/**
 * 논문의 코멘트 · 질문 · 하이라이트 (planning/proposal-2026-10-05-libraries.md §3, 형식은 10/5 사용자 결정).
 * 하나가 파일 하나: research-library/comments/<bib 키>/<id>.md, Markdown + YAML 머리말.
 *
 *   ---
 *   id: c-20261005-101200
 *   kind: 질문                # 코멘트 | 질문 | 하이라이트
 *   state: 대기               # 질문만: 대기 | 답함 | 끝냄
 *   color: yellow            # 하이라이트만: yellow | green | blue | pink
 *   project: sample-research # 어느 프로젝트에서 남겼는지 (없으면 라이브러리에서)
 *   page: 2                  # 0부터 (Zotero의 pageIndex와 같게)
 *   rects: [[72, 640.5, 372, 651.5]]  # PDF 포인트, 쪽 왼쪽 아래 원점 [x1, y1, x2, y2] (Zotero와 같게)
 *   pageHeight: 792          # 위 좌표를 화면 좌표로 바꾸는 데 쓰는 쪽 높이
 *   quote:
 *     exact: 고른 글
 *   created: 2026-10-05T10:12:00+09:00
 *   ---
 *   본문
 *
 *   ### 답 · claude · 2026-10-05 10:14
 *   답
 *
 * 화면(연구노트 PDF와 같은 부품)에는 comments.ts의 CommentFile 모양으로 넘긴다: 쪽은 1부터, 사각형은 왼쪽 위 원점 [x, y, w, h].
 */

export type PaperNoteKind = '메모' | '코멘트' | '질문' | '하이라이트'
export const HIGHLIGHT_COLORS = ['yellow', 'green', 'blue', 'pink'] as const
export type HighlightColor = (typeof HIGHLIGHT_COLORS)[number]

export interface PaperHighlight { id: string; page: number; rects: number[][]; pageHeight: number; color: HighlightColor; quote?: string }
export interface PaperCommentFile extends CommentFile {
  /** 코멘트마다 남긴 프로젝트 (화면의 "이 프로젝트만" 거르기) */
  projects: Record<string, string>
  highlights: PaperHighlight[]
}

interface Front {
  id?: string; kind?: string; state?: string; color?: string; project?: string
  page?: number; rects?: number[][]; pageHeight?: number; quote?: { exact?: string } | string; created?: string
}

const ID_RE = /^c-[\w-]{1,60}$/

function dirOf(lib: string, key: string): string {
  if (!isSafeKey(key)) throw new WorkbenchError(400, t(`올바르지 않은 키: ${key}`, `Invalid key: ${key}`))
  return path.join(lib, PAPER_COMMENTS_DIR, key)
}

function split(text: string): { front: Front; body: string } {
  const f = frontMatter(text)
  if (!f) return { front: {}, body: text }
  let front: Front = {}
  try { front = (YAML.parse(f.yaml) as Front) ?? {} } catch { /* 깨진 머리말은 본문만 */ }
  return { front, body: f.body }
}

/** 고쳐 쓸 때: 머리말이 깨졌으면 쓰지 않는다 (kind · page · rects · quote를 잃지 않게) */
function splitForWrite(text: string): { front: Front; body: string } {
  const f = frontMatter(text)
  let ok = false
  if (f) { try { const v = YAML.parse(f.yaml) as unknown; ok = !!v && typeof v === 'object' && !Array.isArray(v) } catch { ok = false } }
  if (!ok) throw new WorkbenchError(422, t('코멘트 파일의 머리말(---)을 읽을 수 없어 고치지 않았습니다. 파일을 먼저 고쳐 주세요', 'Could not read the comment file front matter (---), so nothing was changed. Fix the file first'))
  return split(text)
}

const join = (front: Front, body: string) => `---\n${YAML.stringify(front, { flowCollectionPadding: false }).replace(/\n$/, '')}\n---\n${body.replace(/^\n+/, '')}`

/** 왼쪽 아래 원점 [x1, y1, x2, y2] ↔ 왼쪽 위 원점 [x, y, w, h] */
const toScreen = (r: number[], h: number) => [r[0]!, round(h - r[3]!), round(r[2]! - r[0]!), round(r[3]! - r[1]!)]
const toZotero = (r: number[], h: number) => [r[0]!, round(h - r[1]! - r[3]!), round(r[0]! + r[2]!), round(h - r[1]!)]
const round = (n: number) => Math.round(n * 100) / 100

function files(dir: string): string[] {
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir).filter((f) => f.endsWith('.md') && !f.startsWith('.') && ID_RE.test(f.slice(0, -3)))
    // 이름순 = 남긴 순서 (같은 초에 남긴 c-…-2가 c-… 뒤에 오게 .md를 떼고 비교)
    .sort((a, b) => a.slice(0, -3).localeCompare(b.slice(0, -3)))
}

export function readPaperComments(lib: string, key: string, title = key): PaperCommentFile {
  const dir = dirOf(lib, key)
  const comments: CommentEntry[] = []
  const highlights: PaperHighlight[] = []
  const projects: Record<string, string> = {}
  let all = ''
  for (const f of files(dir)) {
    const text = fs.readFileSync(path.join(dir, f), 'utf8')
    all += `${f}\n${text}\n`
    const { front, body } = split(text)
    const id = f.slice(0, -3)
    const page = typeof front.page === 'number' ? front.page + 1 : undefined
    const h = typeof front.pageHeight === 'number' ? front.pageHeight : undefined
    const rects = Array.isArray(front.rects) && h ? front.rects.filter((r) => Array.isArray(r) && r.length === 4 && r.every((n) => typeof n === 'number')).map((r) => toScreen(r, h)) : []
    const quote = typeof front.quote === 'string' ? front.quote : front.quote?.exact
    if (front.kind === '하이라이트') {
      if (page && h) highlights.push({ id, page, rects, pageHeight: h, color: HIGHLIGHT_COLORS.includes(front.color as HighlightColor) ? (front.color as HighlightColor) : 'yellow', ...(quote && { quote }) })
      continue
    }
    const kind = front.kind === '질문' ? '질문' : front.kind === '메모' ? '메모' : '코멘트'
    const color = HIGHLIGHT_COLORS.includes(front.color as HighlightColor) ? front.color as HighlightColor : undefined
    const [main = '', ...rest] = body.split(/^(?=### 답 · )/m)
    const answers = rest.map((a) => {
      const [head = '', ...lines] = a.split('\n')
      const m = ANSWER_RE.exec(head)
      return { by: m?.[1] ?? '?', at: m?.[2] ?? '', body: lines.join('\n').trim() }
    })
    const state = kind === '질문' ? ((isCommentState(front.state) ? front.state : undefined) ?? (answers.length ? '답함' : '대기')) : null
    if (front.project) projects[id] = front.project
    comments.push({ id, kind, where: page ? `p.${page}` : '전체', ...(page && { page }), rects, ...(quote && { quote }), ...(color && { color }), body: main.trim(), state, answers })
  }
  return { target: `paper-${key}`, title, source: `${key}.pdf`, hash: hashOf(all), comments, highlights, projects }
}

function newId(dir: string, now: Date): string {
  const base = `c-${localDate(now).replace(/-/g, '')}-${localTime(now).replace(':', '')}${String(now.getSeconds()).padStart(2, '0')}`
  let id = base
  for (let i = 2; fs.existsSync(path.join(dir, `${id}.md`)); i++) id = `${base}-${i}`
  return id
}

export interface NewPaperNote {
  kind?: unknown; text?: unknown; page?: unknown; rects?: unknown; pageHeight?: unknown; quote?: unknown; color?: unknown; project?: unknown
}

/** 새 코멘트 · 질문 · 하이라이트. 쪽은 1부터, 사각형은 화면 좌표(왼쪽 위 원점 [x, y, w, h])로 받는다 */
export function addPaperNote(lib: string, key: string, n: NewPaperNote, now = new Date()): { id: string } {
  const dir = dirOf(lib, key)
  const kind = n.kind === '메모' || n.kind === '질문' || n.kind === '하이라이트' ? n.kind : n.kind === '코멘트' || n.kind === undefined ? '코멘트' : null
  if (!kind) throw new WorkbenchError(400, t('kind는 메모 · 코멘트 · 질문 · 하이라이트 중 하나', 'kind must be one of 메모 · 코멘트 · 질문 · 하이라이트 (memo · comment · question · highlight)'))
  const text = typeof n.text === 'string' ? n.text.trim() : ''
  const quote = typeof n.quote === 'string' ? n.quote.trim().slice(0, 4000) : ''
  const page = typeof n.page === 'number' && Number.isInteger(n.page) && n.page >= 1 ? n.page : undefined
  const h = typeof n.pageHeight === 'number' && n.pageHeight > 0 ? n.pageHeight : undefined
  const rects = Array.isArray(n.rects) ? n.rects.filter((r): r is number[] => Array.isArray(r) && r.length === 4 && r.every((x) => typeof x === 'number' && Number.isFinite(x))).slice(0, 80) : []
  if (kind === '하이라이트' && (!page || !h || !rects.length)) throw new WorkbenchError(400, t('하이라이트에는 쪽과 고른 글의 자리가 필요함', 'A highlight needs a page and the position of the selected text'))
  if (kind !== '하이라이트' && !text && !quote) throw new WorkbenchError(400, t('내용이 비었음', 'The text is empty'))
  const color = HIGHLIGHT_COLORS.includes(n.color as HighlightColor) ? n.color as HighlightColor : kind === '하이라이트' ? 'yellow' : undefined
  const project = typeof n.project === 'string' && /^[\w.-]{1,80}$/.test(n.project) ? n.project : undefined
  const id = newId(dir, now)
  const front: Front = {
    id, kind, ...(kind === '질문' && { state: '대기' }), ...(color && { color }), ...(project && { project }),
    ...(page && { page: page - 1 }), ...(page && h && rects.length && { rects: rects.map((r) => toZotero(r, h)), pageHeight: round(h) }),
    ...(quote && { quote: { exact: quote } }), created: now.toISOString(),
  }
  writeAtomic(path.join(dir, `${id}.md`), join(front, text ? `${text}\n` : ''))
  return { id }
}

function fileOf(lib: string, key: string, id: string): string {
  if (!ID_RE.test(id)) throw new WorkbenchError(400, t(`올바르지 않은 id: ${id}`, `Invalid id: ${id}`))
  const file = path.join(dirOf(lib, key), `${id}.md`)
  if (!fs.existsSync(file)) throw new WorkbenchError(404, t(`없는 코멘트: ${id}`, `No such comment: ${id}`))
  return file
}

function checkHash(lib: string, key: string, baseHash: unknown): void {
  const now = readPaperComments(lib, key).hash
  if (baseHash !== now) throw new ConflictError(t('그사이 코멘트가 바뀌었음', 'The comment changed in the meantime'), now)
}

/** 질문의 상태나 하이라이트의 색을 바꾼다 (그 파일의 머리말만) */
export function updatePaperNote(lib: string, key: string, id: string, change: { state?: unknown; color?: unknown }, baseHash: unknown): void {
  checkHash(lib, key, baseHash)
  const file = fileOf(lib, key, id)
  const { front, body } = splitForWrite(fs.readFileSync(file, 'utf8'))
  if (change.state !== undefined) {
    if (front.kind !== '질문' || !isCommentState(change.state)) throw new WorkbenchError(400, t('질문의 상태는 대기 · 답함 · 끝냄', 'A question state must be 대기 · 답함 · 끝냄 (waiting · answered · closed)'))
    front.state = change.state
  }
  if (change.color !== undefined) {
    if (front.kind !== '하이라이트' || !HIGHLIGHT_COLORS.includes(change.color as HighlightColor)) throw new WorkbenchError(400, t(`색은 ${HIGHLIGHT_COLORS.join(' · ')}`, `color must be ${HIGHLIGHT_COLORS.join(' · ')}`))
    front.color = change.color as HighlightColor
  }
  writeAtomic(file, join(front, body))
}

export function deletePaperNote(lib: string, key: string, id: string, baseHash: unknown): void {
  checkHash(lib, key, baseHash)
  fs.rmSync(fileOf(lib, key, id))
}

/** 질문 아래에 답을 덧붙이고 상태를 답함으로 */
export function appendPaperAnswer(lib: string, key: string, id: string, by: string, answer: string, now = new Date()): void {
  const file = fileOf(lib, key, id)
  const { front, body } = splitForWrite(fs.readFileSync(file, 'utf8'))
  front.state = '답함'
  writeAtomic(file, join(front, `${body.replace(/\s*$/, '')}\n\n${answerHead(by, now)}\n${answer.trim()}\n`))
}
