import { tr } from './i18n.js'
export interface BlockDocumentPaths {
  /** 연구의 공통 서식 파일 절대 경로 (workbench/preamble.tex) */
  preamble: string
  /** 블록 파일 절대 경로 (workbench/blocks/<id>.tex) */
  block: string
  /** 그림 폴더 절대 경로 (workbench/figures) */
  figures: string
  /** 공유 라이브러리 절대 경로. 있으면 \input{preamble/base.tex}처럼 라이브러리 안 경로로 찾을 수 있다 */
  library?: string
}

export const DOCUMENT_CLASS = '\\documentclass[11pt]{article}'

/** 주석 밖에 \documentclass가 없으면 앱의 서식으로 감쌀 수 있는 본문이다. */
export const isBodyOnly = (text: string): boolean => !/^[^%\n]*\\documentclass/m.test(text)

/** 고른 서식이 먼저 불러온 패키지의 옵션은 유지하고, 프로젝트의 나머지 패키지·기호는 그대로 읽는다. */
export function inputBlockPreamble(preamble: string, hasTemplate: boolean): string {
  const input = `\\input{${preamble}}`
  if (!hasTemplate) return input
  return [
    '\\makeatletter',
    '\\let\\rw@block@usepackage\\usepackage',
    '\\renewcommand{\\usepackage}[2][]{\\@for\\rw@block@package:=#2\\do{\\@ifpackageloaded{\\rw@block@package}{}{\\rw@block@usepackage[#1]{\\rw@block@package}}}}',
    '\\makeatother',
    input,
    '\\makeatletter\\let\\usepackage\\rw@block@usepackage\\makeatother',
  ].join('\n')
}

/**
 * 블록 하나를 컴파일하기 위한 틀 문서를 만든다.
 * 블록 파일에는 \documentclass가 없고, 이 틀이 서식과 블록을 차례로 불러온다.
 * \graphicspath는 graphicx를 불러오는 서식 다음에 와야 한다.
 * 컴파일은 workbench/.build/<블록>/에서 돌지만, 서식·블록 안의 상대 경로 \input은
 * workbench/ 기준으로, 없으면 공유 라이브러리 기준으로 찾는다(\input@path).
 * 예: \input{../statements/preamble.tex}, \input{preamble/base.tex}
 */
export function buildBlockMainTex(paths: BlockDocumentPaths, choice: { template?: { documentClass: string; preamble: string }; front?: string[] } = {}): string {
  for (const p of Object.values(paths).filter((v): v is string => typeof v === 'string')) {
    if (!p.startsWith('/')) throw new Error(tr(`절대 경로가 아님: ${p}`, `Not an absolute path: ${p}`))
    if (/[\s{}%\\#~$^&]/.test(p)) throw new Error(tr(`LaTeX 경로에 쓸 수 없는 문자(공백·특수문자)가 있음: ${p}`, `The path has characters LaTeX cannot use (spaces or special characters): ${p}`))
  }
  const figures = paths.figures.endsWith('/') ? paths.figures : `${paths.figures}/`
  const dir = (p: string) => (p.endsWith('/') ? p : `${p}/`)
  const searchPath = [paths.preamble.slice(0, paths.preamble.lastIndexOf('/') + 1), ...(paths.library ? [dir(paths.library)] : [])]
  return [
    '% 자동 생성 파일 — research-workspace가 컴파일할 때마다 다시 만든다. 직접 고치지 않는다.',
    choice.template?.documentClass || DOCUMENT_CLASS,
    `\\makeatletter\\def\\input@path{${searchPath.map((d) => `{${d}}`).join('')}}\\makeatother`,
    ...(choice.template?.preamble.trim() ? [choice.template.preamble.trim()] : []),
    inputBlockPreamble(paths.preamble, !!choice.template),
    `\\makeatletter\\@ifpackageloaded{graphicx}{\\graphicspath{{${figures}}}}{}\\makeatother`,
    '\\begin{document}',
    ...(choice.front ?? []),
    `\\input{${paths.block}}`,
    '\\end{document}',
    '',
  ].join('\n')
}

/**
 * 공유 라이브러리 노트(개념노트·문헌노트) 하나를 컴파일하기 위한 틀 문서.
 * 라이브러리의 공통 서식(preamble/*.tex)을 모두 순서대로 불러온 뒤 노트를 넣는다.
 * 노트 안의 상대 경로 \input은 라이브러리 기준으로 찾는다.
 * bib(라이브러리 references.bib)를 주면 끝에 참고문헌을 붙인다. 노트가 \cite를 쓸 때만 준다
 * (인용이 없는데 붙이면 빈 참고문헌 목록이 오류가 된다).
 * template(설정의 LaTeX 서식)을 주면 그 문서 종류 줄과 공통 줄(보통 \input{setting})을 라이브러리 서식 앞에 쓴다.
 * setting.tex는 컴파일하는 쪽이 빌드 폴더에 만든다. 없으면 예전처럼 article.
 */
export function buildLibraryNoteMainTex(paths: { library: string; preambles: string[]; note: string; bib?: string; template?: { documentClass: string; preamble: string } }): string {
  for (const p of [paths.library, paths.note, ...paths.preambles, ...(paths.bib ? [paths.bib] : [])]) {
    if (!p.startsWith('/')) throw new Error(tr(`절대 경로가 아님: ${p}`, `Not an absolute path: ${p}`))
    if (/[\s{}%\\#~$^&]/.test(p)) throw new Error(tr(`LaTeX 경로에 쓸 수 없는 문자(공백·특수문자)가 있음: ${p}`, `The path has characters LaTeX cannot use (spaces or special characters): ${p}`))
  }
  const lib = paths.library.endsWith('/') ? paths.library : `${paths.library}/`
  return [
    '% 자동 생성 파일 — research-workspace가 컴파일할 때마다 다시 만든다. 직접 고치지 않는다.',
    paths.template?.documentClass || DOCUMENT_CLASS,
    `\\makeatletter\\def\\input@path{{${lib}}}\\makeatother`,
    ...(paths.template?.preamble.trim() ? [paths.template.preamble.trim()] : []),
    ...paths.preambles.map((p) => `\\input{${p}}`),
    '\\begin{document}',
    `\\input{${paths.note}}`,
    // 참고문헌은 노트에 글로 적지 않고 \cite{키}만 둔다. 컴파일할 때 라이브러리 references.bib에서 인용한 것만 붙인다
    ...(paths.bib ? ['\\bibliographystyle{unsrt}', `\\bibliography{${paths.bib.replace(/\.bib$/, '')}}`] : []),
    '\\end{document}',
    '',
  ].join('\n')
}
