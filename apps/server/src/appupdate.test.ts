// 연구 저장소의 최신 여부와 앱 업데이트
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildApp } from './app.js'
import { appIssuesUrl, buildReason, nextBuildOf, numberVersions, parseSubject, promoteNextBuild, webRemote } from './appupdate.js'
import { fixture, tmp, useSampleApp } from './testkit.js'

useSampleApp()

describe('연구 저장소의 최신 여부', () => {
  it('GitHub보다 뒤처졌는지 보여 주고, 이 컴퓨터에만 있는 커밋이나 겹치는 변경은 받지 않는다', async () => {
    const g = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd }).toString().trim()
    const remote = path.join(tmp, 'sync-remote.git')
    const mine = path.join(tmp, 'sync-mine')
    const other = path.join(tmp, 'sync-other')
    execFileSync('git', ['init', '-q', '--bare', '-b', 'main', remote])
    execFileSync('git', ['clone', '-q', remote, mine])
    for (const d of [mine]) { g(d, 'config', 'user.name', 't'); g(d, 'config', 'user.email', 't@t') }
    fs.cpSync(fixture, mine, { recursive: true, filter: (src) => !src.includes('.build') })
    g(mine, 'add', '.'); g(mine, 'commit', '-qm', 'init'); g(mine, 'push', '-q', '-u', 'origin', 'main')
    execFileSync('git', ['clone', '-q', remote, other])
    g(other, 'config', 'user.name', 'o'); g(other, 'config', 'user.email', 'o@o')

    const sa = buildApp({ configDir: path.join(tmp, 'config-sync') })
    const id = (await sa.inject({ method: 'POST', url: '/api/researches', payload: { path: mine } })).json().id as string
    const sync = async (fetch = true) => (await sa.inject({ method: 'GET', url: `/api/researches/${id}/sync${fetch ? '?fetch=1' : ''}` })).json().sync
    const update = () => sa.inject({ method: 'POST', url: `/api/researches/${id}/sync/update` })

    expect(await sync()).toMatchObject({ branch: 'main', upstream: 'origin/main', ahead: 0, behind: 0, dirty: 0, canUpdate: false })

    // 다른 곳(다른 맥, 클라우드)에서 올린 커밋
    fs.writeFileSync(path.join(other, 'NOTES.md'), '추가\n')
    g(other, 'add', '.'); g(other, 'commit', '-qm', 'remote edit'); g(other, 'push', '-q')
    expect((await update()).statusCode).toBe(200) // update는 항상 원격을 다시 확인한다
    expect(await sync(false)).toMatchObject({ behind: 0, ahead: 0 })
    expect(fs.readFileSync(path.join(mine, 'NOTES.md'), 'utf8')).toMatch(/추가/)

    // 같은 파일에 커밋 안 한 변경이 있으면 받지 않는다
    fs.appendFileSync(path.join(other, 'NOTES.md'), '둘째\n')
    g(other, 'commit', '-qam', 'remote edit 2'); g(other, 'push', '-q')
    const local = path.join(mine, 'NOTES.md')
    fs.appendFileSync(local, '내 변경\n')
    const refused = await update()
    expect(refused.statusCode).toBe(409)
    expect(refused.json().error).toMatch(/커밋하지 않은 변경.*NOTES\.md/)
    expect(fs.readFileSync(local, 'utf8')).toMatch(/내 변경/)
    expect(await sync(false)).toMatchObject({ behind: 1, dirty: 1, canUpdate: false })

    // 이 컴퓨터에만 있는 커밋이 있으면 받지 않는다
    g(mine, 'commit', '-qam', 'mine')
    expect((await update()).json().error).toMatch(/이 컴퓨터에만 있는 커밋 1개/)
    expect(await sync(false)).toMatchObject({ ahead: 1, behind: 1, canUpdate: false })
    await sa.close()
  })
})

describe('앱 업데이트', () => {
  it('새 피드백은 커밋해 얹고 GitHub의 새 버전을 받아 빌드·재시작하며, 맥에서 고친 코드가 있으면 멈춘다', async () => {
    const g = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd }).toString().trim()
    const remote = path.join(tmp, 'app-remote.git')
    const mac = path.join(tmp, 'app-mac')
    const cloud = path.join(tmp, 'app-cloud')
    execFileSync('git', ['init', '-q', '--bare', '-b', 'main', remote])
    for (const d of [mac, cloud]) execFileSync('git', ['clone', '-q', remote, d])
    for (const d of [mac, cloud]) { g(d, 'config', 'user.name', 't'); g(d, 'config', 'user.email', 't@t') }
    fs.writeFileSync(path.join(mac, 'app.ts'), 'v1\n'); fs.writeFileSync(path.join(mac, '.gitignore'), 'apps/web/dist-next/\n'); fs.mkdirSync(path.join(mac, 'feedback'))
    fs.writeFileSync(path.join(mac, 'feedback/2026-10-01.md'), '# 피드백\n')
    g(mac, 'add', '.'); g(mac, 'commit', '-qm', 'v1'); g(mac, 'push', '-q', '-u', 'origin', 'main')
    const running = g(mac, 'rev-parse', 'HEAD')
    g(cloud, 'pull', '-q')

    const calls: string[] = []
    const steps = { install: async () => { calls.push('install') }, build: async () => { calls.push('build') }, restart: () => { calls.push('restart'); return true }, canRestart: () => true }
    const ua = buildApp({ configDir: path.join(tmp, 'config-app'), appRepo: { root: mac, running, steps } })
    const status = async () => (await ua.inject({ method: 'GET', url: '/api/app/status?fetch=1' })).json().status
    const update = () => ua.inject({ method: 'POST', url: '/api/app/update' })

    expect(await status()).toMatchObject({ behind: 0, blocked: null })
    expect((await update()).json()).toMatchObject({ restarting: false, message: '이미 최신입니다' })

    // 클라우드에서 고쳐 올린 새 버전 + 맥에서 남긴 새 피드백
    fs.writeFileSync(path.join(cloud, 'app.ts'), 'v2\n'); fs.writeFileSync(path.join(cloud, 'package.json'), '{}\n')
    fs.writeFileSync(path.join(cloud, 'feedback/status.yaml'), '2026-10-01 09:00 홈:\n  state: 반영\n  clean: 홈 카드가 너무 크다.\n  note: 카드를 줄임\n')
    g(cloud, 'add', '.'); g(cloud, 'commit', '-qm', 'Fix home layout'); g(cloud, 'push', '-q')
    fs.appendFileSync(path.join(mac, 'feedback/2026-10-01.md'), '\n## 새 코멘트\n')
    expect(await status()).toMatchObject({
      behind: 1, blocked: null, incoming: ['Fix home layout'],
      resolved: [{ key: '2026-10-01 09:00 홈', state: '반영', text: '홈 카드가 너무 크다.', note: '카드를 줄임' }],
    })
    // 설정 화면과 제목줄이 동시에 확인해도 fetch가 겹쳐 실패하지 않는다
    for (const s of await Promise.all([status(), status(), status()])) { expect(s.behind).toBe(1); expect(s.fetchError).toBeUndefined() }

    const done = await update()
    expect(done.statusCode).toBe(200)
    expect(done.json()).toMatchObject({ restarting: true })
    expect(calls).toEqual(['install', 'build', 'restart'])
    expect(fs.readFileSync(path.join(mac, 'app.ts'), 'utf8')).toBe('v2\n')
    expect(g(mac, 'status', '--porcelain')).toBe('')
    // 피드백 커밋은 GitHub에도 올라갔다
    expect(g(remote, 'log', '--format=%s', '-n', '2', 'main').split('\n')).toEqual(['Add app feedback', 'Fix home layout'])

    // 맥에서 코드를 고쳐 둔 상태면 받지 않고, 파일도 그대로 둔다
    g(cloud, 'pull', '-q'); fs.writeFileSync(path.join(cloud, 'app.ts'), 'v3\n'); g(cloud, 'commit', '-qam', 'v3'); g(cloud, 'push', '-q')
    fs.writeFileSync(path.join(mac, 'app.ts'), 'mac edit\n')
    const blocked = await update()
    expect(blocked.statusCode).toBe(409)
    expect(blocked.json().error).toMatch(/이 맥에서 고친 파일이 있어.*app\.ts/)
    expect(fs.readFileSync(path.join(mac, 'app.ts'), 'utf8')).toBe('mac edit\n')

    const off = buildApp({ configDir: path.join(tmp, 'config-app2') })
    expect((await off.inject({ method: 'GET', url: '/api/app/status' })).json()).toEqual({ enabled: false })
    expect((await off.inject({ method: 'POST', url: '/api/app/update' })).statusCode).toBe(404)
    await Promise.all([ua.close(), off.close()])
  })

  it('자동 업데이트는 받고 빌드까지만 하고, 다시 시작은 처리 중인 요청이 없을 때 따로 한다 (10/9 "쉴 때 · 버튼")', async () => {
    const g = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd }).toString().trim()
    const remote = path.join(tmp, 'auto-remote.git')
    const mac = path.join(tmp, 'auto-mac')
    const cloud = path.join(tmp, 'auto-cloud')
    execFileSync('git', ['init', '-q', '--bare', '-b', 'main', remote])
    for (const d of [mac, cloud]) execFileSync('git', ['clone', '-q', remote, d])
    for (const d of [mac, cloud]) { g(d, 'config', 'user.name', 't'); g(d, 'config', 'user.email', 't@t') }
    fs.writeFileSync(path.join(mac, 'app.ts'), 'v1\n'); fs.writeFileSync(path.join(mac, '.gitignore'), 'apps/web/dist-next/\n')
    g(mac, 'add', '.'); g(mac, 'commit', '-qm', 'v1'); g(mac, 'push', '-q', '-u', 'origin', 'main')
    const running = g(mac, 'rev-parse', 'HEAD')
    g(cloud, 'pull', '-q'); fs.writeFileSync(path.join(cloud, 'app.ts'), 'v2\n'); g(cloud, 'commit', '-qam', 'v2'); g(cloud, 'push', '-q')

    const calls: string[] = []
    const steps = {
      install: async () => { calls.push('install') },
      // 진짜 빌드처럼 dist-next에 화면을 만든다
      build: async (root: string) => { calls.push('build'); fs.mkdirSync(path.join(root, 'apps/web/dist-next'), { recursive: true }); fs.writeFileSync(path.join(root, 'apps/web/dist-next/index.html'), 'v2') },
      restart: () => { calls.push('restart'); return true },
      canRestart: () => true,
    }
    const ua = buildApp({ configDir: path.join(tmp, 'config-auto'), appRepo: { root: mac, running, steps } })
    const restart = () => ua.inject({ method: 'POST', url: '/api/app/restart' })

    // 받을 것만 있고 빌드해 둔 것이 없으면 다시 시작하지 않는다
    expect((await restart()).statusCode).toBe(409)

    const { updateApp } = await import('./appupdate.js')
    const r = await updateApp(mac, running, steps, { restart: false })
    expect(r.restarting).toBe(false)
    expect(calls).toEqual(['build'])
    const head = g(mac, 'rev-parse', 'HEAD')
    expect(nextBuildOf(mac)).toBe(head)
    expect((await ua.inject({ method: 'GET', url: '/api/app/status' })).json().status).toMatchObject({ behind: 0, prepared: true })

    // 상단바 버튼(업데이트)은 이미 빌드했으면 다시 빌드하지 않고 다시 시작만 한다
    calls.length = 0
    expect((await ua.inject({ method: 'POST', url: '/api/app/update' })).json()).toMatchObject({ restarting: true })
    expect(calls).toEqual(['restart'])

    // 쉴 때 다시 시작
    calls.length = 0
    expect((await restart()).json()).toEqual({ restarting: true })
    expect(calls).toEqual(['restart'])

    // 새 커밋으로 켜지면 미리 빌드한 화면을 dist로 바꿔 단다. 다른 커밋이면 그대로 둔다
    fs.mkdirSync(path.join(mac, 'apps/web/dist'), { recursive: true }); fs.writeFileSync(path.join(mac, 'apps/web/dist/index.html'), 'v1')
    expect(promoteNextBuild(mac, running)).toBe(false)
    expect(promoteNextBuild(mac, head)).toBe(true)
    expect(fs.readFileSync(path.join(mac, 'apps/web/dist/index.html'), 'utf8')).toBe('v2')
    expect(fs.existsSync(path.join(mac, 'apps/web/dist-next'))).toBe(false)
    expect(fs.existsSync(path.join(mac, 'apps/web/dist/.commit'))).toBe(false)
    await ua.close()
  })
})

describe('앱 기본정보', () => {
  it('지금 버전과 그 날짜, 받는 곳, 합쳐진 PR 제목을 보이고 피드백 올리기 커밋은 뺀다', async () => {
    const g = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd }).toString().trim()
    const repo = path.join(tmp, 'app-info')
    execFileSync('git', ['init', '-q', '-b', 'main', repo])
    g(repo, 'config', 'user.name', 't'); g(repo, 'config', 'user.email', 't@t')
    g(repo, 'remote', 'add', 'origin', 'git@github.com:me/research-workspace.git')
    for (const s of ['Start', 'Note card states (#141)', 'Add app feedback (2026-10-04)']) {
      fs.writeFileSync(path.join(repo, 'f.txt'), s); g(repo, 'add', '.'); g(repo, 'commit', '-qm', s)
    }
    const running = g(repo, 'rev-parse', 'HEAD')
    const steps = { install: async () => {}, build: async () => {}, restart: () => true, canRestart: () => true }
    const ua = buildApp({ configDir: path.join(tmp, 'config-info'), appRepo: { root: repo, running, steps } })
    const b = (await ua.inject({ method: 'GET', url: '/api/app/info' })).json()
    expect(b.enabled).toBe(true)
    expect(b.info.version.commit).toBe(running.slice(0, 7))
    expect(b.info.version.date).toMatch(/^\d{4}-\d\d-\d\d$/)
    expect(b.info.remote).toBe('https://github.com/me/research-workspace')
    expect(b.info.history.map((h: { title: string; pr?: number; version: string }) => [h.pr, h.version, h.title])).toEqual([[141, '0.1', 'Note card states'], [undefined, '0.0', 'Start']])
    expect(b.info.history[0].time).toMatch(/^\d{4}-\d\d-\d\d \d\d:\d\d$/)
    expect(b.info.version.number).toBe('0.1')
    await ua.close()
  })

  it('버전 번호: 합쳐진 변경마다 뒤 번호가 오르고, 표의 커밋에서 앞 번호가 바뀐다', () => {
    const majors = [{ major: 1, from: 'ccc' }, { major: 2, from: 'fff' }]
    expect(numberVersions(['aaa', 'bbb', 'ccc', 'ddd', 'eee', 'fff', 'ggg'], majors)).toEqual(['0.0', '0.1', '1.0', '1.1', '1.2', '2.0', '2.1'])
    expect(numberVersions(['aaa1234', 'ccc5678'], [{ major: 1, from: 'ccc' }])).toEqual(['0.0', '1.0'])
  })

  it('PR 번호와 내용: squash 제목과 합치기 커밋', () => {
    expect(parseSubject('작업 패널 통일 (#314)')).toEqual({ title: '작업 패널 통일', pr: 314 })
    expect(parseSubject('Merge pull request #288 from me/branch', '\n홈 목록: 머리 글자\n\n자세히')).toEqual({ title: '홈 목록: 머리 글자', pr: 288 })
    expect(parseSubject('Fix docs')).toEqual({ title: 'Fix docs' })
  })
})

describe('빌드 실패 이유', () => {
  it('vite 오류 출력에서 이유 줄을 고른다 (첫 줄은 "building for production"이라 쓸모없다)', () => {
    const stderr = 'vite v6.4.3 building for production...\n✗ Build failed in 2.06s\nerror during build:\nsrc/RegisterDialog.tsx (6:9): "ProjectProfileFields" is not exported by "src/projectProfile.ts"\n    at foo'
    expect(buildReason({ stderr })).toBe('src/RegisterDialog.tsx (6:9): "ProjectProfileFields" is not exported by "src/projectProfile.ts"')
    expect(buildReason({ stderr: 'pnpm: not found' })).toBe('pnpm: not found')
  })
})

describe('공개 이슈 주소 (GitHub에 보내기)', () => {
  it('앱 저장소의 GitHub 원격에서 새 이슈 주소를 만들고, GitHub가 아니면 없다', async () => {
    expect(webRemote('git@github.com:o/r.git')).toBe('https://github.com/o/r')
    const repo = path.join(tmp, 'issues-app')
    fs.mkdirSync(repo, { recursive: true })
    execFileSync('git', ['init', '-q', repo])
    expect(await appIssuesUrl(repo)).toBeNull()
    execFileSync('git', ['-C', repo, 'remote', 'add', 'origin', 'git@github.com:emergence-project/emergence-workbench.git'])
    expect(await appIssuesUrl(repo)).toBe('https://github.com/emergence-project/emergence-workbench/issues/new')
    execFileSync('git', ['-C', repo, 'remote', 'set-url', 'origin', 'https://gitlab.com/o/r.git'])
    expect(await appIssuesUrl(repo)).toBeNull()
  })
})
