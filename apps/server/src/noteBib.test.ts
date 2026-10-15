// Markdown 연구노트의 참고문헌: 노트·프로젝트 bib에 없는 인용 키는 공유 라이브러리 references.bib에서 찾는다
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildApp } from './app.js'
import { libraryCitedBib } from './noteBib.js'
import { hasLatex, makeRepo, tmp, useSampleApp } from './testkit.js'

useSampleApp()

const LIBRARY_BIB = [
  '% Zotero export',
  '@string{prl = {Phys. Rev. Lett.}}',
  '@article{tothLinear2015, author = {Toth, S. and Lake, B.}, title = {Linear spin wave theory for {single-Q} incommensurate magnetic structures}, journal = {J. Phys.: Condens. Matter}, year = {2015}}',
  '@article{haldaneModel1988, author = {Haldane, F. D. M.}, title = {Model for a {Quantum Hall} Effect}, journal = prl, year = {1988}}',
  '@article{ownToo2020, author = {Own, A.}, title = {Library copy}, year = {2020}}',
  '',
].join('\n')

/** 프로젝트 bib 없이 라이브러리 키만 인용하는 Markdown 연구노트 하나 */
async function libraryProject(name: string) {
  const proj = makeRepo(name)
  const w = (rel: string, text: string) => { fs.mkdirSync(path.dirname(path.join(proj, rel)), { recursive: true }); fs.writeFileSync(path.join(proj, rel), text) }
  w('workbench/research.yaml', 'title: Sample\nlatex-template: article\n')
  w('workbench/notes/lswt/note.md', '## Spin waves\n\nRotating frame [@tothLinear2015].\n')
  w('workbench/notes/lswt/note.yaml', 'name: LSWT\n')
  const lib = path.join(tmp, `${name}-lib`)
  fs.mkdirSync(lib, { recursive: true })
  fs.writeFileSync(path.join(lib, 'references.bib'), LIBRARY_BIB)
  const a = buildApp({ configDir: path.join(tmp, `config-${name}`) })
  a.registry.setLibrary(lib)
  const id = (await a.inject({ method: 'POST', url: '/api/researches', payload: { path: proj } })).json().id
  const R = `/api/researches/${id}`
  const list = (await a.inject({ method: 'GET', url: `${R}/manuscripts` })).json() as { key: string; name: string }[]
  return { a, proj, R, key: list.find((m) => m.name === 'LSWT')!.key }
}

describe('공유 라이브러리 bib', () => {
  it('프로젝트 bib에 없는 키의 항목과 @string만 글자 그대로 뽑는다', () => {
    const dir = path.join(tmp, 'note-bib-unit')
    fs.mkdirSync(dir, { recursive: true })
    const lib = path.join(dir, 'references.bib')
    const own = path.join(dir, 'refs.bib')
    fs.writeFileSync(lib, LIBRARY_BIB)
    fs.writeFileSync(own, '@article{ownToo2020, title = {Project copy}, year = {2020}}\n')
    const text = libraryCitedBib('See \\cite{tothLinear2015,ownToo2020} and \\cite[p.~3]{haldaneModel1988, unknownKey}.', [own], lib)!
    expect(text).toContain('@string{prl = {Phys. Rev. Lett.}}')
    expect(text).toContain('title = {Linear spin wave theory for {single-Q} incommensurate magnetic structures}, journal = {J. Phys.: Condens. Matter}, year = {2015}}')
    expect(text).toContain('@article{haldaneModel1988,')
    // 프로젝트 bib에 있는 키는 다시 넣지 않는다 (BibTeX의 키 겹침을 피한다)
    expect(text).not.toContain('ownToo2020')
    expect(text).not.toContain('Zotero export')
    expect(libraryCitedBib('\\cite{ownToo2020}', [own], lib)).toBeNull()
    expect(libraryCitedBib('\\cite{tothLinear2015}', [], undefined)).toBeNull()
    expect(libraryCitedBib('no citations', [], lib)).toBeNull()
  })

  it.skipIf(!hasLatex)('컴파일하면 라이브러리에서 뽑은 항목으로 인용이 풀린다', async () => {
    const { a, proj, R, key } = await libraryProject('note-bib-compile')
    const r = (await a.inject({ method: 'POST', url: `${R}/manuscript/compile?ms=${encodeURIComponent(key)}` })).json()
    expect(r.problems).toEqual([])
    expect(r.ok).toBe(true)
    const build = path.join(proj, 'workbench/.build', fs.readdirSync(path.join(proj, 'workbench/.build')).find((d) => d.startsWith('manuscript'))!)
    expect(fs.readFileSync(path.join(build, 'library-refs.bib'), 'utf8')).toContain('@article{tothLinear2015,')
    expect(fs.readFileSync(path.join(build, 'note.log'), 'utf8')).not.toMatch(/undefined citations|Citation .* undefined/)
    await a.close()
  })

  it('화면은 키로 라이브러리 항목을 받고, 내보내기는 library-refs.bib로 참고문헌을 붙인다', async () => {
    const { a, R, key } = await libraryProject('note-bib-library')

    const bib = (await a.inject({ method: 'GET', url: '/api/papers/bib?keys=tothLinear2015,unknownKey' })).json() as { items: { key: string; title?: string }[] }
    expect(bib.items.map((e) => e.key)).toEqual(['tothLinear2015'])
    expect((await a.inject({ method: 'GET', url: '/api/papers/bib' })).json()).toEqual({ items: [] })

    const res = await a.inject({ method: 'GET', url: `${R}/export?ms=${encodeURIComponent(key)}` })
    expect(res.statusCode).toBe(200)
    const dir = path.join(tmp, 'note-bib-library-unzip')
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'x.zip'), res.rawPayload)
    execFileSync('unzip', ['-q', 'x.zip'], { cwd: dir })
    const [root] = fs.readdirSync(dir).filter((f) => f !== 'x.zip')
    const main = fs.readFileSync(path.join(dir, root!, 'main.tex'), 'utf8')
    expect(main).toContain('\\cite{tothLinear2015}')
    expect(main).toContain('\\bibliography{library-refs}\n\\end{document}')
    const refs = fs.readFileSync(path.join(dir, root!, 'library-refs.bib'), 'utf8')
    expect(refs).toContain('@article{tothLinear2015,')
    expect(refs).not.toContain('haldaneModel1988')
    await a.close()
  })
})
