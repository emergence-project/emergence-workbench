import fs from 'node:fs'
import path from 'node:path'
import YAML from 'yaml'
import { hashOf, writeAtomic } from './fsutil.js'
import { cleanDescription, takeDescription } from './topics.js'
import { ConflictError, WorkbenchError } from './workbench.js'
import { t } from './i18n.js'
import { stripFrontMatter } from '@rw/core'

/**
 * 연구노트·계산 노트의 카드 정보 (10/4 15:40 피드백 "섹션 목록 숨기고 카드 제목 + 한줄설명으로 카드를"):
 * 노트 폴더의 note.yaml에 summary(한 줄 설명)와 done(완결)을 둔다. summary가 없으면 본문 첫 문단에서 뽑아 보여 준다.
 */
/**
 * 카드 상태 (10/4 17:59·대화 "넷으로, 막힘은 일시 정지"): 없으면 진행 중.
 * paused 일시 정지(무엇을 기다리는 중, 곧 다시) · stopped 정지(그만둠) · done 완결. 예전 done: true는 완결로 읽는다.
 */
export type NoteState = 'active' | 'paused' | 'stopped' | 'done'
export const NOTE_STATES: NoteState[] = ['active', 'paused', 'stopped', 'done']
export interface NoteMeta { summary?: string; summaryAuto?: boolean; done?: boolean; state?: Exclude<NoteState, 'active'>; resume?: string }

const MAX = 140

/**
 * 한 줄 설명 속 수식 `$…$`는 그대로 둔다 (카드가 KaTeX로 그린다, 10/5). 줄바꿈·겹친 빈칸만 하나로 줄인다.
 * 예전에는 기호만 남겨 "cmiACB=0"처럼 뭉개졌다.
 */
const keepMath = (m: string) => `$${m.replace(/\s+/g, ' ').trim()}$`

/** LaTeX 한 문단을 읽을 수 있는 한 줄로: 명령은 내용만, 인용·참조·라벨은 뺀다, 수식은 `$…$` 그대로 */
export function plainLine(tex: string): string {
  const math: string[] = []
  // 수식을 먼저 떼어 두고(아래 명령 지우기가 수식 안을 건드리지 않게) 끝에 되돌린다
  const hold = (m: string) => `\u0000${math.push(keepMath(m)) - 1}\u0000`
  return tex
    .replace(/\\(?:cite[a-z]*|ref|eqref|label|footnote)\*?(?:\[[^\]]*\])*\{[^}]*\}/g, '')
    .replace(/\$([^$]+)\$/g, (_, m: string) => hold(m))
    .replace(/\\\(([^]*?)\\\)/g, (_, m: string) => hold(m))
    .replace(/\\[a-zA-Z]+\*?(?:\[[^\]]*\])?\{([^{}]*)\}/g, '$1')
    .replace(/\\[a-zA-Z]+\*?/g, '')
    .replace(/[{}~]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s+([.,;:])/g, '$1')
    .replace(/\u0000(\d+)\u0000/g, (_, i: string) => math[Number(i)]!)
    .trim()
}

/** 설명을 MAX자 안으로: 문장 끝에서 자르고, 잘려 짝이 맞지 않는 수식은 뺀다 */
function clip(line: string): string {
  if (line.length <= MAX) return line
  const cut = line.slice(0, MAX)
  const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('다. '))
  if (end > 40 && (cut.slice(0, end + 1).match(/\$/g)?.length ?? 0) % 2 === 0) return cut.slice(0, end + 1)
  let head = cut.replace(/\s+\S*$/, '')
  if ((head.match(/\$/g)?.length ?? 0) % 2) head = head.slice(0, head.lastIndexOf('$')).trimEnd()
  return `${head}…`
}

/** 본문 첫 문단(머리 명령·절 제목·환경 경계 줄은 건너뜀)에서 한 줄 설명. 문장 끝에서 자른다 */
export function summaryOf(text: string): string | undefined {
  const start = text.indexOf('\\begin{document}')
  const body = (start >= 0 ? text.slice(start + '\\begin{document}'.length) : text).split('\n').map((l) => l.replace(/(^|[^\\])%.*$/, '$1'))
  const para: string[] = []
  for (const l of body) {
    const t = l.trim()
    if (!t) { if (para.length) break; continue }
    if (/^\\(?:title|author|email|affiliation|date|maketitle|section|subsection|chapter|label|begin|end|tableofcontents|appendix|bibliography|input|include|usepackage|documentclass|newcommand|def)\b/.test(t)) { if (para.length) break; continue }
    para.push(t)
  }
  const line = plainLine(para.join(' '))
  return line ? clip(line) : undefined
}

/** Markdown 노트 본문 첫 문단(머리말·제목·수식 블록·목록 표시는 건너뜀)에서 한 줄 설명 */
export function summaryOfMarkdown(text: string): string | undefined {
  const lines = stripFrontMatter(text).split('\n')
  const para: string[] = []
  let skip = false
  for (const l of lines) {
    const t = l.trim()
    if (/^(```|~~~|\$\$)/.test(t) && !(t.startsWith('$$') && t.length > 4 && t.endsWith('$$'))) { if (para.length) break; skip = !skip; continue }
    if (skip) continue
    if (!t) { if (para.length) break; continue }
    if (/^(#|>|\||---)/.test(t)) { if (para.length) break; continue }
    para.push(t.replace(/^([-*+]|\d+[.)])\s+/, ''))
  }
  const math: string[] = []
  const line = para.join(' ')
    // 수식은 떼어 두었다가 그대로 되돌린다 (안의 *·_가 강조 표시로 지워지지 않게)
    .replace(/\$([^$]+)\$/g, (_, m: string) => `\u0000${math.push(keepMath(m)) - 1}\u0000`)
    // \(…\)도 같은 수식이다: $…$로 바꿔 보인다 (LaTeX 노트의 plainLine과 같게)
    .replace(/\\\(([^]*?)\\\)/g, (_, m: string) => `\u0000${math.push(keepMath(m)) - 1}\u0000`)
    .replace(/\[@[^\]]*\]/g, '')
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, a: string, b?: string) => b ?? a)
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\*\*|__|==|[*`]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s+([.,;:])/g, '$1')
    .replace(/\u0000(\d+)\u0000/g, (_, i: string) => math[Number(i)]!)
    .trim()
  return line ? clip(line) : undefined
}

/**
 * main.tex 옆 note.yaml에서 읽는다. 없으면 본문에서 뽑은 설명 (main.tex가 \input뿐이면 첫 장 파일, more에서).
 * head: 이미 읽은 note.yaml (노트 목록이 같은 파일을 두 번 읽지 않게)
 */
export function readNoteMeta(mainAbs: string, text: string, more: () => string | undefined = () => undefined, head?: Record<string, unknown>): NoteMeta {
  let y: Record<string, unknown> = head ?? {}
  if (!head) try { y = (YAML.parse(fs.readFileSync(path.join(path.dirname(mainAbs), 'note.yaml'), 'utf8')) ?? {}) as Record<string, unknown> } catch { /* 없으면 본문에서 */ }
  // 설명 (10/5 "주제와 노트": description, 여러 줄). 예전 이름 summary:도 같은 뜻으로 읽는다
  const given = [y.description, y.summary].find((v): v is string => typeof v === 'string' && !!v.trim())
  const summary = given === undefined ? undefined : cleanDescription(given)
  const auto = summary ? undefined : mainAbs.endsWith('.md') ? summaryOfMarkdown(text) : summaryOf(text) ?? (() => { const t = more(); return t ? summaryOf(t) : undefined })()
  const state = NOTE_STATES.includes(y.state as NoteState) && y.state !== 'active' ? y.state as Exclude<NoteState, 'active'> : y.done === true ? 'done' : undefined
  const resume = typeof y.resume === 'string' && y.resume.trim() && (state === 'paused' || state === 'stopped') ? y.resume.trim() : undefined
  return { ...(summary ? { summary } : auto ? { summary: auto, summaryAuto: true } : {}), ...(state === 'done' && { done: true }), ...(state && { state }), ...(resume && { resume }) }
}

/**
 * note.yaml의 설명·상태만 고친다 (name·from 등 다른 줄은 그대로). summary는 설명(description:)으로 쓴다:
 * 여러 줄을 지키고 200자까지 (10/5). 빈 설명은 지운다
 */
export function writeNoteMeta(mainAbs: string, patch: { summary?: unknown; done?: unknown; state?: unknown; resume?: unknown }, baseHash?: unknown): void {
  if (!['main.tex', 'note.md'].includes(path.basename(mainAbs))) throw new WorkbenchError(400, t('연구노트·계산 노트만 고칠 수 있음', 'Only research notes and calculation notes can be edited'))
  const file = path.join(path.dirname(mainAbs), 'note.yaml')
  const text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : ''
  // baseHash(노트 목록 줄의 hash = note.yaml의 해시)를 주면 그 뒤 바뀐 note.yaml은 고치지 않는다
  if (baseHash !== undefined && baseHash !== null && baseHash !== hashOf(text)) {
    throw new ConflictError(t('다른 곳에서 note.yaml이 바뀌어 고치지 않았음', 'note.yaml changed elsewhere, so it was not edited'), hashOf(text))
  }
  const doc = text ? YAML.parseDocument(text) : new YAML.Document({})
  if (doc.errors.length) throw new WorkbenchError(400, t(`note.yaml을 읽지 못함: ${doc.errors[0]!.message}`, `Could not read note.yaml: ${doc.errors[0]!.message}`))
  if (patch.summary !== undefined) {
    if (typeof patch.summary !== 'string') throw new WorkbenchError(400, t('summary는 글이어야 함', 'summary must be text'))
    const s = takeDescription(patch.summary)
    doc.delete('summary')
    if (s) doc.set('description', s); else doc.delete('description')
  }
  if (patch.done !== undefined) {
    if (typeof patch.done !== 'boolean') throw new WorkbenchError(400, t('done은 참·거짓이어야 함', 'done must be true or false'))
    patch = { ...patch, state: patch.done ? 'done' : 'active' }
  }
  if (patch.state !== undefined) {
    if (!NOTE_STATES.includes(patch.state as NoteState)) throw new WorkbenchError(400, t(`state는 ${NOTE_STATES.join('·')} 중 하나`, `state must be one of ${NOTE_STATES.join('·')}`))
    doc.delete('done')
    if (patch.state === 'active') doc.delete('state'); else doc.set('state', patch.state)
    if (patch.state === 'active' || patch.state === 'done') doc.delete('resume')
  }
  if (patch.resume !== undefined) {
    if (typeof patch.resume !== 'string') throw new WorkbenchError(400, t('resume은 글이어야 함', 'resume must be text'))
    const r = patch.resume.replace(/\s+/g, ' ').trim().slice(0, 300)
    if (r) doc.set('resume', r); else doc.delete('resume')
  }
  writeAtomic(file, doc.toString({ lineWidth: 0 }))
}
