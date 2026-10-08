import { tr } from './i18n.js'
/**
 * 노트가 함께 쓰는 LaTeX 서식과 저자·소속 (앱 설정 파일 config.yaml의 `latexTemplates:`, `authors:`).
 * 내보낼 때(main.tex·setting.tex를 만들 때) 이 값을 기계적으로 넣는다. 노트 본문은 바꾸지 않는다.
 */

export interface LatexSetup {
  /** 문서 종류 줄 그대로. 예: \documentclass[prl, twocolumn]{revtex4-1} */
  documentClass: string
  /** 문서 종류 줄 다음, \begin{document} 앞에 넣는 줄들. 예: \include{setting} */
  preamble: string
  /** 고른 패키지 이름. setting.tex에 \usepackage로 적는다 */
  packages: string[]
  /** setting.tex 끝에 덧붙이는 줄 (직접 정의한 기호 등) */
  settingExtra: string
}

export interface Author {
  name: string
  email?: string
  /** 그 밖의 이메일 (10/4 20:53 "이메일 여러 개"). 내보내기의 \email 줄에는 첫 이메일(email)만 쓴다 */
  emails?: string[]
  /** 교신 저자면 이름 뒤에 \thanks{corresponding author} */
  corresponding?: boolean
  affiliations: string[]
}

/** 고를 수 있는 패키지. options가 있으면 \usepackage[options]{name} */
export const LATEX_PACKAGES: { name: string; options?: string; desc: string }[] = [
  { name: 'amsmath', get desc() { return tr('수식 환경 (align, cases …)', 'Math environments (align, cases …)') } },
  { name: 'amssymb', get desc() { return tr('수학 기호', 'Math symbols') } },
  { name: 'amsthm', get desc() { return tr('정리·증명 환경', 'Theorem and proof environments') } },
  { name: 'mathtools', get desc() { return tr('amsmath 확장', 'amsmath extensions') } },
  { name: 'bm', get desc() { return tr('굵은 수식 기호 \\bm', 'Bold math symbols \\bm') } },
  { name: 'physics', get desc() { return tr('\\ket, \\bra, \\Tr 같은 물리 기호', 'Physics symbols like \\ket, \\bra, \\Tr') } },
  { name: 'braket', get desc() { return tr('\\braket 디랙 표기', '\\braket Dirac notation') } },
  { name: 'dsfont', get desc() { return tr('\\mathds{1} 단위 연산자', '\\mathds{1} identity operator') } },
  { name: 'mathrsfs', get desc() { return tr('\\mathscr 필기체', '\\mathscr script letters') } },
  { name: 'graphicx', get desc() { return tr('그림 넣기', 'Insert figures') } },
  { name: 'xcolor', get desc() { return tr('글자 색', 'Text color') } },
  { name: 'tikz', get desc() { return tr('그림 그리기', 'Draw figures') } },
  { name: 'dcolumn', get desc() { return tr('표에서 소수점 맞추기', 'Align decimal points in tables') } },
  { name: 'hyperref', options: 'colorlinks=true, allcolors=blue', get desc() { return tr('참조와 링크', 'References and links') } },
  { name: 'cleveref', get desc() { return tr('\\cref 참조 이름 자동', '\\cref automatic reference names') } },
]

export const DEFAULT_LATEX_SETUP: LatexSetup = {
  documentClass: '\\documentclass[prl, twocolumn, english, superscriptaddress, floatfix, longbibliography]{revtex4-1}',
  preamble: '\\include{setting}',
  packages: ['amsmath', 'amssymb', 'bm', 'graphicx', 'dcolumn', 'hyperref'],
  settingExtra: '',
}

export const DEFAULT_AUTHORS: Author[] = [
  { name: 'Ada Researcher', affiliations: ['Department of Mathematics, Example University, Example City 00000'] },
  { name: 'Ben Collaborator', email: 'ben@example.org', corresponding: true, affiliations: ['Department of Computer Science, Example Institute, Example City 00000'] },
  { name: 'Cy Advisor', email: 'cy@example.org', corresponding: true, affiliations: ['Department of Mathematics, Example University, Example City 00000'] },
]

const MAX_TEXT = 4000
const MAX_LINE = 400
const MAX_AUTHORS = 30
const oneLine = (v: unknown) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, MAX_LINE) : '')
const block = (v: unknown) => (typeof v === 'string' ? v.replace(/\r\n?/g, '\n').slice(0, MAX_TEXT) : '')

/** 저장된 값이나 요청 값을 믿지 않고 모양을 맞춘다. 없는 값은 기본값 */
export function normalizeLatexSetup(raw: unknown, base: LatexSetup = DEFAULT_LATEX_SETUP): LatexSetup {
  const src = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const known = LATEX_PACKAGES.map((p) => p.name)
  return {
    documentClass: 'documentClass' in src ? oneLine(src.documentClass) : base.documentClass,
    preamble: 'preamble' in src ? block(src.preamble) : base.preamble,
    packages: Array.isArray(src.packages) ? known.filter((n) => (src.packages as unknown[]).includes(n)) : base.packages,
    settingExtra: 'settingExtra' in src ? block(src.settingExtra) : base.settingExtra,
  }
}

/** 이름이 빈 저자는 뺀다. 소속은 빈 줄을 빼고 순서대로 */
export function normalizeAuthors(raw: unknown, base: Author[] = DEFAULT_AUTHORS): Author[] {
  if (!Array.isArray(raw)) return base
  const out: Author[] = []
  for (const r of raw.slice(0, MAX_AUTHORS)) {
    if (!r || typeof r !== 'object') continue
    const a = r as Record<string, unknown>
    const name = oneLine(a.name)
    if (!name) continue
    const email = oneLine(a.email)
    const emails = Array.isArray(a.emails) ? [...new Set(a.emails.map(oneLine).filter((e) => e && e !== email))].slice(0, 5) : []
    const affiliations = Array.isArray(a.affiliations) ? a.affiliations.map(oneLine).filter(Boolean).slice(0, 10) : []
    out.push({ name, ...(email && { email }), ...(email && emails.length && { emails }), ...(a.corresponding === true && { corresponding: true }), affiliations })
  }
  return out
}

/** setting.tex: 고른 패키지를 목록 순서대로, 그 뒤에 덧붙인 줄 */
export function buildSettingTex(setup: LatexSetup): string {
  const lines = LATEX_PACKAGES.filter((p) => setup.packages.includes(p.name))
    .map((p) => `\\usepackage${p.options ? `[${p.options}]` : ''}{${p.name}}`)
  const extra = setup.settingExtra.trim()
  return [
    '% setting.tex — research-workspace의 LaTeX 공통 설정에서 만든 파일',
    ...lines,
    ...(extra ? ['', extra] : []),
    '',
  ].join('\n')
}

/** 저자·소속 줄 (revtex 형식: \author, \email, \affiliation) */
export function buildAuthorLines(authors: Author[]): string[] {
  const out: string[] = []
  for (const a of authors) {
    out.push(`\\author{${a.name}${a.corresponding ? ' \\thanks{corresponding author}' : ''}}`)
    if (a.email) out.push(`\\email{${a.email}}`)
    for (const f of a.affiliations) out.push(`\\affiliation{${f}}`)
  }
  return out
}

/** revtex가 아닌 문서(article 등) 저자 줄: \author{이름 \\ 소속 \and …} (\affiliation·\email이 없는 클래스) */
export function buildPlainAuthorLines(authors: Author[]): string[] {
  if (authors.length === 0) return []
  const one = (a: Author) => [`${a.name}${a.corresponding && a.email ? `\\thanks{${a.email}}` : ''}`, ...a.affiliations].join(' \\\\ ')
  return [`\\author{${authors.map(one).join(' \\and ')}}`]
}

/**
 * 발표(beamer) 저자 줄: \author{A \and B}, 소속은 겹치지 않게 한 줄에 하나씩 \institute[]{…}.
 * 여러 줄은 tabular로 묶는다 (표지의 소속 자리에서 \\만 쓰면 둘째 줄 글자 크기가 돌아간다).
 * 소속이 길어서 아래 띠(짧은 소속 자리)는 비운다.
 */
export function buildSlidesAuthorLines(authors: Author[]): string[] {
  const affiliations = [...new Set(authors.flatMap((a) => a.affiliations))]
  return [
    `\\author{${authors.map((a) => a.name).join(' \\and ')}}`,
    ...(affiliations.length > 1
      ? [`\\institute[]{\\begin{tabular}[b]{@{}r@{}}${affiliations.join(' \\\\ ')}\\end{tabular}}`]
      : affiliations.map((f) => `\\institute[]{${f}}`)),
  ]
}

/** 문서 앞머리: 제목·저자·소속·날짜 (revtex는 \\affiliation, 그 밖은 \\author{이름 \\\\ 소속}). 노트 본문에는 두지 않고 앱이 붙인다 (10/4 15:41 피드백) */
// date: \\date{} 안에 넣을 글 (빼면 \\today, 빈 글이면 날짜 없이). 내보내기에서 고른다 (10/4 "날짜 등등")
export function buildFrontMatter(o: { setup: Pick<LatexSetup, 'documentClass'>; authors: Author[]; title: string; date?: string }): string[] {
  return [
    `\\title{${oneLine(o.title)}}`,
    ...(/revtex/.test(o.setup.documentClass) ? buildAuthorLines(o.authors) : buildPlainAuthorLines(o.authors)),
    `\\date{${o.date ?? '\\today'}}`,
  ]
}

/**
 * 내보낼 main.tex. 문서 종류 줄 → 공통 줄 → \begin{document} → 제목·저자·소속 → \maketitle → 본문.
 * 발표 서식(kind: 'slides')은 제목·저자를 \begin{document} 앞에 두고 첫 장면에 \titlepage를 넣는다.
 * 본문은 받은 그대로 넣는다.
 */
export function buildExportMainTex(o: { setup: LatexSetup & { kind?: LatexTemplate['kind'] }; authors: Author[]; title: string; body?: string; date?: string }): string {
  const preamble = o.setup.preamble.trim()
  const head = [o.setup.documentClass, ...(preamble ? [preamble] : []), '']
  const body = [...(o.body !== undefined ? [o.body.replace(/\s+$/, '')] : ['% 본문']), '', '\\end{document}', '']
  if (o.setup.kind === 'slides') {
    return [
      ...head,
      `\\title{${oneLine(o.title)}}`,
      ...buildSlidesAuthorLines(o.authors),
      `\\date{${o.date ?? '\\today'}}`,
      '',
      '\\begin{document}',
      '',
      '\\begin{frame}[plain,noframenumbering]',
      '  \\titlepage',
      '\\end{frame}',
      '',
      ...body,
    ].join('\n')
  }
  return [
    ...head,
    '\\begin{document}',
    '',
    ...buildFrontMatter(o),
    '\\maketitle',
    '',
    ...body,
  ].join('\n')
}

/**
 * LaTeX 서식 모음 (10/4 12:58 피드백 "latex 서식을 라이브러리로 관리하자. article 뿐만 아니라 prl 유형, beamer 템플릿 등").
 * 서식 하나 = 문서 종류 줄 + 공통 줄 + setting.tex(패키지·덧붙인 줄). 앱 설정 config.yaml의 `latexTemplates:`.
 * 내보내기는 기본 서식(`latexDefault:`)을 쓰고, 개념노트 PDF는 컴파일할 때 서식을 고른다 (13:05 피드백).
 * slides(발표) 서식은 본문을 frame으로 나눠야 해서 노트 컴파일에는 쓰지 않는다.
 */
export interface LatexTemplate extends LatexSetup {
  id: string
  name: string
  kind: 'document' | 'slides'
  /** main.tex 옆에 함께 둘 스타일 파일 (저장소 templates/latex/). 기본 서식에서만 오고 고칠 수 없다. 복사하면 따라간다 */
  files?: string[]
  /** 서식 모음에서 묶어 보는 이름표 (논문, 노트, 발표 …). 10/4 19:30 "필요하다면 태그도 사용해" */
  tags?: string[]
}

export const BUILTIN_TEMPLATES: LatexTemplate[] = [
  {
    id: 'article', name: '기본 문서 (article)', kind: 'document',
    documentClass: '\\documentclass[11pt]{article}',
    preamble: '\\input{setting}',
    packages: ['amsmath', 'amssymb', 'graphicx', 'hyperref'],
    settingExtra: '',
    tags: ['노트'],
  },
  { id: 'prl', name: 'PRL (revtex)', kind: 'document', ...DEFAULT_LATEX_SETUP, tags: ['논문', 'APS'] },
  {
    // 사용자의 발표 서식 (knowledge-factory의 knowledge-factory-beamer v0.1.1, 10/4). XeLaTeX로 컴파일한다.
    // 글꼴·수식 패키지는 main.tex가 먼저 불러야 하고, setting.tex(amsmath)는 unicode-math보다 앞에 둔다.
    // beamer가 hyperref·graphicx를 이미 불러서 패키지에서 뺀다.
    id: 'beamer', name: '발표 (Knowledge Factory beamer)', kind: 'slides',
    documentClass: '\\documentclass[aspectratio=169,11pt]{beamer}',
    preamble: [
      '\\input{setting}',
      '\\usepackage{fontspec}',
      '\\usepackage{kotex}',
      '\\usepackage{unicode-math}',
      '\\usepackage[talk]{knowledge-factory-beamer}',
    ].join('\n'),
    packages: ['amsmath'],
    settingExtra: '',
    files: ['knowledge-factory-beamer.sty'],
    tags: ['발표', 'XeLaTeX'],
  },
  {
    // 사용자가 10/4 05:01에 붙인 논문(PRB) 머리. 노트에서는 머리를 지우고 이 서식으로 컴파일한다 ("본문만 남기고 컴파일러가 처리").
    // 한 연구에만 쓰는 주석 기호(\ADA, \BEA, \EDIT, \DEL, \EG)와 pdftitle은 넣지 않는다: 기호는 그 연구의 workbench/macros.tex, 제목은 앱이 노트 이름으로.
    // inputenc는 XeLaTeX에서 쓸모가 없어 뺐다.
    id: 'prb', name: 'PRB (revtex4-2)', kind: 'document',
    documentClass: '\\documentclass[aps,english,prb,floatfix,amsmath,superscriptaddress,tightenlines,twocolumn,nofootinbib]{revtex4-2}',
    preamble: '\\input{setting}',
    packages: ['amsmath', 'amssymb', 'amsthm', 'bm', 'braket', 'graphicx', 'xcolor', 'tikz', 'dcolumn', 'hyperref'],
    settingExtra: [
      '\\usepackage{amsfonts, nicefrac}',
      '\\usepackage{multirow}',
      '\\usepackage{tabularx}',
      '\\usepackage{array}',
      '\\usepackage{units}',
      '\\usepackage{tensor}',
      '\\usepackage{enumitem}',
      '\\usepackage{soul}',
      '\\usepackage[export]{adjustbox}',
      '',
      '\\setcounter{secnumdepth}{2}',
      '\\makeatletter',
      '\\renewcommand\\twocolumngrid{',
      '  \\def\\footnoterule{',
      '    \\dimen@\\skip\\footins\\divide\\dimen@\\thr@@',
      '    \\kern-\\dimen@\\hrule width.5in\\kern\\dimen@}',
      '  \\do@columngrid{mlt}{\\tw@}',
      '}',
      '\\makeatother',
      '',
      '\\newtheorem{theorem}{Theorem}[section]',
      '\\newtheorem{lemma}[theorem]{Lemma}',
      '\\newtheorem{prop}{Proposition}',
      '\\newtheorem{axiom}{Axiom}',
      '\\newtheorem{claim}{Claim}',
      '',
      '\\hypersetup{colorlinks=true, linkcolor=blue, filecolor=magenta, urlcolor=blue, pdfpagemode=FullScreen}',
    ].join('\n'),
    tags: ['논문', 'APS'],
  },
  {
    // 작성자의 연구노트 서식 모양 (10/4 19:32 "pdf 원고도 이쁜데 latex template 중 하나로").
    // 모양만 rw-research-note.sty로 옮기고 그 연구에만 맞는 글(머리말의 제목, "In review")은 뺐다: 머리말에는 문서 제목이 들어간다. XeLaTeX로 컴파일한다.
    id: 'research-note', name: '연구노트 (rw-research-note)', kind: 'document',
    documentClass: '\\documentclass[11pt,a4paper]{article}',
    preamble: ['\\input{setting}', '\\usepackage{rw-research-note}'].join('\n'),
    packages: ['amsmath', 'amssymb', 'graphicx'],
    settingExtra: '',
    files: ['rw-research-note.sty'],
    tags: ['노트', 'XeLaTeX'],
  },
]
export const DEFAULT_TEMPLATE_ID = 'prl'
/** 서식 모음을 처음 만든 #98 때의 기본 서식. 그 뒤에 더한 기본 서식은 예전 설정에도 한 번 더해 준다 */
const FIRST_BUILTINS = ['article', 'prl', 'beamer']

const MAX_TEMPLATES = 30
const templateId = (v: unknown) => (typeof v === 'string' ? v.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) : '')

/** 서식 하나. 모르는 값은 base에서 */
export function normalizeTemplate(raw: unknown, base: LatexTemplate): LatexTemplate {
  const src = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  return {
    id: base.id,
    name: 'name' in src ? oneLine(src.name) || base.name : base.name,
    kind: src.kind === 'slides' || src.kind === 'document' ? src.kind : base.kind,
    ...normalizeLatexSetup(src, base),
    ...(base.files?.length ? { files: base.files } : {}),
    ...(() => { const tags = Array.isArray(src.tags) ? [...new Set(src.tags.map(oneLine).filter(Boolean))].slice(0, 8) : base.tags; return tags?.length ? { tags } : {} })(),
  }
}

/**
 * 서식 목록. 저장된 것이 없으면 기본 서식 전부. seen: 이 설정이 이미 본 기본 서식 id (config.yaml의 latexBuiltins:). 예전 설정의 `latex:`(#85, 서식 하나)는 PRL 서식의 내용으로 옮긴다.
 * id가 겹치거나 비면 버린다. 하나도 남지 않으면 기본 목록.
 */
export function normalizeTemplates(raw: unknown, legacy?: unknown, seen?: unknown): LatexTemplate[] {
  if (!Array.isArray(raw)) {
    return BUILTIN_TEMPLATES.map((t) => (t.id === 'prl' && legacy ? normalizeTemplate(legacy, t) : t))
  }
  // 저장된 목록이 본 적 없는 새 기본 서식은 끝에 더한다 (지운 기본 서식은 되살리지 않는다)
  const known = Array.isArray(seen) ? seen.map(String) : FIRST_BUILTINS
  const added = BUILTIN_TEMPLATES.filter((t) => !known.includes(t.id))
  const out: LatexTemplate[] = []
  for (const r of raw.slice(0, MAX_TEMPLATES)) {
    const id = templateId(r && typeof r === 'object' ? (r as Record<string, unknown>).id : undefined)
    if (!id || out.some((t) => t.id === id)) continue
    const builtin = BUILTIN_TEMPLATES.find((t) => t.id === id)
    out.push(normalizeTemplate(r, builtin ?? { ...BUILTIN_TEMPLATES[0]!, id, name: id }))
  }
  if (!out.length) return BUILTIN_TEMPLATES
  for (const t of added) if (!out.some((x) => x.id === t.id)) out.push(t)
  return out
}

/** 새 서식의 id: 이름에서, 겹치면 -2, -3 … */
export function newTemplateId(name: string, taken: string[]): string {
  const base = templateId(name) || 'template'
  let id = base
  for (let n = 2; taken.includes(id); n++) id = `${base}-${n}`
  return id
}
