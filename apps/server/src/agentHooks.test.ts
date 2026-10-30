// 밖에서 도는 에이전트의 상태 (10/30): 훅 넣기 · 빼기, 받은 알림
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from './app.js'
import { codexInstalled, HOOK_MARK, hookEvent, setClaudeHooks, setCodexNotify, writeHookFiles } from './agentHooks.js'
import { fixture } from './testkit.js'

describe('훅 넣기 · 빼기', () => {
  let home: string
  beforeAll(() => { home = fs.mkdtempSync(path.join(os.tmpdir(), 'rw-hooks-home-')) })
  afterAll(() => fs.rmSync(home, { recursive: true, force: true }))

  it('Claude Code: 앱의 훅만 더하고 빼며, 다른 훅과 설정은 그대로 둔다', () => {
    const file = path.join(home, '.claude', 'settings.json')
    fs.mkdirSync(path.dirname(file), { recursive: true })
    const mine = { model: 'opus', hooks: { Stop: [{ hooks: [{ type: 'command', command: 'say done' }] }] } }
    fs.writeFileSync(file, JSON.stringify(mine))
    setClaudeHooks('/cfg', true, home)
    setClaudeHooks('/cfg', true, home) // 두 번 켜도 한 번만
    const on = JSON.parse(fs.readFileSync(file, 'utf8'))
    expect(on.model).toBe('opus')
    expect(Object.keys(on.hooks).sort()).toEqual(['Notification', 'SessionEnd', 'Stop', 'UserPromptSubmit'])
    expect(on.hooks.Stop).toHaveLength(2)
    expect(on.hooks.Stop[0].hooks[0].command).toBe('say done')
    expect(on.hooks.UserPromptSubmit[0].hooks[0].command).toBe(`sh "/cfg/agent-hooks/${HOOK_MARK}.sh" claude-code`)
    setClaudeHooks('/cfg', false, home)
    expect(JSON.parse(fs.readFileSync(file, 'utf8'))).toEqual(mine)
  })

  it('Claude Code: 깨진 설정 파일은 고치지 않고 오류', () => {
    const file = path.join(home, '.claude', 'settings.json')
    fs.writeFileSync(file, '{ not json')
    expect(() => setClaudeHooks('/cfg', true, home)).toThrow()
    expect(fs.readFileSync(file, 'utf8')).toBe('{ not json')
  })

  it('Codex: notify 한 줄을 맨 위에 넣고 빼며, 다른 notify가 있으면 함께 부르고 끄면 되돌린다', () => {
    const file = path.join(home, '.codex', 'config.toml')
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, 'model = "gpt-5"\n\n[mcp_servers.x]\ncommand = "node"\n')
    expect(setCodexNotify('/cfg', true, home)).toBe(true)
    const text = fs.readFileSync(file, 'utf8')
    expect(text.split('\n')[0]).toBe(`notify = ["sh", "/cfg/agent-hooks/${HOOK_MARK}.sh", "codex"]`)
    expect(codexInstalled(home)).toBe(true)
    expect(setCodexNotify('/cfg', false, home)).toBe(false)
    expect(fs.readFileSync(file, 'utf8')).toBe('model = "gpt-5"\n\n[mcp_servers.x]\ncommand = "node"\n')

    const theirs = 'model = "gpt-5"\nnotify = ["terminal-notifier", "-title", "Codex"]\n\n[x]\na = 1\n'
    fs.writeFileSync(file, theirs)
    expect(codexInstalled(home)).toBe(false)
    expect(setCodexNotify('/cfg', true, home)).toBe(true)
    expect(fs.readFileSync(file, 'utf8')).toBe(`notify = ["sh", "/cfg/agent-hooks/${HOOK_MARK}.sh", "codex", "--", "terminal-notifier", "-title", "Codex"]\nmodel = "gpt-5"\n\n[x]\na = 1\n`)
    expect(setCodexNotify('/cfg', true, home)).toBe(true) // 두 번 켜도 원래 것은 한 번만
    expect(fs.readFileSync(file, 'utf8').match(/terminal-notifier/g)).toHaveLength(1)
    expect(setCodexNotify('/cfg', false, home)).toBe(false)
    expect(fs.readFileSync(file, 'utf8')).toBe('notify = ["terminal-notifier", "-title", "Codex"]\nmodel = "gpt-5"\n\n[x]\na = 1\n')

    fs.writeFileSync(file, "notify = ['terminal-notifier']\n") // 읽지 못하는 모양은 손대지 않는다
    expect(codexInstalled(home)).toBe('busy')
    expect(setCodexNotify('/cfg', true, home)).toBe('busy')
    expect(fs.readFileSync(file, 'utf8')).toBe("notify = ['terminal-notifier']\n")
  })

  it('스크립트: 앱에 알린 뒤 원래 notify를 같은 인자로 부른다 (앱이 꺼져 있어도)', () => {
    const cfg = path.join(home, 'cfg-chain')
    writeHookFiles(cfg, 'http://127.0.0.1:9')
    fs.rmSync(path.join(cfg, 'agent-hooks', 'endpoint.env'))
    const out = path.join(home, 'chain-out')
    const r = spawnSync('sh', [path.join(cfg, 'agent-hooks', `${HOOK_MARK}.sh`), 'codex', '--', 'sh', '-c', 'printf %s "$1" > "$0"', out, '{"type":"agent-turn-complete"}'])
    expect(r.status).toBe(0)
    expect(fs.readFileSync(out, 'utf8')).toBe('{"type":"agent-turn-complete"}')
  })

  it('스크립트는 부를 때마다 주소 파일을 읽고, 실행할 수 있다', () => {
    const cfg = path.join(home, 'cfg')
    writeHookFiles(cfg, 'http://127.0.0.1:5174')
    const script = path.join(cfg, 'agent-hooks', `${HOOK_MARK}.sh`)
    expect(fs.statSync(script).mode & 0o111).toBeTruthy()
    expect(fs.readFileSync(script, 'utf8')).toContain('env="$(dirname "$0")/endpoint.env"')
    expect(fs.readFileSync(path.join(cfg, 'agent-hooks', 'endpoint.env'), 'utf8')).toBe('RW_URL=http://127.0.0.1:5174\n')
  })
})

describe('받은 알림', () => {
  it('Claude Code 이벤트와 Codex 차례 끝을 상태로 읽고, 모르는 것은 버린다', () => {
    expect(hookEvent('claude-code', { hook_event_name: 'UserPromptSubmit', session_id: 's', cwd: '/r' })).toEqual({ agent: 'claude-code', session: 's', cwd: '/r', state: 'working' })
    expect(hookEvent('claude-code', { hook_event_name: 'Notification', session_id: 's', cwd: '/r', message: 'Claude needs your permission to use Bash' })).toMatchObject({ state: 'waiting', note: 'Claude needs your permission to use Bash' })
    expect(hookEvent('claude-code', { hook_event_name: 'Stop', session_id: 's', cwd: '/r' })).toMatchObject({ state: 'done' })
    expect(hookEvent('claude-code', { hook_event_name: 'SessionEnd', session_id: 's' })).toBe('end')
    expect(hookEvent('claude-code', { hook_event_name: 'PreToolUse', session_id: 's' })).toBeNull()
    expect(hookEvent('codex', { type: 'agent-turn-complete', 'thread-id': 't1', cwd: '/r' })).toEqual({ agent: 'codex', session: 't1', cwd: '/r', state: 'done' })
    expect(hookEvent('other', { type: 'x' })).toBeNull()
  })

  it('앱 서버: 프로젝트 안 세션은 프로젝트 이름과 함께, 세션이 닫히면 빠진다', async () => {
    const tmp = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'rw-hooks-'))
    const repo = path.join(tmp, 'sample-research')
    fs.cpSync(fixture, repo, { recursive: true, filter: (src) => !src.includes('.build') })
    fs.mkdirSync(path.join(repo, '.git'))
    const app = buildApp({ configDir: path.join(tmp, 'config'), agentHome: path.join(tmp, 'home') })
    expect((await app.inject({ method: 'POST', url: '/api/researches', payload: { path: repo } })).statusCode).toBe(200)
    const hook = (agent: string, payload: object) => app.inject({ method: 'POST', url: '/api/agent-hooks', headers: { 'x-rw-hook-agent': agent }, payload })
    expect((await hook('claude-code', { hook_event_name: 'UserPromptSubmit', session_id: 'a', cwd: path.join(repo, 'workbench') })).json()).toEqual({ ok: true })
    await hook('claude-code', { hook_event_name: 'Notification', session_id: 'a', cwd: path.join(repo, 'workbench'), message: '허락 필요' })
    await hook('claude-code', { hook_event_name: 'Stop', session_id: 'b', cwd: '/elsewhere' })
    expect((await hook('claude-code', { nonsense: true })).statusCode).toBe(200)
    const view = (await app.inject({ method: 'GET', url: '/api/agent-hooks' })).json()
    expect(view.installed).toEqual({ 'claude-code': false, codex: false })
    expect(view.sessions).toHaveLength(2)
    expect(view.sessions.find((s: { session: string }) => s.session === 'a')).toMatchObject({ rid: 'sample-research', state: 'waiting', note: '허락 필요' })
    expect(view.sessions.find((s: { session: string }) => s.session === 'b')).not.toHaveProperty('rid')
    await hook('claude-code', { hook_event_name: 'SessionEnd', session_id: 'b' })
    expect((await app.inject({ method: 'GET', url: '/api/agent-hooks' })).json().sessions).toHaveLength(1)
    const on = await app.inject({ method: 'POST', url: '/api/agent-hooks/install', payload: { agent: 'claude-code', on: true } })
    expect(on.json().installed['claude-code']).toBe(true)
    expect(fs.existsSync(path.join(tmp, 'home', '.claude', 'settings.json'))).toBe(true)
    await app.close()
    fs.rmSync(tmp, { recursive: true, force: true })
  })
})
