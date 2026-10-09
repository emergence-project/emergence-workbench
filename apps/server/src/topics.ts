import fs from 'node:fs'
import path from 'node:path'
import YAML from 'yaml'
import { charCount, parseCardFigureRef } from '@rw/core'
import { hashOf, writeAtomic } from './fsutil.js'
import { ConflictError, WorkbenchError, type Workbench } from './workbench.js'
import { t as tx } from './i18n.js'

/**
 * 주제(Topic, 10/5 "주제와 노트"): 노트를 묶기만 하는 한 단계 묶음. 예전 이름은 카드(10/3).
 * 원고 파일은 건드리지 않고 workbench/research.yaml의 topics:에만 적는다.
 *
 * research.yaml
 *   topics:
 *     - id: phase-diagram
 *       title: Example phase diagram
 *       star: true            # 즐겨찾기 (어느 정렬에서도 앞에)
 *       description: |-       # 설명: 여러 줄, "- " 목록, 200자까지 (10/5)
 *         상도와 그 경계
 *         - 고전 · 조화 근사
 *       preview:              # 주제 카드 위쪽 미리보기 (10/5, 주제 화면에서만 넣는다)
 *         text: CMI $I(A:C|B)$   # 30자까지, $…$ 안은 수식
 *         image: figure:library/phase-diagram.png   # 그림 id (예전 저장소 기준 경로도 읽는다)
 *         color: violet       # 바탕색: 없으면 기본(프로젝트 색). TOPIC_COLORS 중 하나
 *       parts: [docs/model/chapters/02-model-graph.tex]   # 원고의 장 (예전 기록, 그대로 읽고 둔다)
 *       blocks: [vortex-core]   # 예전 기록: 이 주제에 든 보조 노트. 노트의 주제는 이제 노트 머리말 topics:에 적는다
 *       done: true            # 없으면 진행 중
 *       manuscript: docs/model/main.tex   # 없으면 첫째 메인 노트
 * parts는 장 id (장 파일이면 저장소 기준 경로, \section으로 나눈 원고면 "파일#label").
 */
export interface Topic {
  id: string
  title: string
  /** 원고의 장 id */
  parts: string[]
  /** 예전 기록: 이 주제에 든 보조 노트 id (workbench/blocks/). 노트 머리말 topics:와 합쳐 읽는다 */
  blocks: string[]
  done: boolean
  /** 즐겨찾기: 목록 맨 앞에 둔다 */
  star: boolean
  /** 메인 노트 main .tex (저장소 기준). 없으면 첫째 메인 노트 */
  manuscript?: string
  /** 설명: 여러 줄("- " 목록), 200자까지 */
  description?: string
  /** 주제 카드 미리보기 */
  preview?: TopicPreview
}

/** 주제 카드 바탕색: 기본(프로젝트 색) 말고 정해 둔 다섯 색. 값은 화면의 tokens.css에 라이트·다크로 둔다 (시안 7-주제-고치기-창) */
export const TOPIC_COLORS = ['violet', 'blue', 'teal', 'orange', 'gray'] as const
export type TopicColor = (typeof TOPIC_COLORS)[number]
export interface TopicPreview { text?: string; image?: string; color?: TopicColor }

export const TITLE_MAX = 40
export const DESCRIPTION_MAX = 200
export const PREVIEW_TEXT_MAX = 30
const IMAGE = /\.(png|jpe?g|gif|svg|webp)$/i

const ID = /^[a-z0-9][a-z0-9-]*$/
const MAX_TOPICS = 100

const str = (v: unknown) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '')
/** 글자 수: 줄바꿈은 세지 않고 $…$ 수식은 보이는 글자만 (화면의 글자 수와 같게, @rw/core) */
export { charCount }

/** 설명: 줄마다 앞뒤 빈칸을 떼고 빈칸을 하나로, 빈 줄은 하나까지. 맨 앞뒤 빈 줄은 뗀다 */
export function cleanDescription(v: unknown): string {
  if (typeof v !== 'string') return ''
  return v.replace(/\r\n?/g, '\n').split('\n').map((l) => l.replace(/[ \t ]+/g, ' ').trim()).join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

/** 설명 줄 수 한도: 노트 머리말(맨 위 80줄 안에서 찾는다)에 들어가므로 */
export const DESCRIPTION_MAX_LINES = 20

/** 설명을 받을 때: 글이 아니거나 200자·20줄을 넘으면 거절 */
export function takeDescription(v: unknown): string {
  if (typeof v !== 'string') throw new WorkbenchError(400, tx('description은 글이어야 함', 'description must be text'))
  const d = cleanDescription(v)
  if (charCount(d) > DESCRIPTION_MAX) throw new WorkbenchError(400, tx(`설명은 ${DESCRIPTION_MAX}자까지 (지금 ${charCount(d)}자)`, `The description can have up to ${DESCRIPTION_MAX} characters (now ${charCount(d)})`))
  const lines = d ? d.split('\n').length : 0
  if (lines > DESCRIPTION_MAX_LINES) throw new WorkbenchError(400, tx(`설명은 ${DESCRIPTION_MAX_LINES}줄까지 (지금 ${lines}줄)`, `The description can have up to ${DESCRIPTION_MAX_LINES} lines (now ${lines})`))
  return d
}

/** 그림 라이브러리 참조 또는 예전 저장소 기준 경로. 저장소 밖 경로·그림이 아닌 것은 받지 않는다 */
function imagePath(v: unknown): string {
  if (typeof v === 'string' && v.trim().startsWith('figure:')) return parseCardFigureRef(v.trim()) ? v.trim() : ''
  const p = typeof v === 'string' ? path.posix.normalize(v.trim().replace(/\\/g, '/')) : ''
  return p && p !== '.' && !p.startsWith('../') && !path.posix.isAbsolute(p) && IMAGE.test(p) ? p : ''
}

function readPreview(v: unknown): TopicPreview | undefined {
  if (!v || typeof v !== 'object') return undefined
  const r = v as Record<string, unknown>
  const text = str(r.text)
  const image = imagePath(r.image)
  const color = TOPIC_COLORS.includes(r.color as TopicColor) ? r.color as TopicColor : undefined
  return text || image || color ? { ...(text && { text }), ...(image && { image }), ...(color && { color }) } : undefined
}

export function readTopics(wb: Workbench): Topic[] {
  if (!fs.existsSync(wb.researchPath)) return []
  let raw: unknown
  try { raw = YAML.parse(fs.readFileSync(wb.researchPath, 'utf8')) } catch { return [] }
  const list = raw && typeof raw === 'object' ? (raw as Record<string, unknown>).topics : undefined
  return Array.isArray(list) ? normalize(list, false) : []
}

/**
 * 받은 목록을 검사해 고른다. strict면 잘못된 칸에서 멈춘다 (앱에서 저장할 때).
 * 글자 수 제한은 before(지금 파일의 주제)와 달라진 값에만 건다: 사람이 길게 적어 둔 것 때문에 다른 주제를 못 고치는 일이 없게
 */
function normalize(list: unknown[], strict: boolean, before: Topic[] = []): Topic[] {
  return normalizeIndexed(list, strict, before).map((x) => x.topic)
}

/** normalize와 같고, 주제마다 받은 목록의 몇째 칸에서 왔는지(at)를 함께 준다 */
function normalizeIndexed(list: unknown[], strict: boolean, before: Topic[] = []): { topic: Topic; at: number }[] {
  const out: Topic[] = []
  const from: number[] = []
  const bad = (msg: string) => { if (strict) throw new WorkbenchError(400, msg) }
  const was = new Map(before.map((t) => [t.id, t]))
  for (const [at, t] of list.entries()) {
    if (!t || typeof t !== 'object') { bad(tx('주제 모양이 올바르지 않음', 'Invalid topic shape')); continue }
    const r = t as Record<string, unknown>
    const title = str(r.title)
    if (!title) { bad(tx('주제 이름이 비어 있음', 'The topic name is empty')); continue }
    // 새 주제는 id 없이 와도 된다: 이름에서 만든다
    const id = str(r.id) || topicIdOf(title, [...out.map((x) => x.id), ...list.map((x) => str((x as Record<string, unknown> | null)?.id))])
    if (!ID.test(id)) { bad(tx(`주제 id가 올바르지 않음: ${id}`, `Invalid topic id: ${id}`)); continue }
    if (out.some((x) => x.id === id)) { bad(tx(`주제 id가 겹침: ${id}`, `Duplicate topic id: ${id}`)); continue }
    const list_ = (v: unknown) => [...new Set((Array.isArray(v) ? v : []).map(str).filter(Boolean))]
    const manuscript = str(r.manuscript)
    const description = cleanDescription(r.description)
    const preview = readPreview(r.preview)
    const old = was.get(id)
    if (strict) {
      if (title !== old?.title && charCount(title) > TITLE_MAX) bad(tx(`주제 이름은 ${TITLE_MAX}자까지`, `A topic name can have up to ${TITLE_MAX} characters`))
      if (description !== (old?.description ?? '') && charCount(description) > DESCRIPTION_MAX) bad(tx(`설명은 ${DESCRIPTION_MAX}자까지 (지금 ${charCount(description)}자)`, `The description can have up to ${DESCRIPTION_MAX} characters (now ${charCount(description)})`))
      if (preview?.text && preview.text !== old?.preview?.text && charCount(preview.text) > PREVIEW_TEXT_MAX) bad(tx(`카드 미리보기 글은 ${PREVIEW_TEXT_MAX}자까지`, `Card preview text can have up to ${PREVIEW_TEXT_MAX} characters`))
      const pr = r.preview as Record<string, unknown> | undefined
      if (pr && typeof pr === 'object') {
        if (pr.image != null && pr.image !== '' && !imagePath(pr.image)) bad(tx(`그림 경로가 올바르지 않음: ${String(pr.image)}`, `Invalid picture path: ${String(pr.image)}`))
        if (pr.color != null && pr.color !== 'default' && !TOPIC_COLORS.includes(pr.color as TopicColor)) bad(tx(`바탕색은 default·${TOPIC_COLORS.join('·')} 중 하나`, `The background color must be one of default·${TOPIC_COLORS.join('·')}`))
      }
    }
    out.push({
      id, title, parts: list_(r.parts), blocks: list_(r.blocks), done: r.done === true, star: r.star === true,
      ...(manuscript && { manuscript }), ...(description && { description }), ...(preview && { preview }),
    })
    from.push(at)
  }
  if (out.length > MAX_TOPICS) bad(tx(`주제는 ${MAX_TOPICS}개까지`, `Up to ${MAX_TOPICS} topics`))
  return out.slice(0, MAX_TOPICS).map((topic, i) => ({ topic, at: from[i]! }))
}

/** 이름에서 id를 만든다 (겹치면 -2, -3 …) */
export function topicIdOf(title: string, taken: string[]): string {
  const base = title.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'topic'
  let id = base
  for (let i = 2; taken.includes(id); i++) id = `${base}-${i}`
  return id
}

export const topicsHash = (wb: Workbench) => hashOf(fs.existsSync(wb.researchPath) ? fs.readFileSync(wb.researchPath, 'utf8') : '')

/** 읽을 때 받은 baseHash 뒤로 research.yaml이 바뀌지 않았는지 본다 (없으면 거절: 바깥 수정을 모르고 덮지 않게) */
export function checkTopicsHash(wb: Workbench, baseHash: unknown): void {
  if (typeof baseHash !== 'string' || !baseHash) throw new WorkbenchError(400, tx('baseHash(주제 목록을 읽을 때 받은 hash)가 필요함', 'baseHash (the hash you got when reading the topic list) is required'))
  const now = topicsHash(wb)
  if (baseHash !== now) throw new ConflictError(tx('다른 곳에서 research.yaml이 바뀌어 고치지 않았음', 'Not changed: research.yaml was changed elsewhere'), now)
}

/** 주제 하나를 research.yaml에 적을 모양 (새로 더하는 주제) */
function topicYaml(t: Topic): Record<string, unknown> {
  return {
    id: t.id, title: t.title, ...(t.star && { star: true }), ...(t.description && { description: t.description }),
    ...(t.preview && { preview: t.preview }), parts: t.parts, ...(t.blocks.length && { blocks: t.blocks }),
    ...(t.done && { done: true }), ...(t.manuscript && { manuscript: t.manuscript }),
  }
}

/** 칸마다 research.yaml에 적을 값 (undefined면 그 칸을 지운다) */
const TOPIC_FIELDS: Record<string, (t: Topic) => unknown> = {
  id: (t) => t.id,
  title: (t) => t.title,
  star: (t) => (t.star ? true : undefined),
  description: (t) => t.description,
  preview: (t) => t.preview,
  parts: (t) => t.parts,
  blocks: (t) => (t.blocks.length ? t.blocks : undefined),
  done: (t) => (t.done ? true : undefined),
  manuscript: (t) => t.manuscript,
}

/** 장이 하나면 한 줄로, 여럿이면 줄마다 (사람이 고쳐 읽기 쉽게) */
function flowShort(node: unknown): void {
  YAML.visit(node as YAML.Node, { Seq(_, n) { if (n.items.length <= 1) n.flow = true } })
}

/**
 * topics: 칸을 고친다. 다른 칸과 주석은 그대로 둔다. workbench/ 안 파일만 쓴다.
 * 이미 있는 주제는 바뀐 칸만 그 자리에서 고치고(앱이 모르는 칸·주석·모양은 그대로),
 * 앱이 읽지 못하는 항목(id가 규칙에 맞지 않는 것 등)은 지우지 않고 그 자리에 둔다.
 * list에서 빠진 (앱이 읽은) 주제만 지운다.
 */
export function saveTopics(wb: Workbench, list: unknown): Topic[] {
  if (!Array.isArray(list)) throw new WorkbenchError(400, tx('topics(목록)가 필요함', 'topics (a list) is required'))
  const text = fs.existsSync(wb.researchPath) ? fs.readFileSync(wb.researchPath, 'utf8') : ''
  const doc = YAML.parseDocument(text)
  if (doc.errors.length) throw new WorkbenchError(409, tx('research.yaml을 읽지 못해 고치지 않음', 'Not changed: could not read research.yaml'))
  if (doc.contents != null && !YAML.isMap(doc.contents)) throw new WorkbenchError(409, tx('research.yaml 모양이 달라 고치지 않음', 'Not changed: research.yaml has an unexpected shape'))
  const got = doc.get('topics', true)
  // 'topics:'처럼 값이 빈 칸은 없는 것으로 본다
  const seq = YAML.isScalar(got) && got.value == null ? undefined : got
  if (seq != null && !YAML.isSeq(seq)) throw new WorkbenchError(409, tx('research.yaml의 topics:가 목록이 아니어서 고치지 않음', 'Not changed: topics: in research.yaml is not a list'))
  const items: unknown[] = seq ? [...seq.items] : []
  const read = normalizeIndexed(items.map((n) => (YAML.isNode(n) ? n.toJSON() : n)), false)
  const topics = normalize(list, true, read.map((x) => x.topic))
  const wanted = new Map(topics.map((t) => [t.id, t]))
  const was = new Map(read.map((x) => [x.topic.id, x]))

  // 남는 (읽은) 주제의 칸에 새 순서대로 다시 넣는다. 읽지 못한 항목은 제자리
  const keptSlots = read.filter((x) => wanted.has(x.topic.id)).map((x) => x.at)
  const keptOrder = topics.filter((t) => was.has(t.id))
  const removed = new Set(read.filter((x) => !wanted.has(x.topic.id)).map((x) => x.at))
  const next: unknown[] = items.map((n, i) => (removed.has(i) ? undefined : n))
  keptSlots.forEach((slot, k) => {
    const t = keptOrder[k]!
    const old = was.get(t.id)!
    const node = items[old.at]
    if (!YAML.isMap(node)) { next[slot] = doc.createNode(topicYaml(t)); return }
    for (const [key, valueOf] of Object.entries(TOPIC_FIELDS)) {
      const v = valueOf(t)
      if (JSON.stringify(v) === JSON.stringify(valueOf(old.topic)) && !(key === 'id' && !node.has('id'))) continue
      if (v === undefined) node.delete(key)
      else { const vn = doc.createNode(v); flowShort(vn); node.set(key, vn) }
    }
    next[slot] = node
  })
  for (const t of topics) {
    if (was.has(t.id)) continue
    const node = doc.createNode(topicYaml(t))
    flowShort(node)
    next.push(node)
  }
  const out_ = next.filter((n) => n !== undefined)
  if (out_.length) {
    if (seq) seq.items = out_ as typeof seq.items
    else { const s_ = doc.createNode([]) as YAML.YAMLSeq; s_.items = out_ as typeof s_.items; doc.set('topics', s_) }
  } else doc.delete('topics')
  // [a, b]처럼 사람이 쓴 모양을 지킨다 (기본값은 [ a, b ]). 긴 설명을 접지 않는다
  const out = doc.toString({ flowCollectionPadding: false, lineWidth: 0 })
  if (out !== text) writeAtomic(wb.researchPath, out)
  return readTopics(wb)
}

/** 주제 만들기: 이름(40자)은 꼭, 설명·미리보기는 있으면. 맨 뒤에 더한다 */
export function createTopic(wb: Workbench, input: { title?: unknown; description?: unknown; preview?: unknown }): Topic {
  const title = str(input.title)
  if (!title) throw new WorkbenchError(400, tx('주제 이름이 필요함', 'A topic name is required'))
  if (charCount(title) > TITLE_MAX) throw new WorkbenchError(400, tx(`주제 이름은 ${TITLE_MAX}자까지`, `A topic name can have up to ${TITLE_MAX} characters`))
  const now = readTopics(wb)
  const id = topicIdOf(title, now.map((t) => t.id))
  const next = applyPatch({ id, title, parts: [], blocks: [], done: false, star: false }, { description: input.description, preview: input.preview })
  return saveTopics(wb, [...now, next]).find((t) => t.id === id)!
}

export interface TopicPatch { title?: unknown; description?: unknown; preview?: unknown; star?: unknown; done?: unknown }

/** 주제 고치기 (주제 고치기 창 · ★). preview는 고칠 칸만: { text, image, color } 각각 빈 값·null이면 지운다 */
export function patchTopic(wb: Workbench, id: string, patch: TopicPatch): Topic {
  const now = readTopics(wb)
  const t = now.find((x) => x.id === id)
  if (!t) throw new WorkbenchError(404, tx(`없는 주제: ${id}`, `No such topic: ${id}`))
  const next = applyPatch(t, patch)
  return saveTopics(wb, now.map((x) => (x.id === id ? next : x))).find((x) => x.id === id)!
}

function applyPatch(t: Topic, patch: TopicPatch): Topic {
  const next: Topic = { ...t, ...(t.preview && { preview: { ...t.preview } }) }
  if (patch.title !== undefined) {
    const title = str(patch.title)
    if (!title) throw new WorkbenchError(400, tx('주제 이름이 비어 있음', 'The topic name is empty'))
    if (title !== t.title && charCount(title) > TITLE_MAX) throw new WorkbenchError(400, tx(`주제 이름은 ${TITLE_MAX}자까지`, `A topic name can have up to ${TITLE_MAX} characters`))
    next.title = title
  }
  if (patch.description !== undefined && patch.description !== null) {
    const d = takeDescription(patch.description)
    if (d) next.description = d; else delete next.description
  } else if (patch.description === null) delete next.description
  for (const k of ['star', 'done'] as const) {
    if (patch[k] === undefined) continue
    if (typeof patch[k] !== 'boolean') throw new WorkbenchError(400, tx(`${k}는 참·거짓이어야 함`, `${k} must be true or false`))
    next[k] = patch[k]
  }
  if (patch.preview !== undefined) {
    if (patch.preview !== null && typeof patch.preview !== 'object') throw new WorkbenchError(400, tx('preview는 { text, image, color }', 'preview must be { text, image, color }'))
    const p = (patch.preview ?? { text: null, image: null, color: null }) as Record<string, unknown>
    const pv: TopicPreview = { ...next.preview }
    if (p.text !== undefined) {
      if (p.text !== null && typeof p.text !== 'string') throw new WorkbenchError(400, tx('미리보기 글은 글이어야 함', 'Preview text must be text'))
      const text = str(p.text)
      if (charCount(text) > PREVIEW_TEXT_MAX) throw new WorkbenchError(400, tx(`카드 미리보기 글은 ${PREVIEW_TEXT_MAX}자까지 (지금 ${charCount(text)}자)`, `Card preview text can have up to ${PREVIEW_TEXT_MAX} characters (now ${charCount(text)})`))
      if (text) pv.text = text; else delete pv.text
    }
    if (p.image !== undefined) {
      const image = p.image === null || p.image === '' ? '' : imagePath(p.image)
      if (p.image && !image) throw new WorkbenchError(400, tx(`그림 경로가 올바르지 않음: ${String(p.image)}`, `Invalid picture path: ${String(p.image)}`))
      if (image) pv.image = image; else delete pv.image
    }
    if (p.color !== undefined) {
      if (p.color === null || p.color === 'default' || p.color === '') delete pv.color
      else if (TOPIC_COLORS.includes(p.color as TopicColor)) pv.color = p.color as TopicColor
      else throw new WorkbenchError(400, tx(`바탕색은 default·${TOPIC_COLORS.join('·')} 중 하나`, `The background color must be one of default·${TOPIC_COLORS.join('·')}`))
    }
    if (Object.keys(pv).length) next.preview = pv; else delete next.preview
  }
  return next
}

/** 주제 지우기: research.yaml에서만 뺀다. 노트와 그림 파일은 그대로 둔다 (노트는 "노트들"로) */
export function deleteTopic(wb: Workbench, id: string): Topic[] {
  const now = readTopics(wb)
  if (!now.some((t) => t.id === id)) throw new WorkbenchError(404, tx(`없는 주제: ${id}`, `No such topic: ${id}`))
  return saveTopics(wb, now.filter((t) => t.id !== id))
}

/** 앱이 올린 주제 그림의 자리: workbench/figures/topics/<id>.<ext> */
export const topicFiguresDir = (wb: Workbench) => path.join(wb.figuresDir, 'topics')

/** 주제 그림 올리기: 같은 주제의 예전 그림(다른 확장자)은 지우고 새 그림을 미리보기에 건다 */
export function setTopicImage(wb: Workbench, id: string, name: unknown, bytes: unknown): Topic {
  if (!readTopics(wb).some((t) => t.id === id)) throw new WorkbenchError(404, tx(`없는 주제: ${id}`, `No such topic: ${id}`))
  if (!Buffer.isBuffer(bytes) || !bytes.length) throw new WorkbenchError(400, tx('그림 파일 내용이 필요함 (application/octet-stream)', 'Picture file content is required (application/octet-stream)'))
  const ext = (typeof name === 'string' ? path.extname(name) : '').toLowerCase().replace('.jpeg', '.jpg')
  if (!IMAGE.test(`x${ext}`)) throw new WorkbenchError(400, tx('그림은 png·jpg·gif·svg·webp', 'Pictures must be png, jpg, gif, svg, or webp'))
  const dir = topicFiguresDir(wb)
  fs.mkdirSync(dir, { recursive: true })
  for (const f of fs.readdirSync(dir)) if (f !== `${id}${ext}` && path.parse(f).name === id && IMAGE.test(f)) fs.rmSync(path.join(dir, f), { force: true })
  const file = path.join(dir, `${id}${ext}`)
  const tmp = `${file}.${process.pid}.tmp`
  fs.writeFileSync(tmp, bytes)
  fs.renameSync(tmp, file)
  return patchTopic(wb, id, { preview: { image: path.relative(path.dirname(wb.root), file).split(path.sep).join('/') } })
}

/** 주제 미리보기 그림의 실제 파일 (저장소 안, 그림만). 없으면 404 */
export function topicImageFile(wb: Workbench, id: string): string {
  const t = readTopics(wb).find((x) => x.id === id)
  if (!t) throw new WorkbenchError(404, tx(`없는 주제: ${id}`, `No such topic: ${id}`))
  if (!t.preview?.image) throw new WorkbenchError(404, tx('이 주제에는 그림이 없음', 'This topic has no picture'))
  const repo = fs.realpathSync(path.dirname(wb.root))
  const abs = path.resolve(repo, t.preview.image)
  if (!fs.existsSync(abs)) throw new WorkbenchError(404, tx(`그림이 없음: ${t.preview.image}`, `No such picture: ${t.preview.image}`))
  const real = fs.realpathSync(abs)
  if (!real.startsWith(repo + path.sep) || !fs.statSync(real).isFile()) throw new WorkbenchError(403, tx('저장소 밖의 그림', 'The picture is outside the repository'))
  return real
}
