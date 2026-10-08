import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildApp } from './app.js'
import { makeRepo, tmp, useSampleApp } from './testkit.js'

useSampleApp()

describe('원고를 메인 노트 목록에서 빼기 (10/4 18:05)', () => {
  it('research.yaml에서 그 항목만 지우고, 원고 파일과 다른 줄은 그대로 둔다', async () => {
    const proj = makeRepo('ms-remove')
    const w = (rel: string, text: string) => { fs.mkdirSync(path.dirname(path.join(proj, rel)), { recursive: true }); fs.writeFileSync(path.join(proj, rel), text) }
    w('PRB.tex', '\\documentclass{article}\\begin{document}a\\end{document}\n')
    w('old/main_v2.tex', '\\documentclass{article}\\begin{document}b\\end{document}\n')
    w('workbench/research.yaml', '# 메모\ntitle: N\nsources:\n  manuscript:\n    - PRB.tex — 논문 원고\n    - old/main_v2.tex — 옛 원고\n  canon: [PRB.tex]\n')
    const a = buildApp({ configDir: path.join(tmp, 'config-ms-remove') })
    const id = (await a.inject({ method: 'POST', url: '/api/researches', payload: { path: proj } })).json().id
    const R = `/api/researches/${id}`
    expect((await a.inject({ method: 'DELETE', url: `${R}/main-note?path=${encodeURIComponent('old/main_v2.tex')}` })).statusCode).toBe(200)
    const y = fs.readFileSync(path.join(proj, 'workbench/research.yaml'), 'utf8')
    expect(y).toContain('# 메모')
    expect(y).toContain('PRB.tex — 논문 원고')
    expect(y).not.toContain('main_v2')
    expect(fs.existsSync(path.join(proj, 'old/main_v2.tex'))).toBe(true)
    expect((await a.inject({ method: 'DELETE', url: `${R}/main-note?path=nope.tex` })).statusCode).toBe(404)
    expect((await a.inject({ method: 'DELETE', url: `${R}/main-note?path=PRB.tex` })).statusCode).toBe(200)
    expect(fs.readFileSync(path.join(proj, 'workbench/research.yaml'), 'utf8')).not.toContain('manuscript')
    await a.close()
  })
})
