import { tr } from './i18n.js'
export const DOCUMENT_CLASS = '\\documentclass[11pt]{article}'

/** 주석 밖에 \documentclass가 없으면 앱의 서식으로 감쌀 수 있는 본문이다. */
export const isBodyOnly = (text: string): boolean => !/^[^%\n]*\\documentclass/m.test(text)

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
