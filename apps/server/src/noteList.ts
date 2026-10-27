import fs from 'node:fs'
import { projectStamp } from './projectReadCache.js'
import path from 'node:path'
import { sameNoteFile, type BlockStatus } from '@rw/core'
import YAML from 'yaml'
import { hashOf, writeAtomic } from './fsutil.js'
import { wikiTargets } from './knowledge.js'
import { msKeyOf } from './manuscript.js'
import { readNoteMeta, summaryOf, summaryOfMarkdown } from './noteMeta.js'
import { readTopics, takeDescription, type Topic } from './topics.js'
import { ConflictError, NOTE_DIRS, WorkbenchError, type Workbench } from './workbench.js'
import { t } from './i18n.js'

/**
 * 노트 한 목록 (10/5 "주제와 노트"): 연구노트(workbench/notes/ · topics/<주제>/) · 계산 노트(workbench/calc/)를
 * 같은 모양의 줄로 모은다. 블록 노트(workbench/blocks/)는 2026-10-27에 없앴다. 지운 노트(.trash/)는 들지 않는다. 파일은 옮기지 않고 머리말만 읽고 쓴다.
 *
 * 노트 머리말 (note.yaml):
 *   topics: [coloring, kempe]   # 주제 id, 첫째 = 주 주제. 없으면 "노트들"(주제 없음)
 *   kind: proof                 # 노트 성격 하나 (NOTE_CATEGORIES). 없으면 calc/ 노트는 calc, 나머지는 미분류.
 *                               # none = 미분류로 정함 (calc/ 노트를 미분류로 고르면 적는다: 폴더 값은 처음 값일 뿐, 10/5 결정)
 *   description: |-             # 설명: 여러 줄("- " 목록), 200자까지. 연구노트는 예전 summary:도 설명으로 읽는다
 *     …
 *   star: true                  # 즐겨찾기
 * 주제 폴더 배치(10/13): workbench/topics/<주제>/<노트>/의 노트는 그 폴더의 주제가 주인 주제(첫째)다. note.yaml topics:가 달라도 폴더가 이긴다.
 * 주제 폴더를 쓰는 프로젝트에서 주인 주제를 바꾸면 연구노트 폴더를 그 주제 폴더로(주제가 없으면 notes/로) 옮긴다. 계산 노트(calc/)는 옮기지 않는다.
 */
export { NOTE_CATEGORIES } from '@rw/core/contract/notes'
export type { NoteCategory, NoteRow, TopicStats, NoteLinks } from '@rw/core/contract/notes'
import { NOTE_CATEGORIES, type NoteCategory, type NoteLinks, type NoteRow, type TopicStats } from '@rw/core/contract/notes'
/** 머리말 kind: none — 미분류로 정한 것 (calc/ 노트의 폴더 값을 쓰지 않게) */
const KIND_NONE = 'none'
export const isNoteCategory = (v: unknown): v is NoteCategory => NOTE_CATEGORIES.includes(v as NoteCategory)


interface Source { row: NoteRow; body: string; headTopics: string[]; concepts: string[] }

/** 같은 노트 (file은 목록이 준 경로, 주제 폴더 사이를 옮기기 전의 옛 경로도 받는다) */
const findSource = (all: Source[], file: string) => all.find((s) => s.row.file === file) ?? all.find((s) => sameNoteFile(s.row.file, file))

const STATE_TO_STATUS = { paused: 'blocked', stopped: 'stopped', done: 'solved' } as const

const asList = (v: unknown): string[] => (Array.isArray(v) ? v : typeof v === 'string' && v.trim() ? [v] : []).map((x) => String(x).trim()).filter(Boolean)
const uniq = (xs: string[]) => [...new Set(xs)]

const sourceCache = new WeakMap<Workbench, { stamp: string; sources: Source[] }>()
function cachedNoteSources(wb: Workbench): Source[] {
  const stamp = projectStamp(wb)
  const hit = sourceCache.get(wb)
  if (hit?.stamp === stamp) return hit.sources
  const sources = noteSources(wb)
  sourceCache.set(wb, { stamp, sources })
  return sources
}

function noteSources(wb: Workbench): Source[] {
  const repo = wb.repo
  const manuscripts = wb.readResearch().sources.manuscripts
  const out: Source[] = []
  for (const n of wb.ownNotes()) {
    if (n.kind === 'paper') continue
    const abs = path.join(repo, n.path)
    let body: string
    let mtime: number
    try { body = fs.readFileSync(abs, 'utf8'); mtime = fs.statSync(abs).mtimeMs } catch { continue }
    const yamlFile = path.join(path.dirname(abs), 'note.yaml')
    const yamlText = fs.existsSync(yamlFile) ? fs.readFileSync(yamlFile, 'utf8') : ''
    let y: Record<string, unknown> = {}
    try { y = (YAML.parse(yamlText) ?? {}) as Record<string, unknown> } catch { /* 읽지 못하면 머리말 없이 */ }
    const meta = readNoteMeta(abs, body, undefined, y)
    const i = manuscripts.findIndex((m) => m.path === n.path)
    const kind = isNoteCategory(y.kind) ? y.kind : n.kind === 'calc' && y.kind !== KIND_NONE ? 'calc' : undefined
    out.push({
      row: {
        id: path.basename(path.dirname(abs)), type: n.kind, file: n.path, ...(i >= 0 && { ms: msKeyOf(manuscripts[i]!, i) }),
        format: abs.endsWith('.md') ? 'md' : 'tex', title: n.name,
        status: meta.state ? STATE_TO_STATUS[meta.state] : 'in-progress', ...(meta.resume && { resume: meta.resume }),
        ...(kind && { kind }), ...(kind && !isNoteCategory(y.kind) && { kindAuto: true as const }),
        ...(meta.summary && { description: meta.summary }), ...(meta.summaryAuto && { descriptionAuto: true as const }),
        topics: [], star: y.star === true, mtime, hash: hashOf(yamlText),
      },
      body, headTopics: uniq([...(n.topic ? [n.topic] : []), ...asList(y.topics)]), concepts: uniq(asList(y.concepts)),
    })
  }
  return out
}

/** 노트의 주제: note.yaml topics (첫째 = 주 주제). 없는 주제는 뺀다 */
function topicsOf(s: Source, topics: Topic[]): string[] {
  const known = new Set(topics.map((t) => t.id))
  return s.headTopics.filter((id) => known.has(id))
}

/** 읽기 전용 조회(목록·개괄·연결)는 프로젝트가 바뀌지 않았으면 지난번 읽은 것을 쓴다. 고치기 직전에는 noteSources로 새로 읽는다 */
function sourcesWithTopics(wb: Workbench, topics = readTopics(wb), fresh = false): Source[] {
  return (fresh ? noteSources(wb) : cachedNoteSources(wb)).map((s) => ({ ...s, row: { ...s.row, topics: topicsOf(s, topics) } }))
}

/** 프로젝트의 노트 전부. 최근 고친 것부터 */
export function listNotes(wb: Workbench, fresh = false): NoteRow[] {
  return sourcesWithTopics(wb, undefined, fresh).map((s) => s.row).sort((a, b) => b.mtime - a.mtime || a.title.localeCompare(b.title))
}


function statsOf(rows: NoteRow[]): TopicStats {
  const byStatus: Record<BlockStatus, number> = { 'in-progress': 0, blocked: 0, stopped: 0, solved: 0 }
  const kinds = new Map<NoteCategory | null, number>()
  for (const r of rows) {
    byStatus[r.status]++
    kinds.set(r.kind ?? null, (kinds.get(r.kind ?? null) ?? 0) + 1)
  }
  const order = (k: NoteCategory | null) => (k === null ? NOTE_CATEGORIES.length : NOTE_CATEGORIES.indexOf(k))
  const updated = rows.reduce((m, r) => Math.max(m, r.mtime), 0)
  return {
    notes: rows.length, byStatus,
    kinds: [...kinds].map(([kind, count]) => ({ kind, count })).sort((a, b) => b.count - a.count || order(a.kind) - order(b.kind)),
    ...(updated && { updated }),
  }
}

/** 주제 목록과 주제마다 노트 수·성격·최근 시각. loose = 주제가 없는 노트 묶음("노트들") */
export function topicsOverview(wb: Workbench): { topics: (Topic & TopicStats)[]; loose: TopicStats } {
  const topics = readTopics(wb)
  const rows = sourcesWithTopics(wb, topics).map((s) => s.row)
  return {
    topics: topics.map((t) => ({ ...t, ...statsOf(rows.filter((r) => r.topics.includes(t.id))) })),
    loose: statsOf(rows.filter((r) => !r.topics.length)),
  }
}

export { noteRecordTarget } from '@rw/core'

export interface NoteHeadPatch { title?: unknown; topics?: unknown; kind?: unknown; description?: unknown; star?: unknown }

/**
 * 노트 머리말 고치기 (이름·주제·성격·설명·★, note.yaml의 name … 10/5 "노트 이름 고치기"). file = NoteRow.file. baseHash를 주면 그 뒤로 머리말 파일이 바뀌었을 때 409.
 */
export function writeNoteHead(wb: Workbench, file: unknown, patch: NoteHeadPatch, baseHash?: unknown): NoteRow {
  if (typeof file !== 'string' || !file) throw new WorkbenchError(400, t('file(노트 본문 파일, 저장소 기준)이 필요함', 'file (the note body file, relative to the repository) is required'))
  if (!patch || typeof patch !== 'object') throw new WorkbenchError(400, t('patch가 필요함', 'patch is required'))
  const topics = readTopics(wb)
  const src = findSource(noteSources(wb), file)
  if (!src) throw new WorkbenchError(404, t(`노트가 아님: ${file}`, `Not a note: ${file}`))
  if (baseHash !== undefined && baseHash !== null && baseHash !== src.row.hash) {
    throw new ConflictError(t('다른 곳에서 노트가 바뀌어 고치지 않았음', 'The note changed elsewhere, so it was not edited'), src.row.hash)
  }
  for (const k of Object.keys(patch)) if (!['title', 'topics', 'kind', 'description', 'star'].includes(k)) throw new WorkbenchError(400, t(`고칠 수 없는 키: ${k}`, `Key cannot be edited: ${k}`))

  let nextTopics: string[] | undefined
  if (patch.topics !== undefined) {
    if (patch.topics !== null && !(Array.isArray(patch.topics) && patch.topics.every((x) => typeof x === 'string'))) throw new WorkbenchError(400, t('topics는 주제 id 목록', 'topics must be a list of topic ids'))
    nextTopics = uniq(((patch.topics ?? []) as string[]).map((x) => x.trim()).filter(Boolean))
    for (const id of nextTopics) if (!topics.some((t) => t.id === id)) throw new WorkbenchError(400, t(`없는 주제: ${id}`, `No such topic: ${id}`))
  }
  let kind: NoteCategory | null | undefined
  if (patch.kind !== undefined) {
    if (patch.kind === null || patch.kind === '') kind = null
    else if (isNoteCategory(patch.kind)) kind = patch.kind
    else throw new WorkbenchError(400, t(`kind는 ${NOTE_CATEGORIES.join('·')} 중 하나 (지우려면 null)`, `kind must be one of ${NOTE_CATEGORIES.join('·')} (null to clear)`))
  }
  const description = patch.description === undefined ? undefined : patch.description === null ? '' : takeDescription(patch.description)
  if (patch.star !== undefined && typeof patch.star !== 'boolean') throw new WorkbenchError(400, t('star는 참·거짓이어야 함', 'star must be true or false'))
  const star = patch.star as boolean | undefined
  let title: string | undefined
  if (patch.title !== undefined) {
    if (typeof patch.title !== 'string') throw new WorkbenchError(400, t('title은 글이어야 함', 'title must be text'))
    title = patch.title.replace(/\s+/g, ' ').trim()
    if (!title) throw new WorkbenchError(400, t('이름이 비었음', 'The name is empty'))
    if (title.length > 120) throw new WorkbenchError(400, t('이름은 120자까지', 'Names are up to 120 characters'))
  }

  const repo = wb.repo
  {
    // 주인 주제가 바뀌면 폴더부터 옮긴다 (같은 이름의 폴더가 있으면 아무것도 고치지 않고 멈춘다)
    if (nextTopics) src.row.file = placeNoteFolder(wb, src.row.file, nextTopics[0])
    const yamlFile = path.join(repo, path.dirname(src.row.file), 'note.yaml')
    const text = fs.existsSync(yamlFile) ? fs.readFileSync(yamlFile, 'utf8') : ''
    const doc = text ? YAML.parseDocument(text) : new YAML.Document({})
    if (doc.errors.length) throw new WorkbenchError(400, t(`note.yaml을 읽지 못함: ${doc.errors[0]!.message}`, `Could not read note.yaml: ${doc.errors[0]!.message}`))
    if (doc.contents != null && !YAML.isMap(doc.contents)) throw new WorkbenchError(409, t('note.yaml 모양이 달라 고치지 않음', 'note.yaml has an unexpected shape, so it was not edited'))
    if (title !== undefined) doc.set('name', title)
    if (nextTopics) { if (nextTopics.length) doc.set('topics', doc.createNode(nextTopics, { flow: true })); else doc.delete('topics') }
    // calc/ 노트는 적지 않으면 계산으로 읽으므로, 미분류는 none으로 적는다
    if (kind !== undefined) { if (kind) doc.set('kind', kind); else if (src.row.type === 'calc') doc.set('kind', KIND_NONE); else doc.delete('kind') }
    if (description !== undefined) {
      // 예전 이름 summary:는 description:으로 바꿔 쓴다 (읽을 때는 둘 다 설명)
      doc.delete('summary')
      if (description) doc.set('description', description); else doc.delete('description')
    }
    if (star !== undefined) { if (star) doc.set('star', true); else doc.delete('star') }
    const out = doc.toString({ lineWidth: 0 })
    if (out !== text) writeAtomic(yamlFile, out)
  }
  const row = listNotes(wb, true).find((r) => r.file === src.row.file)
  if (!row) throw new WorkbenchError(500, t('고친 노트를 다시 읽지 못함', 'Could not read the edited note again'))
  return row
}

/**
 * 주제 폴더 배치에서 연구노트 폴더를 주인 주제의 폴더(workbench/topics/<주제>/)로, 주제가 없거나 그 주제의 폴더가 없으면 notes/로 옮긴다.
 * 옮긴 뒤 본문 파일의 저장소 기준 경로. 주제 폴더를 쓰지 않는 프로젝트, 계산 노트(calc/), 원고는 그대로 둔다.
 * 기록 대상(note-<폴더>)과 원고 key는 폴더 이름에서 나오므로 그대로다. 비어 버린 주제 폴더(topic.yaml도 없는 것)는 지운다
 */
function placeNoteFolder(wb: Workbench, file: string, owner: string | undefined): string {
  if (!wb.usesTopicFolders()) return file
  const abs = path.join(wb.repo, file)
  const dir = path.dirname(abs)
  const parent = path.dirname(dir)
  const notesDir = path.join(wb.root, NOTE_DIRS.note)
  const inTopic = path.dirname(parent) === wb.topicsDir
  if (parent !== notesDir && !inTopic) return file
  const ownerDir = owner && fs.existsSync(path.join(wb.topicsDir, owner)) ? path.join(wb.topicsDir, owner) : notesDir
  if (ownerDir === parent) return file
  const dest = path.join(ownerDir, path.basename(dir))
  if (fs.existsSync(dest)) throw new WorkbenchError(409, t(`옮길 자리에 같은 이름의 폴더가 있어 고치지 않았음: ${path.relative(wb.repo, dest)}`, `Not changed: a folder with the same name is already at ${path.relative(wb.repo, dest)}`))
  fs.mkdirSync(ownerDir, { recursive: true })
  fs.renameSync(dir, dest)
  if (inTopic) { try { if (!fs.readdirSync(parent).length) fs.rmdirSync(parent) } catch { /* 남은 폴더는 그대로 */ } }
  return path.relative(wb.repo, path.join(dest, path.basename(abs))).split(path.sep).join('/')
}

/** 지운 주제를 노트 머리말에서도 뺀다 (같은 id로 새 주제를 만들 때 예전 노트가 저절로 들지 않게) */
export function dropTopicsFromNotes(wb: Workbench, removed: string[]): number {
  if (!removed.length) return 0
  const topics = readTopics(wb)
  let n = 0
  for (const s of noteSources(wb)) {
    if (!s.headTopics.some((t) => removed.includes(t))) continue
    const keep = topicsOf(s, topics).filter((t) => !removed.includes(t))
    try { writeNoteHead(wb, s.row.file, { topics: keep }); n++ } catch { /* 못 고친 노트는 읽을 때 없는 주제로 걸러진다 */ }
  }
  return n
}

/** 링크 비교용 이름: 대소문자·빈칸·기호를 뺀다 (한글은 그대로) */
export const linkKey = (s: string) => s.normalize('NFC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '')

export interface ConceptLookup {
  /** [[이름]] → 개념노트 (없으면 null) */
  resolve(name: string): { id: string; title: string } | null
  /** id → 개념노트 줄 (머리말 concepts:) */
  rows(ids: string[]): { id: string; title: string }[]
}


/**
 * 노트 링크에서 모으는 두 목록 (노트 화면 오른쪽 사이드바, 10/5). 링크 문법은 앱의 [[이름]]·[[이름|보이는 글]]·[[이름#절]].
 * 이름이 프로젝트 노트(제목 또는 폴더·id)와 같으면 노트 인용, 아니면 개념노트(제목 > 다른 이름 > 파일 이름).
 */
export function noteLinks(wb: Workbench, file: string, concepts: ConceptLookup | null): NoteLinks {
  const all = sourcesWithTopics(wb)
  const me = findSource(all, file)
  if (!me) throw new WorkbenchError(404, t(`노트가 아님: ${file}`, `Not a note: ${file}`))
  const keysOf = (r: NoteRow) => new Set([linkKey(r.title), linkKey(r.id)].filter(Boolean))
  const noteKeys = new Set(all.flatMap((s) => [...keysOf(s.row)]))
  const found: { id: string; title: string }[] = []
  const missing: string[] = []
  for (const name of wikiTargets(me.body)) {
    if (noteKeys.has(linkKey(name))) continue
    const hit = concepts?.resolve(name) ?? null
    if (hit) { if (!found.some((c) => c.id === hit.id)) found.push({ id: hit.id, title: hit.title }) }
    else if (!missing.includes(name)) missing.push(name)
  }
  const bodyConcepts = [...found]
  const rest = me.concepts.filter((id) => !found.some((c) => c.id === id))
  const rows = new Map((concepts?.rows(rest) ?? []).map((r) => [r.id, r]))
  for (const id of rest) found.push({ id, title: rows.get(id)?.title ?? id })
  const mine = keysOf(me.row)
  const citedBy = all
    .filter((s) => s !== me && wikiTargets(s.body).some((n) => mine.has(linkKey(n))))
    .map(({ row: { id, type, file: f, title, status, mtime } }) => ({ id, type, file: f, title, status, mtime }))
    .sort((a, b) => b.mtime - a.mtime)
  return { concepts: found, bodyConcepts, missing, citedBy }
}

/**
 * 프로젝트가 쓰는 개념노트 (지식 첫 화면 점검, 10/6): 노트 본문 [[링크]] 가운데 프로젝트 노트가 아닌 이름과
 * 노트 머리말 concepts:, 프로젝트 전체가 기대는 research.yaml concepts:(원고 · 메인 노트용). 이름은 개념노트 색인으로 푼다.
 */
/** 노트 머리말 concepts:에 적은 개념노트 id마다 그 노트 (개념노트의 "쓰는 곳") */
export function noteConceptUses(wb: Workbench): { concept: string; file: string; title: string }[] {
  return cachedNoteSources(wb).flatMap((s) => s.concepts.map((concept) => ({ concept, file: s.row.file, title: s.row.title })))
}

export function projectConceptRefs(wb: Workbench): { names: string[]; ids: string[] } {
  const all = cachedNoteSources(wb)
  const noteKeys = new Set(all.flatMap((s) => [linkKey(s.row.title), linkKey(s.row.id)].filter(Boolean)))
  const names = uniq(all.flatMap((s) => wikiTargets(s.body)).filter((n) => !noteKeys.has(linkKey(n))))
  const ids = uniq([...wb.readResearch().concepts, ...all.flatMap((s) => s.concepts)])
  return { names, ids }
}
