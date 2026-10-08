// 프로젝트 정보의 저장소 칸: 브랜치·원격·마지막 커밋·변경·GitHub와의 차이 (10/4 19:25 피드백)
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildApp } from './app.js'
import { fetchProblem, remoteWeb } from './gitsync.js'
import { fixture, R, app, tmp, useSampleApp } from './testkit.js'

useSampleApp()

const g = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd }).toString().trim()

describe('프로젝트 정보의 저장소 칸', () => {
  it('브랜치·원격·마지막 커밋·변경 수를 보이고, "확인"을 눌렀을 때만 원격을 확인하며 받아오지 않는다', async () => {
    const remote = path.join(tmp, 'info-remote.git')
    const mine = path.join(tmp, 'info-mine')
    const other = path.join(tmp, 'info-other')
    execFileSync('git', ['init', '-q', '--bare', '-b', 'main', remote])
    execFileSync('git', ['clone', '-q', remote, mine])
    g(mine, 'config', 'user.name', 't'); g(mine, 'config', 'user.email', 't@t')
    fs.cpSync(fixture, mine, { recursive: true, filter: (src) => !src.includes('.build') })
    g(mine, 'add', '.'); g(mine, 'commit', '-qm', 'first commit'); g(mine, 'push', '-q', '-u', 'origin', 'main')
    execFileSync('git', ['clone', '-q', remote, other])
    g(other, 'config', 'user.name', 'o'); g(other, 'config', 'user.email', 'o@o')

    const sa = buildApp({ configDir: path.join(tmp, 'config-info') })
    const id = (await sa.inject({ method: 'POST', url: '/api/researches', payload: { path: mine } })).json().id as string
    const info = async (fetch = false) => (await sa.inject({ method: 'GET', url: `/api/researches/${id}/repo${fetch ? '?fetch=1' : ''}` })).json().repo

    const first = await info()
    expect(first).toMatchObject({ state: 'ok', branch: 'main', upstream: 'origin/main', ahead: 0, behind: 0, untracked: 0, fetchedAt: null })
    expect(first.remote).toMatchObject({ name: 'origin', web: null })
    expect(first.last).toMatchObject({ subject: 'first commit', sha: g(mine, 'rev-parse', '--short', 'HEAD') })
    // 앱이 등록하며 만든 workbench/ 파일이 있으면 그것도 새 파일로 센다
    const baseUntracked = first.untracked as number

    // 다른 곳에서 올린 커밋: 확인하기 전에는 모르고, 확인하면 뒤처진 수가 보이지만 받아오지는 않는다
    fs.writeFileSync(path.join(other, 'NOTES.md'), '추가\n')
    g(other, 'add', '.'); g(other, 'commit', '-qm', 'remote edit'); g(other, 'push', '-q')
    expect(await info()).toMatchObject({ behind: 0 })
    const checked = await info(true)
    expect(checked).toMatchObject({ behind: 1, ahead: 0 })
    expect(typeof checked.fetchedAt).toBe('number')
    expect(fs.existsSync(path.join(mine, 'NOTES.md'))).toBe(false)

    // 커밋 안 한 변경과 새 파일, 이 컴퓨터에만 있는 커밋
    fs.appendFileSync(path.join(mine, 'workbench/preamble.tex'), '% 내 변경\n')
    fs.writeFileSync(path.join(mine, 'new.txt'), '새 파일\n')
    expect(await info()).toMatchObject({ dirty: 1, untracked: baseUntracked + 1 })
    g(mine, 'add', 'new.txt'); g(mine, 'commit', '-qm', 'mine')
    expect(await info()).toMatchObject({ ahead: 1, behind: 1, last: { subject: 'mine' } })

    // 원격에 닿지 않으면 쉬운 말로 알리고, 앞서 본 차이는 그대로 둔다
    g(mine, 'remote', 'set-url', 'origin', path.join(tmp, 'no-such-remote.git'))
    const offline = await info(true)
    expect(offline.fetchError).toBe('원격 저장소를 찾지 못했습니다')
    expect(offline.fetchDetail).toBeTruthy()
    expect(offline.fetchedAt).toBeNull()
    await sa.close()
  })

  it('원격이 없는 저장소, git 저장소가 아닌 폴더, 다른 저장소 안의 폴더를 구별한다', async () => {
    // 예제 연구의 .git은 빈 폴더라 git 저장소가 아니다
    expect((await app.inject({ method: 'GET', url: `${R}/repo` })).json().repo).toEqual({ state: 'none' })

    const solo = path.join(tmp, 'info-solo')
    fs.cpSync(fixture, solo, { recursive: true, filter: (src) => !src.includes('.build') })
    execFileSync('git', ['init', '-q', '-b', 'work', solo])
    const sa = buildApp({ configDir: path.join(tmp, 'config-solo') })
    const id = (await sa.inject({ method: 'POST', url: '/api/researches', payload: { path: solo } })).json().id as string
    const r = (await sa.inject({ method: 'GET', url: `/api/researches/${id}/repo?fetch=1` })).json().repo
    expect(r).toMatchObject({ state: 'ok', branch: 'work', remote: null, upstream: null, last: null, ahead: null, behind: null })
    expect(r.fetchError).toBeUndefined()

    const sub = path.join(solo, 'inner')
    fs.cpSync(fixture, sub, { recursive: true, filter: (src) => !src.includes('.build') })
    const sid = (await sa.inject({ method: 'POST', url: '/api/researches', payload: { path: sub } })).json().id as string
    const inner = (await sa.inject({ method: 'GET', url: `/api/researches/${sid}/repo` })).json().repo
    expect(inner.state).toBe('inside')
    expect(fs.realpathSync(inner.top)).toBe(fs.realpathSync(solo))
    await sa.close()
  })

  it('원격 주소를 웹 주소로 바꾸며 주소 속 로그인 정보는 지운다', () => {
    expect(remoteWeb('git@github.com:me/repo.git')).toEqual({ shown: 'github.com/me/repo', web: 'https://github.com/me/repo' })
    expect(remoteWeb('https://ghp_secret@github.com/me/repo.git')).toEqual({ shown: 'github.com/me/repo', web: 'https://github.com/me/repo' })
    expect(remoteWeb('ssh://git@github.com/me/repo')).toEqual({ shown: 'github.com/me/repo', web: 'https://github.com/me/repo' })
    expect(remoteWeb('/srv/repo.git').web).toBeNull()
    expect(fetchProblem('fatal: unable to access \'https://github.com/x/\': Could not resolve host: github.com')).toMatch(/인터넷/)
    expect(fetchProblem('fatal: could not read Username for \'https://github.com\'')).toMatch(/로그인/)
  })
})
