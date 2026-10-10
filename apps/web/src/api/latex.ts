// ---------- LaTeX 서식 모음 · 저자와 소속 (서버 routes/latexSetup.ts) ----------
import type { LatexMacrosView, LatexSetupView, LatexTemplateAdded, SaveAuthorsBody, SaveTemplateBody } from '@rw/core/contract/latex'
import { enc, json, req, send } from './http'

/** 모든 노트가 함께 쓰는 기호(LatexMacrosView): research-library의 concepts/macros.tex (개념노트 화면과 LaTeX 컴파일이 함께 쓴다) */
export type { LatexMacrosView, LatexSetupView } from '@rw/core/contract/latex'

export const latexApi = {
  get: () => req('/api/latex-setup').then((r) => json<LatexSetupView>(r)),
  saveTemplate: (id: string, template: SaveTemplateBody['template']) => req(`/api/latex-templates/${enc(id)}`, send('PUT', { template })).then((r) => json<LatexSetupView>(r)),
  addTemplate: (from: string, name?: string) => req('/api/latex-templates', send('POST', { from, name })).then((r) => json<LatexTemplateAdded>(r)),
  removeTemplate: (id: string) => req(`/api/latex-templates/${enc(id)}`, { method: 'DELETE' }).then((r) => json<LatexSetupView>(r)),
  setDefault: (id: string) => req('/api/latex-templates-default', send('PUT', { id })).then((r) => json<LatexSetupView>(r)),
  saveAuthors: (authors: SaveAuthorsBody['authors']) => req('/api/authors', send('PUT', { authors })).then((r) => json<LatexSetupView>(r)),
  /** 서식 카드의 미리보기 PDF. v는 서식이 바뀌면 바뀌는 값 (브라우저가 지난 것을 쓰지 않게) */
  previewUrl: (id: string, v: string) => `/api/latex-templates/${enc(id)}/preview.pdf?v=${enc(String(v.length) + '-' + [...v].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 0))}`,
  macros: () => req('/api/latex-macros').then((r) => json<LatexMacrosView>(r)),
  saveMacros: (text: string, baseHash: string) => req('/api/latex-macros', send('PUT', { text, baseHash })).then((r) => json<LatexMacrosView>(r)),
  downloadUrl: (file: string, template: string) => `/api/latex-setup/download/${file}?template=${enc(template)}`,
}
