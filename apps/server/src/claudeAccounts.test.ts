// Claude 계정 여럿 (11/16 "pro 계정을 주로 답변용으로" · "로그인 정보를 담아두고 쉽게 전환"): 계정 폴더 · 대화 종류마다 계정 · 대화마다 바꾸기
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { accountEnv, accountForNew, ClaudeAccounts, loginUrl, moveCodexSession, moveSession, switchAccount } from './claudeAccounts.js'

let tmp = ''
const make = () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rw-acct-'))
  // claude 대신 아무것도 하지 않고 끝나는 명령 (로그인 · 로그아웃을 띄우기만)
  return new ClaudeAccounts(path.join(tmp, 'config'), { cli: () => '/bin/true', home: path.join(tmp, 'home') })
}
afterEach(() => { if (tmp) fs.rmSync(tmp, { recursive: true, force: true }) })

describe('Claude 계정', () => {
  it('처음 더한 계정은 중앙 · 피드백에 쓰고, 계정 폴더를 CLAUDE_CONFIG_DIR로 준다', () => {
    const a = make()
    expect(a.state().accounts.map((x) => x.id)).toEqual(['default'])
    const s = a.add('Pro')
    const id = s.accounts[1]!.id
    expect(id).toMatch(/^a[0-9a-f]{6}$/)
    expect(s.roles).toEqual({ central: id, feedback: id, app: 'default', project: 'default' })
    expect(s.base).toBe('default')
    expect(a.env(id)).toEqual({ CLAUDE_CONFIG_DIR: path.join(tmp, 'config', 'claude-accounts', id) })
    expect(a.env('default')).toEqual({})
    expect(a.env('a000000')).toEqual({})
    // 로그인한 계정 폴더의 이메일 · 요금제를 읽는다
    const dir = a.dirOf(id)!
    fs.writeFileSync(path.join(dir, '.claude.json'), JSON.stringify({ oauthAccount: { emailAddress: 'p@example.com' } }))
    expect(a.state().accounts[1]).toMatchObject({ name: 'Pro', email: 'p@example.com', login: true })
  })

  it('대화 종류마다 계정: 고른 것, 없으면 종류의 계정, Claude가 아니면 없음', () => {
    const a = make()
    const id = a.add('Pro').accounts[1]!.id
    a.setRole('app', id)
    const base = { rid: 'r', agent: 'claude-code', app: false, central: false }
    expect(accountForNew({ claude: a }, { ...base, central: true })).toBe(id)
    expect(accountForNew({ claude: a }, { ...base, feedback: 'k' })).toBe(id)
    expect(accountForNew({ claude: a }, { ...base, app: true })).toBe(id)
    expect(accountForNew({ claude: a }, base)).toBeUndefined()
    expect(accountForNew({ claude: a }, { ...base, agent: 'codex', central: true })).toBeUndefined()
    a.setRole('central', 'default')
    expect(accountForNew({ claude: a }, { ...base, central: true })).toBeUndefined()
    expect(() => a.setRole('central', 'a123456')).toThrow()
  })

  it('기본 계정: 고르지 않은 종류가 따르고, 이 컴퓨터를 고른 종류 · 대화는 이 컴퓨터 폴더로 못 박는다', () => {
    const a = make()
    const id = a.add('Pro').accounts[1]!.id
    a.setRole('app', 'default')
    const s = a.setRole('base', id)
    expect(s.base).toBe(id)
    expect(s.roles).toEqual({ central: id, feedback: id, app: 'default', project: id })
    expect(a.env(undefined)).toEqual({ CLAUDE_CONFIG_DIR: path.join(tmp, 'home', '.claude') })
    expect(a.remove(id).base).toBe('default')
    expect(a.env(undefined)).toEqual({})
  })

  it('계정을 빼면 폴더를 지우고 그 계정을 쓰던 종류는 기본으로', () => {
    const a = make()
    const id = a.add('Pro').accounts[1]!.id
    const dir = a.dirOf(id)!
    const s = a.remove(id)
    expect(s.accounts.map((x) => x.id)).toEqual(['default'])
    expect(s.roles).toEqual({ central: 'default', feedback: 'default', app: 'default', project: 'default' })
    expect(fs.existsSync(dir)).toBe(false)
    expect(() => a.remove('default')).toThrow()
  })

  it('대화의 계정을 바꾸면 세션 파일을 옮겨 잇고, 일하는 중에는 막는다', () => {
    const a = make()
    const id = a.add('Pro').accounts[1]!.id
    const from = path.join(tmp, 'home', '.claude', 'projects', '-w-app')
    fs.mkdirSync(from, { recursive: true })
    fs.writeFileSync(path.join(from, 's1.jsonl'), '{}\n')
    const c: { account?: string; sessionId?: string; agent: string; state: string } = { sessionId: 's1', agent: 'claude-code', state: 'idle' }
    switchAccount(c, id, { claude: a })
    expect(c).toMatchObject({ account: id, sessionId: 's1' })
    expect(fs.existsSync(path.join(a.dirOf(id)!, 'projects', '-w-app', 's1.jsonl'))).toBe(true)
    expect(() => switchAccount({ ...c, state: 'running' }, 'default', { claude: a })).toThrow(/일하는 중/)
    // 세션 파일이 없으면 새 세션으로
    const d = { sessionId: 'nope', agent: 'claude-code', state: 'idle', account: id }
    switchAccount(d, 'default', { claude: a })
    expect(d).toEqual({ agent: 'claude-code', state: 'idle' })
    expect(() => switchAccount({ agent: 'codex', state: 'idle' }, id, { claude: a })).toThrow()
  })

  it('로그인 출력에서 주소를 찾는다', () => {
    expect(loginUrl('Opening browser…\nhttps://claude.ai/oauth/authorize?code=true&x=1\nPaste code here if prompted >')).toBe('https://claude.ai/oauth/authorize?code=true&x=1')
    expect(loginUrl('nothing')).toBeUndefined()
    expect(moveSession('/nope', '/nope2', 'x')).toBe(false)
  })
})

describe('Codex 계정 (11/20 시안 4절)', () => {
  const makeCodex = () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rw-acct-'))
    return new ClaudeAccounts(path.join(tmp, 'config'), { cli: () => '/bin/true', home: path.join(tmp, 'home'), kind: 'codex' })
  }
  const jwt = (claims: object) => `x.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.y`

  it('계정 폴더를 CODEX_HOME으로 주고, 이 컴퓨터 설정(config.toml)을 복사하며, auth.json에서 이메일 · 한도를 읽는다', () => {
    const a = makeCodex()
    fs.mkdirSync(path.join(tmp, 'home', '.codex'), { recursive: true })
    fs.writeFileSync(path.join(tmp, 'home', '.codex', 'config.toml'), 'model = "gpt-x"\n')
    const s = a.add('Plus')
    expect(s.kind).toBe('codex')
    const id = s.accounts[1]!.id
    const dir = a.dirOf(id)!
    expect(dir).toBe(path.join(tmp, 'config', 'codex-accounts', id))
    expect(a.env(id)).toEqual({ CODEX_HOME: dir })
    expect(fs.readFileSync(path.join(dir, 'config.toml'), 'utf8')).toContain('gpt-x')
    expect(fs.existsSync(path.join(dir, 'auth.json'))).toBe(false)
    fs.writeFileSync(path.join(dir, 'auth.json'), JSON.stringify({ tokens: { id_token: jwt({ email: 'c@example.com', 'https://api.openai.com/auth': { chatgpt_plan_type: 'plus' } }) } }))
    const day = path.join(dir, 'sessions', '2026', '11', '20')
    fs.mkdirSync(day, { recursive: true })
    const later = Math.floor(Date.now() / 1000) + 3600
    fs.writeFileSync(path.join(day, 'rollout-2026-11-20T01-00-00-s9.jsonl'), `${JSON.stringify({ timestamp: new Date().toISOString(), type: 'event_msg', payload: { type: 'token_count', rate_limits: { primary: { used_percent: 12.5, window_minutes: 300, resets_at: later }, secondary: { used_percent: 81, window_minutes: 10080, resets_at: later } } } })}\n`)
    expect(a.state().accounts[1]).toMatchObject({ email: 'c@example.com', plan: 'Plus', login: true, limits: { five: { used: 12.5 }, week: { used: 81 } } })
    // Codex 대화는 Codex 계정으로, 환경은 CODEX_HOME
    const book = { codex: a }
    a.setRole('project', id)
    expect(accountForNew(book, { rid: 'r', agent: 'codex', app: false, central: false })).toBe(id)
    expect(accountForNew(book, { rid: 'r', agent: 'claude-code', app: false, central: false })).toBeUndefined()
    expect(accountEnv(book, { agent: 'codex', account: id })).toEqual({ CODEX_HOME: dir })
    // 대화를 옮기면 rollout 파일을 같은 자리로
    const c: { account?: string; sessionId?: string; agent: string; state: string } = { agent: 'codex', state: 'idle', account: id, sessionId: 's9' }
    switchAccount(c, 'default', book)
    expect(c).toEqual({ agent: 'codex', state: 'idle', sessionId: 's9' })
    expect(fs.existsSync(path.join(tmp, 'home', '.codex', 'sessions', '2026', '11', '20', 'rollout-2026-11-20T01-00-00-s9.jsonl'))).toBe(true)
    expect(moveCodexSession(dir, path.join(tmp, 'x'), 'nope')).toBe(false)
  })
})
