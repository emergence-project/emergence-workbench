// ---------- 지식 (주제 색인 · 지식 지도 · Topic Review, 서버 knowledge.ts) ----------
import type { CheckState } from './concepts'
import { enc, json, req } from './http'
import type { LibraryUse } from './library'

export type KnowledgeStatus = 'study' | 'draft' | 'reviewed' | 'paper'
export interface KnowledgeTopic {
  key: string; title: string; subject: string; status: KnowledgeStatus
  study?: { path: string; size: number }
  concept?: { id: string; status: string; empty: boolean; format?: 'md'; unfinished?: string[]; checked?: CheckState; locked?: boolean }
  review?: { path: string; title: string }
  papers: string[]; uses: LibraryUse[]; links: string[]; linkedBy: string[]; summary?: string; names: string[]
}
export interface KnowledgeInfo { topics: KnowledgeTopic[]; study: boolean; reviews: boolean }
export const knowledgeApi = {
  index: () => req('/api/knowledge').then((r) => json<KnowledgeInfo>(r)),
  review: (path: string) => req(`/api/knowledge/review?path=${enc(path)}`).then((r) => json<{ title: string; text: string }>(r)),
}
/** 서버 topicKey와 같다: 이름 → 비교용 key */
export const topicKey = (name: string) => name.normalize('NFKD').replace(/[̀-ͯ]/g, '').normalize('NFC').toLowerCase().replace(/[^a-z0-9가-힣]+/g, '')
