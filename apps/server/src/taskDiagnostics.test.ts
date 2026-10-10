import fs from 'node:fs'
import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { generateStatus } from './agentStatus.js'
import { parseTask } from './tasks.js'
import { app, R, repo, useSampleApp } from './testkit.js'
import { Workbench } from './workbench.js'

useSampleApp()
const dir = () => path.join(repo, 'workbench/tasks')
const write = (name: string, content: string) => fs.writeFileSync(path.join(dir(), name), content)
const task = (extra = '') => `---\ntitle: 점검\ntask: 대조\nstate: working\n${extra}---\n## 근거\n본문 바이트\n`
beforeEach(() => { fs.rmSync(dir(), { recursive: true, force: true }); fs.mkdirSync(dir(), { recursive: true }) })

describe('작업 파일 읽기 진단', () => {
  it('백업 동기화가 남긴 사본은 이름 오류가 아니라 사본이라고 알린다', async () => {
    write('2026-10-07-good.md', task())
    write('2026-10-07-good.github-20261010.md', task())
    const response = (await app.inject({ method: 'GET', url: `${R}/tasks` })).json()
    expect(response.tasks.map((t: { id: string }) => t.id)).toEqual(['2026-10-07-good'])
    expect(response.diagnostics).toEqual([expect.objectContaining({ file: 'workbench/tasks/2026-10-07-good.github-20261010.md', code: 'filename', message: expect.stringContaining('사본') })])
  })
  it('깨진 YAML·머리말 누락·상태 오타·파일 이름을 누락하지 않고 파일과 줄로 알린다', async () => {
    const files = {
      '2026-10-07-yaml.md': task('conclusion: 결론: 대조 통과\n'),
      '2026-10-07-plain.md': '# 그냥 본문\n',
      '2026-10-07-state.md': task().replace('state: working', 'state: results'),
      'wrong-name.md': task(),
      '2026-10-07-good.md': task(),
    }
    for (const [name, content] of Object.entries(files)) write(name, content)
    const response = (await app.inject({ method: 'GET', url: `${R}/tasks` })).json()
    expect(response.tasks.map((t: { id: string }) => t.id)).toEqual(['2026-10-07-good'])
    expect(response.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ file: 'workbench/tasks/2026-10-07-yaml.md', code: 'yaml', line: 5 }),
      expect.objectContaining({ file: 'workbench/tasks/2026-10-07-plain.md', code: 'frontmatter', line: 1 }),
      expect.objectContaining({ file: 'workbench/tasks/2026-10-07-state.md', code: 'schema', line: 4, message: expect.stringContaining('results') }),
      expect.objectContaining({ file: 'workbench/tasks/wrong-name.md', code: 'filename', line: 1 }),
    ]))
    expect(response.diagnostics).toHaveLength(4)
    expect(response.diagnostics.find((d: { code: string }) => d.code === 'yaml').message).not.toMatch(/at line \d+/)
    const status = generateStatus(new Workbench(path.join(repo, 'workbench')))
    expect(status).toContain('## 작업 파일 오류 4')
    for (const name of Object.keys(files).filter((n) => !n.includes('good'))) expect(status).toContain(`workbench/tasks/${name}`)
    for (const [name, content] of Object.entries(files)) expect(fs.readFileSync(path.join(dir(), name), 'utf8')).toBe(content)
  })

  it('틀린 상태를 진행으로 바꾸지 않고 조회·판단 요청도 실패한다', async () => {
    const content = task().replace('state: working', 'state: results')
    expect(parseTask('2026-10-07-state', 'workbench/tasks/2026-10-07-state.md', content)).toBeNull()
    write('2026-10-07-state.md', content)
    expect((await app.inject({ method: 'GET', url: `${R}/tasks/2026-10-07-state` })).statusCode).toBe(422)
    expect((await app.inject({ method: 'POST', url: `${R}/tasks/2026-10-07-state/judge`, payload: { verdict: 'approve', baseHash: 'old' } })).statusCode).toBe(422)
    expect(fs.readFileSync(path.join(dir(), '2026-10-07-state.md'), 'utf8')).toBe(content)
  })

  it('읽기 실패 하나 때문에 정상 작업 전체가 실패하지 않는다', async () => {
    write('2026-10-07-unreadable.md', task())
    write('2026-10-07-good.md', task())
    const original = fs.readFileSync
    const spy = vi.spyOn(fs, 'readFileSync').mockImplementation(((file: Parameters<typeof original>[0], ...args: unknown[]) => {
      if (String(file).endsWith('2026-10-07-unreadable.md')) throw Object.assign(new Error('permission denied'), { code: 'EACCES' })
      return Reflect.apply(original, fs, [file, ...args])
    }) as typeof original)
    try {
      const response = await app.inject({ method: 'GET', url: `${R}/tasks` })
      expect(response.statusCode).toBe(200)
      expect(response.json().tasks).toHaveLength(1)
      expect(response.json().diagnostics).toEqual([expect.objectContaining({ file: 'workbench/tasks/2026-10-07-unreadable.md', code: 'read' })])
    } finally { spy.mockRestore() }
  })

  it.each([
    ['state', 'state: { toString: nope }', 'state: working'],
    ['end-check', 'end-check: { toString: nope }', ''],
    ['judged', 'judged: [{ verdict: { toString: nope } }]', ''],
  ])('%s의 객체 값도 진단 중 예외 없이 schema·422로 알린다', async (key, invalid, original) => {
    const content = original ? task().replace(original, invalid) : task(`${invalid}\n`)
    write(`2026-10-07-object-${key}.md`, content)
    const url = `${R}/tasks/2026-10-07-object-${key}`
    const get = await app.inject({ method: 'GET', url })
    expect(get.statusCode).toBe(422)
    expect(get.json().error).toContain(`${key}:`)
    expect((await app.inject({ method: 'POST', url: `${url}/judge`, payload: { verdict: 'approve', baseHash: 'old' } })).statusCode).toBe(422)
    const scan = (await app.inject({ method: 'GET', url: `${R}/tasks` })).json()
    expect(scan.diagnostics).toEqual([expect.objectContaining({ code: 'schema', file: `workbench/tasks/2026-10-07-object-${key}.md` })])
    expect(() => parseTask(`2026-10-07-object-${key}`, `workbench/tasks/2026-10-07-object-${key}.md`, content)).not.toThrow()
    expect(fs.readFileSync(path.join(dir(), `2026-10-07-object-${key}.md`), 'utf8')).toBe(content)
  })

  it('YAML 변환의 alias 한도 오류도 조회·판단에서 422로 알린다', async () => {
    const aliases = `a: &a [x, x, x, x, x, x, x, x, x, x]\nb: &b [*a, *a, *a, *a, *a, *a, *a, *a, *a, *a]\nc: [*b, *b, *b, *b, *b, *b, *b, *b, *b, *b]\n`
    const content = task(aliases)
    write('2026-10-07-alias.md', content)
    const get = await app.inject({ method: 'GET', url: `${R}/tasks/2026-10-07-alias` })
    expect(get.statusCode).toBe(422)
    expect(get.json().error).toContain('YAML 오류')
    expect((await app.inject({ method: 'POST', url: `${R}/tasks/2026-10-07-alias/judge`, payload: { verdict: 'approve', baseHash: 'old' } })).statusCode).toBe(422)
    const scan = (await app.inject({ method: 'GET', url: `${R}/tasks` })).json()
    expect(scan.diagnostics).toEqual([expect.objectContaining({ code: 'yaml', file: 'workbench/tasks/2026-10-07-alias.md' })])
    expect(() => parseTask('2026-10-07-alias', 'workbench/tasks/2026-10-07-alias.md', content)).not.toThrow()
    expect(fs.readFileSync(path.join(dir(), '2026-10-07-alias.md'), 'utf8')).toBe(content)
  })

  it('종결 조건 제안·질문·다음 지시의 깨진 형식을 조용히 버리지 않는다', async () => {
    write('2026-10-07-proposal.md', task('proposal: { end-condition: [세 크기, 123] }\n').replace('state: working', 'state: proposed'))
    write('2026-10-07-ask.md', task('ask: [{ options: [예, 아니요] }]\n'))
    write('2026-10-07-next.md', task('next: [{ task: 대조, end-condition: [조건] }]\n'))
    const response = (await app.inject({ method: 'GET', url: `${R}/tasks` })).json()
    expect(response.tasks).toEqual([])
    expect(response.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ file: 'workbench/tasks/2026-10-07-proposal.md', message: expect.stringContaining('proposal') }),
      expect.objectContaining({ file: 'workbench/tasks/2026-10-07-ask.md', message: expect.stringContaining('ask') }),
      expect.objectContaining({ file: 'workbench/tasks/2026-10-07-next.md', message: expect.stringContaining('next') }),
    ]))
  })
})
