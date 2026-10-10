// ---------- 네트워킹 (서버 routes/network.ts) ----------
import type { PeopleList, PersonPage, PersonSuggestions, SavePeopleBody } from '@rw/core/contract/network'
import { json, req, send } from './http'

export type { Coauthor, PersonPaper, PersonSuggestion, PersonView } from '@rw/core/contract/network'
export const networkApi = {
  list: () => req('/api/network').then((r) => json<PeopleList>(r)),
  savePeople: (people: SavePeopleBody['people']) => req('/api/network/people', send('PUT', { people })).then((r) => json<PeopleList>(r)),
  suggestions: () => req('/api/network/suggestions').then((r) => json<PersonSuggestions>(r)),
  person: (id: string) => req(`/api/network/people/${encodeURIComponent(id)}`).then((r) => json<PersonPage>(r)),
}
