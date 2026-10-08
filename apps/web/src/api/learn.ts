// ---------- 공부할 것: "모름"과 개념노트 초안 (research-library/to-learn.yaml, 서버 learn.ts) ----------
import { enc, json, req, send } from './http'

export interface LearnFrom { rid?: string; project?: string; title?: string; target?: string; page?: number; quote?: string }
export interface LearnItem { id: string; term: string; at: string; note?: string; from?: LearnFrom; concept?: string }
/** drafting: 지금 Claude가 초안을 쓰고 있는 항목 id */
export interface LearnList { items: LearnItem[]; hash: string; exists: boolean; drafting: string[] }

export const learnApi = {
  list: () => req('/api/learn').then((r) => json<LearnList>(r)),
  add: (input: { term: string; note?: string; from?: LearnFrom; concept?: string }) => req('/api/learn', send('POST', input)).then((r) => json<LearnList & { item: LearnItem }>(r)),
  remove: (id: string) => req(`/api/learn/${enc(id)}`, { method: 'DELETE' }).then((r) => json<LearnList>(r)),
  link: (id: string, concept: string | null) => req(`/api/learn/${enc(id)}/concept`, send('POST', { concept: concept ?? '' })).then((r) => json<LearnList>(r)),
  /** 맥의 Claude가 개념노트 초안을 쓴다 (몇 분 걸릴 수 있다) */
  draft: (id: string) => req(`/api/learn/${enc(id)}/draft`, { method: 'POST' }).then((r) => json<LearnList & { concept: string; existed: boolean }>(r)),
}
