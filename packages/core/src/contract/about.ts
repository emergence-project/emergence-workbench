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
}).strict()

export const AboutCheckBody = z.object({
  key: z.string().min(1).max(200),
  action: z.enum(['check', 'sent']),
  /** 그때 그 절의 마지막 PR (없으면 0) */
  pr: z.number().int().min(0),
})

export type AboutCheck = z.infer<typeof AboutCheck>
export type AboutChecks = z.infer<typeof AboutChecks>
export type AboutCheckBody = z.infer<typeof AboutCheckBody>
