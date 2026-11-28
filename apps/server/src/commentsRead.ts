import fs from 'node:fs'
import path from 'node:path'
import { hashOf, isBackupCopy } from './fsutil.js'
import { ANSWER_RE, COMMENT_STATES, type CommentState } from './commentFormat.js'
import { WorkbenchError } from './workbench.js'
import { HIGHLIGHT_COLORS, type HighlightColor } from './paperComments.js'
import type { z } from 'zod'
import { RECORD_AUTHOR_RE, RECORD_AUTHOR_REQUIRED_FROM, USER_ANSWER_BY, type CommentAnswer, type CommentEntry, type CommentFile, type CommentKind, type NoteHighlight, type PendingQuestion, type RecordFile as RecordGroup } from '@rw/core/contract/comments'
import { t } from './i18n.js'

export const COMMENTS_DIR = 'comments'
/** 코멘트는 예전 입력과 논문 라이브러리의 호환 타입. 노트에는 메모로 저장한다. */
export const COMMENT_KINDS: CommentKind[] = ['메모', '할 일', '질문', '지시', '하이라이트', '코멘트']
/** 에이전트가 움직이는 기록: 질문은 답하고, 지시는 하고 답한다 (10/15). 상태는 대기 · 답함 · 끝냄 */
export const isAgentKind = (kind: string) => kind === '질문' || kind === '지시'
/**
 * 사용자 차례인 기록 (10/15): 에이전트가 쓴(by) 질문 · 지시가 대기. 사용자가 이어 쓰면 답함이 된다.
 * 사용자가 쓴 질문 · 지시의 대기는 에이전트 차례다.
 */
export const isUserTurnRecord = (c: Pick<CommentEntry, 'kind' | 'by' | 'state'>) => isAgentKind(c.kind) && Boolean(c.by) && c.state === '대기'

// 응답 모양은 API 계약(@rw/core/contract/comments)에 있다

const TARGET_RE = /^[a-z]+(?:-[A-Za-z0-9._-]{1,160})?$/
export const HEAD_RE = /^## (c-[\w-]+) · (.+?) · (.*)$/
export const STATE_RE = /^- 상태: (\S+)\s*$/
export const META_RE = /^<!-- rw: (\{.*\}) -->$/
export const SOURCE_RE = /^<!-- rw-source: (.+) -->$/

export function commentsFile(root: string, target: string): string {
  if (!TARGET_RE.test(target) || target.includes('..')) throw new WorkbenchError(400, t(`코멘트 대상 이름이 올바르지 않음: ${target}`, `Invalid comment target name: ${target}`))
  return path.join(root, COMMENTS_DIR, `${target}.md`)
}

export function parseComments(target: string, text: string): CommentFile {
  const lines = text.split(/\r?\n/)
  let title = target
  let source: string | undefined
  const comments: CommentEntry[] = []
  const highlights: NoteHighlight[] = []
  let cur: CommentEntry | null = null
  let ans: CommentAnswer | null = null
  let buf: string[] = []
  let quotes: string[] = []
  let quoteMultiline = false
  const flush = () => {
    const body = buf.join('\n').trim()
    if (ans) ans.body = body
    else if (cur) cur.body = body
    if (cur && quotes.length) {
      // 예전 수동 파일은 줄마다 따옴표를 닫았다. 새 여러 줄 선택은 처음과 끝만 감싼다.
      cur.quote = !quoteMultiline && quotes.length > 1 && quotes.every((q) => /^".*"$/.test(q.trim()))
        ? quotes.map((q) => q.trim().slice(1, -1)).join(' ')
        : quotes.join('\n').replace(/^"([\s\S]*)"$/, '$1')
    }
    quotes = []
    buf = []
  }
  for (const line of lines) {
    const head = HEAD_RE.exec(line)
    if (head) {
      flush()
      ans = null
      quoteMultiline = false
      const kind: CommentKind = (head[2] !== '코멘트' && COMMENT_KINDS.find((k) => k === head[2])) || '메모'
      const where = head[3]!.trim()
      const page = /^p\.(\d+)/.exec(where)
      const lineNo = /^L(\d+)$/.exec(where)
      cur = { id: head[1]!, kind, where, page: page ? Number(page[1]) : undefined, ...(lineNo && { line: Number(lineNo[1]) }), rects: [], body: '', state: isAgentKind(kind) || kind === '할 일' ? '대기' : null, answers: [] }
      if (kind === '하이라이트') {
        const h: NoteHighlight = { ...cur, kind, color: 'yellow' }
        cur = h
        highlights.push(h)
      } else comments.push(cur)
      continue
    }
    if (!cur) {
      const h1 = /^# (.+)$/.exec(line)
      if (h1) title = h1[1]!.replace(/^코멘트 · /, '').trim()
      const src = SOURCE_RE.exec(line)
      if (src) source = src[1]!.trim()
      continue
    }
    const a = ANSWER_RE.exec(line)
    if (a) {
      flush()
      ans = { by: a[1]!.trim(), at: a[2]!.trim(), body: '' }
      cur.answers.push(ans)
      continue
    }
    const st = STATE_RE.exec(line)
    if (st) {
      const state = COMMENT_STATES.find((s) => s === st[1])
      if (state) cur.state = state
      continue
    }
    if (!ans && buf.every((l) => !l.trim())) {
      // 머리 바로 아래: 숨은 좌표 줄, 인용
      const meta = META_RE.exec(line)
      if (meta) {
        try {
          const m: Record<string, unknown> = JSON.parse(meta[1]!)
          if (Array.isArray(m.rects)) cur.rects = m.rects.filter((r): r is number[] => Array.isArray(r) && r.length === 4 && r.every((n) => typeof n === 'number'))
          const color = HIGHLIGHT_COLORS.find((c) => c === m.color)
          if (color) cur.color = color
          if (typeof m.line === 'number' && Number.isInteger(m.line) && m.line > 0) cur.line = m.line
          if (typeof m.prefix === 'string') cur.prefix = m.prefix
          if (typeof m.suffix === 'string') cur.suffix = m.suffix
          if (m.quoteMultiline === true) quoteMultiline = true
          if (m.unsorted === true) cur.unsorted = true
          if (m.split === true) cur.split = true
          if (m.pinned === true) cur.pinned = true
          if (typeof m.journal === 'string') cur.journal = m.journal
          if (typeof m.journalIndex === 'number' && Number.isInteger(m.journalIndex) && m.journalIndex >= 0) cur.journalIndex = m.journalIndex
          if (m.edit === '질문' || m.edit === '수정') cur.edit = m.edit
          if (typeof m.editBase === 'string') cur.editBase = m.editBase
          if (typeof m.part === 'string' && m.part) cur.part = m.part
          if (typeof m.partText === 'string' && m.partText) cur.partText = m.partText
          if (typeof m.by === 'string' && RECORD_AUTHOR_RE.test(m.by)) cur.by = m.by
          if (m.src === 'user' || m.src === 'app') cur.src = m.src
          if (typeof m.todo === 'string' && /^c-[\w-]+$/.test(m.todo)) cur.todo = m.todo
        } catch { /* 깨진 숨은 줄은 무시 */ }
        continue
      }
      if (line.startsWith('> ')) {
        quotes.push(line.slice(2))
        continue
      }
    }
    buf.push(line)
  }
  flush()
  for (const c of [...comments, ...highlights]) if (lacksAuthor(c)) c.noAuthor = true
  return { target, title, source, hash: hashOf(text), comments, highlights }
}

/** 노트 본문 위치: /answer와 앵커 재탐색이 같은 규칙을 쓴다. 저장소 밖 경로는 읽지 않는다. */
export function commentSourceFile(root: string, file: Pick<CommentFile, 'target' | 'source'>): string | undefined {
  if (!file.source || path.isAbsolute(file.source) || file.source.split(/[\\/]/).includes('..')) return undefined
  const repo = path.dirname(root)
  const candidates = /^(note|calc|concept)-/.test(file.target) ? [path.join(repo, file.source)] : []
  for (const candidate of candidates) {
    try {
      const relative = path.relative(fs.realpathSync(repo), fs.realpathSync(candidate))
      if (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative) && fs.statSync(candidate).isFile()) return candidate
    } catch { /* 없는 파일이면 다음 확장자를 본다 */ }
  }
  return undefined
}

export function reanchor(root: string, file: CommentFile): CommentFile {
  const entries = [...file.comments, ...file.highlights].filter((c) => c.quote && !c.page)
  if (!entries.length) return file
  const source = commentSourceFile(root, file)
  if (!source) return file
  let text: string
  try { text = fs.readFileSync(source, 'utf8').replace(/\r\n/g, '\n') } catch { return file }
  // 줄 시작 위치. 일치마다 앞부분을 잘라 세지 않고 이진 탐색으로 줄 번호를 얻는다(짧은 인용은 일치가 수백 개)
  const starts = [0]
  for (let i = text.indexOf('\n'); i !== -1; i = text.indexOf('\n', i + 1)) starts.push(i + 1)
  const lineAt = (pos: number): number => {
    let lo = 0, hi = starts.length - 1
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (starts[mid]! <= pos) lo = mid; else hi = mid - 1 }
    return lo + 1
  }
  for (const entry of entries) {
    const quote = entry.quote!.replace(/\r\n/g, '\n')
    const prefix = (entry.prefix ?? '').replace(/\r\n/g, '\n')
    const suffix = (entry.suffix ?? '').replace(/\r\n/g, '\n')
    const nearest = (needle: string, offset: number): number | undefined => {
      let found: number | undefined
      let distance = Infinity
      for (let at = text.indexOf(needle); at !== -1; at = text.indexOf(needle, at + 1)) {
        const line = lineAt(at + offset)
        const d = Math.abs(line - (entry.line ?? 1))
        if (d < distance) { found = line; distance = d }
      }
      return found
    }
    const line = nearest(prefix + quote + suffix, prefix.length) ?? nearest(quote, 0)
    if (line !== undefined) { entry.line = line; delete entry.lost }
    // 줄을 저장하지 않던 예전 인용은 공백을 합쳤으므로, 원문과 달라도 분실로 단정하지 않는다.
    else if (entry.line !== undefined) entry.lost = true
  }
  return file
}

export function readComments(root: string, target: string): CommentFile {
  const file = commentsFile(root, target)
  if (!fs.existsSync(file)) return { target, title: target, hash: '', comments: [], highlights: [] }
  return reanchor(root, parseComments(target, fs.readFileSync(file, 'utf8')))
}

/** 이 프로젝트의 코멘트 파일들 (이름순). 목록에서는 각 노트 본문을 읽어 앵커를 다시 찾지 않는다. */
export function listComments(root: string): CommentFile[] {
  const dir = path.join(root, COMMENTS_DIR)
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir)
    .filter((n) => n.endsWith('.md') && !n.startsWith('.') && !isBackupCopy(n) && TARGET_RE.test(n.slice(0, -3)))
    .sort()
    .map((n) => parseComments(n.slice(0, -3), fs.readFileSync(path.join(dir, n), 'utf8')))
}

/** 프로젝트 적기: 프로젝트 기록을 먼저, 노트별 기록을 그 뒤에 둔다. 인용 위치는 읽을 때 다시 찾는다. */
/** projectTitle이 null이면(지식 라이브러리) 빈 프로젝트 묶음을 더하지 않는다: 라이브러리에는 프로젝트가 없다 (10/18) */
export function listRecords(root: string, projectTitle: string | null): RecordGroup[] {
  const files = listComments(root)
  if (projectTitle !== null && !files.some((file) => file.target === 'project')) files.unshift({ target: 'project', title: projectTitle, hash: '', comments: [], highlights: [] })
  return files.sort((a, b) => a.target === 'project' ? -1 : b.target === 'project' ? 1 : a.target.localeCompare(b.target))
    .filter((file) => (file.target === 'project' && projectTitle !== null) || file.comments.length > 0)
    .map((file) => {
      const { highlights: _highlights, ...group } = reanchor(root, file)
      return group
    })
}

/** 에이전트 함: 아직 답이 없는 질문 (kind = '지시'면 아직 하지 않은 지시) */
export function pendingQuestions(root: string, kind: '질문' | '지시' = '질문'): PendingQuestion[] {
  return listComments(root).flatMap((f) => f.comments
    // 에이전트가 사용자에게 물은 것(by)은 에이전트 함이 아니라 사용자 차례다
    .filter((c) => c.kind === kind && c.state === '대기' && !c.by)
    .map((c) => {
      const last = c.answers.at(-1)
      const todo = c.todo ? f.comments.find((x) => x.id === c.todo && x.kind === '할 일') : undefined
      return { target: f.target, title: f.title, source: f.source, file: `workbench/${COMMENTS_DIR}/${f.target}.md`, id: c.id, where: c.where, quote: c.quote, body: c.body, ...(last && { lastAnswer: { by: last.by, body: last.body } }), ...(todo && { todo: { id: todo.id, body: todo.body } }) }
    }))
}

/** 에이전트가 물은 질문에 사용자가 답한 것 (10/16): 에이전트가 그 답을 읽고 반영한 뒤 answer_record로 끝냄으로 닫는다 */
export function userReplies(root: string): PendingQuestion[] {
  return listComments(root).flatMap((f) => f.comments
    .filter((c) => !!c.by && c.state === '답함' && c.answers.at(-1)?.by === USER_ANSWER_BY)
    .map((c) => ({ target: f.target, title: f.title, source: f.source, file: `workbench/${COMMENTS_DIR}/${f.target}.md`, id: c.id, where: c.where, quote: c.quote, body: c.answers.at(-1)!.body })))
}

/** 종류를 아직 정하지 않은(자동) 기록 (10/16): 사용자가 분류하기 전까지 메모라 에이전트 차례에 들지 않는다 */
export function unsortedRecords(root: string): PendingQuestion[] {
  return listComments(root).flatMap((f) => f.comments
    .filter((c) => c.unsorted && c.state !== '끝냄')
    .map((c) => ({ target: f.target, title: f.title, source: f.source, file: `workbench/${COMMENTS_DIR}/${f.target}.md`, id: c.id, where: c.where, quote: c.quote, body: c.body })))
}

/** 사용자 차례인 기록 수 (왼쪽 띠 · 사이드바 기록 줄의 주황 수) */
export function userTurnRecords(root: string): number {
  return listComments(root).reduce((n, f) => n + f.comments.filter(isUserTurnRecord).length, 0)
}

/** by도 src도 없는 새 기록 (10/21 결정 "기록의 쓴 이"): 그 전 기록은 쓴 이 칸이 없던 때라 사용자로 읽는다 */
function lacksAuthor(c: Pick<CommentEntry, 'id' | 'by' | 'src'>): boolean {
  const day = /^c-(\d{8})/.exec(c.id)?.[1]
  return !c.by && !c.src && !!day && day >= RECORD_AUTHOR_REQUIRED_FROM
}
