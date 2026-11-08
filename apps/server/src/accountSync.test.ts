// 계정으로 맞추기 (accountSync.ts): 컴퓨터 A가 계정에 올리고, 같은 계정으로 로그인한 컴퓨터 B가 같은 상태를 받는다.
// GitHub 대신 이 시험의 맨 저장소(bare)를 쓴다: git 설정 url.insteadOf로 https://github.com/<계정>/<이름>을 그 폴더로 돌린다
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { AccountSync, adopt, BIG_FILE, excludeBig, HOME_REPO, LIBRARY_REPO, PAPERS_REPO, repoNameOf } from './accountSync.js'
import { backupWorkbenches } from './backup.js'
import { createProjectFolder } from './clone.js'
import { setFallbackIdentity, setGithubToken } from './git.js'
import { GithubAccount } from './githubAccount.js'
import { autoPull } from './gitsync.js'
import { Registry } from './registry.js'
import { remoteOf } from './routes/google.js'
import { memorySecretStore } from './secretStore.js'
import { prepareStarter } from './starter.js'

const TEMPLATE = path.resolve(import.meta.dirname, '../../../templates/shared-library')
let tmp: string
let gh: string
const saved = { global: process.env.GIT_CONFIG_GLOBAL, nosys: process.env.GIT_CONFIG_NOSYSTEM }

beforeAll(() => {
  // 윈도우의 짧은 이름(RUNNER~1)은 앱처럼 긴 이름으로 (starter.ts)
  tmp = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'rw-acctsync-')))
  gh = path.join(tmp, 'github')
  const cfg = path.join(tmp, 'gitconfig')
  fs.writeFileSync(cfg, `[user]\n\tname = Friend\n\temail = friend@example.com\n[init]\n\tdefaultBranch = main\n[url "${pathToFileURL(gh).href}/"]\n\tinsteadOf = https://github.com/\n[protocol "file"]\n\tallow = always\n`)
  process.env.GIT_CONFIG_GLOBAL = cfg
  process.env.GIT_CONFIG_NOSYSTEM = '1'
})
afterAll(() => {
  setGithubToken(null)
  setFallbackIdentity(null)
  for (const [k, v] of [['GIT_CONFIG_GLOBAL', saved.global], ['GIT_CONFIG_NOSYSTEM', saved.nosys]] as const) {
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
  fs.rmSync(tmp, { recursive: true, force: true })
})

const json = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status, headers: { 'content-type': 'application/json' } })

/** 가짜 GitHub: 로그인은 바로 되고, 저장소 만들기 · 찾기는 맨 저장소 폴더로 */
function fakeGitHub(login: string): typeof fetch {
  return async (input, init) => {
    const url = String(input)
    if (url.endsWith('/login/device/code')) return json({ device_code: 'd', user_code: 'AAAA-BBBB', verification_uri: 'https://github.com/login/device', expires_in: 900, interval: 5 })
    if (url.endsWith('/login/oauth/access_token')) return json({ access_token: `tok-${login}` })
    if (url.endsWith('/user')) return json({ login, id: 7, name: login, avatar_url: '' })
    if (url.endsWith('/user/repos')) {
      const body: unknown = JSON.parse(typeof init?.body === 'string' ? init.body : '{}')
      const name = body && typeof body === 'object' && 'name' in body ? String(body.name) : ''
      const dir = path.join(gh, login, `${name}.git`)
      if (fs.existsSync(dir)) return json({ message: 'name already exists' }, 422)
      fs.mkdirSync(dir, { recursive: true })
      execFileSync('git', ['init', '--quiet', '--bare', '-b', 'main', dir])
      if (body && typeof body === 'object' && 'auto_init' in body && body.auto_init) {
        const work = fs.mkdtempSync(path.join(tmp, 'init-'))
        execFileSync('git', ['clone', '--quiet', dir, work])
        fs.writeFileSync(path.join(work, 'README.md'), `# ${name}\n`)
        execFileSync('git', ['-C', work, 'add', '.'])
        execFileSync('git', ['-C', work, 'commit', '--quiet', '-m', 'Initial commit'])
        execFileSync('git', ['-C', work, 'push', '--quiet', 'origin', 'HEAD:main'])
      }
      return json({ html_url: `https://github.com/${login}/${name}` }, 201)
    }
    const m = url.match(/\/repos\/([^/]+)\/([^/]+)$/)
    if (m) return fs.existsSync(path.join(gh, m[1]!, `${m[2]!}.git`)) ? json({ html_url: `https://github.com/${m[1]}/${m[2]}` }) : json({ message: 'Not Found' }, 404)
    return json({ message: 'Not Found' }, 404)
  }
}

/** 컴퓨터 하나: 설정 폴더, 집 폴더(문서/EmergenceWorkbench), 로그인한 계정, 계정으로 맞추기 */
async function computer(name: string, login = 'friend') {
  const home = path.join(tmp, name)
  fs.mkdirSync(path.join(home, 'Documents'), { recursive: true })
  const configDir = path.join(home, 'config')
  const registry = new Registry(configDir)
  prepareStarter(registry, TEMPLATE, home, process.platform)
  const account = new GithubAccount(configDir, memorySecretStore(), fakeGitHub(login), () => undefined, async () => undefined)
  await account.start()
  await account.settled()
  const backupDir = path.join(configDir, 'backup')
  const runBackup = async () => {
    const list = registry.list()
    const projects = await Promise.all(list.map(async (r) => ({ id: r.id, title: r.title, remote: await remoteOf(r.path), folder: path.basename(r.path), tags: r.tags, state: r.state, ...registry.sharedProfile(r.id) })))
    const r = await backupWorkbenches({ dir: backupDir, remote: registry.personalRepo!, targets: list.map((x) => ({ id: x.id, path: x.path })), settings: path.join(configDir, 'config.yaml'), projects, machine: name })
    if (r.error) throw new Error(r.error)
    if (r.settingsPulled) registry.reload()
  }
  const base = path.join(home, 'Documents', 'EmergenceWorkbench')
  const registered: string[] = []
  const sync = new AccountSync({ account, registry, configDir, backupDir, runBackup, cloneParent: () => base, libraryTemplate: TEMPLATE, remoteOf, machine: name, registered: (id) => registered.push(id) })
  return { home, base, registry, account, sync, registered, library: registry.libraryPath!, papers: registry.pdfFolders[0]! }
}

const read = (f: string) => fs.readFileSync(f, 'utf8')
/** 맨 저장소 폴더 (GitHub처럼 이름.git, git은 .git 없는 주소도 찾아간다) */
const bare = (login: string, name: string) => path.join(gh, login, `${name}.git`)
const show = (repo: string, file: string) => execFileSync('git', ['--git-dir', repo, 'show', `main:${file}`]).toString()

describe('AccountSync', () => {
  it('puts computer A on the account and gives computer B the same projects, library and papers', async () => {
    // ── 컴퓨터 A: 로그인 전에 만든 프로젝트 · 개념노트 · 논문
    const a = await computer('computer-a')
    const made = await createProjectFolder(a.base, 'My notes')
    const pa = a.registry.register(made.path, { createWorkbench: true, title: 'My notes' })
    fs.mkdirSync(path.join(made.path, 'workbench', 'notes', 'first'), { recursive: true })
    fs.writeFileSync(path.join(made.path, 'workbench', 'notes', 'first', 'note.md'), '# First\n\nhello\n')
    fs.writeFileSync(path.join(made.path, 'workbench', 'STATUS.md'), 'made by the app, not pushed\n')
    fs.writeFileSync(path.join(made.path, 'workbench', 'data.bin'), '')
    fs.truncateSync(path.join(made.path, 'workbench', 'data.bin'), BIG_FILE + 1)
    fs.mkdirSync(path.join(a.library, 'concepts'), { recursive: true })
    fs.writeFileSync(path.join(a.library, 'concepts', 'entropy.md'), '# Entropy\n')
    fs.writeFileSync(path.join(a.papers, 'smith2024.pdf'), '%PDF-1.4 small')
    // GitHub가 받지 않는 큰 파일 (자리만 잡는 파일이라 디스크를 쓰지 않는다)
    fs.writeFileSync(path.join(a.papers, 'huge.pdf'), '')
    fs.truncateSync(path.join(a.papers, 'huge.pdf'), BIG_FILE + 1)

    await a.sync.run()
    const va = a.sync.view()
    expect(va.error).toBeNull()
    expect(va.home).toBe(`https://github.com/friend/${HOME_REPO}`)
    expect(va.skipped).toEqual(['huge.pdf', 'My notes/workbench/data.bin'])
    expect(a.registry.personalRepo).toBe(va.home)
    // 프로젝트: 같은 이름의 비공개 저장소에 workbench/ (앱이 다시 만드는 STATUS.md는 빼고)
    expect(await remoteOf(made.path)).toBe('https://github.com/friend/My-notes.git')
    expect(show(bare('friend', 'My-notes'), 'workbench/notes/first/note.md')).toContain('hello')
    expect(() => show(bare('friend', 'My-notes'), 'workbench/STATUS.md')).toThrow()
    expect(() => show(bare('friend', 'My-notes'), 'workbench/data.bin')).toThrow()
    // 라이브러리 · 논문 (큰 파일은 빼고)
    expect(show(bare('friend', LIBRARY_REPO), 'concepts/entropy.md')).toBe('# Entropy\n')
    expect(show(bare('friend', LIBRARY_REPO), 'preamble/base.tex')).toBe(read(path.join(TEMPLATE, 'preamble/base.tex')))
    expect(show(bare('friend', PAPERS_REPO), 'smith2024.pdf')).toBe('%PDF-1.4 small')
    expect(() => show(bare('friend', PAPERS_REPO), 'huge.pdf')).toThrow()
    // 계정 저장소에 이 컴퓨터의 프로젝트 목록
    expect(show(bare('friend', HOME_REPO), '_settings/computer-a/projects.yaml')).toContain('github.com/friend/My-notes')

    // A에서 노트를 고치면 다음 차례에 올라간다
    fs.writeFileSync(path.join(made.path, 'workbench', 'notes', 'first', 'note.md'), '# First\n\nhello again\n')
    await a.sync.run()
    expect(show(bare('friend', 'My-notes'), 'workbench/notes/first/note.md')).toContain('hello again')

    // ── 컴퓨터 B: 로그인 전에 라이브러리 틀의 파일 하나를 고치고, 개념노트 하나를 더함
    const b = await computer('computer-b')
    fs.writeFileSync(path.join(b.library, 'preamble', 'notation.tex'), '% my own notation on B\n')
    fs.mkdirSync(path.join(b.library, 'concepts'), { recursive: true })
    fs.writeFileSync(path.join(b.library, 'concepts', 'b-only.md'), '# Only on B\n')
    await b.sync.run()
    const vb = b.sync.view()
    expect(vb.error).toBeNull()
    // 다른 컴퓨터가 만든 계정 저장소를 그대로 쓴다
    expect(b.registry.personalRepo).toBe(va.home)
    // 프로젝트를 받아 등록했다
    expect(b.registered).toHaveLength(1)
    const pb = b.registry.list()[0]!
    expect(pb.path).toBe(path.join(b.base, 'My-notes'))
    expect(read(path.join(pb.path, 'workbench', 'notes', 'first', 'note.md'))).toContain('hello again')
    // 라이브러리: A의 개념노트를 받고, B에서 고친 틀 파일은 옆에 남기고, B에만 있던 개념노트는 계정에 올렸다
    expect(read(path.join(b.library, 'concepts', 'entropy.md'))).toBe('# Entropy\n')
    expect(read(path.join(b.library, 'preamble', 'notation.tex'))).toBe(read(path.join(TEMPLATE, 'preamble/notation.tex')))
    const kept = fs.readdirSync(path.join(b.library, 'preamble')).find((f) => f.startsWith('notation.this-computer-'))
    expect(kept).toMatch(/^notation\.this-computer-\d{8}\.tex$/)
    expect(read(path.join(b.library, 'preamble', kept!))).toBe('% my own notation on B\n')
    expect(show(bare('friend', LIBRARY_REPO), 'concepts/b-only.md')).toBe('# Only on B\n')
    expect(read(path.join(b.papers, 'smith2024.pdf'))).toBe('%PDF-1.4 small')

    // ── B에서 고친 것을 A가 받는다 (저절로 받기, routes/sync.ts)
    fs.writeFileSync(path.join(pb.path, 'workbench', 'notes', 'first', 'note.md'), '# First\n\nedited on B\n')
    await b.sync.run()
    expect(await autoPull(made.path)).toBe(true)
    expect(read(path.join(made.path, 'workbench', 'notes', 'first', 'note.md'))).toContain('edited on B')
    expect(await autoPull(a.library)).toBe(true)
    expect(read(path.join(a.library, 'concepts', 'b-only.md'))).toBe('# Only on B\n')

    // 새 컴퓨터의 "모두 받기"는 한 번만: B에서 프로젝트를 빼도 다시 받지 않는다
    b.registry.unregister(pb.id)
    await b.sync.run()
    expect(b.registry.list()).toHaveLength(0)
    expect(pa.id).toBeTruthy()
  }, 60_000)

  it('gives a second project with the same name its own repository', async () => {
    const c = await computer('computer-c', 'other')
    const first = await createProjectFolder(c.base, 'Same')
    c.registry.register(first.path, { createWorkbench: true, title: 'Same' })
    fs.mkdirSync(bare('other', 'Same'), { recursive: true }) // 다른 곳에서 이미 만든 같은 이름
    execFileSync('git', ['init', '--quiet', '--bare', bare('other', 'Same')])
    await c.sync.run()
    expect(c.sync.view().error).toBeNull()
    expect(await remoteOf(first.path)).toBe('https://github.com/other/Same-2.git')
  }, 30_000)

  it('does nothing while signed out', async () => {
    const d = await computer('computer-d', 'nobody')
    await d.account.logout()
    await d.sync.run()
    expect(d.sync.view()).toMatchObject({ on: false, at: null })
    expect(fs.existsSync(path.join(gh, 'nobody'))).toBe(false)
  })
})

describe('adopt', () => {
  it('leaves the folder alone when the GitHub repository is empty', async () => {
    const dir = path.join(tmp, 'adopt-empty')
    fs.mkdirSync(dir)
    fs.writeFileSync(path.join(dir, 'x.txt'), 'x')
    const repo = bare('adopt', 'empty')
    fs.mkdirSync(repo, { recursive: true })
    execFileSync('git', ['init', '--quiet', '--bare', repo])
    expect(await adopt(dir, 'https://github.com/adopt/empty')).toBe(false)
    expect(read(path.join(dir, 'x.txt'))).toBe('x')
    expect(execFileSync('git', ['-C', dir, 'remote']).toString().trim()).toBe('')
  })
})

describe('helpers', () => {
  it('makes repository names from folder names', () => {
    expect(repoNameOf('My-notes')).toBe('My-notes')
    expect(repoNameOf('양자 노트')).toBe('project')
    expect(repoNameOf('Café notes')).toBe('Cafe-notes')
  })
  it('lists big files and keeps them out of git', () => {
    const dir = path.join(tmp, 'big')
    fs.mkdirSync(path.join(dir, 'sub'), { recursive: true })
    execFileSync('git', ['init', '--quiet', dir])
    fs.writeFileSync(path.join(dir, 'sub', 'a.pdf'), '')
    fs.truncateSync(path.join(dir, 'sub', 'a.pdf'), BIG_FILE + 10)
    fs.writeFileSync(path.join(dir, 'b.pdf'), 'small')
    expect(excludeBig(dir)).toEqual(['sub/a.pdf'])
    expect(excludeBig(dir)).toEqual(['sub/a.pdf'])
    expect(read(path.join(dir, '.git', 'info', 'exclude')).split('\n').filter((l) => l === '/sub/a.pdf')).toHaveLength(1)
  })
})
