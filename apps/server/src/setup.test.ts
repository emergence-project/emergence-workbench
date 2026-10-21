// 설정 › 계정 › 시작 준비: 커밋 이름 · 이메일, 개인 저장소 주소, 에이전트 연결, TeX
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from './app.js'
import { useGithubFetch } from './personalRepo.js'
import { onPath } from './routes/setup.js'
import { agentRegistered } from './agentSeen.js'

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
    expect(v).toMatchObject({ git: { name: '', email: '' }, projects: 0, personal: { remote: null, active: false }, agent: null })
    expect(v.mcpCommand).toMatch(/^claude mcp add --scope user emergence-workbench -- node .*scripts\/mcp\.mjs$/)
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
  it('MCP 입구가 부르면 에이전트 연결로 보인다', async () => {
    await app.inject({ method: 'GET', url: '/api/researches', headers: { 'x-rw-agent': 'claude-code' } })
    const v = (await app.inject({ method: 'GET', url: '/api/setup' })).json()
    expect(v.agent).toMatchObject({ name: 'claude-code' })
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
})
