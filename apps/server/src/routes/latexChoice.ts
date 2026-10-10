import type { Author } from '@rw/core'
import type { Registry } from '../registry.js'
import { WorkbenchError, type NoteKind, type Workbench } from '../workbench.js'
import { t } from '../i18n.js'

/** 노트의 기본 서식 (한 단). 앱 기본 서식 목록의 id */
export const NOTE_TEMPLATE = 'research-note'

/** 컴파일과 내보내기에서 함께 쓰는 서식·저자·날짜 선택. */
export type LatexChoiceQuery = { au?: string | string[]; tpl?: string; date?: string }
export const queryList = (v: string | string[] | undefined): string[] => Array.isArray(v) ? v : typeof v === 'string' ? [v] : []

export function latexChoices(registry: Registry) {
  /**
   * 고르지 않았을 때의 서식: research.yaml의 latex-template:, 없으면 노트(연구노트 · 계산 노트 · 블록 노트)는 한 단 연구노트 서식,
   * 원고는 앱의 내보내기 기본 서식 (10/8 11:42 "연구노트는 기본을 one column으로")
   */
  const projectTemplate = (wb: Workbench, kind: NoteKind = 'paper') => {
    const id = wb.readResearch().latexTemplate
    if (id && registry.latexTemplates.some((t) => t.id === id)) return id
    return kind !== 'paper' && registry.latexTemplates.some((t) => t.id === NOTE_TEMPLATE) ? NOTE_TEMPLATE : registry.latexDefault
  }
  const latexPick = (wb: Workbench, q: LatexChoiceQuery, lenient = false, kind: NoteKind = 'paper') => {
    const find = (name: string): Author | undefined => registry.authors.find((a) => a.name === name)
      ?? (() => { const p = registry.people.find((x) => x.name === name || x.aliases?.includes(name)); return p ? { name: p.name, affiliations: [] } : undefined })()
    const names = [...new Set(queryList(q.au).map((x) => x.trim()).filter(Boolean))]
    const authors = q.au === undefined ? undefined : names.map(find).filter((a): a is Author => !!a)
    const d = q.date
    if (d !== undefined && !/^(?:none|today|\d{4}-\d{2}-\d{2})$/.test(d)) throw new WorkbenchError(400, t('날짜는 none, today 또는 YYYY-MM-DD', 'Date must be none, today or YYYY-MM-DD'))
    const date = d === undefined ? undefined : d === 'none' ? '' : d === 'today' ? '\\today' : d
    const asked = typeof q.tpl === 'string' && q.tpl && (!lenient || registry.latexTemplates.some((t) => t.id === q.tpl)) ? q.tpl : ''
    return { template: registry.template(asked || projectTemplate(wb, kind)), ...(authors && { authors }), ...(date !== undefined && { date }) }
  }
  return { projectTemplate, latexPick }
}
