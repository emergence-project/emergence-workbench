/**
 * 공부할 것 API의 계약 (research-library/to-learn.yaml, 서버 routes/learn.ts · 화면 api/learn.ts).
 * 파일 형식은 docs/repo-format.md, 여기는 앱 서버와 화면 사이의 모양이다.
 */
import { z } from 'zod'

/** 모름을 남긴 자리 */
export const LearnFrom = z.object({
  rid: z.string().optional(),
  project: z.string().optional(),
  /** 읽던 것 (논문·원고·노트 이름)과 코멘트 대상 이름 */
  title: z.string().optional(),
  target: z.string().optional(),
  page: z.number().optional(),
  /** 고른 글 */
  quote: z.string().optional(),
}).strict()

export const LearnItem = z.object({
  id: z.string(),
  /** 모르는 말 */
  term: z.string(),
  at: z.string(),
  note: z.string().optional(),
  from: LearnFrom.optional(),
  /** 연결된 개념노트 id */
  concept: z.string().optional(),
}).strict()

/** drafting: 지금 Claude가 초안을 쓰고 있는 항목 id */
export const LearnList = z.object({ items: z.array(LearnItem), hash: z.string(), exists: z.boolean(), drafting: z.array(z.string()) }).strict()
/** POST /learn */
export const LearnAdded = LearnList.extend({ item: LearnItem }).strict()
/** POST /learn/:id/draft. existed: 이미 있던 개념노트에 잇기만 했으면 true */
export const LearnDrafted = LearnList.extend({ concept: z.string(), existed: z.boolean() }).strict()

// ---------- 요청 ----------
// 길이·빈 말은 서버 learn.ts가 본다.

export const NewLearnBody = z.object({
  term: z.string(),
  note: z.string().optional(),
  from: LearnFrom.strip().optional(),
  concept: z.string().optional(),
})
/** 빈 값이거나 없으면 연결을 푼다 */
export const LearnConceptBody = z.object({ concept: z.string().optional() })

export type LearnFrom = z.infer<typeof LearnFrom>
export type LearnItem = z.infer<typeof LearnItem>
export type LearnList = z.infer<typeof LearnList>
export type LearnAdded = z.infer<typeof LearnAdded>
export type LearnDrafted = z.infer<typeof LearnDrafted>
export type NewLearnBody = z.input<typeof NewLearnBody>
export type LearnConceptBody = z.input<typeof LearnConceptBody>
