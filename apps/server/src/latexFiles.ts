import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { LatexTemplate } from '@rw/core'
import { MACROS_FILE, parseMacros } from './conceptNotes.js'

/** 서식이 함께 쓰는 스타일 파일 중 앱이 싣는 것 (저장소 templates/latex/) */
export const LATEX_FILES_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../templates/latex')
/** 앱에 싣지 않는 사용자 스타일 파일을 두는 곳: 설정 폴더 아래 (예: 공개하지 않는 발표 테마) */
export const USER_LATEX_FILES = 'latex-files'

let userFilesDir: string | null = null
/** 사용자 스타일 파일 폴더 (<설정 폴더>/latex-files). buildApp이 정한다 */
export function setUserLatexFilesDir(configDir: string): void { userFilesDir = path.join(configDir, USER_LATEX_FILES) }

/** 서식 파일 이름 → 실제 파일. 앱의 templates/latex/에서 먼저, 없으면 사용자 폴더에서 찾는다. 없거나 이름이 경로면 null */
export function templateFilePath(name: string): string | null {
  if (!name || path.basename(name) !== name) return null
  for (const d of [LATEX_FILES_DIR, userFilesDir]) {
    if (!d) continue
    const abs = path.join(d, name)
    if (fs.existsSync(abs)) return abs
  }
  return null
}

/** 서식의 스타일 파일을 빌드 폴더에 둔다 (빌드 폴더는 TEXINPUTS 앞쪽이라 \usepackage가 찾는다) */
export function placeTemplateFiles(template: LatexTemplate | undefined, dir: string): void {
  for (const f of template?.files ?? []) {
    const src = templateFilePath(f)
    if (src) fs.copyFileSync(src, path.join(dir, f))
  }
}

/** 모든 노트가 함께 쓰는 기호 파일을 LaTeX 컴파일에 넣을 때의 이름 (빌드 폴더·내보낸 폴더) */
export const SHARED_MACROS = 'shared-macros.tex'

/**
 * 공통 기호 (공유 라이브러리의 concepts/macros.tex, 개념노트 화면의 KaTeX가 쓰는 것과 같은 파일, 10/4 "기호는 한 파일")를
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
    `% research-workspace가 만든 파일: 공통 기호 (shared-library/${MACROS_FILE}). 앞서 정한 이름은 건드리지 않는다.`,
    ...names.map((n) => {
      const body = macros[n]!
      const args = Math.max(0, ...[...body.matchAll(/#(\d)/g)].map((m) => Number(m[1])))
      return `\\providecommand{${n}}${args ? `[${args}]` : ''}{${body}}`
    }),
    '',
  ].join('\n')
}
