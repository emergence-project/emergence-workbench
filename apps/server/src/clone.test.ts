import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { cloneInto, createProjectFolder, defaultCloneDir, folderNameOf, parseGitHubRepo } from './clone.js'

describe('parseGitHubRepo', () => {
  it('reads the usual forms of a GitHub address', () => {
    const want = { owner: 'me', name: 'my-research', url: 'https://github.com/me/my-research.git' }
    expect(parseGitHubRepo('https://github.com/me/my-research')).toEqual(want)
    expect(parseGitHubRepo('https://github.com/me/my-research.git/')).toEqual(want)
    expect(parseGitHubRepo('git@github.com:me/my-research.git')).toEqual(want)
    expect(parseGitHubRepo(' me/my-research ')).toEqual(want)
  })
  it('rejects other hosts, paths and option-looking input', () => {
    for (const s of ['https://gitlab.com/me/x', '/Users/me/x', 'me/x/y', '--upload-pack=x/y', 'me/..', '']) expect(parseGitHubRepo(s)).toBeNull()
  })
})

describe('defaultCloneDir', () => {
  it('picks the folder most registered repos live in', () => {
    expect(defaultCloneDir(['/a/GitHub/x', '/a/GitHub/y', '/b/z'])).toBe('/a/GitHub')
    expect(defaultCloneDir([])).toBe(path.join(os.homedir(), 'GitHub'))
  })
})

describe('cloneInto', () => {
  it('clones into parent/name and refuses an existing folder', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rw-clone-'))
    const src = path.join(tmp, 'src')
    execFileSync('git', ['init', '-q', '-b', 'main', src])
    fs.writeFileSync(path.join(src, 'a.txt'), 'a')
    execFileSync('git', ['-C', src, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qam', 'x', '--allow-empty'])
    execFileSync('git', ['-C', src, 'add', '.'])
    execFileSync('git', ['-C', src, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'a'])
    const dest = await cloneInto(src, path.join(tmp, 'repos'), 'r')
    expect(fs.readFileSync(path.join(dest, 'a.txt'), 'utf8')).toBe('a')
    await expect(cloneInto(src, path.join(tmp, 'repos'), 'r')).rejects.toThrow(/이미 있는 폴더/)
    await expect(cloneInto(path.join(tmp, 'nope'), path.join(tmp, 'repos'), 'q')).rejects.toThrow(/받지 못했습니다/)
    expect(fs.existsSync(path.join(tmp, 'repos', 'q'))).toBe(false)
  })
})

describe('folderNameOf', () => {
  it('turns a title into a safe folder name, keeping Korean', () => {
    expect(folderNameOf('그래프 색칠 문제')).toBe('그래프-색칠-문제')
    expect(folderNameOf('  a/b: c?  ')).toBe('ab-c')
    expect(folderNameOf('../..')).toBe('project')
    expect(folderNameOf('$%#')).toBe('project')
  })
})

describe('createProjectFolder', () => {
  it('makes parent/name as a new git repository and refuses an existing folder', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rw-new-'))
    const made = await createProjectFolder(path.join(tmp, 'projects'), '내 연구')
    expect(made).toEqual({ path: path.join(tmp, 'projects', '내-연구'), git: true })
    expect(fs.existsSync(path.join(made.path, '.git'))).toBe(true)
    await expect(createProjectFolder(path.join(tmp, 'projects'), '내 연구')).rejects.toThrow(/이미 있는 폴더/)
    await expect(createProjectFolder('relative', 'x')).rejects.toThrow(/절대 경로/)
    fs.rmSync(tmp, { recursive: true, force: true })
  })
})
