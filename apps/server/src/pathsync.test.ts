import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { pendingPaths, publishPaths } from './pathsync.js'
import { buildApp } from './app.js'

let tmp: string
beforeAll(() => { tmp = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'rw-pathsync-')) })
afterAll(() => { fs.rmSync(tmp, { recursive: true, force: true }) })

const g = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
const write = (dir: string, file: string, text: string) => { fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true }); fs.writeFileSync(path.join(dir, file), text) }

function setup(name: string) {
  const remote = path.join(tmp, `${name}.git`)
  const mac = path.join(tmp, `${name}-mac`)
  const cloud = path.join(tmp, `${name}-cloud`)
  execFileSync('git', ['init', '-q', '--bare', '-b', 'main', remote])
  for (const d of [mac, cloud]) {
    execFileSync('git', ['clone', '-q', remote, d], { stdio: 'ignore' })
    g(d, 'config', 'user.name', 't'); g(d, 'config', 'user.email', 't@t')
  }
  write(mac, 'manuscript.tex', 'v1\n'); write(mac, 'workbench/comments/a.md', '# a\n')
  g(mac, 'add', '.'); g(mac, 'commit', '-qm', 'init'); g(mac, 'push', '-q', '-u', 'origin', 'main')
  g(cloud, 'pull', '-q')
  return { remote, mac, cloud }
}
const PATHS = ['workbench/comments']
const opts = { message: 'Add comments' }

describe('정한 경로만 GitHub에 올리기', () => {
  it('앞선 원격 위에 경로 안 파일만 얹어 올리고, 이 컴퓨터의 작업 트리·다른 커밋은 건드리지 않는다', async () => {
    const { remote, mac, cloud } = setup('ontop')
    // 클라우드가 코드를 고쳐 올렸다
    write(cloud, 'manuscript.tex', 'cloud\n'); g(cloud, 'commit', '-qam', 'cloud edit'); g(cloud, 'push', '-q')
    // 맥: 원고를 커밋해 두었고(올리면 안 됨), 원고를 고치는 중이며, 코멘트를 남겼다
    write(mac, 'notes.md', 'local only\n'); g(mac, 'add', 'notes.md'); g(mac, 'commit', '-qm', 'local note')
    write(mac, 'manuscript.tex', 'editing\n')
    write(mac, 'workbench/comments/a.md', '# a\n- 코멘트\n'); write(mac, 'workbench/comments/b.md', '# b\n')
    expect(await pendingPaths(mac, PATHS)).toEqual(['workbench/comments/a.md', 'workbench/comments/b.md'])

    const headBefore = g(mac, 'rev-parse', 'HEAD')
    const r = await publishPaths(mac, PATHS, opts)
    expect(r).toMatchObject({ pushed: true, files: ['workbench/comments/a.md', 'workbench/comments/b.md'] })
    expect(g(remote, 'log', '--format=%s', 'main').split('\n')).toEqual(['Add comments', 'cloud edit', 'init'])
    expect(g(remote, 'show', 'main:manuscript.tex')).toBe('cloud')
    expect(() => g(remote, 'show', 'main:notes.md')).toThrow()
    expect(g(remote, 'show', 'main:workbench/comments/a.md')).toContain('코멘트')
    // 이 컴퓨터: 코멘트 커밋만 더해졌고 작업 중인 원고는 그대로
    expect(g(mac, 'rev-parse', 'HEAD~1')).toBe(headBefore)
    expect(fs.readFileSync(path.join(mac, 'manuscript.tex'), 'utf8')).toBe('editing\n')
    expect(await pendingPaths(mac, PATHS)).toEqual([])

    // 이어서 또 남겨도 (원격에 자기가 올린 판이 있으니) 충돌로 보지 않는다
    fs.appendFileSync(path.join(mac, 'workbench/comments/a.md'), '- 둘째\n')
    expect(await publishPaths(mac, PATHS, opts)).toMatchObject({ pushed: true, files: ['workbench/comments/a.md'] })
    expect(g(remote, 'show', 'main:workbench/comments/a.md')).toContain('둘째')
    expect(await publishPaths(mac, PATHS, opts)).toMatchObject({ pushed: false, commit: null })

    // 나중에 git pull로 합쳐도 코멘트 쪽은 충돌이 없다 (작업 중이던 원고는 이 시험과 무관해 치워 둔다)
    g(mac, 'stash', '-q'); g(mac, 'pull', '-q', '--no-rebase', '--no-edit')
    expect(g(mac, 'status', '--porcelain')).toBe('')
    expect(g(mac, 'diff', 'HEAD', 'origin/main', '--', 'workbench')).toBe('')
  })

  it('원격에서도 같은 파일이 이 컴퓨터가 모르는 내용으로 바뀌었으면 올리지 않고 멈춘다', async () => {
    const { remote, mac, cloud } = setup('conflict')
    write(cloud, 'workbench/comments/a.md', '# a\n- 클라우드\n'); g(cloud, 'commit', '-qam', 'cloud comment'); g(cloud, 'push', '-q')
    write(mac, 'workbench/comments/a.md', '# a\n- 맥\n')
    await expect(publishPaths(mac, PATHS, opts)).rejects.toThrow(/같은 파일이 바뀌어.*a\.md/)
    expect(g(remote, 'log', '--format=%s', '-n', '1', 'main')).toBe('cloud comment')
    // 맥의 코멘트는 커밋으로 남아 있다
    expect(g(mac, 'log', '--format=%s', '-n', '1')).toBe('Add comments')
  })

  it('원격이 앞서 있지 않고 커밋이 경로 안뿐이면 그대로 올린다. 경로 밖이나 저장소 밖 경로는 받지 않는다', async () => {
    const { remote, mac } = setup('plain')
    write(mac, 'workbench/comments/a.md', '# a\n- 하나\n')
    const r = await publishPaths(mac, PATHS, opts)
    expect(r.pushed).toBe(true)
    expect(g(remote, 'rev-parse', 'main')).toBe(g(mac, 'rev-parse', 'HEAD'))
    await expect(publishPaths(mac, ['../x'], opts)).rejects.toThrow(/상대 경로/)
    await expect(publishPaths(mac, ['.'], opts)).rejects.toThrow(/상대 경로/)
  })

  it('연구 저장소의 코멘트 기록을 앱 API로 확인하고 올린다 (records/unpublished · publish)', async () => {
    const { remote, mac } = setup('route')
    const app = buildApp({ configDir: path.join(tmp, 'route-config') })
    try {
      const id = (await app.inject({ method: 'POST', url: '/api/researches', payload: { path: mac, createWorkbench: true } })).json().id
      write(mac, 'workbench/comments/b.md', '# b\n')
      expect((await app.inject({ method: 'GET', url: `/api/researches/${id}/records/unpublished` })).json()).toEqual({ files: ['workbench/comments/b.md'] })
      expect((await app.inject({ method: 'POST', url: `/api/researches/${id}/records/publish` })).json()).toMatchObject({ pushed: true, files: ['workbench/comments/b.md'] })
      expect(g(remote, 'show', 'main:workbench/comments/b.md')).toBe('# b')
    } finally { await app.close() }
  })
})
