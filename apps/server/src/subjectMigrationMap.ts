import YAML from 'yaml'
import { parseSubjects } from './subjects.js'

export const normalizeSubjectPath = (value: string) => value.split('›').map((part) => part.trim()).join(' › ')
export interface SubjectMapping {
  subjectsYaml: string
  paths: Map<string, string>
  notes: Map<string, string[]>
  tags: Map<string, string>
}

/** Validate even unused entries: the mapping is a complete, hand-reviewed decision. */
export function parseSubjectMapping(raw: string): SubjectMapping {
  const doc = YAML.parseDocument(raw)
  if (doc.errors.length || !YAML.isMap(doc.contents)) throw new Error('대응표 YAML을 읽지 못했습니다')
  const value = doc.toJS() as Record<string, unknown>
  const record = (key: string): Record<string, unknown> => {
    const entry = value[key]
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new Error(`대응표 ${key}는 표여야 합니다`)
    return entry as Record<string, unknown>
  }
  const subjectsYaml = YAML.stringify(record('tree'), { lineWidth: 0 })
  const ids = new Set(parseSubjects(subjectsYaml).map((s) => s.id))
  const id = (entry: unknown, where: string): string => {
    if (typeof entry !== 'string' || !ids.has(entry)) throw new Error(`대응표에 없는 분류 ID (${where}): ${String(entry)}`)
    return entry
  }
  const paths = new Map<string, string>()
  for (const [old, target] of Object.entries(record('paths'))) {
    const normalized = normalizeSubjectPath(old)
    if (!normalized || paths.has(normalized)) throw new Error(`비어 있거나 중복된 대응표 경로: ${old}`)
    paths.set(normalized, id(target, `paths.${old}`))
  }
  const notes = new Map<string, string[]>()
  for (const [file, targets] of Object.entries(record('notes'))) {
    if (!Array.isArray(targets) || targets.length > 3 || new Set(targets).size !== targets.length) throw new Error(`노트 분류는 중복 없이 0–3개여야 합니다: ${file}`)
    notes.set(file, targets.map((target) => id(target, `notes.${file}`)))
  }
  const tags = new Map(Object.entries(record('tags')).map(([tag, target]) => [tag, id(target, `tags.${tag}`)]))
  return { subjectsYaml, paths, notes, tags }
}

/** Refine subjects in place, including the primary; retain up to three choices in tag order. */
export function mappedSecondaries(primary: string | undefined, fm: Record<string, unknown>, tags: Map<string, string>): { subjects: string[]; secondaryFrom: string[] } {
  const chosen = primary ? [{ id: primary, tag: '' }] : []
  const legacyTags = [fm.subjects, fm.domains].flatMap((v) => Array.isArray(v) ? v : [])
  for (const tag of legacyTags) {
    if (typeof tag !== 'string') continue
    const id = tags.get(tag)
    if (!id || chosen.some((s) => s.id === id || s.id.startsWith(`${id}/`))) continue
    const ancestor = chosen.findIndex((s) => id.startsWith(`${s.id}/`))
    if (ancestor >= 0) chosen[ancestor] = { id, tag }
    else if (chosen.length < 3) chosen.push({ id, tag })
  }
  return { subjects: chosen.map((s) => s.id), secondaryFrom: chosen.filter((s) => s.tag !== '').map((s) => s.tag) }
}
