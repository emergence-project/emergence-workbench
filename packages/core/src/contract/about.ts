/**
 * 소개 절 확인 기록 API의 계약 (피드백 폴더 about.yaml, 서버 aboutChecks.ts · routes/about.ts, 화면 api/about.ts · aboutChecks.ts).
 * 11/11 「안 C′」: 확인 단위는 절 하나, 확인함은 확인한 때의 PR 번호로 계산한다.
 */
import { z } from 'zod'

/** 절 하나의 기록 */
export const AboutCheck = z.object({
  /** 확인한 때 그 절의 마지막 PR (PR이 없던 절은 0) */
  checked: z.number().int().optional(),
  /** 확인한 날 (YYYY-MM-DD) */
  at: z.string().optional(),
  /** 고쳐 보낸 때 그 절의 마지막 PR */
  sentPr: z.number().int().optional(),
  /** 고쳐 보낸 시각 */
  sent: z.string().optional(),
  /** 업데이트 줄마다 확인한 날 (PR 번호 → YYYY-MM-DD, 11/20 시안 2절) */
  ok: z.record(z.string(), z.string()).optional(),
}).strict()

export const AboutChecks = z.object({
  /** 피드백 폴더가 있어 기록할 수 있는지 */
  enabled: z.boolean(),
  /** 기록 파일이 있는지 (없으면 아직 확인을 시작하지 않은 것: 확인 전을 세지 않는다) */
  exists: z.boolean(),
  /** 키는 <쪽>/<절> */
  sections: z.record(z.string(), AboutCheck),
  /** PR 번호 → 합친 날 (이력 보기, 앱 저장소가 없으면 빈 표) */
  prDates: z.record(z.string(), z.string()),
  /** PR 번호 → 업데이트 제목 (소개 이력 사이드바, 설정 › 업데이트 이력과 같은 말. 앱 저장소가 없으면 빈 표) */
  prTitles: z.record(z.string(), z.string()),
}).strict()

export const AboutCheckBody = z.object({
  key: z.string().min(1).max(200),
  action: z.enum(['check', 'ok', 'sent']),
  /** check · sent: 그때 그 절의 마지막 PR (없으면 0). ok: 확인한 업데이트 */
  pr: z.number().int().min(0),
})

/** GET /api/about/changes?pr=N */
export const AboutChangesQuery = z.object({ pr: z.coerce.number().int().positive() })

/** 업데이트 하나가 소개 글에서 바꾼 것 (GET /api/about/changes?pr=N) */
export const AboutChanges = z.object({
  pr: z.number().int(),
  /** 새로 생긴 문장 (한국어 · 영어 소스 둘 다. 화면이 지금 본문에서 찾는다) */
  sentences: z.array(z.string()),
  /** 커밋 본문의 요약 줄 */
  summary: z.array(z.string()),
}).strict()

export type AboutChanges = z.infer<typeof AboutChanges>
export type AboutCheck = z.infer<typeof AboutCheck>
export type AboutChecks = z.infer<typeof AboutChecks>
export type AboutCheckBody = z.infer<typeof AboutCheckBody>

/** GET /api/about/guide: 에이전트가 읽는 소개 절 (MCP about · pnpm agent:about과 같은 계산, about-guide.ts) */
export const AboutGuideQuery = z.object({
  section: z.string().max(200).optional(),
  file: z.string().max(500).optional(),
  tool: z.string().max(100).optional(),
  lang: z.enum(['ko', 'en']).optional(),
})

export const AboutGuide = z.object({
  /** 물음이 비면 목록 한 줄씩, 있으면 맞는 절의 전문 */
  text: z.string(),
  /** 맞은 절 키 */
  keys: z.array(z.string()),
  /** 읽지 못한 절 파일 (형식 오류) */
  errors: z.array(z.string()),
}).strict()

export type AboutGuideQuery = z.infer<typeof AboutGuideQuery>
export type AboutGuide = z.infer<typeof AboutGuide>
