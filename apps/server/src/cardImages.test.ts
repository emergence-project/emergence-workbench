import fs from 'node:fs'
import path from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import YAML from 'yaml'
import { app, makeRepo, R, repo, tmp, useSampleApp } from './testkit.js'

useSampleApp()

const SVG = '<svg xmlns="http://www.w3.org/2000/svg"><circle r="1"/></svg>'
const PDF = '%PDF-1.4 card preview fixture'
const RID = 'sample-research'
let library: string

const hash = async () => (await app.inject({ method: 'GET', url: `${R}/topics` })).json().hash as string
const saved = () => YAML.parse(fs.readFileSync(path.join(repo, 'workbench/research.yaml'), 'utf8'))
const upload = (scope: string, name: string, body = SVG) => app.inject({
  method: 'PUT', url: `/api/figures/upload?scope=${scope}&name=${encodeURIComponent(name)}`,
  headers: { 'content-type': 'application/octet-stream' }, payload: Buffer.from(body),
})
const setProject = async (image: string, baseHash?: string) => app.inject({
  method: 'PATCH', url: `${R}/info`, payload: { image, baseHash: baseHash ?? await hash() },
})
const setTopic = async (image: string | null, baseHash?: string) => app.inject({
  method: 'PATCH', url: `${R}/topics/card-image`, payload: { preview: { image }, baseHash: baseHash ?? await hash() },
})

beforeAll(async () => {
  library = path.join(tmp, 'card-image-library')
  fs.mkdirSync(path.join(library, 'figures'), { recursive: true })
  fs.writeFileSync(path.join(library, 'references.bib'), '')
  app.registry.setLibrary(library)
  expect((await upload(RID, 'local.svg')).statusCode).toBe(200)
  expect((await upload('library', 'shared.svg')).statusCode).toBe(200)
  expect((await upload('library', 'first-page.pdf', PDF)).statusCode).toBe(200)
  expect((await app.inject({ method: 'POST', url: `${R}/topics`, payload: { title: 'Card image', baseHash: await hash() } })).statusCode).toBe(200)
  const other = makeRepo('other-card-project')
  expect((await app.inject({ method: 'POST', url: '/api/researches', payload: { path: other } })).statusCode).toBe(200)
  expect((await upload('other-card-project', 'private.svg')).statusCode).toBe(200)
})

describe('프로젝트·주제 카드의 그림 라이브러리 참조', () => {
  it('공용·프로젝트 그림 id를 같은 칸에 저장하고 기존 그림 API로 보여 준다', async () => {
    for (const id of ['library/shared.svg', `${RID}/local.svg`, 'library/first-page.pdf']) {
      const image = `figure:${id}`
      expect((await setProject(image)).statusCode).toBe(200)
      expect((await setTopic(image)).statusCode).toBe(200)
      const summary = (await app.inject({ method: 'GET', url: R })).json()
      expect(summary.research.image).toBe(image)
      expect(saved().image).toBe(image)
      expect(saved().topics.find((t: { id: string }) => t.id === 'card-image').preview.image).toBe(image)
      const topics = (await app.inject({ method: 'GET', url: `${R}/topics` })).json().topics
      expect(topics.find((t: { id: string }) => t.id === 'card-image').preview.image).toBe(image)
      for (const url of [`${R}/image`, `${R}/topics/card-image/image`]) {
        const response = await app.inject({ method: 'GET', url })
        expect(response.statusCode).toBe(302)
        expect(response.headers.location).toBe(`/api/figures/file?id=${encodeURIComponent(id)}`)
        const file = await app.inject({ method: 'GET', url: String(response.headers.location) })
        expect(file.statusCode).toBe(200)
        expect(file.body).toBe(id.endsWith('.pdf') ? PDF : SVG)
        expect(file.headers['content-type']).toContain(id.endsWith('.pdf') ? 'application/pdf' : 'image/svg+xml')
      }
      // 카드에서 써도 그림 라이브러리 항목은 계속 고를 수 있다.
      const figures = (await app.inject({ method: 'GET', url: '/api/figures' })).json().figures
      expect(figures.map((f: { id: string }) => f.id)).toContain(id)
    }
    expect(fs.readFileSync(path.join(library, 'figures/shared.svg'), 'utf8')).toBe(SVG)
  })

  it('다른 프로젝트·없는 그림·잘못된 참조는 저장하지 않는다', async () => {
    for (const image of ['figure:other-card-project/private.svg', 'figure:library/missing.svg',
      'figure:library/../shared.svg', 'figure:library/shared.svg?x=1', 'figure:library/shared.exe']) {
      const before = fs.readFileSync(path.join(repo, 'workbench/research.yaml'), 'utf8')
      expect([400, 404]).toContain((await setProject(image)).statusCode)
      expect([400, 404]).toContain((await setTopic(image)).statusCode)
      expect(fs.readFileSync(path.join(repo, 'workbench/research.yaml'), 'utf8')).toBe(before)
    }
    const outside = path.join(tmp, 'outside.svg')
    fs.writeFileSync(outside, SVG)
    fs.symlinkSync(outside, path.join(library, 'figures/outside.svg'))
    expect((await setProject('figure:library/outside.svg')).statusCode).toBe(403)
    expect((await setTopic('figure:library/outside.svg')).statusCode).toBe(403)
  })

  it('주제 만들기·통째 저장에도 그림의 프로젝트 범위를 확인한다', async () => {
    const badImage = 'figure:other-card-project/private.svg'
    const before = fs.readFileSync(path.join(repo, 'workbench/research.yaml'), 'utf8')
    expect((await app.inject({ method: 'POST', url: `${R}/topics`, payload: {
      title: 'Bad image', preview: { image: badImage }, baseHash: await hash(),
    } })).statusCode).toBe(400)
    expect((await app.inject({ method: 'PUT', url: `${R}/topics`, payload: {
      topics: [{ id: 'card-image', title: 'Card image', preview: { image: badImage } }], baseHash: await hash(),
    } })).statusCode).toBe(400)
    expect(fs.readFileSync(path.join(repo, 'workbench/research.yaml'), 'utf8')).toBe(before)
  })

  it('그림을 올려도 저장 전에는 카드가 바뀌지 않고, 파일과 바깥 수정을 덮어쓰지 않는다', async () => {
    const before = fs.readFileSync(path.join(repo, 'workbench/research.yaml'), 'utf8')
    expect((await upload(RID, 'draft.svg')).statusCode).toBe(200)
    expect(fs.readFileSync(path.join(repo, 'workbench/research.yaml'), 'utf8')).toBe(before)
    expect((await upload(RID, 'Draft.svg', 'replacement')).statusCode).toBe(409)
    expect(fs.readFileSync(path.join(repo, 'workbench/figures/draft.svg'), 'utf8')).toBe(SVG)
    const baseHash = await hash()
    const external = `${before}# 다른 편집기에서 고침\n`
    fs.writeFileSync(path.join(repo, 'workbench/research.yaml'), external)
    expect((await setProject(`figure:${RID}/draft.svg`, baseHash)).statusCode).toBe(409)
    expect((await setTopic(`figure:${RID}/draft.svg`, baseHash)).statusCode).toBe(409)
    expect(fs.readFileSync(path.join(repo, 'workbench/research.yaml'), 'utf8')).toBe(external)
  })

  it('예전 저장소 기준 경로와 그림 빼기를 그대로 지원한다', async () => {
    const image = 'workbench/figures/local.svg'
    expect((await setProject(image)).statusCode).toBe(200)
    expect((await setTopic(image)).statusCode).toBe(200)
    for (const url of [`${R}/image`, `${R}/topics/card-image/image`]) {
      const result = await app.inject({ method: 'GET', url })
      expect(result.statusCode).toBe(200)
      expect(result.body).toBe(SVG)
    }
    expect((await setProject('')).statusCode).toBe(200)
    expect((await setTopic(null)).statusCode).toBe(200)
    expect(saved().image).toBeUndefined()
    expect(saved().topics.find((t: { id: string }) => t.id === 'card-image').preview).toBeUndefined()
    expect(fs.existsSync(path.join(repo, image))).toBe(true)
  })
})

describe('research.yaml 모양 지키기', () => {
  it('프로젝트 정보를 저장해도 다른 칸의 흐름 목록 [a]와 긴 줄은 그대로다', async () => {
    const file = path.join(repo, 'workbench/research.yaml')
    const long = 'x'.repeat(140)
    const before = fs.readFileSync(file, 'utf8') + `extra_flow: [a, b]\nextra_long: ${long}\n`
    fs.writeFileSync(file, before)
    const r = await app.inject({ method: 'PATCH', url: `${R}/info`, payload: { started: '2026-10-01', baseHash: await hash() } })
    expect(r.statusCode).toBe(200)
    const after = fs.readFileSync(file, 'utf8')
    expect(after).toContain('extra_flow: [a, b]\n')
    expect(after).toContain(`extra_long: ${long}\n`)
  })
})
