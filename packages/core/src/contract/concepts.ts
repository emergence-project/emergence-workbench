/**
 * 개념노트 API의 계약 (research-library/concepts/, 서버 routes/concepts.ts · 화면 api/concepts.ts).
 * 파일 형식은 docs/repo-format.md, 여기는 앱 서버와 화면 사이의 모양이다.
 */
import { z } from 'zod'

/** 확인 표시: 없음 · 확인한 본문 그대로 · 확인한 뒤 본문이 바뀜 */
export const CHECK_STATES = ['none', 'ok', 'changed'] as const
export const CheckState = z.enum(CHECK_STATES)

export type CheckState = z.infer<typeof CheckState>
