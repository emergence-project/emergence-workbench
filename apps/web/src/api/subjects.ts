import { enc, json, req, send } from './http'
import type { ConceptMd } from './concepts'
export interface LibrarySubject { id: string; name: string; parent: string | null; notes: number; figures: number; papers: number }
export interface SubjectTree { enabled: boolean; unclassified?: { notes: number; figures: number; papers: number }; hash: string; items: LibrarySubject[]; suggestions: { id: string; reason: string }[] }
export interface SubjectCount { subject: string; count: number; name?: string; parent?: string | null; model?: 'ids' }
export const subjectsApi = {
  tree: (note?: string) => req(`/api/subjects${note ? `?note=${enc(note)}` : ''}`).then((r) => json<SubjectTree>(r)),
  rename: (id: string, name: string, baseHash: string) => req('/api/subjects', send('PATCH', { id, name, baseHash })).then((r) => json<SubjectTree>(r)),
  add: (parent: string, name: string, slug: string, baseHash: string) => req('/api/subjects', send('POST', { parent, name, slug, baseHash })).then((r) => json<SubjectTree>(r)),
  concept: (id: string, subjects: string[], baseHash: string) => req(`/api/concepts/${enc(id)}/subjects`, send('PUT', { subjects, baseHash })).then((r) => json<ConceptMd>(r)),
  figure: (id: string, subjects: string[], baseHash: string) => req('/api/figures/subjects', send('PUT', { id, subjects, baseHash })).then((r) => json<{ hash: string }>(r)),
  paper: (key: string, subjects: string[], baseHash: string) => req(`/api/papers/${enc(key)}/subjects`, send('PUT', { subjects, baseHash })).then((r) => json<{ hash: string }>(r)),
}
export const matchesSubject = (ids: readonly string[] | undefined, prefix: string) => prefix === '' ? !ids?.length : !!ids?.some((id) => id === prefix || id.startsWith(`${prefix}/`))
