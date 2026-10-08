// 개인 저장소: 피드백을 앱 저장소 대신 개인 저장소 사본에 쌓는다
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { backupRemoteFor } from './backup.js'
import { publishFeedback } from './feedback.js'
import { ensurePersonalClone, personalRemote, pullPersonal } from './personalRepo.js'

let tmp: string
const git = (cwd: string, ...args: string[]) => execFileSync('git', ['-C', cwd, '-c', 'user.name=t', '-c', 'user.email=t@t', ...args]).toString().trim()
const savedEnv = { p: process.env.RW_PERSONAL_REMOTE, b: process.env.RW_BACKUP_REMOTE }

beforeAll(() => { tmp = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'rw-personal-')) })
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }))
afterEach(() => {
  for (const [k, v] of [['RW_PERSONAL_REMOTE', savedEnv.p], ['RW_BACKUP_REMOTE', savedEnv.b]] as const) {
    if (v === undefined) delete process.env[k]; else process.env[k] = v
  }
})

/** 파일 하나가 든 bare 원격 */
function remoteWith(name: string, files: Record<string, string>): string {
  const remote = path.join(tmp, `${name}.git`)
  const work = path.join(tmp, `${name}-seed`)
  execFileSync('git', ['init', '-q', '--bare', '-b', 'main', remote])
  git(tmp, 'clone', '-q', remote, work)
  for (const [f, body] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(work, f)), { recursive: true }); fs.writeFileSync(path.join(work, f), body) }
  git(work, 'add', '-A')
  git(work, 'commit', '-qm', 'seed')
  git(work, 'push', '-q', 'origin', 'HEAD:main')
  return remote
}

describe('개인 저장소', () => {
  it('공개 저장소(emergence-workbench)에서는 남의 개인 저장소를 짐작하지 않는다', () => {
    expect(backupRemoteFor('https://github.com/emergence-project/emergence-workbench.git')).toBeNull()
  })

  it('주소는 환경 변수, 설정, 받아 둔 백업 사본, 옛 앱 origin 차례로 찾고, 없으면 꺼짐', async () => {
    delete process.env.RW_PERSONAL_REMOTE
    delete process.env.RW_BACKUP_REMOTE
    const config = path.join(tmp, 'cfg-order')
    const app = path.join(tmp, 'app-order')
    fs.mkdirSync(config, { recursive: true })
    git(tmp, 'init', '-q', 'app-order')
    git(app, 'remote', 'add', 'origin', 'https://github.com/org/emergence-workbench.git')
    expect(await personalRemote(config, app)).toBeNull() // 설정하지 않으면 꺼짐
    git(app, 'remote', 'set-url', 'origin', 'https://github.com/me/research-workspace.git')
    expect(await personalRemote(config, app)).toBe('https://github.com/me/research-workspace-backup.git') // 옛 저장소는 예전처럼

    git(config, 'init', '-q', 'backup')
    git(path.join(config, 'backup'), 'remote', 'add', 'origin', 'https://github.com/me/research-workspace-backup.git')
    expect(await personalRemote(config, app)).toBe('https://github.com/me/research-workspace-backup.git')

    fs.writeFileSync(path.join(config, 'config.yaml'), 'engine: xelatex\npersonalRepo: https://github.com/me/mine.git\n')
    expect(await personalRemote(config, app)).toBe('https://github.com/me/mine.git')

    process.env.RW_PERSONAL_REMOTE = 'https://github.com/me/env.git'
    expect(await personalRemote(config, app)).toBe('https://github.com/me/env.git')
  })

  it('비어 있으면 받고, 피드백만 올린다', async () => {
    const remote = remoteWith('p1', { '_settings/config.yaml': 'engine: xelatex\n' })
    const dir = path.join(tmp, 'cfg1/personal')
    await ensurePersonalClone(dir, remote)
    expect(fs.readFileSync(path.join(dir, '_settings/config.yaml'), 'utf8')).toBe('engine: xelatex\n')
    fs.mkdirSync(path.join(dir, 'feedback'))
    fs.writeFileSync(path.join(dir, 'feedback/2026-10-08.md'), '# 2026-10-08\n')
    fs.writeFileSync(path.join(dir, 'other.txt'), '올리지 않음')
    git(dir, 'config', 'user.name', 't'); git(dir, 'config', 'user.email', 't@t')
    const r = await publishFeedback(path.join(dir, 'feedback'))
    expect(r.pushed).toBe(true)
    expect(git(remote, 'ls-tree', '-r', '--name-only', 'main').split('\n')).toEqual(['_settings/config.yaml', 'feedback/2026-10-08.md'])
  })

  it('받기 전에 남긴 피드백은 잃지 않고, GitHub에만 있는 파일은 꺼낸다', async () => {
    const remote = remoteWith('p2', { 'feedback/status.yaml': 'a: 1\n', 'feedback/2026-10-07.md': '원격\n' })
    const dir = path.join(tmp, 'cfg2/personal')
    fs.mkdirSync(path.join(dir, 'feedback'), { recursive: true })
    fs.writeFileSync(path.join(dir, 'feedback/2026-10-07.md'), '맥에서 남김\n')
    fs.writeFileSync(path.join(dir, 'feedback/2026-10-08.md'), '새것\n')
    await ensurePersonalClone(dir, remote)
    expect(fs.readFileSync(path.join(dir, 'feedback/2026-10-07.md'), 'utf8')).toBe('맥에서 남김\n')
    expect(fs.readFileSync(path.join(dir, 'feedback/2026-10-08.md'), 'utf8')).toBe('새것\n')
    expect(fs.readFileSync(path.join(dir, 'feedback/status.yaml'), 'utf8')).toBe('a: 1\n')
    expect(git(dir, 'status', '--porcelain').split('\n').map((l) => l.trim()).sort()).toEqual(['?? feedback/2026-10-08.md', 'M feedback/2026-10-07.md'])
  })

  it('GitHub의 새 처리 기록을 받고, 맥에서 남긴 피드백은 그대로 둔다', async () => {
    const remote = remoteWith('p3', { 'feedback/status.yaml': 'a: 1\n' })
    const dir = path.join(tmp, 'cfg3/personal')
    await ensurePersonalClone(dir, remote)
    fs.writeFileSync(path.join(dir, 'feedback/2026-10-08.md'), '아직 안 올림\n')
    const seed = path.join(tmp, 'p3-seed')
    git(seed, 'pull', '-q', 'origin', 'main')
    fs.writeFileSync(path.join(seed, 'feedback/status.yaml'), 'a: 2\n')
    git(seed, 'commit', '-qam', 'status')
    git(seed, 'push', '-q', 'origin', 'HEAD:main')
    expect(await pullPersonal(dir)).toEqual({ ok: true })
    expect(fs.readFileSync(path.join(dir, 'feedback/status.yaml'), 'utf8')).toBe('a: 2\n')
    expect(fs.readFileSync(path.join(dir, 'feedback/2026-10-08.md'), 'utf8')).toBe('아직 안 올림\n')
  })
})
