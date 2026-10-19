// ---------- 네트워킹 (서버 routes/network.ts) ----------
import type { NewPapers, PeopleList, PersonPage, PersonSuggestions, S2Authors, SavePeopleBody } from '@rw/core/contract/network'
import { json, req, send } from './http'

export type { Coauthor, NewPaper, NewPapers, PersonAppearance, PersonPaper, PersonSuggestion, PersonView, S2Author } from '@rw/core/contract/network'
const person = (id: string) => `/api/network/people/${encodeURIComponent(id)}`
export const networkApi = {
  list: () => req('/api/network').then((r) => json<PeopleList>(r)),
  savePeople: (people: SavePeopleBody['people']) => req('/api/network/people', send('PUT', { people })).then((r) => json<PeopleList>(r)),
  suggestions: () => req('/api/network/suggestions').then((r) => json<PersonSuggestions>(r)),
  person: (id: string) => req(person(id)).then((r) => json<PersonPage>(r)),
  /** 사람 페이지의 새 논문 (10/19): 하루에 한 번 찾은 결과 */
  newPapers: (id: string) => req(`${person(id)}/new-papers`).then((r) => json<NewPapers>(r)),
  seenPapers: (id: string) => req(`${person(id)}/new-papers/seen`, { method: 'POST' }).then((r) => json<PeopleList>(r)),
  hidePaper: (id: string, paper: string) => req(`${person(id)}/new-papers/hide`, send('POST', { paper })).then((r) => json<PeopleList>(r)),
  s2Search: (q: string) => req(`/api/network/s2?q=${encodeURIComponent(q)}`).then((r) => json<S2Authors>(r)),
  savePhoto: (id: string, data: string) => req(`${person(id)}/photo`, send('PUT', { data })).then((r) => json<PeopleList>(r)),
  removePhoto: (id: string) => req(`${person(id)}/photo`, { method: 'DELETE' }).then((r) => json<PeopleList>(r)),
  photoUrl: (id: string, stamp: number) => `${person(id)}/photo?v=${stamp}`,
}
