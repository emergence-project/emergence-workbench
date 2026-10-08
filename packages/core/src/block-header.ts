/**
 * 블록 파일 맨 위의 주석 머리말.
 *
 *   % ---
 *   % id: kempe-chains
 *   % title: Kempe 사슬 이용
 *   % status: in-progress
 *   % alternatives: [discharging]
 *   % ---
 *
 * 원칙: 머리말을 고쳐도 머리말 아래 본문은 한 바이트도 바꾸지 않는다.
 * 머리말 안에서도 고치지 않은 줄(모르는 키, 사람이 쓴 주석)은 그대로 둔다.
 */

import { tr } from './i18n.js'

export const BLOCK_STATUSES = ['in-progress', 'blocked', 'stopped', 'solved'] as const
export type BlockStatus = (typeof BLOCK_STATUSES)[number]

/** Korean names written into research files (journal lines). Do not translate. */
export const STATUS_LABEL_KO: Record<BlockStatus, string> = {
  'in-progress': '진행',
  blocked: '멈춤',
  stopped: '폐기',
  solved: '해결',
}

/** Names shown on screen, in the app's language. */
export const STATUS_LABEL: Record<BlockStatus, string> = {
  get 'in-progress'() { return tr('진행', 'In progress') },
  get blocked() { return tr('멈춤', 'Blocked') },
  get stopped() { return tr('폐기', 'Dropped') },
  get solved() { return tr('해결', 'Solved') },
}

/** 파일에 쓰는 키 */
export type MetaKey =
  | 'id' | 'title' | 'status' | 'parent' | 'alternatives' | 'next'
  | 'blocked-reason' | 'resume-condition' | 'stopped-reason' | 'created'
  /** 작업노트가 기대는 공유 라이브러리의 개념노트 id 목록 (머리말에만 있고 BlockMeta.extra로 읽힌다) */
  | 'concepts'
  /**
   * 주제·노트 (10/5 결정, BlockMeta.extra로 읽힌다): topics 주제 id 목록(첫째 = 주 주제), kind 노트 성격 하나,
   * description 설명(여러 줄), star 즐겨찾기("true"면 켬). 형식은 planning/mockups/2026-10-05-screens/README.md "자료 형식"
   */
  | 'topics' | 'kind' | 'description' | 'star'

/** 머리말을 고칠 때 쓰는 값. null이면 그 줄을 지운다. */
export type MetaPatch = Partial<Record<MetaKey, string | string[] | null>>

export interface BlockMeta {
  id?: string
  title?: string
  status?: string
  parent?: string
  alternatives: string[]
  next?: string
  blockedReason?: string
  resumeCondition?: string
  stoppedReason?: string
  created?: string
  /** 앱이 모르는 키 (그대로 보존된다) */
  extra: Record<string, string>
}

export interface ParsedBlock {
  meta: BlockMeta
  hasHeader: boolean
  /** 머리말이 끝나는 위치 (본문 시작). 머리말이 없으면 0 */
  bodyStart: number
  /** 본문 첫 줄의 줄 번호 (1부터) */
  bodyStartLine: number
  eol: '\n' | '\r\n'
}

const FENCE = /^%\s*---\s*$/
const ENTRY = /^%\s*([a-z][a-z0-9-]*)\s*:\s?(.*)$/
/**
 * Markdown 보조 노트(blocks/<id>.md, 10/4 결정 "연구노트·보조 노트는 Markdown + KaTeX"):
 * 같은 키를 맨 위 "---" … "---" 머리말에 "key: value"로 적는다 (YAML로도 읽힌다).
 */
const MD_FENCE = /^---\s*$/
const MD_ENTRY = /^([a-z][a-z0-9-]*)\s*:\s?(.*)$/
export type BlockFormat = 'tex' | 'md'
const MAX_HEADER_LINES = 80

type ExtraKey = 'alternatives' | 'concepts' | 'topics' | 'kind' | 'description' | 'star'
/** 여러 줄을 그대로 담는 키: Markdown은 "|-" 블록 글, LaTeX(%)는 따옴표 안 \n 한 줄 */
const MULTILINE_KEYS: ReadonlySet<string> = new Set(['description'])
/** 참·거짓 키: 켜면 true를 따옴표 없이, 끄면 줄을 지운다 */
const FLAG_KEYS: ReadonlySet<string> = new Set(['star'])

const KEY_TO_FIELD: Record<Exclude<MetaKey, ExtraKey>, keyof Omit<BlockMeta, 'alternatives' | 'extra'>> = {
  id: 'id',
  title: 'title',
  status: 'status',
  parent: 'parent',
  next: 'next',
  'blocked-reason': 'blockedReason',
  'resume-condition': 'resumeCondition',
  'stopped-reason': 'stoppedReason',
  created: 'created',
}

/** 줄 단위로 나누되 줄바꿈 문자를 함께 보존한다 */
function splitKeepEol(text: string): string[] {
  return text.match(/[^\r\n]*(?:\r\n|\n|$)/g)?.filter((l, i, a) => l !== '' || i < a.length - 1) ?? []
}

function stripEol(line: string): string {
  return line.replace(/\r?\n$/, '')
}

function detectEol(text: string): '\n' | '\r\n' {
  return /\r\n/.test(text) ? '\r\n' : '\n'
}

/** 머리말 위치: [여는 줄 index, 닫는 줄 index, 형식] 또는 null */
function locateHeader(lines: string[]): [number, number, BlockFormat] | null {
  if (lines.length === 0) return null
  const first = stripEol(lines[0]!)
  if (MD_FENCE.test(first)) {
    for (let i = 1; i < Math.min(lines.length, MAX_HEADER_LINES); i++) {
      if (MD_FENCE.test(stripEol(lines[i]!))) return [0, i, 'md']
    }
    return null
  }
  if (!FENCE.test(first)) return null
  for (let i = 1; i < Math.min(lines.length, MAX_HEADER_LINES); i++) {
    const l = stripEol(lines[i]!)
    if (FENCE.test(l)) return [0, i, 'tex']
    if (!l.startsWith('%')) return null
  }
  return null
}

/** 맨 위 머리말을 찾을 수 있는지 (머리말이 너무 길면 못 찾는다: 고친 뒤 확인용) */
export function hasBlockHeader(content: string): boolean {
  return locateHeader(splitKeepEol(content)) !== null
}

const entryOf = (format: BlockFormat, line: string) => (format === 'md' ? MD_ENTRY : ENTRY).exec(stripEol(line))

export function parseMetaValue(raw: string): string {
  const v = raw.trim()
  // Markdown 머리말은 YAML로도 읽히게 따옴표로 감쌀 때가 있다
  if (v.length >= 2 && v.startsWith('"') && v.endsWith('"')) { try { return String(JSON.parse(v)) } catch { return v } }
  return v
}

export function parseList(raw: string): string[] {
  const v = raw.trim()
  const inner = v.startsWith('[') && v.endsWith(']') ? v.slice(1, -1) : v
  return inner.split(',').map((s) => parseMetaValue(s)).filter(Boolean)
}

export function parseBlock(content: string): ParsedBlock {
  const eol = detectEol(content)
  const lines = splitKeepEol(content)
  const loc = locateHeader(lines)
  const meta: BlockMeta = { alternatives: [], extra: {} }
  if (!loc) return { meta, hasHeader: false, bodyStart: 0, bodyStartLine: 1, eol }

  for (let i = loc[0] + 1; i < loc[1]; i++) {
    const m = entryOf(loc[2], lines[i]!)
    if (!m) continue
    const key = m[1]!
    const value = m[2] ?? ''
    if (key === 'alternatives') meta.alternatives = parseList(value)
    else if (key in KEY_TO_FIELD) meta[KEY_TO_FIELD[key as Exclude<MetaKey, ExtraKey>]] = parseMetaValue(value)
    else meta.extra[key] = loc[2] === 'md' ? mdValue(value, lines.slice(i + 1, continuationEnd(lines, i, loc[1]))) : parseMetaValue(value)
  }
  const bodyStart = lines.slice(0, loc[1] + 1).join('').length
  return { meta, hasHeader: true, bodyStart, bodyStartLine: loc[1] + 2, eol }
}

/**
 * Markdown 머리말에서 키 줄 다음의 이어지는 줄 (YAML처럼: 들여 쓴 줄과 "- " 목록, 그 사이 빈 줄).
 * 돌려주는 값은 이어지는 줄이 끝난 다음 줄의 index (없으면 i + 1)
 */
function continuationEnd(lines: string[], i: number, end: number): number {
  let last = i
  for (let j = i + 1; j < end; j++) {
    const l = stripEol(lines[j]!)
    if (!l.trim()) continue
    if (/^\s/.test(l) || /^-(\s|$)/.test(l)) last = j
    else break
  }
  return last + 1
}

/** 이어지는 줄이 있으면 YAML처럼 읽는다: "|"·">" 블록 글은 줄바꿈 그대로, "- " 목록은 [a, b] */
function mdValue(value: string, more: string[]): string {
  const rows = more.map(stripEol)
  if (!rows.some((l) => l.trim())) return parseMetaValue(value)
  const v = value.trim()
  if (/^[|>][+-]?\d*$/.test(v)) {
    const indent = Math.min(...rows.filter((l) => l.trim()).map((l) => l.match(/^\s*/)![0].length))
    const text = rows.map((l) => l.slice(indent).trimEnd()).join('\n')
    return v.startsWith('>') ? text.replace(/([^\n])\n(?=[^\n\s])/g, '$1 ').trim() : text.replace(/^\n+|\n+$/g, '')
  }
  if (!v && rows.filter((l) => l.trim()).every((l) => /^\s*-(\s|$)/.test(l))) {
    return `[${rows.filter((l) => l.trim()).map((l) => parseMetaValue(l.replace(/^\s*-\s*/, ''))).filter(Boolean).join(', ')}]`
  }
  return [v, ...rows.map((l) => l.trim())].filter(Boolean).map(parseMetaValue).join(' ')
}

/** 한 키의 줄(들): 여러 줄 키는 Markdown이면 "|-" 블록 글, LaTeX면 따옴표 안 \n. 참·거짓 키는 true */
function entryLines(key: string, value: string | string[], fmt: BlockFormat, eol: string): string {
  const head = fmt === 'md' ? `${key}: ` : `% ${key}: `
  if (FLAG_KEYS.has(key) && !Array.isArray(value)) return `${head}true`
  if (MULTILINE_KEYS.has(key) && !Array.isArray(value) && /[\r\n]/.test(value.trim())) {
    const rows = value.trim().split(/\r?\n|\r/).map((l) => l.trimEnd())
    return fmt === 'md' ? [`${key}: |-`, ...rows.map((l) => (l ? `  ${l}` : ''))].join(eol) : `${head}${JSON.stringify(rows.join('\n'))}`
  }
  return `${head}${formatValue(value, fmt)}`
}

function formatValue(value: string | string[], format: BlockFormat = 'tex'): string {
  const one = (s: string) => (format === 'md' ? yamlSafe(oneLine(s), Array.isArray(value)) : oneLine(s))
  if (Array.isArray(value)) return `[${value.map(one).filter(Boolean).join(', ')}]`
  return one(value)
}

/** YAML이 다르게 읽을 글(": ", " #", 기호로 시작, 목록 안의 쉼표)은 따옴표로 */
function yamlSafe(s: string, inList: boolean): string {
  if (!s) return s
  const risky = /^[\s"'{[\]}&*!|>%@`#,?:-]/.test(s) || /:\s|\s#|:$/.test(s) || (inList && /[,[\]{}]/.test(s)) || /^(true|false|null|yes|no|~)$/i.test(s)
  return risky ? JSON.stringify(s) : s
}

function oneLine(s: string): string {
  return s.replace(/\s*[\r\n]+\s*/g, ' ').trim()
}

/**
 * 머리말만 고친다. 본문(머리말 아래)은 원래 문자열을 그대로 이어 붙인다.
 * 머리말이 없으면 새로 만들어 맨 위에 붙인다.
 */
export function updateBlockMeta(content: string, patch: MetaPatch, format: BlockFormat = 'tex'): string {
  const eol = detectEol(content)
  const lines = splitKeepEol(content)
  const loc = locateHeader(lines)
  const entries = Object.entries(patch) as Array<[MetaKey, string | string[] | null | undefined]>

  if (!loc) {
    const added = entries.filter(([, v]) => v !== null && v !== undefined)
    if (added.length === 0) return content
    const header = format === 'md'
      ? ['---', ...added.map(([k, v]) => entryLines(k, v!, 'md', eol)), '---'].join(eol) + eol
      : ['% ---', ...added.map(([k, v]) => entryLines(k, v!, 'tex', eol)), '% ---'].join(eol) + eol
    return header + content
  }
  const fmt = loc[2]

  const header = lines.slice(0, loc[1] + 1)
  const closing = header[loc[1]]!
  const inner = header.slice(1, loc[1])
  const lineEol = (l: string) => (l.endsWith('\r\n') ? '\r\n' : l.endsWith('\n') ? '\n' : eol)

  for (const [key, value] of entries) {
    if (value === undefined) continue
    const idx = inner.findIndex((l) => entryOf(fmt, l)?.[1] === key)
    // Markdown은 그 키의 이어지는 줄(블록 글·목록)까지 함께 바꾼다
    const span = idx < 0 ? 0 : fmt === 'md' ? continuationEnd(inner, idx, inner.length) - idx : 1
    if (value === null) {
      if (idx >= 0) inner.splice(idx, span)
      continue
    }
    const text = entryLines(key, value, fmt, eol)
    if (idx >= 0) inner.splice(idx, span, text + lineEol(inner[idx + span - 1]!))
    else inner.push(text + eol)
  }

  const body = lines.slice(loc[1] + 1).join('')
  return header[0]! + inner.join('') + closing + body
}

export function isBlockStatus(s: unknown): s is BlockStatus {
  return typeof s === 'string' && (BLOCK_STATUSES as readonly string[]).includes(s)
}
