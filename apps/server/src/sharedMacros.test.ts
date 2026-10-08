// 모든 노트가 함께 쓰는 기호 (설정 › LaTeX › 기호, 10/4 19:30): research-library의 concepts/macros.tex 하나를
// 개념노트 화면(KaTeX)과 연구노트 컴파일·내보내기가 함께 쓴다. 프로젝트 기호(workbench/macros.tex)가 앞선다.
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildApp } from './app.js'
import { sharedMacrosTex } from './latexFiles.js'
import { hasLatex, makeRepo, tmp, useSampleApp } from './testkit.js'

useSampleApp()

const SHARED = [
  '% 공통 기호',
  '\\newcommand{\\abs}[1]{\\left|#1\\right|}',
  '\\DeclareMathOperator{\\Col}{col}',
  '\\newcommand{\\ADA}[1]{(shared) #1}',
  '',
].join('\n')

async function setup(name: string) {
  const lib = path.join(tmp, `${name}-library`)
  fs.mkdirSync(path.join(lib, 'concepts'), { recursive: true })
  const proj = makeRepo(name)
  const w = (rel: string, text: string) => { fs.mkdirSync(path.dirname(path.join(proj, rel)), { recursive: true }); fs.writeFileSync(path.join(proj, rel), text) }
  w('workbench/notes/proof/main.tex', '\\begin{document}\n\\section{Proof}\nGraph $\\abs{V}$ with $\\Col G = 5$ and \\ADA{check}.\n\\end{document}\n')
  w('workbench/notes/proof/note.yaml', 'name: 증명 노트\n')
  w('workbench/macros.tex', '\\newcommand{\\ADA}[1]{(ADA) #1}\n')
  const a = buildApp({ configDir: path.join(tmp, `config-${name}`) })
  const id = (await a.inject({ method: 'POST', url: '/api/researches', payload: { path: proj } })).json().id
  const R = `/api/researches/${id}`
  const key = ((await a.inject({ method: 'GET', url: `${R}/manuscripts` })).json() as { key: string; name: string }[]).find((m) => m.name === '증명 노트')!.key
  return { a, lib, proj, R, key }
}

describe('공통 기호', () => {
  it('라이브러리가 없으면 고칠 수 없고, 있으면 concepts/macros.tex를 읽고 쓴다', async () => {
    const { a, lib } = await setup('macros-api')
    expect((await a.inject({ method: 'GET', url: '/api/latex-macros' })).json()).toMatchObject({ library: false, exists: false, macros: {} })
    expect((await a.inject({ method: 'PUT', url: '/api/latex-macros', payload: { text: SHARED } })).statusCode).toBe(409)
    a.registry.setLibrary(lib)
    const { hash } = (await a.inject({ method: 'GET', url: '/api/latex-macros' })).json()
    expect((await a.inject({ method: 'PUT', url: '/api/latex-macros', payload: { text: SHARED } })).statusCode).toBe(400)
    const put = (await a.inject({ method: 'PUT', url: '/api/latex-macros', payload: { text: SHARED, baseHash: hash } })).json()
    expect(put).toMatchObject({ library: true, exists: true, file: 'concepts/macros.tex' })
    expect(put.macros).toEqual({ '\\abs': '\\left|#1\\right|', '\\Col': '\\operatorname{col}', '\\ADA': '(shared) #1' })
    expect(fs.readFileSync(path.join(lib, 'concepts/macros.tex'), 'utf8')).toBe(SHARED)
    // 개념노트 화면이 읽는 것과 같은 파일
    expect((await a.inject({ method: 'GET', url: '/api/concepts/macros' })).json().macros).toEqual(put.macros)
    expect((await a.inject({ method: 'PUT', url: '/api/latex-macros', payload: { text: 3 } })).statusCode).toBe(400)
    // 읽은 뒤 바깥에서 고친 파일은 덮지 않는다
    fs.appendFileSync(path.join(lib, 'concepts/macros.tex'), '\\newcommand{\\agent}{A}\n')
    const stale = await a.inject({ method: 'PUT', url: '/api/latex-macros', payload: { text: SHARED, baseHash: put.hash } })
    expect(stale.statusCode).toBe(409)
    expect(fs.readFileSync(path.join(lib, 'concepts/macros.tex'), 'utf8')).toContain('\\agent')
    await a.close()
  })

  it('LaTeX에는 \\providecommand로 (인자 수 그대로), 기호가 없으면 넣지 않는다', () => {
    const lib = path.join(tmp, 'macros-tex')
    expect(sharedMacrosTex(lib)).toBeNull()
    fs.mkdirSync(path.join(lib, 'concepts'), { recursive: true })
    fs.writeFileSync(path.join(lib, 'concepts/macros.tex'), SHARED)
    const tex = sharedMacrosTex(lib)!
    expect(tex).toContain('\\providecommand{\\abs}[1]{\\left|#1\\right|}')
    expect(tex).toContain('\\providecommand{\\Col}{\\operatorname{col}}')
    expect(tex).not.toContain('\\newcommand')
    fs.writeFileSync(path.join(lib, 'concepts/macros.tex'), '% 비어 있음\n')
    expect(sharedMacrosTex(lib)).toBeNull()
  })

  it('내보낸 폴더에 shared-macros.tex를 넣고 프로젝트 기호 다음에 부른다', async () => {
    const { a, lib, R, key } = await setup('macros-export')
    a.registry.setLibrary(lib)
    fs.writeFileSync(path.join(lib, 'concepts/macros.tex'), SHARED)
    const res = await a.inject({ method: 'GET', url: `${R}/export?ms=${encodeURIComponent(key)}` })
    expect(res.statusCode).toBe(200)
    const dir = path.join(tmp, 'macros-export-zip')
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'x.zip'), res.rawPayload)
    execFileSync('unzip', ['-q', 'x.zip'], { cwd: dir })
    const root = path.join(dir, fs.readdirSync(dir).find((f) => f !== 'x.zip')!)
    const main = fs.readFileSync(path.join(root, 'main.tex'), 'utf8')
    expect(main.indexOf('\\input{macros}')).toBeLessThan(main.indexOf('\\input{shared-macros}'))
    expect(fs.readFileSync(path.join(root, 'shared-macros.tex'), 'utf8')).toContain('\\providecommand{\\abs}')
    if (hasLatex) {
      execFileSync('latexmk', ['-xelatex', '-interaction=nonstopmode', '-halt-on-error', 'main.tex'], { cwd: root, stdio: 'ignore' })
      expect(fs.existsSync(path.join(root, 'main.pdf'))).toBe(true)
    }
    await a.close()
  }, 120_000)

  it.skipIf(!hasLatex)('연구노트 컴파일: 공통 기호를 쓰고, 같은 이름은 프로젝트 기호가 앞선다', async () => {
    const { a, lib, proj, R, key } = await setup('macros-compile')
    a.registry.setLibrary(lib)
    fs.writeFileSync(path.join(lib, 'concepts/macros.tex'), SHARED)
    const r = (await a.inject({ method: 'POST', url: `${R}/manuscript/compile?ms=${encodeURIComponent(key)}` })).json()
    expect(r.problems, JSON.stringify(r.problems)).toEqual([])
    expect(r.ok).toBe(true)
    const build = path.join(proj, 'workbench/.build', key ? `manuscript-${key}` : 'manuscript')
    const wrap = fs.readFileSync(path.join(build, 'rw-wrap-main.tex'), 'utf8')
    expect(wrap.indexOf('macros.tex}')).toBeLessThan(wrap.indexOf('\\input{shared-macros}'))
    expect(fs.existsSync(path.join(build, 'main.pdf'))).toBe(true)
    // 글자 확인은 pdftotext가 있을 때만 (CI의 TeX에는 없다)
    let text: string | null = null
    try { text = execFileSync('pdftotext', [path.join(build, 'main.pdf'), '-']).toString() } catch { /* 없음 */ }
    if (text !== null) {
      expect(text).toContain('(ADA) check')
      expect(text).not.toContain('(shared)')
    }
    await a.close()
  }, 120_000)
})
