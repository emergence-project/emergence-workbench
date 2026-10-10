/**
 * 지식 API의 계약 (주제 색인 · 지식 지도 · Topic Review, 서버 routes/knowledge.ts · 화면 api/knowledge.ts).
 */
import { z } from 'zod'
import { CheckState } from './concepts.js'
import { LibraryUse } from './library.js'

export const KNOWLEDGE_STATUSES = ['study', 'draft', 'reviewed', 'paper'] as const

export const KnowledgeTopic = z.object({
  key: z.string(),
  title: z.string(),
  /** Study 분류 (Concept-Space 아래 폴더, 앞 두 단계). Study에 없으면 '' */
  subject: z.string(),
  status: z.enum(KNOWLEDGE_STATUSES),
  study: z.object({ path: z.string(), size: z.number() }).strict().optional(),
  concept: z.object({
    id: z.string(), status: z.string(), empty: z.boolean(), format: z.literal('md').optional(),
    unfinished: z.array(z.string()).optional(), checked: CheckState.optional(), locked: z.boolean().optional(),
  }).strict().optional(),
  review: z.object({ path: z.string(), title: z.string() }).strict().optional(),
  /** 이 주제에 붙은 문헌노트 id */
  papers: z.array(z.string()),
  /** 이 주제를 쓰는 프로젝트 작업노트 */
  uses: z.array(LibraryUse),
  /** 전제: 이 주제가 링크하는 주제 key */
  links: z.array(z.string()),
  /** 이어지는 개념: 이 주제를 링크하는 주제 key */
  linkedBy: z.array(z.string()),
  /** Study·Topic Review의 첫 문단 */
  summary: z.string().optional(),
  /** 이 주제로 이어지는 이름들의 topicKey */
  names: z.array(z.string()),
}).strict()

/** GET /knowledge. study · reviews: Study 폴더와 Topic Review 폴더를 정했는지 */
export const KnowledgeInfo = z.object({ topics: z.array(KnowledgeTopic), study: z.boolean(), reviews: z.boolean() }).strict()
/** GET /knowledge/review */
export const KnowledgeReview = z.object({ title: z.string(), text: z.string() }).strict()

export type KnowledgeStatus = (typeof KNOWLEDGE_STATUSES)[number]
export type KnowledgeTopic = z.infer<typeof KnowledgeTopic>
export type KnowledgeInfo = z.infer<typeof KnowledgeInfo>
export type KnowledgeReview = z.infer<typeof KnowledgeReview>
