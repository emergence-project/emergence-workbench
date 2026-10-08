import fs from 'node:fs'
import path from 'node:path'
import YAML from 'yaml'
import { fileCache } from './readCache.js'
import { hashOf, writeAtomic } from './fsutil.js'
import { WorkbenchError } from './workbench.js'
import { t } from './i18n.js'

export interface Subject { id: string; name: string; parent: string | null }
export interface SubjectTree { enabled: boolean; hash: string; items: Subject[] }
export const SUBJECT_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*){0,2}$/
export function parseSubjects(raw: string): Subject[] {
  const doc = YAML.parseDocument(raw)
  if (doc.errors.length || (doc.contents !== null && !YAML.isMap(doc.contents))) throw new WorkbenchError(422, t('subjects.yaml을 읽지 못했습니다', 'Could not read subjects.yaml'))
  const map = (doc.toJS() ?? {}) as Record<string, { name?: unknown }>
  const items = Object.entries(map).map(([id, entry]) => {
    if (!SUBJECT_ID.test(id) || !entry || typeof entry.name !== 'string' || !entry.name.trim()) throw new WorkbenchError(422, t(`올바르지 않은 분류: ${id}`, `Invalid subject: ${id}`))
    return { id, name: entry.name.trim(), parent: id.includes('/') ? id.slice(0, id.lastIndexOf('/')) : null }
  })
  for (const item of items) if (item.parent && !Object.hasOwn(map, item.parent)) throw new WorkbenchError(422, t(`상위 분류가 없습니다: ${item.parent}`, `Parent subject not found: ${item.parent}`))
  return items
}
const cachedTree = fileCache((raw): SubjectTree => ({ enabled: true, hash: hashOf(raw), items: parseSubjects(raw) }))
export function readSubjects(lib: string | undefined): SubjectTree {
  const file = lib && path.join(lib, 'subjects.yaml')
  return file && fs.existsSync(file) ? cachedTree(file) : { enabled: false, hash: hashOf(''), items: [] }
}
/** Invalid external metadata stays visible as unclassified; never partially classify it. */
export function acceptedSubjects(tree: SubjectTree, value: unknown): string[] {
  if (!tree.enabled || !Array.isArray(value) || value.length > 3 || value.some((id) => typeof id !== 'string' || !tree.items.some((s) => s.id === id)) || new Set(value).size !== value.length) return []
  return value as string[]
}
export function validateSubjects(lib: string | undefined, value: unknown): string[] {
  const tree = readSubjects(lib)
  if (!tree.enabled) throw new WorkbenchError(409, t('분류 나무를 먼저 마련해 주세요', 'Set up the subject tree first'))
  // [] explicitly removes classification; classified items carry 1–3 unique IDs.
  if (!Array.isArray(value) || value.length > 3 || acceptedSubjects(tree, value).length !== value.length) throw new WorkbenchError(400, t('나무에 있는 분류를 1–3개 골라 주세요 (빈 목록은 분류 빼기)', 'Choose 1–3 subjects from the tree (an empty list removes subjects)'))
  return value as string[]
}
export const matchesSubject = (ids: readonly string[] | undefined, prefix: string) => prefix === '' ? !ids?.length : !!ids?.some((id) => id === prefix || id.startsWith(`${prefix}/`))
export function subjectLabel(tree: SubjectTree, id: string): string {
  return id.split('/').map((_, i, parts) => tree.items.find((s) => s.id === parts.slice(0, i + 1).join('/'))?.name ?? '').join(' › ')
}
export function subjectSlug(name: string): string {
  return name.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40).replace(/-$/, '')
}
const cachedHash = fileCache((raw) => hashOf(raw))
export function readYamlHash(file: string): string { return fs.existsSync(file) ? cachedHash(file) : hashOf('') }
export function editYaml(file: string, baseHash: unknown, edit: (doc: YAML.Document) => void): string {
  const raw = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : ''
  if (typeof baseHash !== 'string') throw new WorkbenchError(400, t('baseHash가 필요합니다', 'baseHash is required'))
  if (hashOf(raw) !== baseHash) throw new WorkbenchError(409, t('다른 곳에서 파일이 바뀌었습니다. 다시 읽어 주세요', 'The file changed elsewhere. Read it again'))
  const doc = YAML.parseDocument(raw)
  if (doc.errors.length || (doc.contents !== null && !YAML.isMap(doc.contents))) throw new WorkbenchError(422, t('YAML을 읽지 못해 고치지 않았습니다', 'Could not read the YAML, so nothing was changed'))
  if (doc.contents === null) doc.contents = doc.createNode({}) as never
  edit(doc)
  const next = doc.toString({ lineWidth: 0 })
  writeAtomic(file, next)
  return hashOf(next)
}
export function changeSubject(lib: string | undefined, input: { id?: unknown; name?: unknown; parent?: unknown; slug?: unknown; baseHash?: unknown }, add: boolean): SubjectTree {
  const tree = readSubjects(lib)
  if (!lib || !tree.enabled) throw new WorkbenchError(409, t('분류 나무가 없습니다', 'There is no subject tree'))
  if (typeof input.name !== 'string' || !input.name.trim() || input.name.trim().length > 120) throw new WorkbenchError(400, t('분류 이름을 120자 이내로 적어 주세요', 'Write a subject name of up to 120 characters'))
  let id = input.id
  if (add) {
    const parent = input.parent ?? ''
    if (typeof parent !== 'string' || (parent && !tree.items.some((s) => s.id === parent))) throw new WorkbenchError(400, t('상위 분류가 없습니다', 'Parent subject not found'))
    const slug = typeof input.slug === 'string' ? input.slug : subjectSlug(input.name)
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new WorkbenchError(400, t('ID 끝부분은 영문 소문자·숫자·하이픈으로 적어 주세요', 'Write the end of the ID with lowercase letters, digits and hyphens'))
    id = parent ? `${parent}/${slug}` : slug
    if (!SUBJECT_ID.test(id as string)) throw new WorkbenchError(400, t('분류 ID는 영문 소문자·숫자·하이픈, 깊이는 3단계까지입니다', 'Subject IDs use lowercase letters, digits and hyphens, up to 3 levels deep'))
    if (tree.items.some((s) => s.id === id)) throw new WorkbenchError(409, t('이미 있는 분류 ID입니다', 'This subject ID already exists'))
  } else if (!tree.items.some((s) => s.id === id)) throw new WorkbenchError(404, t('없는 분류입니다', 'No such subject'))
  editYaml(path.join(lib, 'subjects.yaml'), input.baseHash, (doc) => doc.setIn([id as string, 'name'], input.name!.toString().trim()))
  return readSubjects(lib)
}
export function setEntrySubjects(lib: string | undefined, file: string, key: string, value: unknown, baseHash: unknown): { subjects: string[]; hash: string } {
  const subjects = validateSubjects(lib, value)
  const hash = editYaml(file, baseHash, (doc) => {
    let entry = doc.get(key, true)
    if (YAML.isScalar(entry) && entry.value == null) { doc.delete(key); entry = undefined }
    if (entry != null && !YAML.isMap(entry)) throw new WorkbenchError(422, t('항목이 YAML 표가 아니어서 고치지 않았습니다', 'The entry is not a YAML map, so nothing was changed'))
    if (!entry) doc.set(key, doc.createNode({}))
    doc.setIn([key, 'subjects'], doc.createNode(subjects))
  })
  return { subjects, hash }
}
