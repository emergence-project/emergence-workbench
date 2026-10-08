import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import YAML from 'yaml'
import { markdownToLatex } from '@rw/core'
import { figureEmbedResolver, writeFigureEmbeds } from './figureEmbeds.js'
import { TIKZ_LIBS } from './figures.js'
import { app, repo, tmp, useSampleApp } from './testkit.js'

useSampleApp()

function setup(name: string) {
  const library = path.join(tmp, `embeds-library-${name}`)
  const shared = path.join(library, 'figures')
  const own = path.join(repo, 'workbench', 'figures')
  const notes = path.join(tmp, `embeds-notes-${name}`)
  for (const dir of [shared, own, notes]) fs.mkdirSync(dir, { recursive: true })
  app.registry.setLibrary(library)
  return { shared, own, notes, resolve: figureEmbedResolver(app.registry, 'sample-research') }
}

describe('Markdown 그림 원본 모으기', () => {
  it('이름·파일 이름·stem을 찾고 프로젝트 그림을 먼저 넣으며 원본은 그대로 둔다', () => {
    const { own, shared, notes, resolve } = setup('names')
    const picture = Buffer.from('\\begin{tikzpicture}\r\n\\draw (0,0) -- (1,1);\r\n\\end{tikzpicture}\r\n')
    const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 255])
    const source = path.join(own, 'project-name.tex')
    fs.writeFileSync(source, picture)
    fs.writeFileSync(path.join(shared, 'shared-name.png'), png)
    fs.writeFileSync(path.join(shared, 'clash.png'), 'shared copy')
    fs.writeFileSync(path.join(own, 'figures.yaml'), YAML.stringify({ 'project-name.tex': { name: '같은 그림' } }))
    fs.writeFileSync(path.join(shared, 'figures.yaml'), YAML.stringify({ 'clash.png': { name: '같은 그림' } }))
    const text = '![[같은 그림|300]]\n\n![[project-name.tex]]\n\n![[shared-name]]\n\n![[unknown]]\n'
    const note = path.join(notes, 'note.md')
    fs.writeFileSync(note, text)
    const embeds = resolve(text, [notes])
    expect(embeds.files.map((f) => f.name)).toEqual(['figure-library/sample-research/project-name.tex', 'figure-library/library/shared-name.png'])
    expect(embeds.files[0]!.data.equals(picture)).toBe(true)
    expect(embeds.files[1]!.data.equals(png)).toBe(true)
    expect(embeds.preamble).toBe(`\\usepackage{tikz}\n\\usetikzlibrary{${TIKZ_LIBS}}`)
    expect(embeds.figure('같은 그림')).toBe('\\begin{center}\n\\input{figure-library/sample-research/project-name.tex}\n\\end{center}')
    expect(embeds.figure('shared-name')).toBe('\\begin{center}\n\\includegraphics[width=0.8\\linewidth]{figure-library/library/shared-name.png}\n\\end{center}')
    expect(markdownToLatex(text, embeds)).toContain('\\includegraphics[width=0.8\\linewidth]{unknown}')
    expect(embeds.inputs).toEqual(expect.arrayContaining([source, path.join(own, 'figures.yaml'), path.join(shared, 'figures.yaml')]))
    expect(fs.readFileSync(note, 'utf8')).toBe(text)
    expect(fs.readFileSync(source).equals(picture)).toBe(true)
    const sharedOnly = figureEmbedResolver(app.registry)('![[같은 그림]]', [notes])
    expect(sharedOnly.files.map((f) => f.name)).toEqual(['figure-library/library/clash.png'])
  })

  it('tikzpicture 없는 원본은 input 바깥에서 감싸고 완전한 문서와 SVG는 이름 상자로 둔다', () => {
    const { shared, notes, resolve } = setup('kinds')
    const bare = Buffer.from('\\draw (0,0) circle (1);\r\n')
    const full = '\\documentclass{standalone}\n\\begin{document}full\\end{document}\n'
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"/>\n'
    fs.writeFileSync(path.join(shared, 'bare.tikz'), bare)
    fs.writeFileSync(path.join(shared, 'full.tex'), full)
    fs.writeFileSync(path.join(shared, 'shape.svg'), svg)
    fs.writeFileSync(path.join(shared, 'figures.yaml'), YAML.stringify({ 'shape.svg': { name: 'shape_100%' } }))
    const embeds = resolve('![[bare]]\n\n![[full]]\n\n![[shape_100%]]', [notes])
    expect(embeds.figure('bare')).toBe('\\begin{center}\n\\begin{tikzpicture}\n\\input{figure-library/library/bare.tikz}\n\\end{tikzpicture}\n\\end{center}')
    expect(embeds.figure('full')).toBe('\\fbox{\\texttt{full}}')
    expect(embeds.figure('shape_100%')).toBe('\\fbox{\\texttt{shape\\_100\\%}}')
    expect(embeds.excluded).toEqual(['figure-library/library/full.tex'])
    expect(embeds.svg).toEqual(['figure-library/library/shape.svg'])
    expect(embeds.files.map((f) => f.name)).toEqual(['figure-library/library/bare.tikz', 'figure-library/library/shape.svg'])
    expect(embeds.files[0]!.data.equals(bare)).toBe(true)
    const out = path.join(tmp, 'embeds-build')
    writeFigureEmbeds(embeds, out)
    expect(fs.readFileSync(path.join(out, 'figure-library/library/bare.tikz')).equals(bare)).toBe(true)
    expect(fs.existsSync(path.join(out, 'figure-library/library/shape.svg'))).toBe(false)
    expect(fs.existsSync(path.join(out, 'figure-library/library/full.tex'))).toBe(false)
    expect(fs.readFileSync(path.join(shared, 'full.tex'), 'utf8')).toBe(full)
    expect(fs.readFileSync(path.join(shared, 'shape.svg'), 'utf8')).toBe(svg)
    const placeholders = resolve('![[full]] ![[shape_100%]]', [notes])
    expect(placeholders.preamble).toBe('')
  })

  it.each(['png', 'jpg', 'jpeg', 'pdf'])('%s 원본도 같은 경로·바이트로 복사한다', (ext) => {
    const { shared, notes, resolve } = setup(`copy-${ext}`)
    const bytes = Buffer.from([0, 13, 10, 128, 255])
    const file = `copy-source.${ext}`
    fs.writeFileSync(path.join(shared, file), bytes)
    const embeds = resolve(`![[${file}]]`, [notes])
    expect(embeds.figure(file)).toBe(`\\begin{center}\n\\includegraphics[width=0.8\\linewidth]{figure-library/library/${file}}\n\\end{center}`)
    const out = path.join(tmp, `embeds-copy-${ext}`)
    writeFigureEmbeds(embeds, out)
    expect(fs.readFileSync(path.join(out, 'figure-library/library', file))).toEqual(bytes)
    expect(fs.readFileSync(path.join(shared, file))).toEqual(bytes)
    expect(embeds.preamble).toBe('')
  })

  it('기존 경로에서 찾은 파일을 먼저 쓰고 부모 경로 허용 여부를 따른다', () => {
    const { shared, notes, resolve } = setup('local')
    fs.writeFileSync(path.join(shared, 'local.png'), 'library')
    fs.writeFileSync(path.join(notes, 'local.png'), 'note')
    fs.writeFileSync(path.join(shared, 'parent.png'), 'library parent')
    fs.writeFileSync(path.join(notes, '../parent-local.png'), 'local parent')
    fs.writeFileSync(path.join(shared, 'figures.yaml'), YAML.stringify({ 'parent.png': { name: '../parent-local.png' } }))
    expect(resolve('![[local.png]]', [notes]).files).toEqual([])
    expect(resolve('![[local.png]]', [path.join(notes, 'missing'), notes]).figure('local.png')).toBeUndefined()
    expect(resolve('![[../parent-local.png]]', [notes], true).files).toEqual([])
    expect(resolve('![[../parent-local.png]]', [notes]).files.map((f) => f.name)).toEqual(['figure-library/library/parent.png'])
    expect(fs.readFileSync(path.join(notes, 'local.png'), 'utf8')).toBe('note')
  })

  it('컴파일에서만 확장자를 뺀 로컬 그림을 먼저 쓰고 내보내기의 기존 검색은 유지한다', () => {
    const { shared, notes, resolve } = setup('local-extensions')
    for (const ext of ['pdf', 'png', 'jpg', 'jpeg']) {
      const name = `local-${ext}`
      fs.writeFileSync(path.join(shared, `${name}.png`), 'library')
      fs.writeFileSync(path.join(notes, `${name}.${ext}`), 'local')
      expect(resolve(`![[${name}]]`, [notes], false, true).files).toEqual([])
      expect(resolve(`![[${name}]]`, [notes]).files.map((f) => f.name)).toEqual([`figure-library/library/${name}.png`])
    }
    fs.writeFileSync(path.join(shared, 'parent-extension.png'), 'library')
    fs.writeFileSync(path.join(shared, 'figures.yaml'), YAML.stringify({ 'parent-extension.png': { name: '../parent-extension' } }))
    fs.writeFileSync(path.join(notes, '../parent-extension.pdf'), 'local parent')
    expect(resolve('![[../parent-extension]]', [notes], true, true).files).toEqual([])
    expect(resolve('![[../parent-extension]]', [notes], false, true).files.map((f) => f.name)).toEqual(['figure-library/library/parent-extension.png'])
    fs.writeFileSync(path.join(shared, 'directory.png'), 'library')
    fs.mkdirSync(path.join(notes, 'directory.pdf'))
    expect(resolve('![[directory]]', [notes], false, true).files.map((f) => f.name)).toEqual(['figure-library/library/directory.png'])
  })

  it('컴파일의 복사 경로와 같은 로컬 경로는 원래 절대 경로로 고정한다', () => {
    const { shared, notes, resolve } = setup('local-build-path')
    fs.writeFileSync(path.join(shared, 'overlap.png'), 'library')
    const rel = 'figure-library/library/overlap.png'
    const local = path.join(notes, rel)
    fs.mkdirSync(path.dirname(local), { recursive: true })
    fs.writeFileSync(local, 'local')
    const text = `![[overlap]]\n\n![[${rel}]]\n\n![[figure-library/library/overlap]]`
    const compiled = resolve(text, [notes], false, true)
    expect(compiled.figure('overlap')).toContain('{figure-library/library/overlap.png}')
    expect(compiled.figure(rel)).toBe(`\\includegraphics[width=0.8\\linewidth]{${local}}`)
    expect(compiled.figure('figure-library/library/overlap')).toContain(`{${local}}`)
    expect(resolve(`![[${rel}]]`, [notes], false, true).figure(rel)).toContain(`{${local}}`)
    expect(resolve(text, [notes]).figure(rel)).toBeUndefined()
    expect(fs.readFileSync(local, 'utf8')).toBe('local')
  })

  it('그림 폴더 밖을 가리키는 원본·메타데이터 심볼릭 링크를 읽지 않는다', () => {
    const { shared, notes, resolve } = setup('symlinks')
    const outside = path.join(tmp, 'outside-figure.tex')
    fs.writeFileSync(outside, '\\draw (0,0) -- (99,99);')
    fs.symlinkSync(outside, path.join(shared, 'escape.tex'))
    fs.symlinkSync(path.join(tmp, 'missing-figure.tex'), path.join(shared, 'broken.tex'))
    fs.writeFileSync(path.join(shared, 'safe.png'), 'safe png')
    const meta = path.join(tmp, 'outside-figures.yaml')
    fs.writeFileSync(meta, YAML.stringify({ 'safe.png': { name: 'outside-alias' } }))
    fs.symlinkSync(meta, path.join(shared, 'figures.yaml'))
    const embeds = resolve('![[escape]] ![[broken]] ![[outside-alias]] ![[safe]]', [notes])
    expect(embeds.figure('escape')).toBeUndefined()
    expect(embeds.figure('broken')).toBeUndefined()
    expect(embeds.figure('outside-alias')).toBeUndefined()
    expect(embeds.files.map((f) => f.name)).toEqual(['figure-library/library/safe.png'])
    expect(embeds.inputs).not.toContain(meta)
    expect(embeds.inputs).not.toContain(outside)
    expect(embeds.preamble).toBe('')
  })

  it('빌드 하위 폴더나 파일의 심볼릭 링크를 따라 밖에 쓰지 않는다', () => {
    const { shared, notes, resolve } = setup('build-symlinks')
    fs.writeFileSync(path.join(shared, 'build-safe.png'), 'original')
    const embeds = resolve('![[build-safe]]', [notes])
    const outside = path.join(tmp, 'embeds-outside-build')
    const directoryBuild = path.join(tmp, 'embeds-directory-link-build')
    const fileBuild = path.join(tmp, 'embeds-file-link-build')
    for (const dir of [outside, directoryBuild, path.join(fileBuild, 'figure-library/library')]) fs.mkdirSync(dir, { recursive: true })
    fs.symlinkSync(outside, path.join(directoryBuild, 'figure-library'))
    expect(() => writeFigureEmbeds(embeds, directoryBuild)).toThrow('심볼릭 링크')
    expect(fs.readdirSync(outside)).toEqual([])
    const target = path.join(outside, 'absent.png')
    fs.symlinkSync(target, path.join(fileBuild, 'figure-library/library/build-safe.png'))
    expect(() => writeFigureEmbeds(embeds, fileBuild)).toThrow('심볼릭 링크')
    expect(fs.existsSync(target)).toBe(false)
    expect(fs.readFileSync(path.join(shared, 'build-safe.png'), 'utf8')).toBe('original')
  })

  it('코드·수식·머리말·숨긴 메모 속 embed는 원본 목록에도 넣지 않는다', () => {
    const { shared, notes, resolve } = setup('syntax')
    fs.writeFileSync(path.join(shared, 'hidden.tikz'), '\\draw (0,0) -- (1,1);')
    const text = '---\ntitle: "![[hidden]]"\n---\n`![[hidden]]`\n\n```md\n![[hidden]]\n```\n\n$![[hidden]]$\n\n$$\n![[hidden]]\n$$\n\n<!-- ![[hidden]] -->\n'
    const embeds = resolve(text, [notes])
    expect(embeds.files).toEqual([])
    expect(embeds.inputs).toEqual([])
    expect(embeds.preamble).toBe('')
  })

  it('그림 문단 ![캡션](대상)도 노트 폴더에 없으면 라이브러리 그림으로 캡션·번호와 함께 그린다', () => {
    const { own, shared, notes, resolve } = setup('paragraph')
    fs.writeFileSync(path.join(shared, 'disk.pdf'), '%PDF-1.4 shared\n')
    fs.writeFileSync(path.join(own, 'disk.pdf'), '%PDF-1.4 own\n')
    fs.writeFileSync(path.join(shared, 'local.png'), 'library copy')
    fs.writeFileSync(path.join(notes, 'local.png'), 'note copy')
    fs.writeFileSync(path.join(shared, 'loop.tikz'), '\\draw (0,0) circle (1);\n')
    const text = '![원판 \\label{fig: disk}](disk)\n\n![](local.png)\n\n![고리](loop)\n\n![없음](none.png)\n\n`![코드](code)`\n'
    const embeds = resolve(text, [notes])
    // 이 프로젝트 전용 그림이 공용보다 먼저, 노트 폴더 파일이 라이브러리보다 먼저
    expect(embeds.files.map((f) => f.name)).toEqual(['figure-library/sample-research/disk.pdf', 'figure-library/library/loop.tikz'])
    expect(embeds.preamble).toContain('\\usepackage{tikz}')
    const out = markdownToLatex(text, embeds)
    expect(out).toContain('\\begin{figure}[htbp]\n\\centering\n\\includegraphics[width=\\linewidth]{figure-library/sample-research/disk.pdf}\n\\caption{원판 \\label{fig: disk}}')
    expect(out).toContain('\\begin{center}\n\\includegraphics[width=0.8\\linewidth]{local.png}\n\\end{center}')
    expect(out).toContain('\\begin{tikzpicture}\n\\input{figure-library/library/loop.tikz}\n\\end{tikzpicture}\n\\caption{고리}')
    expect(out).toContain('\\includegraphics[width=\\linewidth]{none.png}')
  })
})
