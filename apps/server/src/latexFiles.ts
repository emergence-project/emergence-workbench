import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { LatexTemplate } from '@rw/core'
import { MACROS_FILE, parseMacros } from './conceptNotes.js'

/** 서식이 함께 쓰는 스타일 파일 (저장소 templates/latex/) */
export const LATEX_FILES_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../templates/latex')

/** 서식의 스타일 파일을 빌드 폴더에 둔다 (빌드 폴더는 TEXINPUTS 앞쪽이라 \usepackage가 찾는다) */
export function placeTemplateFiles(template: LatexTemplate | undefined, dir: string): void {
  for (const f of template?.files ?? []) {
    const src = path.join(LATEX_FILES_DIR, f)
    if (path.basename(f) === f && fs.existsSync(src)) fs.copyFileSync(src, path.join(dir, f))
  }
}

/** 모든 노트가 함께 쓰는 기호 파일을 LaTeX 컴파일에 넣을 때의 이름 (빌드 폴더·내보낸 폴더) */
export const SHARED_MACROS = 'shared-macros.tex'

/**
 * 공통 기호 (research-library의 concepts/macros.tex, 개념노트 화면의 KaTeX가 쓰는 것과 같은 파일, 10/4 "기호는 한 파일")를
 * 연구노트 컴파일·내보내기에 넣을 글로. 모두 \providecommand로 바꿔, 프로젝트 기호(workbench/macros.tex)나 패키지가
 * 이미 정한 이름은 그쪽이 앞선다 (그래서 프로젝트 기호 다음에 불러야 한다). 파일이 없거나 기호가 없으면 null.
 */
export function sharedMacrosTex(lib: string | undefined): string | null {
  const abs = lib ? path.join(lib, MACROS_FILE) : ''
  if (!abs || !fs.existsSync(abs)) return null
  const macros = parseMacros(fs.readFileSync(abs, 'utf8'))
  const names = Object.keys(macros)
  if (!names.length) return null
  return [
    `% research-workspace가 만든 파일: 공통 기호 (research-library/${MACROS_FILE}). 앞서 정한 이름은 건드리지 않는다.`,
    ...names.map((n) => {
      const body = macros[n]!
      const args = Math.max(0, ...[...body.matchAll(/#(\d)/g)].map((m) => Number(m[1])))
      return `\\providecommand{${n}}${args ? `[${args}]` : ''}{${body}}`
    }),
    '',
  ].join('\n')
}
