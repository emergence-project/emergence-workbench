// 설정 › 계정 › 시작 준비: 커밋 이름 · 이메일, 개인 저장소 주소, 에이전트 연결, TeX
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from './app.js'
import { fixture } from './testkit.js'
import { useGithubFetch } from './personalRepo.js'
import { installState, onPath } from './routes/setup.js'
import { agentRegistered, agentSeen, noteAgentCall } from './agentSeen.js'

const tmp = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'rw-setup-'))
const gitConfig = path.join(tmp, 'gitconfig')
const before = { global: process.env.GIT_CONFIG_GLOBAL, remote: process.env.RW_PERSONAL_REMOTE, backup: process.env.RW_BACKUP_REMOTE }
let app: ReturnType<typeof buildApp>
beforeAll(() => {
  // 이 컴퓨터의 git 설정 대신 임시 파일
  process.env.GIT_CONFIG_GLOBAL = gitConfig
  delete process.env.RW_PERSONAL_REMOTE
  delete process.env.RW_BACKUP_REMOTE
  fs.writeFileSync(gitConfig, '')
  useGithubFetch(async (url) => new Response(JSON.stringify({ private: !url.endsWith('/open') }), { status: url.endsWith('/hidden') ? 404 : 200 }))
  app = buildApp({ configDir: path.join(tmp, 'config') })
})
afterAll(async () => {
  await app.close()
  for (const [k, v] of [['GIT_CONFIG_GLOBAL', before.global], ['RW_PERSONAL_REMOTE', before.remote], ['RW_BACKUP_REMOTE', before.backup]] as const) {
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
  fs.rmSync(tmp, { recursive: true, force: true })
})

describe('시작 준비', () => {
  it('처음에는 커밋 이름 · 개인 저장소 · 에이전트가 비어 있다', async () => {
    const v = (await app.inject({ method: 'GET', url: '/api/setup' })).json()
    expect(v).toMatchObject({ git: { name: '', email: '' }, projects: 0, personal: { remote: null, active: false } })
    expect(v.agents.map((a: { key: string; registered: boolean; at: string | null }) => [a.key, a.registered, a.at])).toEqual([['claude-code', false, null], ['codex', false, null]])
    expect(v.agents[0].command).toMatch(/^claude mcp add --scope user emergence-workbench -- node .*scripts\/mcp\.mjs$/)
    expect(v.agents[1].command).toMatch(/^codex mcp add emergence-workbench -- node .*scripts\/mcp\.mjs$/)
  })
  it('커밋 이름 · 이메일을 git 전역 설정에 쓴다', async () => {
    const bad = await app.inject({ method: 'PUT', url: '/api/setup/git', payload: { name: 'Kim', email: 'no-at' } })
    expect(bad.statusCode).toBe(400)
    const v = (await app.inject({ method: 'PUT', url: '/api/setup/git', payload: { name: '  Kim  Researcher ', email: 'kim@example.com' } })).json()
    expect(v.git).toEqual({ name: 'Kim Researcher', email: 'kim@example.com' })
    expect(fs.readFileSync(gitConfig, 'utf8')).toContain('email = kim@example.com')
  })
  it('개인 저장소는 비공개 GitHub 주소만 받고 설정에 저장한다', async () => {
    expect((await app.inject({ method: 'PUT', url: '/api/setup/personal', payload: { remote: 'not a url' } })).statusCode).toBe(400)
    const open = await app.inject({ method: 'PUT', url: '/api/setup/personal', payload: { remote: 'https://github.com/kim/open' } })
    expect(open.statusCode).toBe(400)
    expect(open.json().error).toMatch(/공개|public/)
    const v = (await app.inject({ method: 'PUT', url: '/api/setup/personal', payload: { remote: 'git@github.com:kim/hidden.git' } })).json()
    expect(v.personal).toEqual({ remote: 'git@github.com:kim/hidden.git', active: false })
    expect(fs.readFileSync(path.join(tmp, 'config/config.yaml'), 'utf8')).toContain('personalRepo: git@github.com:kim/hidden.git')
    const cleared = (await app.inject({ method: 'PUT', url: '/api/setup/personal', payload: { remote: '' } })).json()
    expect(cleared.personal.remote).toBeNull()
  })
  it('MCP 입구가 부르면 그 에이전트 줄에 부른 때가 보인다 (에이전트마다 따로)', async () => {
    await app.inject({ method: 'GET', url: '/api/researches', headers: { 'x-rw-agent': 'codex' } })
    await app.inject({ method: 'GET', url: '/api/researches', headers: { 'x-rw-agent': 'claude-code' } })
    const v = (await app.inject({ method: 'GET', url: '/api/setup' })).json()
    expect(v.agents.every((a: { at: string | null }) => typeof a.at === 'string')).toBe(true)
  })
  it('옛 agent-seen.json(마지막 하나만)도 읽는다', () => {
    const dir = path.join(tmp, 'seen-old')
    fs.mkdirSync(dir)
    fs.writeFileSync(path.join(dir, 'agent-seen.json'), JSON.stringify({ at: '2026-10-21T01:00:00.000Z', name: 'claude-code' }))
    expect(agentSeen(dir)).toEqual({ 'claude-code': '2026-10-21T01:00:00.000Z' })
    noteAgentCall(dir, 'codex', Date.parse('2026-10-21T02:00:00Z'))
    expect(agentSeen(dir)).toEqual({ 'claude-code': '2026-10-21T01:00:00.000Z', codex: '2026-10-21T02:00:00.000Z' })
  })
  it('Claude Code · Codex에 이 앱의 MCP 입구가 등록됐는지 본다 (부름과 따로)', () => {
    const home = path.join(tmp, 'home')
    fs.mkdirSync(path.join(home, '.codex'), { recursive: true })
    expect(agentRegistered(home)).toEqual([])
    fs.writeFileSync(path.join(home, '.claude.json'), JSON.stringify({ mcpServers: { other: { command: 'node', args: ['x.js'] } } }))
    expect(agentRegistered(home)).toEqual([])
    fs.writeFileSync(path.join(home, '.claude.json'), JSON.stringify({ mcpServers: { 'emergence-workbench': { command: 'node', args: ['/a/scripts/mcp.mjs'] } } }))
    expect(agentRegistered(home)).toEqual(['Claude Code'])
    fs.writeFileSync(path.join(home, '.claude.json'), JSON.stringify({ projects: { '/p': { mcpServers: { wb: { command: 'node', args: ['/a/scripts/mcp.mjs'] } } } } }))
    fs.writeFileSync(path.join(home, '.codex', 'config.toml'), '[mcp_servers.emergence-workbench]\ncommand = "node"\n')
    expect(agentRegistered(home)).toEqual(['Claude Code', 'Codex'])
    fs.writeFileSync(path.join(home, '.claude.json'), '{ broken')
    expect(agentRegistered(home)).toEqual(['Codex'])
  })
  it('PATH에서 실행 파일을 찾는다', () => {
    const bin = path.join(tmp, 'bin')
    fs.mkdirSync(bin)
    fs.writeFileSync(path.join(bin, 'latexmk'), '#!/bin/sh\n', { mode: 0o755 })
    expect(onPath('latexmk', `/nowhere${path.delimiter}${bin}`)).toBe(true)
    expect(onPath('latexmk', '/nowhere')).toBe(false)
  })
  it('설치 상태: 앱 아이콘 · Dock · 서비스를 본다 (scripts/install.sh가 하는 일)', async () => {
    const home = path.join(tmp, 'home-install')
    expect(installState(home, '')).toEqual({ app: false, dock: false, service: false })
    fs.mkdirSync(path.join(home, 'Applications', 'Emergence Workbench.app'), { recursive: true })
    fs.mkdirSync(path.join(home, 'Library', 'LaunchAgents'), { recursive: true })
    fs.writeFileSync(path.join(home, 'Library', 'LaunchAgents', 'com.research-workspace.app.plist'), '')
    const dock = '"_CFURLString" = "file:///Users/me/Applications/Emergence%20Workbench.app/";'
    expect(installState(home, dock)).toEqual({ app: true, dock: true, service: true })
    const v = (await app.inject({ method: 'GET', url: '/api/setup' })).json()
    expect(v.install.command).toMatch(/^zsh .*scripts\/install\.sh$/)
  })
  it('다른 컴퓨터의 프로젝트: 개인 저장소 사본의 목록 중 이 컴퓨터에 없는 것을 보이고, GitHub 주소가 아니면 받지 않는다', async () => {
    const personal = path.join(tmp, 'personal-elsewhere')
    fs.mkdirSync(path.join(personal, '_settings/Office-iMac'), { recursive: true })
    fs.writeFileSync(path.join(personal, '_settings/Office-iMac/projects.yaml'), '- id: t\n  title: Topology\n  remote: https://github.com/me/topology.git\n  folder: topology\n  tags: []\n  state: paused\n')
    const a = buildApp({ configDir: path.join(tmp, 'config-elsewhere'), personalDir: personal })
    const v = (await a.inject({ method: 'GET', url: '/api/setup' })).json()
    expect(v.elsewhere).toMatchObject([{ machine: 'Office-iMac', title: 'Topology', remote: 'https://github.com/me/topology.git', folder: 'topology', state: 'paused' }])
    expect(typeof v.cloneDir).toBe('string')
    expect((await a.inject({ method: 'POST', url: '/api/setup/fetch', payload: { remote: '/tmp/x', folder: 'x' } })).statusCode).toBe(400)
    await a.close()
  })
  it('개인 저장소를 gh로 비공개로 만들어 바로 정한다, 이름이 이상하면 거절', async () => {
    const calls: string[][] = []
    const io = { run: async (cmd: string, args: string[]) => { calls.push([cmd, ...args]); return 'https://github.com/me/workbench-private\n' }, getJson: async () => [], exists: () => false }
    useGithubFetch(async () => new Response('{}', { status: 404 }))
    const a = buildApp({ configDir: path.join(tmp, 'config-create'), repoIO: io })
    const v = (await a.inject({ method: 'POST', url: '/api/setup/personal/create', payload: { name: 'workbench-private' } })).json()
    expect(calls[0]).toEqual(['gh', 'repo', 'create', 'workbench-private', '--private', '--add-readme', '--description', expect.any(String)])
    expect(v.personal.remote).toBe('https://github.com/me/workbench-private')
    expect((await a.inject({ method: 'POST', url: '/api/setup/personal/create', payload: { name: '../x' } })).statusCode).toBe(400)
    await a.close()
  })
  it('공용 라이브러리: 다른 컴퓨터가 쓰는 라이브러리와 이름이 같은 받아 둔 폴더를 제안하고, 연결하면 설정에 적는다', async () => {
    const root = path.join(tmp, 'lib-case')
    const personal = path.join(root, 'personal')
    fs.mkdirSync(path.join(personal, '_settings/Office-iMac'), { recursive: true })
    fs.writeFileSync(path.join(personal, '_settings/Office-iMac/config.yaml'), 'library: /Users/other/GitHub/my-library\n')
    const proj = path.join(root, 'proj')
    fs.cpSync(fixture, proj, { recursive: true, filter: (src) => !src.includes('.build') })
    fs.mkdirSync(path.join(proj, '.git'))
    fs.mkdirSync(path.join(root, 'my-library/concepts'), { recursive: true })
    const a = buildApp({ configDir: path.join(root, 'config'), personalDir: personal })
    expect((await a.inject({ method: 'POST', url: '/api/researches', payload: { path: proj } })).statusCode).toBe(200)
    let v = (await a.inject({ method: 'GET', url: '/api/setup' })).json()
    expect(v.library).toEqual({ path: null, suggest: path.join(root, 'my-library') })
    // 라이브러리가 없을 때 개념노트 목록은 오류 대신 빈 목록
    expect((await a.inject({ method: 'GET', url: '/api/concepts/list' })).json()).toEqual({ total: 0, items: [] })
    v = (await a.inject({ method: 'PUT', url: '/api/setup/library', payload: { path: v.library.suggest } })).json()
    expect(v.library).toEqual({ path: fs.realpathSync(path.join(root, 'my-library')), suggest: null })
    expect((await a.inject({ method: 'PUT', url: '/api/setup/library', payload: { path: path.join(root, 'nope') } })).statusCode).toBe(400)
    await a.close()
  })
})
