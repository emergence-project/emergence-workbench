// 기록 저절로 올리기 (routes/feedback.ts)와 pathsync의 adopt · merge (10/15)
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { publishPaths } from './pathsync.js'
import { buildApp } from './app.js'

let tmp: string
beforeAll(() => { tmp = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'rw-recpub-')) })
afterAll(() => { fs.rmSync(tmp, { recursive: true, force: true }) })

const g = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
const write = (dir: string, file: string, text: string) => { fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true }); fs.writeFileSync(path.join(dir, file), text) }
const read = (dir: string, file: string) => fs.readFileSync(path.join(dir, file), 'utf8')
const ahead = (dir: string) => Number(g(dir, 'rev-list', '--count', '@{upstream}..HEAD'))
async function until(check: () => boolean | Promise<boolean>, ms = 10_000) {
  const end = Date.now() + ms
  while (!await check()) {
    if (Date.now() > end) throw new Error('timed out')
    await new Promise((r) => setTimeout(r, 25))
  }
}

const RECORDS = '# a\n\n## q1\nquestion one\n\n## q2\nquestion two\n\n## q3\nquestion three\n'
function setup(name: string) {
  const remote = path.join(tmp, `${name}.git`)
  const mac = path.join(tmp, `${name}-mac`)
  const cloud = path.join(tmp, `${name}-cloud`)
  execFileSync('git', ['init', '-q', '--bare', '-b', 'main', remote])
  for (const d of [mac, cloud]) {
    execFileSync('git', ['clone', '-q', remote, d], { stdio: 'ignore' })
    g(d, 'config', 'user.name', 't'); g(d, 'config', 'user.email', 't@t')
  }
  write(mac, 'manuscript.tex', 'v1\n'); write(mac, 'other.txt', 'o1\n'); write(mac, 'workbench/comments/a.md', RECORDS)
  write(mac, '.gitignore', 'ignored.txt\n')
  g(mac, 'add', '.'); g(mac, 'commit', '-qm', 'init'); g(mac, 'push', '-q', '-u', 'origin', 'main')
  g(cloud, 'pull', '-q')
  return { remote, mac, cloud }
}
const PATHS = ['workbench/comments']
const RECORD_OPTS = { message: 'Add comments', adopt: true, merge: true }

describe('기록 올리기: GitHub 위에 올린 뒤 이 컴퓨터의 브랜치를 옮기기 (adopt)', () => {
  it('GitHub가 다른 파일로 앞서 있으면 그 위에 올리고 HEAD를 올린 커밋으로 옮긴다. 고치는 중인 파일은 그대로', async () => {
    const { remote, mac, cloud } = setup('adopt')
    write(cloud, 'manuscript.tex', 'cloud\n'); g(cloud, 'commit', '-qam', 'cloud edit'); g(cloud, 'push', '-q')
    write(mac, 'other.txt', 'editing\n') // 커밋하지 않은 작업
    write(mac, 'workbench/comments/b.md', '# b\n')
    const r = await publishPaths(mac, PATHS, RECORD_OPTS)
    expect(r).toMatchObject({ pushed: true, adopted: true, files: ['workbench/comments/b.md'] })
    expect(g(remote, 'log', '--format=%s', 'main').split('\n')).toEqual(['Add comments', 'cloud edit', 'init'])
    g(mac, 'fetch', '-q')
    expect(g(mac, 'rev-parse', 'HEAD')).toBe(g(remote, 'rev-parse', 'main'))
    expect(ahead(mac)).toBe(0)
    expect(read(mac, 'other.txt')).toBe('editing\n')
    expect(read(mac, 'manuscript.tex')).toBe('cloud\n') // GitHub의 새 내용이 함께 들어온다 (받기와 같다)
    expect(g(mac, 'status', '--porcelain')).toBe('M other.txt')
  })

  it('GitHub에서 바뀌는 파일을 이 컴퓨터에서 고치는 중이거나 무시한 파일과 겹치면 옮기지 않는다', async () => {
    const { remote, mac, cloud } = setup('keep')
    write(cloud, 'manuscript.tex', 'cloud\n'); g(cloud, 'commit', '-qam', 'cloud edit'); g(cloud, 'push', '-q')
    write(mac, 'manuscript.tex', 'editing\n')
    write(mac, 'workbench/comments/b.md', '# b\n')
    const head = g(mac, 'rev-parse', 'HEAD')
    expect(await publishPaths(mac, PATHS, RECORD_OPTS)).toMatchObject({ pushed: true, adopted: false })
    expect(g(remote, 'show', 'main:workbench/comments/b.md')).toBe('# b')
    expect(g(mac, 'rev-parse', 'HEAD~1')).toBe(head)
    expect(read(mac, 'manuscript.tex')).toBe('editing\n')

    const other = setup('ignored')
    write(other.cloud, 'ignored.txt', 'cloud\n'); g(other.cloud, 'add', '-f', 'ignored.txt'); g(other.cloud, 'commit', '-qm', 'add ignored'); g(other.cloud, 'push', '-q')
    write(other.mac, 'ignored.txt', 'mine\n')
    write(other.mac, 'workbench/comments/b.md', '# b\n')
    expect(await publishPaths(other.mac, PATHS, RECORD_OPTS)).toMatchObject({ pushed: true, adopted: false })
    expect(read(other.mac, 'ignored.txt')).toBe('mine\n')
  })

  it('이 컴퓨터에 경로 밖 커밋이 있으면 올리기만 하고 옮기지 않는다', async () => {
    const { mac } = setup('outside')
    write(mac, 'other.txt', 'committed\n'); g(mac, 'commit', '-qam', 'local work')
    write(mac, 'workbench/comments/b.md', '# b\n')
    expect(await publishPaths(mac, PATHS, RECORD_OPTS)).toMatchObject({ pushed: true, adopted: false })
    expect(g(mac, 'log', '--format=%s', '-n', '2').split('\n')).toEqual(['Add comments', 'local work'])
  })
})

describe('기록 올리기: GitHub에서도 바뀐 기록 파일 합치기 (merge)', () => {
  it('클라우드의 답과 이 컴퓨터의 새 기록이 깨끗이 합쳐지면 합쳐 올리고 HEAD를 옮긴다', async () => {
    const { remote, mac, cloud } = setup('merge')
    write(cloud, 'workbench/comments/a.md', RECORDS.replace('question one\n', 'question one\n- answer (claude)\n'))
    g(cloud, 'commit', '-qam', 'cloud answer'); g(cloud, 'push', '-q')
    write(mac, 'workbench/comments/a.md', `${RECORDS}\n## q4\nnew record\n`)
    const r = await publishPaths(mac, PATHS, RECORD_OPTS)
    expect(r).toMatchObject({ pushed: true, adopted: true, merged: ['workbench/comments/a.md'] })
    const merged = `${RECORDS.replace('question one\n', 'question one\n- answer (claude)\n')}\n## q4\nnew record\n`
    expect(read(mac, 'workbench/comments/a.md')).toBe(merged)
    expect(`${g(remote, 'show', 'main:workbench/comments/a.md')}\n`).toBe(merged)
    g(mac, 'fetch', '-q')
    expect(g(mac, 'rev-parse', 'HEAD')).toBe(g(remote, 'rev-parse', 'main'))
    expect(g(mac, 'status', '--porcelain')).toBe('')
  })

  it('부딪히면 아무것도 바꾸지 않고 멈춘다. merge를 켜지 않으면(피드백) 합칠 수 있어도 지금처럼 멈춘다', async () => {
    const { remote, mac, cloud } = setup('clash')
    write(cloud, 'workbench/comments/a.md', RECORDS.replace('question two', 'cloud two')); g(cloud, 'commit', '-qam', 'cloud'); g(cloud, 'push', '-q')
    const mine = RECORDS.replace('question two', 'mac two')
    write(mac, 'workbench/comments/a.md', mine)
    await expect(publishPaths(mac, PATHS, RECORD_OPTS)).rejects.toThrow(/같은 파일이 바뀌어.*a\.md/)
    expect(g(remote, 'log', '--format=%s', '-n', '1', 'main')).toBe('cloud')
    expect(read(mac, 'workbench/comments/a.md')).toBe(mine)
    expect(g(mac, 'log', '--format=%s', '-n', '1')).toBe('Add comments')

    const plain = setup('nomerge')
    write(plain.cloud, 'workbench/comments/a.md', RECORDS.replace('question one\n', 'question one\n- answer\n')); g(plain.cloud, 'commit', '-qam', 'cloud'); g(plain.cloud, 'push', '-q')
    write(plain.mac, 'workbench/comments/a.md', `${RECORDS}more\n`)
    const head = g(plain.mac, 'rev-parse', 'HEAD')
    await expect(publishPaths(plain.mac, PATHS, { message: 'Add app feedback' })).rejects.toThrow(/같은 파일이 바뀌어/)
    expect(g(plain.mac, 'rev-parse', 'HEAD~1')).toBe(head)
  })
})

describe('기록을 쓰면 저절로 올린다 (recordsAutoPublishMs)', () => {
  it('기록을 더하면 잠시 뒤 GitHub에 올라가고, 실패하면 마지막 결과에 남았다가 다시 올리면 풀린다', async () => {
    const { remote, mac, cloud } = setup('auto')
    const app = buildApp({ configDir: path.join(tmp, 'auto-config'), recordsAutoPublishMs: 30 })
    try {
      const id = (await app.inject({ method: 'POST', url: '/api/researches', payload: { path: mac, createWorkbench: true } })).json().id
      expect((await app.inject({ method: 'GET', url: `/api/researches/${id}/records/publish` })).json()).toEqual({ autoPublish: true, last: null })
      const added = await app.inject({ method: 'POST', url: `/api/researches/${id}/comments/project`, payload: { kind: '메모', title: 'P', text: '맥에서 남긴 메모' } })
      expect(added.statusCode).toBe(200)
      await until(() => { try { return g(remote, 'log', '--format=%s', '-n', '1', 'main') === 'Add comments from the research workspace app' } catch { return false } })
      expect(g(remote, 'show', 'main:workbench/comments/project.md')).toContain('맥에서 남긴 메모')
      const last = async () => (await app.inject({ method: 'GET', url: `/api/researches/${id}/records/publish` })).json().last as { error: string | null } | null
      await until(async () => (await last()) !== null)
      expect(await last()).toMatchObject({ error: null })
      expect(ahead(mac)).toBe(0)

      // 부딪히는 변경: 실패가 마지막 결과에 남는다
      g(cloud, 'pull', '-q')
      write(cloud, 'workbench/comments/a.md', RECORDS.replace('question two', 'cloud two')); g(cloud, 'commit', '-qam', 'cloud'); g(cloud, 'push', '-q')
      write(mac, 'workbench/comments/a.md', RECORDS.replace('question two', 'mac two'))
      expect((await app.inject({ method: 'POST', url: `/api/researches/${id}/comments/project`, payload: { kind: '메모', title: 'P', text: '둘째 메모' } })).statusCode).toBe(200)
      const failed = async () => (await last())?.error ?? null
      await until(async () => !!(await failed()))
      expect(await failed()).toMatch(/같은 파일이 바뀌어/)
      expect(g(remote, 'log', '--format=%s', '-n', '1', 'main')).toBe('cloud')

      // 맥에서 손으로 합친 뒤 다시 올리기 버튼: 마지막 결과가 풀린다
      g(mac, 'pull', '-q', '--no-rebase', '-X', 'theirs', '--no-edit')
      expect((await app.inject({ method: 'POST', url: `/api/researches/${id}/records/publish` })).statusCode).toBe(200)
      expect(await failed()).toBeNull()
    } finally { await app.close() }
  })

  it('예제 모드와 옵션이 없을 때는 저절로 올리지 않는다', async () => {
    const { remote, mac } = setup('off')
    const app = buildApp({ configDir: path.join(tmp, 'off-config') })
    try {
      const id = (await app.inject({ method: 'POST', url: '/api/researches', payload: { path: mac, createWorkbench: true } })).json().id
      expect((await app.inject({ method: 'GET', url: `/api/researches/${id}/records/publish` })).json()).toEqual({ autoPublish: false, last: null })
      await app.inject({ method: 'POST', url: `/api/researches/${id}/comments/project`, payload: { kind: '메모', title: 'P', text: '메모' } })
      // 저절로 올리기가 꺼져 있으면 올리기를 예약하지도 시도하지도 않는다: 기다리지 않고 상태로 본다
      expect((await app.inject({ method: 'GET', url: `/api/researches/${id}/records/publish` })).json()).toEqual({ autoPublish: false, last: null })
      expect(g(remote, 'log', '--format=%s', '-n', '1', 'main')).toBe('init')
    } finally { await app.close() }
  })
})
