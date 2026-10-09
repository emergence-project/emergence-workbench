import fs from 'node:fs'
import path from 'node:path'
import { isOutside } from './fsutil.js'
import { escapeLatexText, markdownToLatex } from '@rw/core'
import { FIGURES_META, LIBRARY_SCOPE, TIKZ_LIBS, figureFile, listFigureSources, resolveFigure, type FigureKind } from './figures.js'
import type { Registry } from './registry.js'
import { t } from './i18n.js'

export interface FigureEmbeds {
  figure: (name: string) => string | undefined
  /** ![캡션](대상)의 대상이 라이브러리 그림이면 그 그림 (figure 환경 안에 들어가 가운데 맞춤 없이) */
  image: (target: string, width: string) => string | undefined
  files: { name: string; abs: string; data: Buffer; kind: FigureKind }[]
  preamble: string
  svg: string[]
  excluded: string[]
  inputs: string[]
}

export type FigureEmbedResolver = (text: string, dirs: string[], allowParent?: boolean, graphicsExtensions?: boolean) => FigureEmbeds

/** 기존 Markdown 첨부 파일을 먼저 쓴다. 컴파일 때는 graphicx가 찾는 확장자도 살핀다. */
function localFile(name: string, dirs: string[], allowParent: boolean, graphicsExtensions: boolean): string | undefined {
  const rel = path.normalize(name)
  if (path.isAbsolute(rel) || (!allowParent && isOutside(rel))) return undefined
  const variants = [rel, ...(graphicsExtensions && !path.extname(rel) ? ['.pdf', '.png', '.jpg', '.jpeg'].map((ext) => `${rel}${ext}`) : [])]
  for (const dir of dirs) for (const file of variants) {
    const abs = path.resolve(dir, file)
    try { if (fs.statSync(abs).isFile()) return abs } catch { /* 다음 기존 경로를 살핀다. */ }
  }
  return undefined
}

const centered = (body: string) => `\\begin{center}\n${body}\n\\end{center}`
const placeholder = (name: string) => `\\fbox{\\texttt{${escapeLatexText(name)}}}`

/** 그림 하나를 그리는 LaTeX: 폭을 받아 그린다 (tikz는 원본 크기). 못 그리는 것은 이름 상자이고 가운데 맞추지 않는다. */
type Draw = ((width: string) => string) & { box?: true }
const box = (name: string): Draw => Object.assign(() => placeholder(name), { box: true as const })

/** 원본은 읽기만 하고, 생성 본문에서 쓸 경로·원본 바이트를 함께 돌려준다. */
export function figureEmbedResolver(registry: Registry, rid?: string): FigureEmbedResolver {
  return (text, dirs, allowParent = false, graphicsExtensions = false) => {
    // 변환기가 실제로 그리는 그림만 모은다 (코드·수식·숨긴 메모는 제외).
    // ![[이름]]은 라이브러리 그림, ![캡션](대상)은 노트 폴더에 없을 때만 라이브러리 그림.
    const names = new Set<string>(), targets = new Set<string>()
    markdownToLatex(text, {
      figure: (name) => { names.add(name); return undefined },
      image: (target) => { targets.add(target); return undefined },
    })
    const draws = new Map<string, Draw>()
    const files = new Map<string, FigureEmbeds['files'][number]>()
    const svg = new Set<string>(), excluded = new Set<string>(), inputs = new Set<string>()
    let tikz = false
    const figures = names.size || targets.size ? listFigureSources(registry, [LIBRARY_SCOPE, ...(rid ? [rid] : [])]) : []
    const library = (name: string): Draw | undefined => {
      const fig = resolveFigure(figures, name, rid)
      if (!fig) return undefined
      try {
        const { abs, folder, file, kind } = figureFile(registry, fig.id)
        const root = fs.realpathSync(folder.dir)
        const real = fs.realpathSync(abs)
        if (!real.startsWith(root + path.sep) || !fs.statSync(real).isFile()) return undefined
        const data = fs.readFileSync(real)
        const output = `figure-library/${fig.scope}/${file}`
        inputs.add(abs)
        const meta = path.join(folder.dir, FIGURES_META)
        if (fs.existsSync(meta) && fs.realpathSync(meta).startsWith(root + path.sep)) inputs.add(meta)
        files.set(output, { name: output, abs, data, kind })
        if (kind === 'tikz') {
          const source = data.toString('utf8')
          if (/\\documentclass/.test(source)) {
            excluded.add(output)
            files.delete(output)
            return box(name)
          }
          tikz = true
          const input = `\\input{${output}}`
          const body = /\\begin\{tikzpicture\}/.test(source) ? input : `\\begin{tikzpicture}\n${input}\n\\end{tikzpicture}`
          return () => body
        }
        if (kind === 'svg') { svg.add(output); return box(name) }
        return (width) => `\\includegraphics[width=${width}]{${output}}`
      } catch { return undefined /* 없거나 읽지 못하는 원본은 기존 변환으로 둔다. */ }
    }
    const snippets = new Map<string, string>()
    for (const name of names) {
      const local = localFile(name, dirs, allowParent, graphicsExtensions)
      if (local) {
        // 빌드에 복사한 그림(지난 컴파일의 것도)이 같은 경로의 로컬 파일을 가리지 않게 한다.
        if (graphicsExtensions && path.normalize(name).startsWith('figure-library' + path.sep)) {
          snippets.set(name, `\\includegraphics[width=0.8\\linewidth]{${local}}`)
        }
        continue
      }
      const draw = library(name)
      if (draw) snippets.set(name, draw.box ? draw('') : centered(draw('0.8\\linewidth')))
    }
    for (const target of targets) {
      // 노트 폴더의 파일이 먼저다 (같은 이름의 라이브러리 그림이 있어도).
      if (localFile(target, dirs, allowParent, graphicsExtensions)) continue
      const draw = library(target)
      if (draw) draws.set(target, draw)
    }
    return {
      figure: (name) => snippets.get(name),
      image: (target, width) => draws.get(target)?.(width),
      files: [...files.values()],
      preamble: tikz ? `\\usepackage{tikz}\n\\usetikzlibrary{${TIKZ_LIBS}}` : '',
      svg: [...svg], excluded: [...excluded], inputs: [...inputs],
    }
  }
}

/** 컴파일에 쓰이는 원본만 빌드 폴더에 쓴다. SVG는 zip 내보내기에서만 담는다. */
export function writeFigureEmbeds(embeds: FigureEmbeds, dir: string): void {
  const root = path.resolve(dir)
  const rejectSymlink = (file: string) => {
    try {
      if (fs.lstatSync(file).isSymbolicLink()) throw new Error(t('빌드 폴더의 그림 경로에 심볼릭 링크가 있어 쓰지 않았습니다', 'Not written: a figure path in the build folder contains a symbolic link'))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
  }
  for (const file of embeds.files) {
    if (file.kind === 'svg') continue
    const dest = path.resolve(root, file.name)
    if (!dest.startsWith(root + path.sep)) throw new Error(t('그림 원본은 빌드 폴더 안에만 쓸 수 있습니다', 'Figure sources can only be written inside the build folder'))
    fs.mkdirSync(root, { recursive: true })
    let folder = root
    // 기존 빌드 파일의 링크를 따라 원본 폴더나 다른 위치에 쓰지 않는다.
    for (const part of path.relative(root, path.dirname(dest)).split(path.sep).filter(Boolean)) {
      folder = path.join(folder, part)
      rejectSymlink(folder)
      fs.mkdirSync(folder, { recursive: true })
    }
    rejectSymlink(dest)
    fs.writeFileSync(dest, file.data)
  }
}
