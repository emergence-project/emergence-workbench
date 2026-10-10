import { enc, json, req, send } from './http'
import type { EntrySubjects, SubjectTree, SubjectTreeSaved } from '@rw/core/contract/subjects'
import type { ConceptMd } from './concepts'
export type { LibrarySubject, SubjectTree } from '@rw/core/contract/subjects'
export interface SubjectCount { subject: string; count: number; name?: string; parent?: string | null; model?: 'ids' }
export const subjectsApi = {
  tree: (note?: string) => req(`/api/subjects${note ? `?note=${enc(note)}` : ''}`).then((r) => json<SubjectTree>(r)),
  rename: (id: string, name: string, baseHash: string) => req('/api/subjects', send('PATCH', { id, name, baseHash })).then((r) => json<SubjectTreeSaved>(r)),
  add: (parent: string, name: string, slug: string, baseHash: string) => req('/api/subjects', send('POST', { parent, name, slug, baseHash })).then((r) => json<SubjectTreeSaved>(r)),
  concept: (id: string, subjects: string[], baseHash: string) => req(`/api/concepts/${enc(id)}/subjects`, send('PUT', { subjects, baseHash })).then((r) => json<ConceptMd>(r)),
  figure: (id: string, subjects: string[], baseHash: string) => req('/api/figures/subjects', send('PUT', { id, subjects, baseHash })).then((r) => json<EntrySubjects>(r)),
  paper: (key: string, subjects: string[], baseHash: string) => req(`/api/papers/${enc(key)}/subjects`, send('PUT', { subjects, baseHash })).then((r) => json<EntrySubjects>(r)),
}
export const matchesSubject = (ids: readonly string[] | undefined, prefix: string) => prefix === '' ? !ids?.length : !!ids?.some((id) => id === prefix || id.startsWith(`${prefix}/`))
