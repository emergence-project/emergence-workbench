import fs from 'node:fs'
import path from 'node:path'
import YAML from 'yaml'
import type { ConceptRow } from '@rw/core/contract/concepts'
import { StudyKind as KindSchema, StudyState as StateSchema, type StudyBook, type StudyBookRow, type StudyKind, type StudyState } from '@rw/core/contract/study'
import { hashOf, writeAtomic } from './fsutil.js'
import { ConflictError, WorkbenchError } from './workbench.js'
import { t } from './i18n.js'

/**
 * 공부: 책 · 강의 하나가 라이브러리 study/<id>.yaml 하나 (11/10 사용자 결정 "공부는 지식 라이브러리에", 안 A).
 * 장마다 상태(아직 · 읽는 중 · 끝)와 그 장에서 정리한 개념노트 id를 적는다. 정리는 개념노트에 쌓이고,
 * 이 파일은 책의 차례와 진도만 가진다. 형식은 docs/repo-format.md §10.6.
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

interface RawChapter { title: string; state: StudyState; concepts: string[] }
interface RawBook { title: string; kind: StudyKind; source?: string; chapters: RawChapter[] }

const kindOf = (v: unknown): StudyKind => KindSchema.safeParse(v).data ?? '책'
const stateOf = (v: unknown): StudyState => StateSchema.safeParse(v).data ?? '아직'

const rec = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v)) : {})

/** 사람이 고친 파일도 읽는다: 모르는 값은 기본값으로, 장이 글자 하나면 제목으로 본다 */
export function parseStudy(text: string, id: string): RawBook {
  let data: unknown
  try { data = YAML.parse(text) } catch { data = null }
  const o = rec(data)
  const chapters = (Array.isArray(o.chapters) ? o.chapters : []).map((c): RawChapter => {
    if (typeof c === 'string') return { title: c, state: '아직', concepts: [] }
    const r = rec(c)
    const concepts = Array.isArray(r.concepts) ? r.concepts.filter((x): x is string => typeof x === 'string' && CONCEPT_ID.test(x)) : []
    return { title: String(r.title ?? ''), state: stateOf(r.state), concepts }
  })
  return { title: typeof o.title === 'string' && o.title.trim() ? o.title : id, kind: kindOf(o.kind),
    ...(typeof o.source === 'string' && o.source && { source: o.source }), chapters }
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
  const all = [...new Set(b.chapters.flatMap((c) => c.concepts))]
  const found = new Map(rows(all).map((r) => [r.id, r]))
  return {
    id, title: b.title, kind: b.kind, ...(b.source && { source: b.source }), hash: hashOf(text),
    chapters: b.chapters.map((c) => ({ ...c, concepts: c.concepts.map((cid) => {
      const r = found.get(cid)
      return { id: cid, title: r?.title ?? cid, checked: r?.checked ?? 'none', missing: !r }
    }) })),
  }
}

function clean(input: { title: string; kind: StudyKind; source?: string; chapters: RawChapter[] }): RawBook {
  const title = input.title.trim()
  if (!title || title.length > 200) throw new WorkbenchError(400, t('제목을 200자 이내로 적어 주세요', 'Write a title of up to 200 characters'))
  const source = input.source?.trim()
  if (source && !BIB_KEY.test(source)) throw new WorkbenchError(400, t('출처 키가 bib 키 모양이 아닙니다', 'The source is not a bib key'))
  if (input.chapters.length > 500) throw new WorkbenchError(400, t('장은 500개까지입니다', 'Up to 500 chapters'))
  const chapters = input.chapters.map((c) => {
    const bad = c.concepts.find((x) => !CONCEPT_ID.test(x))
    if (bad) throw new WorkbenchError(400, t(`개념노트 id가 아닙니다: ${bad}`, `Not a concept note ID: ${bad}`))
    return { title: c.title.trim().slice(0, 300), state: c.state, concepts: [...new Set(c.concepts)] }
  }).filter((c) => c.title || c.concepts.length)
  return { title, kind: input.kind, ...(source && { source }), chapters }
}

const dump = (b: RawBook) => YAML.stringify({ title: b.title, kind: b.kind, ...(b.source && { source: b.source }),
  chapters: b.chapters.map((c) => ({ title: c.title, ...(c.state !== '아직' && { state: c.state }), ...(c.concepts.length && { concepts: c.concepts }) })) }, { lineWidth: 0 })

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

export function saveStudy(lib: string | undefined, id: string, input: { title: string; kind: StudyKind; source?: string; chapters: RawChapter[]; baseHash: string }): void {
  const file = fileOf(needLib(lib), id)
  if (!fs.existsSync(file)) throw new WorkbenchError(404, t('없는 책 · 강의입니다', 'No such book or lecture'))
  const now = hashOf(fs.readFileSync(file, 'utf8'))
  if (now !== input.baseHash) throw new ConflictError(t('그새 파일이 바뀌었습니다. 다시 읽고 고쳐 주세요', 'The file changed meanwhile. Read it again and edit'), now)
  writeAtomic(file, dump(clean(input)))
}
