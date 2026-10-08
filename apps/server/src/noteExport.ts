import fs from 'node:fs'
import path from 'node:path'
import { buildExportMainTex, buildSettingTex, inputBlockPreamble, markdownToLatex, MD_PREAMBLE, parseBlock, type Author, type LatexTemplate } from '@rw/core'
import { SHARED_MACROS } from './latexFiles.js'
import { allManuscripts, frontFor, isBodyOnly, NO_TITLE_BLOCK, type ManuscriptInfo } from './manuscript.js'
import { bibliographyLines, noteBibFiles } from './noteBib.js'
import { innerBody, NOTE_MACROS } from './noteBody.js'
import { collectTexFiles, slugOf } from './noteCopy.js'
import { WorkbenchError, type Workbench } from './workbench.js'
import { makeZip, type ZipEntry } from './zip.js'
import type { FigureEmbedResolver, FigureEmbeds } from './figureEmbeds.js'
import { t as tl } from './i18n.js'

/**
 * 노트 내보내기 (10/4 사용자 "노트마다 내보내기 버튼을 두자. 노트 메인에서는 선택한 노트들을 모아서 한번에 내보내는 것도").
 * 결과는 그대로 컴파일되는 LaTeX 폴더 하나를 묶은 zip이다. 노트 폴더는 건드리지 않는다.
 * - 노트 하나, 머리가 있는 것: 쓰이는 파일을 그대로.
 * - 노트 하나, 본문만 있는 것: main.tex = 서식의 머리 + 기호 파일 + 제목·저자(본문에 \maketitle이 없을 때) + 본문, 그리고 setting.tex·macros.tex·서식의 스타일 파일.
 * - 여러 노트: main.tex 하나에 서식의 머리와 제목·저자를 두고, 노트마다 notes/<폴더>/body.tex를 \subimport로 차례로 넣는다.
 *   노트 각자의 머리(\documentclass…\begin{document})와 제목 줄은 빼고 본문만 넣는다.
 */

/**
 * 내보내기에서 고르는 것 (10/4 반려 "내보낼때 파일을 바로 내보내지 말고, 옵션으로 선택하게하자. 1. 내보내는 디자인 템플릿, 2. 저자 포함 여부, 3. 날짜 등등").
 * - template: 서식 (화면에서 고르지 않으면 프로젝트 서식)
 * - authors: 넣을 저자를 넣을 차례대로. 빼면 원고가 있을 때 allAuthors 모두, 연구·계산 노트만이면 저자 없이.
 *   연구·계산 노트도 저자를 넣으면 원고처럼 제목·저자 줄을 둔다. 원고는 저자를 빼도 제목 줄은 둔다.
 * - date: \\date{}에 넣을 글 ('\\today', '2026-10-04', 빈 글은 날짜 없이). 빼면 원고는 \\today, 노트는 없이.
 */
/** sharedMacros: 공통 기호를 \\providecommand로 바꾼 글 (sharedMacrosTex). 있으면 shared-macros.tex로 넣고 프로젝트·노트 기호 다음에 부른다 */
export interface ExportLatex { template: LatexTemplate; authors?: Author[]; allAuthors?: Author[]; date?: string; filesDir: string; sharedMacros?: string | null; figures?: FigureEmbedResolver }
export interface ExportedNotes { filename: string; zip: Buffer; files: string[] }
type ExportSource = Pick<ManuscriptInfo, 'main' | 'name' | 'kind' | 'format'> & { block?: Workbench }


/** 여러 노트를 모을 때 노트 각자의 제목 줄은 주석으로 돌린다 (한 줄 안에서 괄호가 닫히는 것만) */
const TITLE_LINE = /^\s*\\(?:maketitle|title|author|affiliation|email|date|thanks)\b/
export function quietTitles(body: string): string {
  return body.split('\n').map((l) => {
    if (!TITLE_LINE.test(l)) return l
    const open = (l.match(/\{/g) ?? []).length
    const close = (l.match(/\}/g) ?? []).length
    return open === close ? `% (모아 내보내기에서 뺌) ${l}` : l
  }).join('\n')
}

/** Markdown 노트가 부르는 그림 (노트 폴더 기준, 있는 것만) */
function markdownAssets(text: string, dir: string, allowParent = false): string[] {
  const out: string[] = []
  for (const m of text.matchAll(/!\[[^\]]*\]\(([^)\s]+)\)|!\[\[([^\]|]+)/g)) {
    const rel = path.normalize((m[1] ?? m[2]!).trim())
    if ((allowParent || !rel.startsWith('..')) && !path.isAbsolute(rel) && fs.existsSync(path.join(dir, rel)) && fs.statSync(path.join(dir, rel)).isFile()) out.push(rel)
  }
  return out
}

/** 노트 본문을 LaTeX 본문으로: Markdown 노트는 바꾸고, LaTeX 노트는 \begin{document} 안만 */
const latexBody = (m: ExportSource, text: string, figures?: FigureEmbeds) => (m.format === 'md' ? markdownToLatex(text, { figure: figures?.figure, image: figures?.image }) : innerBody(text))

/** 라이브러리 출력 경로와 겹치는 로컬 그림만 묶음 안에서 옮긴다. 원문·원본은 그대로 둔다. */
function exportBody(m: ExportSource, text: string, files: string[], dir: string, prefix: string, figures?: FigureEmbeds): { body: string; renamed: Map<string, string> } {
  const renamed = new Map<string, string>()
  if (m.format !== 'md' || !figures?.files.length) return { body: latexBody(m, text, figures), renamed }
  const paths = new Map<string, string>()
  const overlaps = (a: string, b: string) => {
    const x = a.toLowerCase(), y = b.toLowerCase()
    return x === y || x.startsWith(`${y}/`) || y.startsWith(`${x}/`)
  }
  let assets = 'note-assets'
  for (let n = 2; files.some((f) => overlaps(f, assets)); n++) assets = `note-assets-${n}`
  // 보조 노트의 기존 graphicspath 순서. 같은 상대 이름이 여러 곳에 있으면 먼저 찾던 것을 쓴다.
  const dirs = m.block ? [m.block.figuresDir, m.block.blocksDir, m.block.root] : [dir]
  for (const local of dirs) for (const ref of markdownAssets(text, local, !!m.block)) {
    if (!figures.files.some((f) => overlaps(ref, f.name))) continue
    const file = path.relative(dir, path.join(local, ref))
    if (!files.includes(file)) continue
    const moved = `${assets}/${file}`
    renamed.set(file, moved)
    if (!paths.has(ref)) paths.set(ref, `${prefix}${moved}`)
  }
  if (!renamed.size) return { body: latexBody(m, text, figures), renamed }
  // 같은 includegraphics 경로라도 라이브러리 그림은 그대로 유지한다.
  const snippets: string[] = []
  const markers: string[] = []
  let marker = '\u0000rw-figure-'
  while (text.includes(marker)) marker += '-'
  const hold = (snippet: string | undefined) => {
    if (snippet === undefined) return undefined
    // 문단 변환기의 환경 앞뒤 줄바꿈 판단도 원래 그림과 같게 유지한다.
    const env = /\\\[|\\\]|\\begin\{|\\end\{/.test(snippet) ? '\\begin{rwfigure}' : ''
    const held = `${marker}${snippets.push(snippet) - 1}${env}\u0000`
    markers.push(held)
    return held
  }
  let body = markdownToLatex(text, { figure: (name) => hold(figures.figure(name)), image: (target, width) => hold(figures.image(target, width)) })
  body = body.replace(/\\begin\{verbatim\}[\s\S]*?\\end\{verbatim\}|(\\includegraphics(?:\[[^\]]*\])?\{)([^{}]+)\}/g, (all, command: string | undefined, ref: string) => {
    if (!command) return all
    const moved = paths.get(path.normalize(ref))
    return moved ? `${command}${moved}}` : all
  })
  for (let i = 0; i < snippets.length; i++) body = body.replaceAll(markers[i]!, () => snippets[i]!)
  return { body, renamed }
}

function filesOf(m: ExportSource, repo: string): { mainAbs: string; text: string; files: string[]; skipped: string[]; dir: string; prefix: string } {
  const mainAbs = path.join(repo, m.main)
  const text = fs.readFileSync(mainAbs, 'utf8')
  if (m.block) {
    const wb = m.block
    const options = { baseDir: wb.root, searchDirs: [wb.blocksDir], graphicsDirs: [wb.figuresDir] }
    const { files, skipped } = collectTexFiles(mainAbs, options)
    if (fs.existsSync(wb.preamblePath)) {
      const preamble = collectTexFiles(wb.preamblePath, options)
      for (const file of preamble.files) files.add(file)
      skipped.push(...preamble.skipped)
    }
    if (m.format === 'md') for (const dir of [wb.root, wb.blocksDir, wb.figuresDir]) {
      for (const file of markdownAssets(text, dir, true)) files.add(path.relative(wb.root, path.join(dir, file)))
    }
    for (const file of fs.readdirSync(wb.blocksDir)) if (file.endsWith('.bib')) files.add(`blocks/${file}`)
    const safe = [...files].filter((file) => {
      const rel = path.relative(wb.root, fs.realpathSync(path.join(wb.root, file)))
      if (rel.startsWith('..') || path.isAbsolute(rel)) { skipped.push(file); return false }
      return true
    })
    return { mainAbs, text, files: safe, skipped, dir: wb.root, prefix: 'block-files/' }
  }
  const { files, skipped } = m.format === 'md' ? { files: new Set([path.basename(mainAbs), ...markdownAssets(fs.readFileSync(mainAbs, 'utf8'), path.dirname(mainAbs))]), skipped: [] } : collectTexFiles(mainAbs)
  const dir = path.dirname(mainAbs)
  // 같은 폴더의 .bib는 \bibliography 없이도 빌드에 쓰일 수 있어 함께 둔다 (연구노트 복사와 같게)
  for (const f of fs.readdirSync(dir)) if (f.endsWith('.bib')) files.add(f)
  return { mainAbs, text, files: [...files], skipped, dir, prefix: '' }
}

const titleFor = (s: string) => s.replace(/[\\{}%#&$^_~]/g, ' ').replace(/\s+/g, ' ').trim()

export function exportNotes(wb: Workbench, keys: string[], latex: ExportLatex): ExportedNotes {
  if (keys.length === 0) throw new WorkbenchError(400, tl('내보낼 노트를 고르세요', 'Choose notes to export'))
  const all = allManuscripts(wb)
  const picked = [...new Set(keys)].map((k) => {
    const m = all.find((x) => x.key === k)
    if (!m) throw new WorkbenchError(404, tl(`그런 노트가 없음: ${k}`, `No such note: ${k}`))
    return m
  })
  return exportSources(wb, picked, latex)
}

/** 보조 노트도 같은 서식·저자·날짜와 zip 묶기를 쓴다. 원문과 기록 파일은 읽기만 한다. */
export function exportBlock(wb: Workbench, id: string, latex: ExportLatex): ExportedNotes {
  const { content } = wb.readBlock(id)
  const name = parseBlock(content).meta.title || id
  return exportSources(wb, [{
    main: path.relative(path.dirname(wb.root), wb.blockPath(id)),
    name,
    kind: 'note',
    ...(wb.blockFormat(id) === 'md' ? { format: 'md' as const } : {}),
    ...((wb.blockFormat(id) === 'md' || isBodyOnly(content)) ? { block: wb } : {}),
  }], latex)
}

function exportSources(wb: Workbench, picked: ExportSource[], latex: ExportLatex): ExportedNotes {
  const repo = path.dirname(wb.root)
  const research = wb.readResearch()
  const t = latex.template
  const hasPaper = picked.some((m) => m.kind === 'paper')
  const authors = latex.authors ?? (hasPaper ? latex.allAuthors ?? [] : [])
  const byline = hasPaper || authors.length > 0
  const date = latex.date ?? (hasPaper ? '\\today' : '')
  const own = research.latexMacros ? path.join(repo, research.latexMacros) : path.join(wb.root, 'macros.tex')
  const macros = !picked[0]?.block && fs.existsSync(own) ? fs.readFileSync(own, 'utf8') : null
  const header = (bodyOnlyFiles: boolean): ZipEntry[] => (bodyOnlyFiles
    ? [
        { name: 'setting.tex', data: buildSettingTex(t) },
        ...(macros !== null ? [{ name: 'macros.tex', data: macros }] : []),
        ...(latex.sharedMacros ? [{ name: SHARED_MACROS, data: latex.sharedMacros }] : []),
        ...(t.files ?? []).filter((f) => fs.existsSync(path.join(latex.filesDir, f))).map((f) => ({ name: f, data: fs.readFileSync(path.join(latex.filesDir, f)) })),
      ]
    : [])
  const setup = (extra: string[]) => ({ ...t, preamble: [t.preamble.trim(), ...(macros !== null ? ['\\input{macros}'] : []), ...extra, ...(latex.sharedMacros ? [`\\input{${SHARED_MACROS.replace(/\.tex$/, '')}}`] : [])].filter(Boolean).join('\n') })
  const note = `% research-workspace에서 내보낸 파일 (서식 "${t.name}")`
  const entries: ZipEntry[] = []
  const skippedAll: string[] = []
  const figureFiles = new Map<string, ZipEntry>()
  const figurePreambles = new Set<string>()
  const svgFigures = new Set<string>()
  const excludedFigures = new Set<string>()
  const figuresFor = (m: ExportSource, text: string, dir: string) => m.format === 'md'
    ? latex.figures?.(text, m.block ? [m.block.root, m.block.blocksDir, m.block.figuresDir] : [dir], !!m.block)
    : undefined
  const collectFigures = (figures?: FigureEmbeds) => {
    if (!figures) return
    for (const f of figures.files) figureFiles.set(f.name, { name: f.name, data: f.data })
    if (figures.preamble) figurePreambles.add(figures.preamble)
    for (const f of figures.svg) svgFigures.add(f)
    for (const f of figures.excluded) excludedFigures.add(f)
  }
  let filename: string
  let root: string

  if (picked.length === 1) {
    const m = picked[0]!
    const { mainAbs, text, files, skipped, dir, prefix } = filesOf(m, repo)
    skippedAll.push(...skipped.map((s) => `${m.name}: ${s}`))
    root = slugOf(m.name)
    filename = m.name
    const mainRel = path.relative(dir, mainAbs)
    if (m.format !== 'md' && !isBodyOnly(text)) {
      for (const f of files) entries.push({ name: `${prefix}${f}`, data: fs.readFileSync(path.join(dir, f)) })
    } else {
      const figures = figuresFor(m, text, dir)
      const { body, renamed } = exportBody(m, text, files, dir, prefix, figures)
      collectFigures(figures)
      const own = !m.block && fs.existsSync(path.join(dir, NOTE_MACROS))
      if (own && !files.includes(NOTE_MACROS)) files.push(NOTE_MACROS)
      const front = frontFor(t, authors, titleFor(m.name), body, m.kind, { byline, date })
      const blockPreamble = m.block ? [
        '\\makeatletter\\def\\input@path{{block-files/}{block-files/blocks/}}\\makeatother',
        ...(files.includes('preamble.tex') ? [inputBlockPreamble('block-files/preamble.tex', true)] : []),
        '\\makeatletter\\@ifpackageloaded{graphicx}{\\graphicspath{{block-files/figures/}{block-files/blocks/}{block-files/}}}{}\\makeatother',
      ] : []
      const extra = [...blockPreamble, ...(own ? [`\\input{${NOTE_MACROS.replace(/\.tex$/, '')}}`] : []), ...(m.format === 'md' ? [MD_PREAMBLE] : []), ...figurePreambles]
      // Markdown 노트의 참고문헌: 노트 폴더의 .bib(함께 묶인다), 없으면 프로젝트 bib를 묶음에 넣어 쓴다
      const bibFiles = (m.format === 'md' ? noteBibFiles(wb, mainAbs, body) : []).filter((file) => {
        if (!m.block) return true
        const rel = path.relative(repo, fs.realpathSync(file))
        if (rel.startsWith('..') || path.isAbsolute(rel)) { skippedAll.push(`${m.name}: ${file}`); return false }
        return true
      })
      const bibName = (f: string) => files.includes(path.relative(dir, f)) ? `${prefix}${path.relative(dir, f)}` : path.basename(f)
      for (const f of bibFiles) if (!files.includes(path.relative(dir, f))) entries.push({ name: path.basename(f), data: fs.readFileSync(f) })
      const bib = bibliographyLines(t, bibFiles.map((f) => bibName(f).replace(/\.bib$/, '')))
      // 발표 서식은 제목을 \\begin{document} 앞에 두는 buildExportMainTex를 따른다
      const main = t.kind === 'slides' && !/\\(?:title|author)\s*[[{]/.test(body)
        ? `${note}\n${buildExportMainTex({ setup: setup(extra), authors, title: titleFor(m.name), body, date })}`
        : [note, t.documentClass, setup(extra).preamble, '', '\\begin{document}', '', ...front, ...(front.length ? [''] : []), body, ...bib, '\\end{document}', ''].join('\n')
      entries.push({ name: 'main.tex', data: main }, ...header(true))
      const taken = new Set(entries.map((e) => e.name))
      for (const f of files) if (f !== mainRel && !taken.has(`${prefix}${renamed.get(f) ?? f}`)) entries.push({ name: `${prefix}${renamed.get(f) ?? f}`, data: fs.readFileSync(path.join(dir, f)) })
    }
  } else {
    root = `${slugOf(research.title)}-notes`
    filename = tl(`${research.title} 노트 ${picked.length}개`, `${research.title} ${picked.length} notes`)
    const used = new Set<string>()
    const parts: string[] = []
    const noteMacros: string[] = []
    for (const m of picked) {
      const { mainAbs, text, files, skipped } = filesOf(m, repo)
      skippedAll.push(...skipped.map((s) => `${m.name}: ${s}`))
      let slug = slugOf(m.name)
      for (let n = 2; used.has(slug); n++) slug = `${slugOf(m.name)}-${n}`
      used.add(slug)
      const mainRel = path.basename(mainAbs)
      const figures = figuresFor(m, text, path.dirname(mainAbs))
      const { body, renamed } = exportBody(m, text, files, path.dirname(mainAbs), '', figures)
      collectFigures(figures)
      entries.push({ name: `notes/${slug}/body.tex`, data: `% ${m.name} (${m.main})\n${quietTitles(body)}` })
      if (fs.existsSync(path.join(path.dirname(mainAbs), NOTE_MACROS))) {
        if (!files.includes(NOTE_MACROS)) files.push(NOTE_MACROS)
        noteMacros.push(`\\input{notes/${slug}/${NOTE_MACROS.replace(/\.tex$/, '')}}`)
      }
      for (const f of files) if (f !== mainRel && f !== 'body.tex') entries.push({ name: `notes/${slug}/${renamed.get(f) ?? f}`, data: fs.readFileSync(path.join(path.dirname(mainAbs), f)) })
      parts.push(
        t.kind === 'slides' ? '' : '\\clearpage',
        `% ---- ${m.name} ----`,
        ...(t.kind === 'slides' ? [] : [`\\begin{center}\\Large\\bfseries ${titleFor(m.name)}\\end{center}`]),
        `\\subimport{notes/${slug}/}{body}`,
        '',
      )
    }
    const all = setup(['\\usepackage{import}', ...noteMacros, ...(picked.some((m) => m.format === 'md') ? [MD_PREAMBLE] : []), ...figurePreambles])
    // 연구·계산 노트만 모은 것은 (저자를 넣지 않으면) 저자·소속 없이 노트마다 이름만 작게 두고 바로 본문으로 간다 (10/4 16:53 사용자)
    const data = t.kind !== 'slides' && !byline
      ? [all.documentClass, all.preamble, '', '\\begin{document}', '', NO_TITLE_BLOCK, ...(date ? [`{\\centering\\small ${date}\\par}\\bigskip`] : []), '', parts.join('\n').replace(/^\\clearpage\n/, ''), '\\end{document}', ''].join('\n')
      : buildExportMainTex({ setup: all, authors, title: titleFor(filename), body: parts.join('\n'), date })
    entries.unshift({ name: 'main.tex', data: `${note}\n${data}` }, ...header(true))
  }

  entries.push(...figureFiles.values())
  const readme = [
    tl(`${filename} — research-workspace에서 내보냄 (${new Date().toISOString().slice(0, 10)})`, `${filename}: exported from research-workspace (${new Date().toISOString().slice(0, 10)})`),
    '',
    tl(`서식: ${t.name}`, `Template: ${t.name}`),
    tl(`저자: ${byline && authors.length ? authors.map((a) => a.name).join(', ') : '넣지 않음'}`, `Authors: ${byline && authors.length ? authors.map((a) => a.name).join(', ') : 'not included'}`),
    tl(`날짜: ${date === '\\today' ? '컴파일한 날 (\\today)' : date || '넣지 않음'}`, `Date: ${date === '\\today' ? 'day of compiling (\\today)' : date || 'not included'}`),
    tl('노트:', 'Notes:'),
    ...picked.map((m) => `- ${m.name} (${m.main})`),
    '',
    picked.length > 1 ? tl('여러 노트를 main.tex 하나로 모았습니다. 노트 각자의 머리(\\documentclass … \\begin{document})와 제목 줄은 빼고 본문만 넣었습니다.', 'Several notes were combined into one main.tex. Each note\'s preamble (\\documentclass … \\begin{document}) and title line were left out; only the bodies are included.') : '',
    tl('한글이나 글꼴 설정(fontspec·kotex)이 있으면 XeLaTeX로 컴파일하세요 (latexmk -xelatex).', 'If there is Korean text or font setup (fontspec·kotex), compile with XeLaTeX (latexmk -xelatex).'),
    ...(svgFigures.size ? ['', tl(`SVG는 LaTeX에 바로 넣을 수 없어 이름 상자로 두었습니다. PDF로 바꿔 넣으세요: ${[...svgFigures].join(', ')}`, `SVG cannot go into LaTeX directly, so these are name boxes. Convert them to PDF and insert them: ${[...svgFigures].join(', ')}`)] : []),
    ...(excludedFigures.size ? ['', tl(`\\documentclass가 있는 TikZ 문서는 본문에 넣을 수 없어 포함하지 않고 이름 상자로 두었습니다: ${[...excludedFigures].join(', ')}`, `TikZ documents with \\documentclass cannot go into the body, so they were left out as name boxes: ${[...excludedFigures].join(', ')}`)] : []),
    ...(skippedAll.length ? ['', tl('노트 폴더 밖이라 넣지 않은 파일:', 'Files left out because they are outside the note folder:'), ...skippedAll.map((s) => `- ${s}`)] : []),
    '',
  ].filter((l, i, a) => !(l === '' && a[i - 1] === '')).join('\n')
  entries.push({ name: 'README.txt', data: readme })
  const prefixed = entries.map((e) => ({ name: `${root}/${e.name}`, data: e.data }))
  return { filename: `${filename}.zip`, zip: makeZip(prefixed), files: prefixed.map((e) => e.name) }
}
