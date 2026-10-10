// ---------- 공부할 것: "모름"과 개념노트 초안 (research-library/to-learn.yaml, 서버 learn.ts) ----------
import type { LearnAdded, LearnDrafted, LearnList, NewLearnBody } from '@rw/core/contract/learn'
import { enc, json, req, send } from './http'

export type { LearnFrom, LearnItem, LearnList } from '@rw/core/contract/learn'

export const learnApi = {
  list: () => req('/api/learn').then((r) => json<LearnList>(r)),
  add: (input: NewLearnBody) => req('/api/learn', send('POST', input)).then((r) => json<LearnAdded>(r)),
  remove: (id: string) => req(`/api/learn/${enc(id)}`, { method: 'DELETE' }).then((r) => json<LearnList>(r)),
  link: (id: string, concept: string | null) => req(`/api/learn/${enc(id)}/concept`, send('POST', { concept: concept ?? '' })).then((r) => json<LearnList>(r)),
  /** 맥의 Claude가 개념노트 초안을 쓴다 (몇 분 걸릴 수 있다) */
  draft: (id: string) => req(`/api/learn/${enc(id)}/draft`, { method: 'POST' }).then((r) => json<LearnDrafted>(r)),
}
