// ---------- 네트워킹 (서버 routes/network.ts) ----------
import type { Person } from '@rw/core'
import { json, req, send } from './http'

export interface PersonView { id: string; name: string; aliases: string[]; note?: string; author: boolean; affiliations: string[]; orgs: string[]; tags: string[]; email?: string; emails: string[]; homepage?: string; added: boolean; star: boolean }
export interface PersonPaper { key: string; title?: string; author?: string; year?: string; journal?: string; eprint?: string; doi?: string; where: { rid?: string; title: string }[] }

/** 등록 추천: bib에서 알 수 있는 것만 (보통 저자 이름뿐이라 소속·이메일은 없다) */
export interface PersonSuggestion { name: string; count: number; aliases?: string[]; latest?: { title?: string; year?: string }; where: string[] }
export interface Coauthor { id: string; name: string; count: number }
export const networkApi = {
  list: () => req('/api/network').then((r) => json<{ people: PersonView[] }>(r)),
  savePeople: (people: Person[]) => req('/api/network/people', send('PUT', { people })).then((r) => json<{ people: PersonView[] }>(r)),
  suggestions: () => req('/api/network/suggestions').then((r) => json<{ suggestions: PersonSuggestion[] }>(r)),
  person: (id: string) => req(`/api/network/people/${encodeURIComponent(id)}`).then((r) => json<{ person: PersonView; papers: PersonPaper[]; coauthors: Coauthor[] }>(r)),
}
