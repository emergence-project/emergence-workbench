// 맥에만 있는 workbench/ 백업: 연구 저장소는 읽기만 하고, 올라가 있지 않은 workbench/만 백업 저장소에 올린다
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import * as C from '@rw/core/contract/backup'
import { buildApp } from './app.js'
import { backupRemoteFor, backupWorkbenches } from './backup.js'

let tmp: string
const git = (cwd: string, ...args: string[]) => execFileSync('git', ['-C', cwd, '-c', 'user.name=t', '-c', 'user.email=t@t', ...args]).toString().trim()

beforeAll(() => { tmp = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'rw-backup-')) })
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }))

function research(name: string, trackWorkbench: boolean): string {
  const dir = path.join(tmp, name)
  fs.mkdirSync(path.join(dir, 'workbench/log'), { recursive: true })
  fs.mkdirSync(path.join(dir, 'workbench/.build/manuscript'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'main.tex'), 'x')
  fs.writeFileSync(path.join(dir, 'workbench/research.yaml'), 'title: T\n')
  fs.writeFileSync(path.join(dir, 'workbench/log/2026-10-04.md'), '- 일지\n')
  fs.writeFileSync(path.join(dir, 'workbench/.build/manuscript/PRB.pdf'), 'pdf')
  git(tmp, 'init', '-q', name)
  git(dir, 'add', 'main.tex', ...(trackWorkbench ? ['workbench/research.yaml'] : []))
  git(dir, 'commit', '-qm', 'init')
  return dir
}

describe('workbench 백업', () => {
  it('origin 주소에서 같은 계정의 백업 저장소 주소를 만든다', () => {
    expect(backupRemoteFor('https://github.com/me/research-workspace.git\n')).toBe('https://github.com/me/research-workspace-backup.git')
    expect(backupRemoteFor('git@github.com:me/research-workspace')).toBe('git@github.com:me/research-workspace-backup.git')
    expect(backupRemoteFor('https://github.com/me/other.git')).toBeNull()
  })

  it('백업을 쓰지 않는 모드에서는 꺼짐으로 알리고, 돌리면 404', async () => {
    const app = buildApp({ configDir: path.join(tmp, 'config-off') })
    expect((await app.inject({ url: '/api/backup' })).json()).toEqual({ enabled: false, remote: null, running: false, last: null })
    expect((await app.inject({ method: 'POST', url: '/api/backup' })).statusCode).toBe(404)
    await app.close()
  })
  it('올라가 있지 않은 workbench/만 .build를 빼고 올리고, 연구 저장소는 그대로 둔다', async () => {
    const remote = path.join(tmp, 'backup.git')
    execFileSync('git', ['init', '-q', '--bare', '-b', 'main', remote])
    const beta = research('beta', false)
    const alpha = research('alpha', true)
    const dir = path.join(tmp, 'config/backup')
    const targets = [{ id: 'beta', path: beta }, { id: 'alpha', path: alpha }, { id: 'gone', path: path.join(tmp, 'nope') }]

    const r1 = C.BackupResult.parse(await backupWorkbenches({ dir, remote, targets }))
    expect(r1).toMatchObject({ projects: ['beta'], pushed: true })
    const files = git(remote, 'ls-tree', '-r', '--name-only', 'main').split('\n')
    expect(files).toEqual(['beta/workbench/log/2026-10-04.md', 'beta/workbench/research.yaml'])
    expect(git(beta, 'status', '--porcelain')).toBe('?? workbench/') // 연구 저장소는 읽기만

    expect(await backupWorkbenches({ dir, remote, targets })).toMatchObject({ commit: null, pushed: false })

    fs.writeFileSync(path.join(beta, 'workbench/research.yaml'), 'title: T\nconcepts: [euler-characteristic]\n')
    fs.rmSync(dir, { recursive: true, force: true }) // 사본이 없어져도 다시 받아 온다
    const r3 = await backupWorkbenches({ dir, remote, targets })
    expect(r3.pushed).toBe(true)
    expect(git(remote, 'show', 'main:beta/workbench/research.yaml')).toContain('euler-characteristic')
  })

  it('백업 저장소를 받지 못하면 이유를 돌려준다', async () => {
    const beta = research('beta2', false)
    const r = await backupWorkbenches({ dir: path.join(tmp, 'b2'), remote: path.join(tmp, 'missing.git'), targets: [{ id: 'beta2', path: beta }] })
    expect(r.pushed).toBe(false)
    expect(r.error).toBeTruthy()
  })

  it('GitHub에서 바뀐 것은 맥으로 받고, 양쪽에서 고친 것은 맥 것을 두고 GitHub 것을 옆에 받는다 (GitHub가 정본)', async () => {
    const remote = path.join(tmp, 'sync.git')
    execFileSync('git', ['init', '-q', '--bare', '-b', 'main', remote])
    const beta = research('beta3', false)
    const settings = path.join(tmp, 'cfg3/config.yaml')
    fs.mkdirSync(path.dirname(settings), { recursive: true })
    fs.writeFileSync(settings, 'engine: xelatex\n')
    fs.writeFileSync(path.join(path.dirname(settings), 'google-token.json'), '{"secret":1}')
    const dir = path.join(tmp, 'cfg3/backup')
    const targets = [{ id: 'beta3', path: beta }]
    const run = () => backupWorkbenches({ dir, remote, targets, settings, now: new Date('2026-10-04T08:00:00Z') })
    expect(await run()).toMatchObject({ pushed: true, projects: ['beta3'] })
    expect(git(remote, 'ls-tree', '-r', '--name-only', 'main').split('\n')).toEqual(['_settings/config.yaml', 'beta3/workbench/log/2026-10-04.md', 'beta3/workbench/research.yaml'])

    // 다른 곳에서 GitHub를 고친다
    const other = path.join(tmp, 'other3')
    execFileSync('git', ['clone', '-q', remote, other])
    fs.writeFileSync(path.join(other, 'beta3/workbench/log/2026-10-05.md'), '- 새 일지\n')
    fs.writeFileSync(path.join(other, 'beta3/workbench/research.yaml'), 'title: GitHub\n')
    fs.writeFileSync(path.join(other, '_settings/config.yaml'), 'engine: lualatex\n')
    git(other, 'add', '-A'); git(other, 'commit', '-qm', 'other'); git(other, 'push', '-q', 'origin', 'main')
    // 맥에서는 같은 파일을 다르게 고치고, 일지 하나를 지운다
    fs.writeFileSync(path.join(beta, 'workbench/research.yaml'), 'title: Mac\n')

    const r = await run()
    expect(r.pushed).toBe(true)
    expect(r.settingsPulled).toBe(true)
    expect(fs.readFileSync(settings, 'utf8')).toBe('engine: lualatex\n')
    expect(fs.readFileSync(path.join(beta, 'workbench/log/2026-10-05.md'), 'utf8')).toBe('- 새 일지\n')
    expect(r.conflicts).toEqual(['beta3/workbench/research.yaml'])
    expect(fs.readFileSync(path.join(beta, 'workbench/research.yaml'), 'utf8')).toBe('title: Mac\n')
    expect(fs.readFileSync(path.join(beta, 'workbench/research.github-20261004.yaml'), 'utf8')).toBe('title: GitHub\n')
    expect(git(remote, 'show', 'main:beta3/workbench/research.yaml')).toBe('title: Mac')
    expect(git(remote, 'ls-tree', '-r', '--name-only', 'main')).not.toContain('google')

    // GitHub에서 지운 파일은 맥에서도 지운다
    git(other, 'pull', '-q', 'origin', 'main')
    git(other, 'rm', '-q', 'beta3/workbench/log/2026-10-04.md'); git(other, 'commit', '-qm', 'rm'); git(other, 'push', '-q', 'origin', 'main')
    const r2 = await run()
    expect(r2.pulled).toEqual(['beta3/workbench/log/2026-10-04.md'])
    expect(fs.existsSync(path.join(beta, 'workbench/log/2026-10-04.md'))).toBe(false)

    // 맥에서 workbench/가 없어지면 GitHub에서 되살린다
    fs.rmSync(path.join(beta, 'workbench'), { recursive: true })
    fs.rmSync(dir, { recursive: true, force: true }) // 지난번 기록도 없는 새 컴퓨터처럼
    await run()
    expect(fs.readFileSync(path.join(beta, 'workbench/research.yaml'), 'utf8')).toBe('title: Mac\n')
    expect(fs.existsSync(path.join(beta, 'workbench/log/2026-10-05.md'))).toBe(true)
  })

  it('비교한 뒤 맥에서 다시 고친 파일은 GitHub 것으로 덮거나 지우지 않는다', async () => {
    const remote = path.join(tmp, 'sync4.git')
    execFileSync('git', ['init', '-q', '--bare', '-b', 'main', remote])
    const beta = research('beta4', false)
    fs.writeFileSync(path.join(beta, 'workbench/log/2026-10-05.md'), '- 둘째 날\n')
    const dir = path.join(tmp, 'cfg4/backup')
    const targets = [{ id: 'beta4', path: beta }]
    const now = new Date('2026-10-07T08:00:00Z')
    expect(await backupWorkbenches({ dir, remote, targets, now })).toMatchObject({ pushed: true })

    // GitHub에서만 한 파일을 고치고 다른 파일을 지운다
    const other = path.join(tmp, 'other4')
    execFileSync('git', ['clone', '-q', remote, other])
    fs.writeFileSync(path.join(other, 'beta4/workbench/log/2026-10-04.md'), '- GitHub\n')
    git(other, 'rm', '-q', 'beta4/workbench/log/2026-10-05.md')
    git(other, 'add', '-A'); git(other, 'commit', '-qm', 'other'); git(other, 'push', '-q', 'origin', 'main')

    // 맞추는 도중(비교한 뒤, 쓰기 전에) 에이전트가 맥에서 두 파일을 고친다
    const beforeWrite = (abs: string) => fs.appendFileSync(abs, '- 에이전트\n')
    const r = await backupWorkbenches({ dir, remote, targets, now, beforeWrite })
    expect(r.pulled).toEqual([])
    expect(fs.readFileSync(path.join(beta, 'workbench/log/2026-10-04.md'), 'utf8')).toBe('- 일지\n- 에이전트\n')
    expect(fs.readFileSync(path.join(beta, 'workbench/log/2026-10-04.github-20261007.md'), 'utf8')).toBe('- GitHub\n')
    expect(fs.readFileSync(path.join(beta, 'workbench/log/2026-10-05.md'), 'utf8')).toBe('- 둘째 날\n- 에이전트\n')
  })
})
