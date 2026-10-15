import fs from 'node:fs'
import path from 'node:path'
import type { LatexTemplate } from '@rw/core'
import type { Workbench } from './workbench.js'
import { bibKeys, citedKeys } from './libraryBib.js'

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

/** 공유 라이브러리에서 뽑은 참고문헌을 빌드·내보내기 폴더에 둘 이름 */
export const LIBRARY_CITED_BIB = 'library-refs.bib'

/**
 * 노트·프로젝트 bib에 없는 인용 키를 공유 라이브러리 references.bib에서 뽑은 글 (화면의 인용 찾기와 같은 차례).
 * 찾은 항목과 @string 정의만 담아, 프로젝트 bib와 키가 겹치지 않는다. 뽑을 것이 없으면 null.
 */
export function libraryCitedBib(latexBody: string, bibFiles: string[], libraryBib: string | undefined): string | null {
  if (!libraryBib || !fs.existsSync(libraryBib)) return null
  const have = new Set(bibFiles.flatMap((f) => bibKeys(fs.readFileSync(f, 'utf8'))))
  const missing = new Set(citedKeys(latexBody).filter((k) => !have.has(k)))
  if (!missing.size) return null
  const picked: string[] = []
  const strings: string[] = []
  for (const raw of bibEntriesRaw(fs.readFileSync(libraryBib, 'utf8'))) {
    const m = /^@(\w+)\s*[{(]\s*([^,\s]+)/.exec(raw)
    if (!m) continue
    if (/^string$/i.test(m[1]!)) strings.push(raw)
    else if (missing.has(m[2]!)) { picked.push(raw); missing.delete(m[2]!) }
  }
  return picked.length ? `% ${path.basename(libraryBib)} (shared library)\n\n${[...strings, ...picked].join('\n\n')}\n` : null
}

/** bib 글을 항목(@…{…}) 글자 그대로 나눈다. 괄호를 세어 항목 끝을 찾고, 항목 밖의 글은 버린다 */
function bibEntriesRaw(text: string): string[] {
  const out: string[] = []
  const head = /@\w+\s*[{(]/g
  let m: RegExpExecArray | null
  while ((m = head.exec(text))) {
    const open = text[head.lastIndex - 1]
    const close = open === '(' ? ')' : '}'
    let depth = 1
    let i = head.lastIndex
    for (; i < text.length && depth > 0; i++) {
      if (text[i] === '\\') { i++; continue }
      if (text[i] === '{' || (open === '(' && text[i] === '(')) depth++
      else if (text[i] === close || (open === '(' && text[i] === '}')) depth--
    }
    if (depth > 0) break
    out.push(text.slice(m.index, i))
    head.lastIndex = i
  }
  return out
}

/** 본문 끝에 붙일 줄. revtex는 서식이 정한 bib 꼴을 그대로 쓴다. names: \bibliography{…}에 쓸 이름(.bib 없이) */
export function bibliographyLines(template: Pick<LatexTemplate, 'documentClass'>, names: string[]): string[] {
  if (!names.length) return []
  return [...(/revtex/.test(template.documentClass) ? [] : ['\\bibliographystyle{unsrt}']), `\\bibliography{${names.join(',')}}`]
}
