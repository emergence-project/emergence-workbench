// ---------- 지식 (주제 색인 · 지식 지도 · Topic Review, 서버 knowledge.ts) ----------
import type { KnowledgeInfo, KnowledgeReview } from '@rw/core/contract/knowledge'
import { enc, json, req } from './http'

export type { KnowledgeInfo, KnowledgeStatus, KnowledgeTopic } from '@rw/core/contract/knowledge'
export const knowledgeApi = {
  index: () => req('/api/knowledge').then((r) => json<KnowledgeInfo>(r)),
  review: (path: string) => req(`/api/knowledge/review?path=${enc(path)}`).then((r) => json<KnowledgeReview>(r)),
}
/** 서버 topicKey와 같다: 이름 → 비교용 key */
export const topicKey = (name: string) => name.normalize('NFKD').replace(/[̀-ͯ]/g, '').normalize('NFC').toLowerCase().replace(/[^a-z0-9가-힣]+/g, '')
