import fs from 'node:fs'
import path from 'node:path'
import { hashOf, writeAtomic } from './fsutil.js'
import { stamp as coreStamp } from '@rw/core'
import { ANSWER_RE, COMMENT_STATES, type CommentState } from './commentFormat.js'
import { ConflictError, WorkbenchError } from './workbench.js'
import { HIGHLIGHT_COLORS, type HighlightColor } from './paperComments.js'
import { doneJournalChange } from './commentJournal.js'
import { writeLinkedTodoFiles, type LinkedTodoFileChange } from './linkedTodoWrite.js'
import type { AskRunner } from './ask.js'
import { classifyPrompt, parseClassification } from './classify.js'
import type { z } from 'zod'
import { RECORD_AUTHOR_RE, type CommentAnswer, type CommentEntry, type CommentFile, type CommentKind, type NewCommentBody, type NoteHighlight, type PendingQuestion, type RecordFile as RecordGroup } from '@rw/core/contract/comments'
import { t } from './i18n.js'
export { COMMENTS_DIR, COMMENT_KINDS, isAgentKind, isUserTurnRecord, commentsFile, parseComments, commentSourceFile, readComments, listComments, listRecords, pendingQuestions, userReplies, unsortedRecords, userTurnRecords } from './commentsRead.js'
import { COMMENT_KINDS, isAgentKind, HEAD_RE, STATE_RE, META_RE, SOURCE_RE, commentsFile, parseComments, reanchor, readComments } from './commentsRead.js'

/**
 * 노트 본문·PDF에 남기는 기록. 대상마다 workbench/comments/<대상>.md 하나.
 * 형식은 docs/repo-format.md §6:
 *
 *   # 코멘트 · 논문 sample2007
 *   <!-- rw-source: sample2007.pdf -->
 *
 *   ## c-20261001-1612 · 질문 · p.4
 *   <!-- rw: {"rects":[[72,140.5,300,11]]} -->
 *   > "the Kempe chain length bounds the cost of a swap"
 *   - 상태: 대기
 *
 *   여기서 속도 상한이 격자 상수에 어떻게 의존하는지?
 *
 *   ### 답 · claude · 2026-10-01 16:40
 *   ...
 *   - 상태: 답함
 *
 *   ## c-20261006-1000 · 메모 · L12
 *   <!-- rw: {"color":"green","line":12,"prefix":"앞 ","suffix":" 뒤"} -->
 *   > "고른 글"
 *
 *   다시 읽을 부분.
 *
 *   ## c-20261006-1001 · 할 일 · 전체
 *   - 상태: 대기
 *
 *   식 (3)의 부호 확인하기.
 *
 *   ## c-20261006-1002 · 하이라이트 · L12
 *   <!-- rw: {"color":"yellow","line":12,"prefix":"앞 ","suffix":" 뒤"} -->
 *   > "고른 글"
 *
 *   ## c-20261006-1003 · 메모 · 전체
 *   <!-- rw: {"unsorted":true} -->
 *
 *   자동으로 적은 분류 전 기록.
 *
 * 예전 코멘트는 메모로 읽기만 한다. 할 일의 정본은 이 파일이다. 끝내면 그날 일지에 "완료"가 rw-todo 줄과 함께 남는다(2026-10-16).
 * 본문 앵커(line·quote·prefix·suffix)는 읽을 때만 다시 찾고, 원문·기록 파일은 고치지 않는다.
 * 여러 줄 선택은 인용 줄에 그대로 쓰고 meta의 quoteMultiline:true로 예전 줄별 인용과 구별한다.
 * 앱은 코멘트를 파일 끝에 덧붙이기만 한다(바깥에서 덧붙인 답을 덮어쓰지 않게).
 * 상태·색·글 바꾸기와 지우기는 읽은 뒤 바뀌지 않았는지(해시) 확인한다.
 */
export type { CommentKind } from '@rw/core/contract/comments'
export { COMMENT_STATES, type CommentState } from './commentFormat.js'
export type { CommentAnswer, CommentEntry, NoteHighlight, CommentFile, RecordFile as RecordGroup, PendingQuestion } from '@rw/core/contract/comments'
/** 서버가 받은 뒤의 모양 (계약 NewCommentBody) */
export type NewComment = z.output<typeof NewCommentBody>
/** 앱 안에서 쓰는 기록 (src: app = 앱이 저절로 남기는 것). HTTP 요청 몸에는 없다 */
type AppComment = NewComment & { src?: 'app' }

const oneLine = (s: string) => s.replace(/\s+/g, ' ').trim()
/** 사용자가 쓴 글 안의 줄이 코멘트 머리·답 머리·상태 줄로 읽히지 않게 */
export const guardBody = (s: string) => s.replace(/\r\n?/g, '\n').trim().split('\n')
  .map((l) => (guarded(l) ? `\\${l}` : l)).join('\n')
const guarded = (l: string) => /^#{1,6} /.test(l) || STATE_RE.test(l) || META_RE.test(l) || SOURCE_RE.test(l)
/** guardBody가 앞에 붙인 \를 뗀다 (답에 든 노트 원문을 그대로 되살릴 때) */
export const unguardBody = (s: string) => s.split('\n').map((l) => (l.startsWith('\\') && guarded(l.slice(1)) ? l.slice(1) : l)).join('\n')

function checkTodoTarget(target: string): void {
  if (target !== 'project' && !/^(note|calc|block|topic|concept)-/.test(target)) throw new WorkbenchError(400, t('할 일은 프로젝트 · 노트 · 주제 · 개념노트에 적습니다', 'To-dos go on a project, note, topic or concept note'))
}

/** Prepare without writing so a classification batch is validated before any record changes. */
function prepareComment(target: string, input: AppComment, now: Date, before: string, options: { storedAnchors?: boolean } = {}) {
  if (input.kind !== '자동' && !COMMENT_KINDS.includes(input.kind)) throw new WorkbenchError(400, t('종류는 메모·할 일·질문·지시·하이라이트·자동', 'kind must be 메모, 할 일, 질문, 지시, 하이라이트, or 자동'))
  const kind = input.kind === '코멘트' || input.kind === '자동' ? '메모' : input.kind
  const text = typeof input.text === 'string' ? input.text.trim() : ''
  // 첫 본문 줄의 Markdown 인용을 고른 글 인용으로 오해하지 않게 한다(답변용 guardBody는 그대로).
  const body = guardBody(text).replace(/^> /, '\\> ')
  const page = Number.isInteger(input.page) && input.page! > 0 ? input.page! : undefined
  // 본문 선택은 앞뒤 공백과 줄바꿈도 앵커의 일부다. PDF 인용은 예전 한 줄 형식을 유지한다.
  // Splits inherit already-stored anchors, including valid values written outside the app.
  const quote = typeof input.quote === 'string' ? (options.storedAnchors ? input.quote : page ? oneLine(input.quote).slice(0, 600) : input.quote.replace(/\r\n?/g, '\n')) : ''
  if (text.length > 20_000 || !options.storedAnchors && quote.length > 20_000) throw new WorkbenchError(400, t('내용이 너무 김', 'The text is too long'))
  if (input.color !== undefined && !HIGHLIGHT_COLORS.includes(input.color)) throw new WorkbenchError(400, t(`색은 ${HIGHLIGHT_COLORS.join(' · ')}`, `The color must be one of ${HIGHLIGHT_COLORS.join(' · ')}`))
  if (kind === '하이라이트' && !input.color) throw new WorkbenchError(400, t('하이라이트에는 색이 필요함', 'A highlight needs a color'))
  const line = Number.isInteger(input.line) && input.line! > 0 ? input.line : undefined
  const rects = options.storedAnchors ? input.rects ?? [] : (Array.isArray(input.rects) ? input.rects : [])
    .filter((r) => Array.isArray(r) && r.length === 4 && r.every((n) => typeof n === 'number' && Number.isFinite(n)))
    .slice(0, 60).map((r) => r.map((n) => Math.round(n * 10) / 10))
  if (!text && !quote.trim() && !(kind === '하이라이트' && page && rects.length)) throw new WorkbenchError(400, t('내용이 필요함', 'Text is required'))

  const parsed = parseComments(target, before)
  const source = before ? parsed.source : (input.source ? oneLine(input.source) : undefined)
  const meta: Record<string, unknown> = {
    ...(rects.length && { rects }), ...(input.color && { color: input.color }), ...(line && { line }),
    ...(typeof input.prefix === 'string' && { prefix: options.storedAnchors ? input.prefix : input.prefix.replace(/\r\n?/g, '\n').slice(-32) }),
    ...(typeof input.suffix === 'string' && { suffix: options.storedAnchors ? input.suffix : input.suffix.replace(/\r\n?/g, '\n').slice(0, 32) }),
    ...(quote.includes('\n') && { quoteMultiline: true }),
    ...(input.kind === '자동' && { unsorted: true }),
    // 가리킨 화면 부위와 그 글자 (10/15 피드백: 피드백 모드처럼 기록이 화면 어디에 대한 것인지 남긴다)
    ...(typeof input.part === 'string' && input.part.trim() && { part: oneLine(input.part).slice(0, 300) }),
    ...(typeof input.partText === 'string' && input.partText.trim() && { partText: oneLine(input.partText).slice(0, 200) }),
    ...((input.edit === '질문' || input.edit === '수정') && kind === '질문' && { edit: input.edit, ...(typeof input.editBase === 'string' && input.editBase && { editBase: input.editBase.slice(0, 200) }) }),
    // 쓴 에이전트 (10/15). 없으면 사용자가 쓴 것
    ...(typeof input.by === 'string' && RECORD_AUTHOR_RE.test(input.by) ? { by: input.by } : { src: input.src === 'app' ? 'app' : 'user' }),
    // 할 일에 대해 묻기 · 맡기기 (10/19): 같은 파일에 있는 할 일에만
    ...(input.todo && { todo: input.todo }),
  }
  if (input.todo) {
    if (!isAgentKind(kind)) throw new WorkbenchError(400, t('할 일에는 질문 · 지시만 이을 수 있음', 'Only a question or instruction can be linked to a to-do'))
    if (!parsed.comments.some((c) => c.id === input.todo && c.kind === '할 일')) throw new WorkbenchError(400, t(`이 기록 묶음에 없는 할 일: ${input.todo}`, `No such to-do in these records: ${input.todo}`))
  }
  if (kind === '할 일') checkTodoTarget(target)
  const taken = new Set([...parsed.comments, ...parsed.highlights].map((c) => c.id))
  const stamp = `c-${coreStamp('compact', now)}`
  let id = stamp
  for (let n = 2; taken.has(id); n++) id = `${stamp}-${n}`

  const out: string[] = []
  if (!before) {
    out.push(`# 코멘트 · ${oneLine(input.title || target)}`)
    if (input.source) out.push(`<!-- rw-source: ${oneLine(input.source)} -->`)
    out.push('', '> 연구 작업대 앱의 기록. 질문에 답할 때는 그 질문 아래에 `### 답 · <이름> · YYYY-MM-DD HH:MM`과 답을 적고, 끝에 `- 상태: 답함`을 덧붙인다. 다른 기록은 고치지 않는다.')
  }
  out.push('', `## ${id} · ${kind} · ${page ? `p.${page}` : line ? `L${line}` : '전체'}`)
  if (Object.keys(meta).length) out.push(`<!-- rw: ${JSON.stringify(meta)} -->`)
  if (quote) out.push(...`"${quote}"`.split('\n').map((l) => `> ${l}`))
  if (isAgentKind(kind) || kind === '할 일') out.push('- 상태: 대기')
  if (body) out.push('', body)
  out.push('')
  const chunk = out.join('\n')
  return { chunk, id, kind, source, body, quote }
}

/** 코멘트 하나를 파일 끝에 덧붙인다. 파일이 없으면 머리와 함께 만든다 */
export function addComment(root: string, target: string, input: AppComment, now = new Date()): { entry: CommentEntry; hash: string } {
  const file = commentsFile(root, target)
  const before = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : ''
  const { chunk, id } = prepareComment(target, input, now, before)
  // 덧붙이기만 한다: 그사이 에이전트가 덧붙인 답이 있어도 덮어쓰지 않는다
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const sep = before && !before.endsWith('\n') ? '\n' : ''
  fs.appendFileSync(file, before ? sep + chunk : `${chunk.replace(/^\n/, '')}`, 'utf8')
  const after = fs.readFileSync(file, 'utf8')
  const saved = parseComments(target, after)
  const entry = [...saved.comments, ...saved.highlights].find((c) => c.id === id)! as CommentEntry
  return { entry, hash: hashOf(after) }
}

/** 코멘트 하나의 줄 범위 [시작, 끝) */
function sectionOf(lines: string[], id: string): [number, number] {
  const start = lines.findIndex((l) => HEAD_RE.exec(l.replace(/\r$/, ''))?.[1] === id)
  if (start < 0) throw new WorkbenchError(404, t(`없는 코멘트: ${id}`, `No such comment: ${id}`))
  let end = lines.findIndex((l, i) => i > start && HEAD_RE.test(l.replace(/\r$/, '')))
  if (end < 0) end = lines.length
  return [start, end]
}

function rewrite(root: string, target: string, baseHash: string, edit: (lines: string[]) => string[],
  extra?: (before: string, next: string) => LinkedTodoFileChange[]): CommentFile {
  const file = commentsFile(root, target)
  if (!fs.existsSync(file)) throw new WorkbenchError(404, t('코멘트 파일이 없음', 'No comment file'))
  const text = fs.readFileSync(file, 'utf8')
  if (hashOf(text) !== baseHash) throw new ConflictError(t('다른 곳에서 코멘트 파일이 바뀌었음', 'The comment file was changed elsewhere'), hashOf(text))
  const next = edit(text.split('\n')).join('\n')
  const currentHash = hashOf(fs.readFileSync(file, 'utf8'))
  if (currentHash !== baseHash) throw new ConflictError(t('다른 곳에서 코멘트 파일이 바뀌었음', 'The comment file was changed elsewhere'), currentHash)
  const linked = extra?.(text, next) ?? []
  if (linked.length) writeLinkedTodoFiles(root, [{ file, before: text, after: next }, ...linked])
  else writeAtomic(file, next)
  return reanchor(root, parseComments(target, next))
}

/** Edit only the heading metadata; body, quotes, answers and unrelated bytes stay intact. */
function classifyHeader(lines: string[], id: string, meta: Record<string, unknown>, kind?: CommentKind): string[] {
  const out = [...lines]
  const [start, end] = sectionOf(out, id)
  const cr = out[start]!.endsWith('\r') ? '\r' : ''
  let lastMeta = -1
  for (let i = start + 1; i < end; i++) {
    const line = out[i]!.replace(/\r$/, '')
    const match = META_RE.exec(line)
    if (match) {
      let value: Record<string, unknown>
      try {
        value = JSON.parse(match[1]!) as Record<string, unknown>
      } catch { throw new WorkbenchError(422, t('기록의 숨은 메타를 읽을 수 없어 고치지 않았습니다', 'Not changed: could not read the hidden metadata of the record')) }
      delete value.unsorted
      out[i] = `<!-- rw: ${JSON.stringify(value)} -->${out[i]!.endsWith('\r') ? '\r' : ''}`
      lastMeta = i
    } else if (line.trim() && !STATE_RE.test(line) && !line.startsWith('> ')) break
  }
  if (lastMeta < 0) out.splice(start + 1, 0, `<!-- rw: ${JSON.stringify(meta)} -->${cr}`)
  else {
    const value = JSON.parse(META_RE.exec(out[lastMeta]!.replace(/\r$/, ''))![1]!) as Record<string, unknown>
    out[lastMeta] = `<!-- rw: ${JSON.stringify({ ...value, ...meta })} -->${out[lastMeta]!.endsWith('\r') ? '\r' : ''}`
  }
  if (kind) {
    out[start] = out[start]!.replace(/^(## c-[\w-]+ · ).+?( · )/, `$1${kind}$2`)
    // A later answer's state still wins; do not replace an agent's answer or state line.
    if (kind === '할 일' || isAgentKind(kind)) out.splice(start + 1, 0, `- 상태: 대기${cr}`)
  }
  return out
}

/** One user-triggered model call; apply only unchanged, still-unsorted records to the latest file. */
export async function classifyComments(root: string, target: string, baseHash: string, runner: AskRunner, cwd: string): Promise<CommentFile> {
  const before = readComments(root, target)
  if (before.hash !== baseHash) throw new ConflictError(t('다른 곳에서 코멘트 파일이 바뀌었음', 'The comment file was changed elsewhere'), before.hash)
  const entries = before.comments.filter((entry) => entry.unsorted)
  if (!entries.length) throw new WorkbenchError(400, t('분류할 기록이 없습니다', 'No records to sort'))
  let classified: ReturnType<typeof parseClassification>
  try {
    const response = await runner({ cwd, prompt: classifyPrompt(entries) })
    classified = parseClassification(response, entries.map((entry) => entry.id))
  } catch { throw new WorkbenchError(502, t('기록을 분류하지 못했습니다. 다시 눌러 주세요', 'Could not sort the records. Try again')) }

  const latest = readComments(root, target)
  const originalBodies = new Map(entries.map((entry) => [entry.id, entry.body]))
  const eligible = (entry: CommentEntry) => entry.unsorted && originalBodies.has(entry.id) && originalBodies.get(entry.id) === entry.body
  if (!latest.comments.some(eligible)) return latest
  const now = new Date()
  const result = rewrite(root, target, latest.hash, (lines) => {
    // Use stored anchors, not the read-time reanchoring supplied to the UI.
    const current = parseComments(target, lines.join('\n'))
    const source = current.source
    let out = lines
    for (const classification of classified) {
      const entry = current.comments.find((entry) => entry.id === classification.id)
      if (!entry || !eligible(entry)) continue
      if (classification.items.length === 1) {
        const kind = classification.items[0]!.kind
        if (kind === '할 일') checkTodoTarget(target)
        out = classifyHeader(out, entry.id, {}, kind)
      } else {
        out = classifyHeader(out, entry.id, { split: true })
        for (const item of classification.items) {
          const text = out.join('\n')
          const prepared = prepareComment(target, {
            kind: item.kind, text: item.text, title: current.title, source,
            quote: entry.quote, color: entry.color, line: entry.line, prefix: entry.prefix, suffix: entry.suffix,
            page: entry.page, rects: entry.rects, part: entry.part, partText: entry.partText, by: entry.by,
          }, now, text, { storedAnchors: true })
          out = (text + (text.endsWith('\n') ? '' : '\n') + prepared.chunk).split('\n')
        }
      }
    }
    return out
  })
  return result
}

export interface CommentChange { state?: CommentState; color?: HighlightColor; text?: string; kind?: CommentKind }

const CHANGEABLE_KINDS: CommentKind[] = ['메모', '할 일', '질문', '지시']
/** 종류 바꾸기 (10/21): 머리의 종류를 바꾸고 상태 줄을 새 종류에 맞춘다(메모는 없음, 나머지는 대기). 분류 전 표시는 뗀다 */
function changeKind(lines: string[], id: string, kind: CommentKind): string[] {
  const out = [...lines]
  const [start, end] = sectionOf(out, id)
  const cr = out[start]!.endsWith('\r') ? '\r' : ''
  out[start] = out[start]!.replace(/^(## c-[\w-]+ · ).+?( · )/, `$1${kind}$2`)
  for (let i = end - 1; i > start; i--) {
    const line = out[i]!.replace(/\r$/, '')
    if (STATE_RE.test(line)) out.splice(i, 1)
    else if (META_RE.test(line)) {
      let value: Record<string, unknown>
      try { value = JSON.parse(META_RE.exec(line)![1]!) as Record<string, unknown> } catch { throw new WorkbenchError(422, t('기록의 숨은 메타를 읽을 수 없어 고치지 않았습니다', 'Not changed: could not read the hidden metadata of the record')) }
      if (value.unsorted) { delete value.unsorted; out[i] = `<!-- rw: ${JSON.stringify(value)} -->${cr}` }
    }
  }
  if (kind !== '메모') {
    // 머리 바로 아래의 숨은 줄 · 인용 다음, 본문 앞에 둔다 (새로 쓸 때와 같은 자리)
    let at = start + 1
    while (at < out.length && (META_RE.test(out[at]!.replace(/\r$/, '')) || out[at]!.startsWith('> '))) at++
    out.splice(at, 0, `- 상태: 대기${cr}`)
  }
  return out
}

/** 머리·메타·인용·상태·답은 건드리지 않고 첫 답 앞의 본문 글만 바꾼다. */
function replaceBody(lines: string[], id: string, body: string): string[] {
  const [start, end] = sectionOf(lines, id)
  const cr = lines[start]!.endsWith('\r') ? '\r' : ''
  let bodyStart = -1
  let bodyEnd = -1
  let answer = end
  for (let i = start + 1; i < end; i++) {
    const line = lines[i]!.replace(/\r$/, '')
    if (ANSWER_RE.test(line)) { answer = i; break }
    if (STATE_RE.test(line)) continue
    if (bodyStart === -1 && (!line.trim() || META_RE.test(line) || line.startsWith('> '))) continue
    if (bodyStart === -1) bodyStart = i
    if (line.trim()) bodyEnd = i
  }
  const out = [...lines]
  if (bodyStart < 0) {
    if (!body) return out
    let at = answer
    while (at > start + 1 && !out[at - 1]!.trim()) at--
    out.splice(at, 0, cr, ...body.split('\n').map((line) => `${line}${cr}`))
    return out
  }
  const replacement = body ? body.split('\n').map((line) => `${line}${cr}`) : []
  // 파일 끝에 개행이 없던 본문은 새 글도 같은 방식으로 끝낸다.
  if (bodyEnd === lines.length - 1 && replacement.length) replacement[replacement.length - 1] = replacement[replacement.length - 1]!.replace(/\r$/, '')
  const states = lines.slice(bodyStart, bodyEnd + 1).filter((line) => STATE_RE.test(line))
  out.splice(bodyStart, bodyEnd - bodyStart + 1, ...replacement, ...states)
  return out
}

/** 한 기록의 상태·색·글을 바꾼다. 다른 절·알 수 없는 메타·답·줄바꿈은 그대로 보존한다. */
/** journal: false면 할 일을 끝내도 일지에 "완료"를 쓰지 않는다 (옛 메모를 옮길 때처럼 오늘 끝낸 일이 아닐 때) */
export function updateComment(root: string, target: string, id: string, change: CommentChange, baseHash: string, { journal = true }: { journal?: boolean } = {}): CommentFile {
  const { state, color, text, kind } = change
  if (kind !== undefined && !CHANGEABLE_KINDS.includes(kind)) throw new WorkbenchError(400, t('종류는 메모 · 할 일 · 질문 · 지시로 바꿀 수 있음', 'The kind can be changed to 메모, 할 일, 질문 or 지시'))
  if (kind !== undefined && state !== undefined) throw new WorkbenchError(400, t('종류와 상태를 함께 바꾸지 않음', 'Change the kind and the state separately'))
  if (state === undefined && color === undefined && text === undefined && kind === undefined) throw new WorkbenchError(400, t('상태나 색, 글이 필요함', 'A state, color, or text is required'))
  if (state !== undefined && !COMMENT_STATES.includes(state)) throw new WorkbenchError(400, t('상태는 대기·답함·끝냄', 'state must be 대기, 답함, or 끝냄'))
  if (color !== undefined && !HIGHLIGHT_COLORS.includes(color)) throw new WorkbenchError(400, t(`색은 ${HIGHLIGHT_COLORS.join(' · ')}`, `The color must be one of ${HIGHLIGHT_COLORS.join(' · ')}`))
  if (text !== undefined && (typeof text !== 'string' || text.length > 20_000)) throw new WorkbenchError(400, t('글은 20,000자 이내여야 함', 'Text must be 20,000 characters or fewer'))
  const result = rewrite(root, target, baseHash, (lines) => {
    const [s, e] = sectionOf(lines, id)
    const record = parseComments(target, lines.slice(s, e).join('\n'))
    const entry = [...record.comments, ...record.highlights][0]!
    if (text !== undefined && !text.trim() && !entry.quote?.trim() && !(entry.kind === '하이라이트' && entry.page && entry.rects.length)) {
      throw new WorkbenchError(400, t('내용이 필요함', 'Text is required'))
    }
    // 메모도 완료할 수 있다 (11/21 안 A3): 끝냄만 적고, 다시 열면(대기) 상태 줄을 지워 표시 없는 메모로 돌아간다
    const memo = entry.kind === '메모' || entry.kind === '코멘트'
    if (state !== undefined && (!isAgentKind(entry.kind) && entry.kind !== '할 일' && !memo || (entry.kind === '할 일' || memo) && state === '답함')) throw new WorkbenchError(400, t('질문·지시는 대기·답함·끝냄, 할 일·메모는 대기·끝냄으로 바꿀 수 있음', 'A question or instruction can be set to 대기, 답함, or 끝냄; a to-do or memo to 대기 or 끝냄'))
    let out = [...lines]
    const cr = lines[s]!.endsWith('\r') ? '\r' : ''
    if (kind !== undefined && kind !== entry.kind) {
      if (!CHANGEABLE_KINDS.includes(entry.kind === '코멘트' ? '메모' : entry.kind)) throw new WorkbenchError(400, t('하이라이트의 종류는 바꾸지 않음', 'A highlight keeps its kind'))
      if (entry.by) throw new WorkbenchError(400, t('에이전트가 쓴 기록의 종류는 바꾸지 않음', 'The kind of a record an agent wrote is not changed'))
      if (entry.answers.length) throw new WorkbenchError(409, t('답이 달린 기록의 종류는 바꾸지 않음', 'The kind of a record with answers is not changed'))
      if (entry.todo || entry.edit) throw new WorkbenchError(400, t('할 일이나 바뀐 곳에서 물은 질문의 종류는 바꾸지 않음', 'A question asked about a to-do or a change keeps its kind'))
      if (kind === '할 일') checkTodoTarget(target)
      out = changeKind(out, id, kind)
    }
    if (state !== undefined) {
      let last = -1
      for (let i = s; i < e; i++) if (STATE_RE.test(lines[i]!)) last = i
      if (memo && state === '대기') { if (last >= 0) out.splice(last, 1) } else if (last >= 0) out[last] = `- 상태: ${state}${lines[last]!.endsWith('\r') ? '\r' : ''}`
      else {
        let at = e
        while (at > s + 1 && !out[at - 1]!.trim()) at--
        out.splice(at, 0, `- 상태: ${state}${cr}`)
      }
    }
    if (color !== undefined) {
      const [, end] = sectionOf(out, id)
      let at = -1
      for (let i = s + 1; i < end; i++) {
        const line = out[i]!.replace(/\r$/, '')
        if (META_RE.test(line)) at = i
        else if (line.trim() && !STATE_RE.test(line) && !line.startsWith('> ')) break
      }
      if (at === -1) out.splice(s + 1, 0, `<!-- rw: ${JSON.stringify({ color })} -->${cr}`)
      else {
        let meta: Record<string, unknown>
        try {
          meta = JSON.parse(META_RE.exec(out[at]!.replace(/\r$/, ''))![1]!) as Record<string, unknown>
          if (!meta || typeof meta !== 'object' || Array.isArray(meta)) throw new Error('meta')
        } catch { throw new WorkbenchError(422, t('기록의 숨은 메타를 읽을 수 없어 고치지 않았습니다', 'Not changed: could not read the hidden metadata of the record')) }
        out[at] = `<!-- rw: ${JSON.stringify({ ...meta, color })} -->${out[at]!.endsWith('\r') ? '\r' : ''}`
      }
    }
    return text === undefined ? out : replaceBody(out, id, guardBody(text).replace(/^> /, '\\> '))
  }, (before, next) => {
    // 할 일을 끝내면 그날 일지에 "완료"를 함께 쓴다. 다시 열거나 글을 고쳐도 지난 완료 기록은 그대로 둔다(있었던 일)
    const was = parseComments(target, before).comments.find((c) => c.id === id)
    const file = parseComments(target, next)
    const now = file.comments.find((c) => c.id === id)
    return journal && was?.kind === '할 일' && was.state !== '끝냄' && now?.state === '끝냄' ? [doneJournalChange(root, file, now)] : []
  })
  return result
}

/** 기존 질문 API와 일지에서 호출하는 상태만의 갱신. */
export function setCommentState(root: string, target: string, id: string, state: CommentState, baseHash: string): CommentFile {
  return updateComment(root, target, id, { state }, baseHash)
}

/** 코멘트를 지운다. 답이 달린 것은 지우지 않는다 (에이전트가 쓴 것을 잃지 않게) */
export function deleteComment(root: string, target: string, id: string, baseHash: string): CommentFile {
  return rewrite(root, target, baseHash, (lines) => {
    const [s, e] = sectionOf(lines, id)
    if (lines.slice(s, e).some((l) => ANSWER_RE.test(l.replace(/\r$/, '')))) throw new WorkbenchError(409, t('답이 달린 코멘트는 지우지 않습니다. 끝냄으로 바꾸세요', 'Comments with answers are not deleted. Set them to 끝냄 instead'))
    const out = [...lines]
    out.splice(s, e - s)
    return out
  })
}
