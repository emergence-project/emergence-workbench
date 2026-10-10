// 컴파일 설정 (10/4 20:56 "컴파일시, 템플릿 설정에 대한 기본값을 정해두고, 추가로 원할때 변경하게 하고 싶어"):
// 고르지 않으면 프로젝트 서식·처음 값으로, 고르면 그 서식·저자·날짜로 감싼다. 감싸는 main은 TeX 없이도 만들어진다.
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildApp } from './app.js'
import { makeRepo, tmp, useSampleApp } from './testkit.js'

useSampleApp()

describe('컴파일 설정', () => {
  it('기본은 프로젝트 서식(없으면 노트는 한 단 연구노트 서식), 고르면 그 서식·저자·날짜로 감싼다 (없는 서식은 프로젝트 서식으로)', async () => {
    const proj = makeRepo('compile-choice')
    const w = (rel: string, text: string) => { fs.mkdirSync(path.dirname(path.join(proj, rel)), { recursive: true }); fs.writeFileSync(path.join(proj, rel), text) }
    w('workbench/notes/proof/main.tex', '\\begin{document}\n\\section{Proof}\nText.\n\\end{document}\n')
    w('workbench/notes/proof/note.yaml', 'name: 증명 노트\n')
    const a = buildApp({ configDir: path.join(tmp, 'config-compile-choice') })
    await a.inject({ method: 'PUT', url: '/api/authors', payload: { authors: [{ name: 'Ann A', affiliations: ['X'] }, { name: 'Bo B', affiliations: ['Y'] }] } })
    const id = (await a.inject({ method: 'POST', url: '/api/researches', payload: { path: proj } })).json().id
    const R = `/api/researches/${id}`
    // 적지 않은 연구노트의 key는 경로에서
    const key = (await a.inject({ method: 'GET', url: `${R}/manuscripts` })).json()[0].key as string
    expect(key).toBe('workbench-notes-proof-main')
    const wrap = async (q: string) => {
      await a.inject({ method: 'POST', url: `${R}/manuscript/compile?ms=${key}${q}` })
      return fs.readFileSync(path.join(proj, `workbench/.build/manuscript-${key}/rw-wrap-main.tex`), 'utf8')
    }
    // latex-template:이 없으면 연구노트는 한 단 연구노트 서식 (앱 기본 서식인 PRL 두 단이 아니라, 10/8 11:42)
    expect(await wrap('')).toContain('rw-research-note')
    expect((await a.inject({ method: 'GET', url: `${R}/export/options` })).json()).toMatchObject({ noteTemplate: 'research-note' })
    fs.appendFileSync(path.join(proj, 'workbench/research.yaml'), 'latex-template: prb\n')
    expect((await a.inject({ method: 'GET', url: `${R}/export/options` })).json()).toMatchObject({ template: 'prb', noteTemplate: 'prb' })
    const plain = await wrap('')
    expect(plain).toContain('{revtex4-2}')
    expect(plain).not.toContain('Ann A')

    const picked = await wrap('&tpl=article&au=Bo%20B&au=Ann%20A&date=2026-10-04')
    expect(picked).toContain('{article}')
    expect(picked.indexOf('Bo B')).toBeGreaterThan(0)
    expect(picked.indexOf('Bo B')).toBeLessThan(picked.indexOf('Ann A'))
    expect(picked).toContain('\\date{2026-10-04}')

    expect(await wrap('&tpl=gone')).toContain('{revtex4-2}')
    expect((await a.inject({ method: 'POST', url: `${R}/manuscript/compile?ms=${key}&date=yesterday` })).statusCode).toBe(400)
    await a.close()
  }, 120_000)
})
