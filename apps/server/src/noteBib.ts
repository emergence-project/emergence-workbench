import fs from 'node:fs'
import path from 'node:path'
import type { LatexTemplate } from '@rw/core'
import type { Workbench } from './workbench.js'

/**
 * Markdown 노트의 참고문헌 (LaTeX 노트는 본문에 \bibliography를 스스로 둔다).
 * 노트 폴더의 .bib가 있으면 그것, 없으면 프로젝트 bib(research.yaml의 bib:). 본문에 인용이 없으면 없음.
 */
export function noteBibFiles(wb: Workbench, mainAbs: string, latexBody: string): string[] {
  if (!/\\cite[a-z]*\*?(?:\[[^\]]*\])?\{/.test(latexBody)) return []
  const dir = path.dirname(mainAbs)
  const own = fs.readdirSync(dir).filter((f) => f.endsWith('.bib')).sort().map((f) => path.join(dir, f))
  if (own.length) return own
  const repo = wb.repo
  return wb.readResearch().sources.bib.map((b) => path.join(repo, b)).filter((f) => f.endsWith('.bib') && fs.existsSync(f))
}

/** 본문 끝에 붙일 줄. revtex는 서식이 정한 bib 꼴을 그대로 쓴다. names: \bibliography{…}에 쓸 이름(.bib 없이) */
export function bibliographyLines(template: Pick<LatexTemplate, 'documentClass'>, names: string[]): string[] {
  if (!names.length) return []
  return [...(/revtex/.test(template.documentClass) ? [] : ['\\bibliographystyle{unsrt}']), `\\bibliography{${names.join(',')}}`]
}
