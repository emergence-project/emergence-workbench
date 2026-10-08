import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { hashOf } from './fsutil.js'
import { app, R, repo, tmp, useSampleApp } from './testkit.js'

useSampleApp()

const blockPath = (id: string, extension = 'md') => path.join(repo, 'workbench/blocks', `${id}.${extension}`)
const remove = (id: string, baseHash?: unknown) => app.inject({
  method: 'DELETE', url: `${R}/blocks/${id}`, payload: baseHash === undefined ? {} : { baseHash },
})
const read = async (id: string) => (await app.inject({ method: 'GET', url: `${R}/blocks/${id}` })).json()

describe('보조 노트 지우기', () => {
  it.each(['md', 'tex'])('%s 원문 파일만 지우고 기록·연결·컴파일 결과를 보존한다', async (extension) => {
    const id = `delete-${extension}`
    const file = blockPath(id, extension)
    const body = extension === 'md'
      ? `---\nid: ${id}\ntitle: 지울 노트\nstatus: in-progress\n---\n\n본문.\r\n`
      : `% ---\n% id: ${id}\n% title: 지울 노트\n% status: in-progress\n% ---\n\nBody.\r\n`
    fs.writeFileSync(file, body)
    const comment = path.join(repo, 'workbench/comments', `block-${id}.md`)
    const linked = blockPath(`linked-${extension}`)
    const result = path.join(repo, 'workbench/.build', id, 'block.pdf')
    fs.mkdirSync(path.dirname(comment), { recursive: true })
    fs.mkdirSync(path.dirname(result), { recursive: true })
    fs.writeFileSync(comment, `# 기록\r\n\n[[${id}]]의 메모와 하이라이트\r\n`)
    fs.writeFileSync(linked, `---\nid: linked-${extension}\nparent: ${id}\nalternatives: [${id}]\n---\n\n[[${id}]]\n`)
    fs.writeFileSync(result, '%PDF-1.4\n')
    const kept = [comment, linked, result, path.join(repo, 'workbench/research.yaml')]
    const before = kept.map((p) => fs.readFileSync(p))

    const response = await remove(id, (await read(id)).hash)

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ ok: true })
    expect(fs.existsSync(file)).toBe(false)
    expect((await app.inject({ method: 'GET', url: `${R}/blocks/${id}` })).statusCode).toBe(404)
    kept.forEach((p, i) => expect(fs.readFileSync(p)).toEqual(before[i]))
  })

  it('해시가 없거나 잘못된 요청으로는 파일을 지우지 않는다', async () => {
    const id = 'delete-needs-hash'
    const file = blockPath(id)
    fs.writeFileSync(file, '---\nid: delete-needs-hash\n---\n\n원문.\r\n')
    const before = fs.readFileSync(file)
    for (const value of [undefined, '', null, 123]) {
      expect((await remove(id, value)).statusCode).toBe(400)
      expect(fs.readFileSync(file)).toEqual(before)
    }
  })

  it('읽은 뒤 외부에서 바뀌면 현재 해시와 409를 반환하고 바뀐 바이트를 보존한다', async () => {
    const id = 'delete-conflict'
    const file = blockPath(id)
    fs.writeFileSync(file, '---\nid: delete-conflict\n---\n\n읽은 글.\n')
    const { hash } = await read(id)
    fs.appendFileSync(file, '다른 에이전트가 쓴 글.\r\n')
    const before = fs.readFileSync(file)

    const response = await remove(id, hash)

    expect(response.statusCode).toBe(409)
    expect(response.json().currentHash).toBe(hashOf(before.toString('utf8')))
    expect(fs.readFileSync(file)).toEqual(before)
  })

  it('없는 노트와 경로 이탈을 거절한다', async () => {
    expect((await remove('delete-missing', 'hash')).statusCode).toBe(404)
    expect((await remove('..%2Fpreamble', 'hash')).statusCode).toBe(400)
  })

  it('밖을 가리키는 링크는 거절하고 내부 링크는 링크만 지운다', async () => {
    const outside = path.join(tmp, 'delete-outside.md')
    fs.writeFileSync(outside, 'workbench 밖 원문\r\n')
    const outsideBytes = fs.readFileSync(outside)
    const escape = blockPath('delete-escape')
    fs.symlinkSync(outside, escape)
    expect((await remove('delete-escape', hashOf(outsideBytes.toString('utf8')))).statusCode).toBe(403)
    expect(fs.lstatSync(escape).isSymbolicLink()).toBe(true)
    expect(fs.readFileSync(outside)).toEqual(outsideBytes)

    const inside = path.join(repo, 'workbench/preamble.tex')
    const insideBytes = fs.readFileSync(inside)
    const alias = blockPath('delete-alias', 'tex')
    fs.symlinkSync(inside, alias)
    expect((await remove('delete-alias', (await read('delete-alias')).hash)).statusCode).toBe(200)
    expect(fs.existsSync(alias)).toBe(false)
    expect(fs.readFileSync(inside)).toEqual(insideBytes)
  })

  it('같은 id의 두 형식이 있으면 둘 다 보존한다', async () => {
    const id = 'delete-two-formats'
    const md = blockPath(id)
    const tex = blockPath(id, 'tex')
    fs.writeFileSync(md, 'Markdown 원문\r\n')
    fs.writeFileSync(tex, 'LaTeX source\r\n')
    const before = [fs.readFileSync(md), fs.readFileSync(tex)]

    expect((await remove(id, (await read(id)).hash)).statusCode).toBe(409)
    expect(fs.readFileSync(md)).toEqual(before[0])
    expect(fs.readFileSync(tex)).toEqual(before[1])
  })

  it('blocks 폴더가 다른 내부 폴더를 가리키면 원문을 보존한다', async () => {
    const blocks = path.join(repo, 'workbench/blocks')
    const moved = path.join(repo, 'workbench/moved-blocks')
    const id = 'delete-linked-directory'
    fs.writeFileSync(blockPath(id), '보존할 원문\r\n')
    const { hash } = await read(id)
    fs.renameSync(blocks, moved)
    fs.symlinkSync(moved, blocks, 'dir')
    try {
      expect((await remove(id, hash)).statusCode).toBe(403)
      expect(fs.readFileSync(path.join(moved, `${id}.md`), 'utf8')).toBe('보존할 원문\r\n')
    } finally {
      fs.unlinkSync(blocks)
      fs.renameSync(moved, blocks)
    }
  })
})
