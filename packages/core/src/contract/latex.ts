/**
 * LaTeX 서식 모음 · 저자와 소속 · 함께 쓰는 기호 API의 계약 (서버 routes/latexSetup.ts · 화면 api/latex.ts).
 * 서식과 저자의 모양은 @rw/core의 LatexTemplate · Author와 같다.
 */
import { z } from 'zod'
import type { Author as AuthorType, LatexTemplate as LatexTemplateType } from '../latex-setup.js'

export const LatexTemplate = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.enum(['document', 'slides']),
  documentClass: z.string(),
  preamble: z.string(),
  packages: z.array(z.string()),
  settingExtra: z.string(),
  /** main.tex 옆에 함께 둘 스타일 파일 (저장소 templates/latex/) */
  files: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
}).strict() satisfies z.ZodType<LatexTemplateType>

export const Author = z.object({
  name: z.string(),
  email: z.string().optional(),
  emails: z.array(z.string()).optional(),
  corresponding: z.boolean().optional(),
  affiliations: z.array(z.string()),
}).strict() satisfies z.ZodType<AuthorType>

/** GET /latex-setup와 서식·저자를 고친 뒤 */
export const LatexSetupView = z.object({
  templates: z.array(LatexTemplate),
  /** 내보낼 때 쓰는 서식 */
  defaultTemplate: z.string(),
  authors: z.array(Author),
  packages: z.array(z.object({ name: z.string(), options: z.string().optional(), desc: z.string() }).strict()),
  /** 서식마다 내보내면 생기는 main.tex(제목 자리 표시)과 setting.tex */
  previews: z.record(z.object({ main: z.string(), setting: z.string() }).strict()),
}).strict()
/** POST /latex-templates: 새 서식 id */
export const LatexTemplateAdded = LatexSetupView.extend({ created: z.string() }).strict()

/** 모든 노트가 함께 쓰는 기호: research-library의 concepts/macros.tex */
export const LatexMacrosView = z.object({
  file: z.string(),
  /** 파일 내용의 해시 (고칠 때 baseHash) */
  hash: z.string(),
  /** 개념노트 라이브러리를 정했는지 (없으면 고칠 수 없다) */
  library: z.boolean(),
  exists: z.boolean(),
  text: z.string(),
  /** 이름 → KaTeX에 넘기는 정의 */
  macros: z.record(z.string()),
}).strict()

// ---------- 요청 ----------
// 길이·개수 제한과 모르는 값은 @rw/core normalizeTemplate · normalizeAuthors가 정리한다.

/** 바꿀 칸만 보낸다 (id와 함께 둘 파일은 바꾸지 않는다) */
export const SaveTemplateBody = z.object({ template: LatexTemplate.omit({ id: true, files: true }).partial().strip() })
/** from: 복사할 서식 id */
export const AddTemplateBody = z.object({ from: z.string(), name: z.string().optional() })
export const DefaultTemplateBody = z.object({ id: z.string() })
export const SaveAuthorsBody = z.object({ authors: z.array(Author.strip()) })
export const SaveMacrosBody = z.object({ text: z.string().max(200_000), baseHash: z.string().min(1, 'baseHash (the hash received when reading) is required') })

export type LatexSetupView = z.infer<typeof LatexSetupView>
export type LatexTemplateAdded = z.infer<typeof LatexTemplateAdded>
export type LatexMacrosView = z.infer<typeof LatexMacrosView>
export type SaveTemplateBody = z.input<typeof SaveTemplateBody>
export type AddTemplateBody = z.input<typeof AddTemplateBody>
export type DefaultTemplateBody = z.input<typeof DefaultTemplateBody>
export type SaveAuthorsBody = z.input<typeof SaveAuthorsBody>
export type SaveMacrosBody = z.input<typeof SaveMacrosBody>
