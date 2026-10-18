import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { LIBRARY_RID } from '@rw/core'
import { buildApp } from './app.js'
import { applyMemoMigration, planMemoMigration } from './conceptMemoMigrate.js'
import { readComments } from './comments.js'

// 지식 라이브러리도 연구 저장소와 같은 기록 장치로 (10/18 결정): 개념노트 기록은 <라이브러리>/workbench/comments/concept-<id>.md
describe('지식 라이브러리 기록', () => {
  let tmp: string
  let lib: string
  let app: ReturnType<typeof buildApp>
  const url = (rest = '') => `/api/researches/${LIBRARY_RID}/comments${rest}`

  beforeAll(() => {
    tmp = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'rw-librecords-'))
    lib = path.join(tmp, 'library')
    fs.mkdirSync(path.join(lib, 'concepts'), { recursive: true })
    fs.writeFileSync(path.join(lib, 'concepts', 'planar-graph.md'), '---\ntitle: Planar graph\n---\n\n## Definition\n\nA graph is planar when it can be drawn without crossings.\n')
    fs.writeFileSync(path.join(lib, 'concepts', 'planar-graph.memo.md'), '## 할 일\n\n- [ ] add Kuratowski\n- [x] cite Euler\n\n## To Develop\n\n- dual graph\n- coloring\n')
    fs.mkdirSync(path.join(tmp, 'config'), { recursive: true })
    fs.writeFileSync(path.join(tmp, 'config', 'config.yaml'), `library: ${lib}\nresearches: []\n`)
    app = buildApp({ configDir: path.join(tmp, 'config') })
  })
  afterAll(async () => {
    await app.close()
    fs.rmSync(tmp, { recursive: true, force: true })
  })

  it('기록 API의 rid 자리에 _library를 넣으면 라이브러리 workbench/comments/에 쓰고 읽는다', async () => {
    const add = await app.inject({ method: 'POST', url: url('/concept-planar-graph'), payload: { kind: '할 일', title: '개념노트 Planar graph', source: 'concepts/planar-graph.md', text: 'prove the 5-color theorem', quote: 'without crossings' } })
    expect(add.statusCode).toBe(200)
    expect(fs.existsSync(path.join(lib, 'workbench', 'comments', 'concept-planar-graph.md'))).toBe(true)
    const file = (await app.inject({ method: 'GET', url: url('/concept-planar-graph') })).json()
    expect(file.comments).toHaveLength(1)
    expect(file.comments[0]).toMatchObject({ kind: '할 일', quote: 'without crossings', state: '대기' })
    // 인용은 개념노트 본문에서 다시 찾는다 (머리말을 센 파일 줄 번호)
    expect(file.comments[0].line).toBe(7)
    const records = (await app.inject({ method: 'GET', url: `/api/researches/${LIBRARY_RID}/records` })).json()
    // 라이브러리에는 프로젝트가 없어 빈 "project" 묶음을 더하지 않는다
    expect(records.files.map((f: { target: string }) => f.target)).toEqual(['concept-planar-graph'])
  })

  it('연구가 아닌 다른 API에 _library를 넣으면 등록되지 않은 연구로 거절한다', async () => {
    expect((await app.inject({ method: 'GET', url: `/api/researches/${LIBRARY_RID}/notes` })).statusCode).toBe(404)
  })

  it('메모 파일을 카드로 옮긴다: 할 일 · 완료 · 제목 아래 절(제목은 굵게, 제목만 있는 절은 버림), 원래 파일은 휴지통으로', () => {
    const plans = planMemoMigration(lib)
    expect(plans).toHaveLength(1)
    expect(plans[0]!.cards.map((c) => [c.input.kind, c.done, c.input.text])).toEqual([
      ['할 일', false, 'add Kuratowski'],
      ['할 일', true, 'cite Euler'],
      ['메모', false, '**To Develop**\n\n- dual graph\n- coloring'],
    ])
    expect(applyMemoMigration(lib, plans)).toEqual({ files: 1, cards: 3 })
    const file = readComments(path.join(lib, 'workbench'), 'concept-planar-graph')
    expect(file.comments.map((c) => [c.kind, c.state])).toEqual([['할 일', '대기'], ['할 일', '대기'], ['할 일', '끝냄'], ['메모', null]])
    expect(fs.existsSync(path.join(lib, 'concepts', 'planar-graph.memo.md'))).toBe(false)
    expect(fs.existsSync(path.join(lib, 'workbench', 'log'))).toBe(false)
    expect(fs.existsSync(path.join(lib, 'workbench', '.trash', 'concept-memos', 'planar-graph.memo.md'))).toBe(true)
    expect(planMemoMigration(lib)).toEqual([])
  })
})
