// ---------- LaTeX 서식 모음 · 저자와 소속 (서버 routes/latexSetup.ts) ----------
import type { Author, LatexTemplate } from '@rw/core'
import { enc, json, req, send } from './http'

export interface LatexSetupView {
  templates: LatexTemplate[]
  /** 내보낼 때 쓰는 서식 */
  defaultTemplate: string
  authors: Author[]
  packages: { name: string; options?: string; desc: string }[]
  /** 서식마다 내보내면 생기는 main.tex(제목 자리 표시)과 setting.tex */
  previews: Record<string, { main: string; setting: string }>
}

/** 모든 노트가 함께 쓰는 기호: research-library의 concepts/macros.tex (개념노트 화면과 LaTeX 컴파일이 함께 쓴다) */
export interface LatexMacrosView {
  file: string
  /** 파일 내용의 해시 (고칠 때 baseHash) */
  hash: string
  /** 개념노트 라이브러리를 정했는지 (없으면 고칠 수 없다) */
  library: boolean
  exists: boolean
  text: string
  /** 이름 → KaTeX에 넘기는 정의 */
  macros: Record<string, string>
}

export const latexApi = {
  get: () => req('/api/latex-setup').then((r) => json<LatexSetupView>(r)),
  saveTemplate: (id: string, template: Partial<LatexTemplate>) => req(`/api/latex-templates/${enc(id)}`, send('PUT', { template })).then((r) => json<LatexSetupView>(r)),
  addTemplate: (from: string, name?: string) => req('/api/latex-templates', send('POST', { from, name })).then((r) => json<LatexSetupView & { created: string }>(r)),
  removeTemplate: (id: string) => req(`/api/latex-templates/${enc(id)}`, { method: 'DELETE' }).then((r) => json<LatexSetupView>(r)),
  setDefault: (id: string) => req('/api/latex-templates-default', send('PUT', { id })).then((r) => json<LatexSetupView>(r)),
  saveAuthors: (authors: Author[]) => req('/api/authors', send('PUT', { authors })).then((r) => json<LatexSetupView>(r)),
  /** 서식 카드의 미리보기 PDF. v는 서식이 바뀌면 바뀌는 값 (브라우저가 지난 것을 쓰지 않게) */
  previewUrl: (id: string, v: string) => `/api/latex-templates/${enc(id)}/preview.pdf?v=${enc(String(v.length) + '-' + [...v].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 0))}`,
  macros: () => req('/api/latex-macros').then((r) => json<LatexMacrosView>(r)),
  saveMacros: (text: string, baseHash: string) => req('/api/latex-macros', send('PUT', { text, baseHash })).then((r) => json<LatexMacrosView>(r)),
  downloadUrl: (file: string, template: string) => `/api/latex-setup/download/${file}?template=${enc(template)}`,
}
