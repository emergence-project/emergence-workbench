import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { RepoSync } from '@rw/core/contract/research'
import { buildApp } from './app.js'
import { autoPull, fastForward, repoSync } from './gitsync.js'
import { localSyncState } from './gitSyncState.js'
import { withLang } from './i18n.js'
import { gitTest as g, syncRepo } from './gitSyncTestkit.js'
import { tmp, useSampleApp } from './testkit.js'

useSampleApp()

// Record HEAD, index, status and every working file byte, including untracked/ignored files.
const snapshot = (repo: string) => {
  const files: Record<string, Buffer> = {}
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === '.git') continue
      const file = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(file)
      else files[path.relative(repo, file)] = fs.readFileSync(file)
    }
  }
  walk(repo)
  return { head: g(repo, 'rev-parse', 'HEAD'), index: g(repo, 'ls-files', '--stage', '-z'), status: g(repo, 'status', '--porcelain', '-z'), files }
}

describe('safe research fast-forward with local edits', () => {
  it.each([false, true])('preserves unrelated local bytes and index (staged=%s) and validates route replies', async (staged) => {
    const { mine, incoming } = syncRepo(tmp, `dirty-${staged}`, { 'local 글.md': 'old\n', 'remote.md': 'old\n' })
    g(mine, 'config', 'merge.autoStash', 'true') // the app must never stash, even if user config enables it
    const bytes = Buffer.from('커밋 안 한 글\r\n\t끝 \n\0', 'utf8')
    fs.writeFileSync(path.join(mine, 'local 글.md'), bytes)
    if (staged) g(mine, 'add', 'local 글.md')
    const index = g(mine, 'ls-files', '--stage', '--', 'local 글.md')
    const head = incoming({ 'remote.md': 'new\n' })
    const sa = buildApp({ configDir: path.join(tmp, `dirty-config-${staged}`) })
    try {
      const id = (await sa.inject({ method: 'POST', url: '/api/researches', payload: { path: mine } })).json().id
      const checked = await sa.inject({ method: 'GET', url: `/api/researches/${id}/sync?fetch=1` })
      expect(checked.statusCode).toBe(200)
      expect(checked.json().sync).toMatchObject({ behind: 1, ahead: 0, dirty: 1, conflicts: [], conflictCount: 0, canUpdate: true })
      const result = await sa.inject({ method: 'POST', url: `/api/researches/${id}/sync/update` })
      expect(result.statusCode).toBe(200)
      expect(result.json().sync).toMatchObject({ behind: 0, dirty: 1, conflicts: [], conflictCount: 0, canUpdate: false })
      expect(g(mine, 'rev-parse', 'HEAD')).toBe(head)
      expect(fs.readFileSync(path.join(mine, 'local 글.md'))).toEqual(bytes)
      expect(g(mine, 'ls-files', '--stage', '--', 'local 글.md')).toBe(index)
      expect(g(mine, 'stash', 'list')).toBe('')
      expect(fs.readFileSync(path.join(mine, 'remote.md'), 'utf8')).toBe('new\n')
    } finally { await sa.close() }
  })

  it.each(['unstaged', 'staged', 'untracked', 'deleted', 'renamed-local', 'renamed-remote'])('rejects %s overlap, keeping HEAD, index and all bytes', async (kind) => {
    const file = ' 글 한글 \t".md'
    const renamed = '새 이름.md'
    const { mine, incoming } = syncRepo(tmp, `overlap-${kind}`, kind === 'untracked' ? {} : { [file]: 'original\n' })
    if (kind === 'deleted') fs.unlinkSync(path.join(mine, file))
    else if (kind === 'renamed-local') g(mine, 'mv', '--', file, renamed)
    else fs.writeFileSync(path.join(mine, file), '나의 글\r\n')
    if (kind === 'staged') g(mine, 'add', '--', file)
    incoming(kind === 'renamed-remote' ? { [file]: null, [renamed]: 'original\n' } : { [file]: 'GitHub 글\n' })
    const before = snapshot(mine)
    expect(RepoSync.parse(await repoSync(mine, { fetch: true, force: true }))).toMatchObject({ behind: 1, dirty: kind === 'untracked' ? 0 : 1, conflicts: [file], conflictCount: 1, canUpdate: false })
    await expect(fastForward(mine)).rejects.toThrow(file)
    expect(snapshot(mine)).toEqual(before)
  })

  it('sorts/caps conflict paths at 20 and reports the full count after the first five names', async () => {
    const files = Object.fromEntries(Array.from({ length: 23 }, (_, i) => [`note-${String(i).padStart(2, '0')}.md`, 'old\n']))
    const { mine, incoming } = syncRepo(tmp, 'many-conflicts', files)
    for (const file of Object.keys(files)) fs.writeFileSync(path.join(mine, file), 'local\n')
    incoming(Object.fromEntries(Object.keys(files).map((file) => [file, 'remote\n'])))
    const before = snapshot(mine)
    const s = await repoSync(mine, { fetch: true, force: true })
    expect(s).toMatchObject({ dirty: 23, conflictCount: 23, canUpdate: false })
    expect(s!.conflicts).toEqual(Object.keys(files).sort().slice(0, 20))
    await expect(fastForward(mine)).rejects.toThrow('note-00.md, note-01.md, note-02.md, note-03.md, note-04.md 외 18개')
    expect(snapshot(mine)).toEqual(before)
  })

  it('rejects local-only commits and leaves divergent histories unchanged', async () => {
    const { mine, incoming } = syncRepo(tmp, 'ahead-dirty', { 'local.md': 'old\n' })
    fs.writeFileSync(path.join(mine, 'local.md'), 'local commit\n')
    g(mine, 'commit', '-qam', 'Local change')
    const aheadOnly = snapshot(mine)
    expect(RepoSync.parse(await repoSync(mine))).toMatchObject({ ahead: 1, behind: 0, canUpdate: false })
    await expect(fastForward(mine)).rejects.toThrow('이 컴퓨터에만 있는 커밋 1개')
    expect(snapshot(mine)).toEqual(aheadOnly)
    incoming({ 'remote.md': 'remote\n' })
    const before = snapshot(mine)
    expect(await repoSync(mine, { fetch: true, force: true })).toMatchObject({ ahead: 1, behind: 1, conflicts: [], canUpdate: false })
    await expect(fastForward(mine)).rejects.toThrow('이 컴퓨터에만 있는 커밋 1개')
    expect(snapshot(mine)).toEqual(before)
  })

  it('reports overlapping filenames in English too', async () => {
    const { mine, incoming } = syncRepo(tmp, 'english-overlap', { 'note.md': 'old\n' })
    fs.writeFileSync(path.join(mine, 'note.md'), 'local\n')
    incoming({ 'note.md': 'remote\n' })
    const saved = process.env.RW_LANG
    delete process.env.RW_LANG
    try {
      await expect(withLang('en', () => fastForward(mine))).rejects.toThrow('same files: note.md. Commit or merge first')
    } finally {
      if (saved === undefined) delete process.env.RW_LANG
      else process.env.RW_LANG = saved
    }
  })

  it('lets Git reject directory collisions and ignored-file overwrites without losing bytes', async () => {
    for (const kind of ['directory', 'ignored']) {
      const { mine, incoming } = syncRepo(tmp, `git-refusal-${kind}`)
      const file = kind === 'ignored' ? 'ignored.txt' : 'folder/local.md'
      fs.mkdirSync(path.dirname(path.join(mine, file)), { recursive: true })
      fs.writeFileSync(path.join(mine, file), 'keep me\n')
      incoming({ [kind === 'ignored' ? file : 'folder']: 'incoming\n' })
      const before = snapshot(mine)
      expect(await repoSync(mine, { fetch: true, force: true })).toMatchObject({ conflicts: [], canUpdate: true })
      await expect(fastForward(mine)).rejects.toThrow(/받아오지 못했습니다: error:/)
      expect(snapshot(mine)).toEqual(before)
    }
  })
})

// 맥의 기본 파일 시스템은 대소문자를 가리지 않는다. 앱에 등록한 경로(my-research)와 git이 돌려주는
// 실제 이름(My-Research)이 달라도 같은 저장소로 본다 (10/10: 홈 카드에 받기 표시가 없어 124커밋 뒤처짐)
const caseInsensitive = (() => {
  const d = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'Rw-Case-'))
  try { return fs.existsSync(d.toLowerCase()) } finally { fs.rmSync(d, { recursive: true, force: true }) }
})()

describe('대소문자만 다른 경로로 등록한 저장소', () => {
  it.skipIf(!caseInsensitive)('받기 상태와 STATUS용 상태가 null이 되지 않는다', async () => {
    const { mine, incoming } = syncRepo(tmp, 'Case-Repo')
    incoming({ 'remote.md': 'new\n' })
    const lower = path.join(path.dirname(mine), path.basename(mine).toLowerCase())
    expect(await repoSync(lower, { fetch: true, force: true })).toMatchObject({ behind: 1, canUpdate: true })
    expect(await localSyncState(lower)).toMatchObject({ behind: 1 })
  })
})

// 저절로 받기 (10/14): 받기 버튼과 같은 조건일 때만 받는다
describe('저절로 받기', () => {
  it('겹치는 파일이 없으면 받고, 겹치면 그대로 둔다', async () => {
    const { mine, incoming } = syncRepo(tmp, 'auto-pull', { 'a.md': 'old\n', 'b.md': 'old\n' })
    const head = incoming({ 'a.md': 'new\n' })
    expect(await autoPull(mine)).toBe(true)
    expect(g(mine, 'rev-parse', 'HEAD')).toBe(head)
    fs.writeFileSync(path.join(mine, 'b.md'), 'local\n')
    incoming({ 'b.md': 'remote\n' })
    const before = snapshot(mine)
    expect(await autoPull(mine)).toBe(false)
    expect(snapshot(mine)).toEqual(before)
  })

  it('빈 저장소를 받아 둔 사본은 첫 커밋이 올라오면 받는다', async () => {
    const remote = path.join(tmp, 'empty-start.git')
    const mine = path.join(tmp, 'empty-start')
    execFileSync('git', ['init', '-q', '--bare', '-b', 'main', remote])
    execFileSync('git', ['clone', '-q', remote, mine], { stdio: 'ignore' })
    expect(await repoSync(mine, { fetch: true, force: true })).toMatchObject({ behind: 0, canUpdate: false })
    expect(await autoPull(mine)).toBe(false)
    // 다른 사본이 첫 커밋을 올린다
    const other = path.join(tmp, 'empty-start-other')
    execFileSync('git', ['clone', '-q', remote, other], { stdio: 'ignore' })
    fs.mkdirSync(path.join(other, 'workbench'))
    fs.writeFileSync(path.join(other, 'workbench', 'research.yaml'), 'title: x\n')
    g(other, 'add', '.')
    g(other, '-c', 'user.name=T', '-c', 'user.email=t@example.com', 'commit', '-qm', 'first')
    g(other, 'push', '-q', 'origin', 'main')
    // 같은 이름의 파일이 사본에 있으면 겹침
    fs.mkdirSync(path.join(mine, 'workbench'))
    fs.writeFileSync(path.join(mine, 'workbench', 'research.yaml'), 'mine\n')
    expect(RepoSync.parse(await repoSync(mine, { fetch: true, force: true }))).toMatchObject({ behind: 1, conflicts: ['workbench/research.yaml'], canUpdate: false })
    expect(await autoPull(mine)).toBe(false)
    expect(fs.readFileSync(path.join(mine, 'workbench', 'research.yaml'), 'utf8')).toBe('mine\n')
    fs.rmSync(path.join(mine, 'workbench'), { recursive: true })
    expect(await autoPull(mine)).toBe(true)
    expect(fs.readFileSync(path.join(mine, 'workbench', 'research.yaml'), 'utf8')).toBe('title: x\n')
    expect(await repoSync(mine)).toMatchObject({ branch: 'main', behind: 0, ahead: 0 })
  })
})

// STATUS용 상태는 git 파일 시각이 같으면 지난 결과를 쓴다 (10/15 종합 검토 묶음 C). 바뀌는 길마다 낡지 않는지 본다
describe('STATUS용 상태 캐시', () => {
  it('커밋 · 올리기 · 받기 · ref 묶기 · 브랜치 바꾸기 뒤에 새로 잰다', async () => {
    const { mine, incoming } = syncRepo(tmp, 'sync-state-cache')
    const commit = (file: string) => { fs.writeFileSync(path.join(mine, file), `${file}\n`); g(mine, 'add', file); g(mine, 'commit', '-qm', file) }
    expect(await localSyncState(mine)).toMatchObject({ ahead: 0, behind: 0 })
    commit('one.md')
    expect(await localSyncState(mine)).toMatchObject({ ahead: 1, behind: 0 })
    g(mine, 'push', '-q')
    expect(await localSyncState(mine)).toMatchObject({ ahead: 0, behind: 0 })
    incoming({ 'remote.md': 'new\n' })
    g(mine, 'fetch', '-q')
    expect(await localSyncState(mine)).toMatchObject({ ahead: 0, behind: 1 })
    // 뒤처진 동안은 겹치는 파일이 작업 폴더에 따라 달라지므로 매번 잰다
    fs.writeFileSync(path.join(mine, 'remote.md'), 'local\n')
    g(mine, 'add', '-N', 'remote.md')
    expect(await localSyncState(mine)).toMatchObject({ behind: 1, conflicts: ['remote.md'] })
    g(mine, 'rm', '-q', '--cached', 'remote.md')
    fs.rmSync(path.join(mine, 'remote.md'))
    g(mine, 'merge', '-q', '--ff-only', '@{upstream}')
    expect(await localSyncState(mine)).toMatchObject({ ahead: 0, behind: 0 })
    g(mine, 'pack-refs', '--all')
    expect(await localSyncState(mine)).toMatchObject({ ahead: 0, behind: 0 })
    commit('two.md')
    expect(await localSyncState(mine)).toMatchObject({ ahead: 1, behind: 0 })
    g(mine, 'checkout', '-q', '-b', 'side')
    expect(await localSyncState(mine)).toBeNull()
    g(mine, 'checkout', '-q', 'main')
    expect(await localSyncState(mine)).toMatchObject({ ahead: 1, behind: 0 })
  })
})
