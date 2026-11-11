import fs from 'node:fs'
import path from 'node:path'
import YAML from 'yaml'
import type { ConceptRow } from '@rw/core/contract/concepts'
import { StudyKind as KindSchema, StudyState as StateSchema, type StudyBook, type StudyBookRow, type StudyCheckBody, type StudyKind, type StudyRead, type StudyState } from '@rw/core/contract/study'
import { parseBib, type BibEntry } from './materials.js'
import { hashOf, writeAtomic } from './fsutil.js'
import { ConflictError, WorkbenchError } from './workbench.js'
import { t } from './i18n.js'

/**
 * 공부: 책 · 강의 하나가 라이브러리 study/<id>.yaml 하나 (11/10 사용자 결정 "공부는 지식 라이브러리에", 안 A).
 * 장(회차)마다 상태(아직 · 읽는 중 · 끝), 학습 목표, 체크리스트 셋(읽을 것 · 개념노트 · 할 일)을 적는다(11/11 "회차별 계획").
 * 정리는 개념노트에 쌓이고, 이 파일은 계획과 진도만 가진다. 형식은 docs/repo-format.md §10.6.
 */

const ID = /^[a-z0-9][a-z0-9-]{0,80}$/
const CONCEPT_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/
const BIB_KEY = /^[A-Za-z0-9][A-Za-z0-9_:.+-]{0,120}$/

const dir = (lib: string) => path.join(lib, 'study')
const fileOf = (lib: string, id: string) => {
  if (!ID.test(id)) throw new WorkbenchError(400, t('공부 id는 영문 소문자 · 숫자 · 하이픈입니다', 'Study IDs use lowercase letters, digits and hyphens'))
  return path.join(dir(lib), `${id}.yaml`)
}
const needLib = (lib: string | undefined): string => {
  if (!lib) throw new WorkbenchError(409, t('지식 라이브러리가 없습니다', 'There is no knowledge library'))
  return lib
}

interface RawRead { key?: string; at?: string; text?: string; url?: string; done: boolean }
interface RawConcept { id: string; done: boolean }
interface RawTodo { text: string; done: boolean }
interface RawChapter { title: string; state: StudyState; goals: string[]; read: RawRead[]; concepts: RawConcept[]; do: RawTodo[] }
interface RawBook { title: string; kind: StudyKind; source?: string; chapters: RawChapter[] }

const kindOf = (v: unknown): StudyKind => KindSchema.safeParse(v).data ?? '책'
const stateOf = (v: unknown): StudyState => StateSchema.safeParse(v).data ?? '아직'

const rec = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v)) : {})
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : typeof v === 'number' ? String(v) : undefined)

/** 읽을 것: {key, at} 또는 {text, url}. 글자 하나면 bib 키 모양일 때 키, 아니면 글로 본다 */
function readOf(v: unknown): RawRead | null {
  if (typeof v === 'string') return BIB_KEY.test(v.trim()) ? { key: v.trim(), done: false } : v.trim() ? { text: v.trim(), done: false } : null
  const r = rec(v)
  const key = str(r.key); const text = str(r.text)
  if (!(key && BIB_KEY.test(key)) && !text) return null
  return { ...(key && BIB_KEY.test(key) && { key }), ...(str(r.at) && { at: str(r.at) }), ...(text && { text }), ...(str(r.url) && { url: str(r.url) }), done: r.done === true }
}
function conceptOf(v: unknown): RawConcept | null {
  const r = typeof v === 'string' ? { id: v } : rec(v)
  return typeof r.id === 'string' && CONCEPT_ID.test(r.id) ? { id: r.id, done: 'done' in r && r.done === true } : null
}
function todoOf(v: unknown): RawTodo | null {
  const r = typeof v === 'string' ? { text: v } : rec(v)
  const text = str(r.text)
  return text ? { text, done: 'done' in r && r.done === true } : null
}
const some = <T>(xs: (T | null)[]): T[] => xs.filter((x): x is T => x !== null)

/** 사람이 고친 파일도 읽는다: 모르는 값은 기본값으로, 장이 글자 하나면 제목으로 본다 */
export function parseStudy(text: string, id: string): RawBook {
  let data: unknown
  try { data = YAML.parse(text) } catch { data = null }
  const o = rec(data)
  const chapters = arr(o.chapters).map((c): RawChapter => {
    if (typeof c === 'string') return { title: c, state: '아직', goals: [], read: [], concepts: [], do: [] }
    const r = rec(c)
    return { title: String(r.title ?? ''), state: stateOf(r.state), goals: some(arr(r.goals).map((g) => str(g) ?? null)),
      read: some(arr(r.read).map(readOf)), concepts: some(arr(r.concepts).map(conceptOf)), do: some(arr(r.do).map(todoOf)) }
  })
  return { title: typeof o.title === 'string' && o.title.trim() ? o.title : id, kind: kindOf(o.kind),
    ...(typeof o.source === 'string' && o.source && { source: o.source }), chapters }
}

/** 아직 없는 개념노트의 이름: id의 하이픈을 띄어 쓰고 첫 글자를 크게 (이 제목으로 만들면 같은 id가 된다) */
export const planTitle = (id: string) => id.replace(/[-_.]+/g, ' ').replace(/^./, (c) => c.toUpperCase())

/** 화면에 보일 짧은 문헌 이름: 첫 저자 성(둘이면 둘, 셋 넘으면 외) + 연도 */
export function bibLabel(e: Pick<BibEntry, 'author' | 'editor' | 'year' | 'title'>): string {
  const names = (e.author ?? e.editor ?? '').split(/\s+and\s+/).map((a) => (a.includes(',') ? a.split(',')[0]! : a.trim().split(/\s+/).pop() ?? '').replace(/[{}\\'"`^~]/g, '').trim()).filter(Boolean)
  const others = names.at(-1)?.toLowerCase() === 'others'
  const ns = others ? names.slice(0, -1) : names
  const who = ns.length === 0 ? (e.title ?? '') : ns.length > 2 || others ? `${ns[0]} ${t('외', 'et al.')}` : ns.join('–')
  return [who, e.year].filter(Boolean).join(' ')
}

export function listStudy(lib: string | undefined): { enabled: boolean; books: StudyBookRow[] } {
  if (!lib) return { enabled: false, books: [] }
  const d = dir(lib)
  const files = fs.existsSync(d) ? fs.readdirSync(d).filter((f) => f.endsWith('.yaml') && ID.test(f.slice(0, -5))) : []
  const books = files.map((f) => {
    const id = f.slice(0, -5)
    const b = parseStudy(fs.readFileSync(path.join(d, f), 'utf8'), id)
    return { id, title: b.title, kind: b.kind, chapters: b.chapters.length, done: b.chapters.filter((c) => c.state === '끝').length }
  })
  return { enabled: true, books: books.sort((a, b) => a.title.localeCompare(b.title)) }
}

export function readStudy(lib: string | undefined, id: string, rows: (ids: string[]) => ConceptRow[]): StudyBook {
  const file = fileOf(needLib(lib), id)
  if (!fs.existsSync(file)) throw new WorkbenchError(404, t('없는 책 · 강의입니다', 'No such book or lecture'))
  const text = fs.readFileSync(file, 'utf8')
  const b = parseStudy(text, id)
  const all = [...new Set(b.chapters.flatMap((c) => c.concepts.map((x) => x.id)))]
  const found = new Map(rows(all).map((r) => [r.id, r]))
  const bibFile = path.join(needLib(lib), 'references.bib')
  const bib = b.chapters.some((c) => c.read.some((r) => r.key)) && fs.existsSync(bibFile) ? new Map(parseBib(fs.readFileSync(bibFile, 'utf8')).map((e) => [e.key, e])) : new Map<string, BibEntry>()
  const readRow = (r: RawRead): StudyRead => {
    const e = r.key ? bib.get(r.key) : undefined
    return { ...r, label: e ? bibLabel(e) : r.key ?? r.text ?? '', ...(e?.title && { title: e.title }), missing: !!r.key && !e }
  }
  return {
    id, title: b.title, kind: b.kind, ...(b.source && { source: b.source }), hash: hashOf(text),
    chapters: b.chapters.map((c) => ({ ...c, read: c.read.map(readRow), concepts: c.concepts.map(({ id: cid, done }) => {
      const r = found.get(cid)
      return { id: cid, title: r?.title ?? planTitle(cid), checked: r?.checked ?? 'none', missing: !r, done }
    }) })),
  }
}

type ChapterIn = { title: string; state: StudyState; goals?: string[]; read?: { key?: string; at?: string; text?: string; url?: string; done?: boolean }[]; concepts: (string | { id: string; done?: boolean })[]; do?: (string | { text: string; done?: boolean })[] }

function clean(input: { title: string; kind: StudyKind; source?: string; chapters: ChapterIn[] }): RawBook {
  const title = input.title.trim()
  if (!title || title.length > 200) throw new WorkbenchError(400, t('제목을 200자 이내로 적어 주세요', 'Write a title of up to 200 characters'))
  const source = input.source?.trim()
  if (source && !BIB_KEY.test(source)) throw new WorkbenchError(400, t('출처 키가 bib 키 모양이 아닙니다', 'The source is not a bib key'))
  if (input.chapters.length > 500) throw new WorkbenchError(400, t('장은 500개까지입니다', 'Up to 500 chapters'))
  const chapters = input.chapters.map((c): RawChapter => {
    const concepts = c.concepts.map((x) => (typeof x === 'string' ? { id: x, done: false } : { id: x.id, done: x.done === true }))
    const bad = concepts.find((x) => !CONCEPT_ID.test(x.id))
    if (bad) throw new WorkbenchError(400, t(`개념노트 id가 아닙니다: ${bad.id}`, `Not a concept note ID: ${bad.id}`))
    const read = (c.read ?? []).map((r) => {
      if (r.key !== undefined && !BIB_KEY.test(r.key.trim())) throw new WorkbenchError(400, t(`bib 키가 아닙니다: ${r.key}`, `Not a bib key: ${r.key}`))
      return readOf(r)
    })
    const seen = new Set<string>()
    return { title: c.title.trim().slice(0, 300), state: c.state,
      goals: (c.goals ?? []).map((g) => g.trim().slice(0, 300)).filter(Boolean),
      read: some(read),
      concepts: concepts.filter((x) => !seen.has(x.id) && !!seen.add(x.id)),
      do: some((c.do ?? []).map(todoOf)).map((d) => ({ ...d, text: d.text.slice(0, 300) })) }
  }).filter((c) => c.title || c.concepts.length || c.read.length || c.do.length || c.goals.length)
  return { title, kind: input.kind, ...(source && { source }), chapters }
}

/** 기본값(아직 · 빈 목록 · done: false)은 적지 않는다. 체크하지 않은 개념노트 · 할 일은 글자 하나로 */
const dump = (b: RawBook) => YAML.stringify({ title: b.title, kind: b.kind, ...(b.source && { source: b.source }),
  chapters: b.chapters.map((c) => ({ title: c.title, ...(c.state !== '아직' && { state: c.state }),
    ...(c.goals.length && { goals: c.goals }),
    ...(c.read.length && { read: c.read.map((r) => ({ ...(r.key && { key: r.key }), ...(r.at && { at: r.at }), ...(r.text && { text: r.text }), ...(r.url && { url: r.url }), ...(r.done && { done: true }) })) }),
    ...(c.concepts.length && { concepts: c.concepts.map((x) => (x.done ? { id: x.id, done: true } : x.id)) }),
    ...(c.do.length && { do: c.do.map((d) => (d.done ? { text: d.text, done: true } : d.text)) }) })) }, { lineWidth: 0 })

/** 제목에서 id를 만든다 (영문이 없으면 book-1 …) */
export function studySlug(title: string, taken: Set<string>): string {
  const base = title.normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/, '') || 'book'
  let id = base; let n = 1
  while (taken.has(id)) id = `${base}-${++n}`
  return id
}

export function createStudy(lib: string | undefined, input: { title: string; kind: StudyKind; source?: string; chapters: string[] }): { id: string } {
  const root = needLib(lib)
  const book = clean({ ...input, chapters: input.chapters.map((title) => ({ title, state: '아직', concepts: [] })) })
  const taken = new Set(listStudy(root).books.map((b) => b.id))
  const id = studySlug(book.title, taken)
  fs.mkdirSync(dir(root), { recursive: true })
  writeAtomic(fileOf(root, id), dump(book))
  return { id }
}

export function saveStudy(lib: string | undefined, id: string, input: { title: string; kind: StudyKind; source?: string; chapters: ChapterIn[]; baseHash: string }): void {
  const file = fileOf(needLib(lib), id)
  if (!fs.existsSync(file)) throw new WorkbenchError(404, t('없는 책 · 강의입니다', 'No such book or lecture'))
  const now = hashOf(fs.readFileSync(file, 'utf8'))
  if (now !== input.baseHash) throw new ConflictError(t('그새 파일이 바뀌었습니다. 다시 읽고 고쳐 주세요', 'The file changed meanwhile. Read it again and edit'), now)
  writeAtomic(file, dump(clean(input)))
}

/** 체크 하나: 파일을 새로 읽어 그 칸만 바꾼다(다른 칸은 그대로라 baseHash 없이). 그새 그 줄이 바뀌었으면 409 */
export function checkStudy(lib: string | undefined, id: string, input: StudyCheckBody): void {
  const file = fileOf(needLib(lib), id)
  if (!fs.existsSync(file)) throw new WorkbenchError(404, t('없는 책 · 강의입니다', 'No such book or lecture'))
  const text = fs.readFileSync(file, 'utf8')
  const b = parseStudy(text, id)
  const ch = b.chapters[input.chapter]
  const list = ch?.[input.list]
  const it = list?.[input.index]
  const name = !it ? undefined : 'id' in it ? it.id : 'key' in it && it.key ? it.key : it.text
  if (!it || name !== input.item) throw new ConflictError(t('그새 파일이 바뀌었습니다. 다시 읽고 체크해 주세요', 'The file changed meanwhile. Read it again and check'), hashOf(text))
  it.done = input.done
  writeAtomic(file, dump(b))
}
