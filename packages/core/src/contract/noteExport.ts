/**
 * 노트 내보내기 상자의 계약 (서버 routes/manuscript.ts · 화면 api/noteExport.ts).
 */
import { z } from 'zod'

/** GET /researches/:rid/export/options */
export const ExportOptions = z.object({
  /** 이 프로젝트의 서식 (research.yaml의 latex-template:, 없으면 내보내기 기본 서식) */
  template: z.string(),
  /** 노트(연구노트 · 계산 노트 · 보조 노트)를 고르지 않고 낼 때의 서식: latex-template:, 없으면 한 단 연구노트 서식 */
  noteTemplate: z.string(),
  templates: z.array(z.object({ id: z.string(), name: z.string(), kind: z.enum(['document', 'slides']) }).strict()),
}).strict()

export type ExportOptions = z.infer<typeof ExportOptions>
