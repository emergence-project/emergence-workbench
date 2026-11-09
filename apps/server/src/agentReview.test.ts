// Claude가 쓰고 Codex가 검토 (11/9): 검토 카드 · 저절로 검토 · 검토에 넘기는 글 · 로그인한 계정
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_AGENT_SETTINGS, normalizeAgentSettings, type AgentSettings } from '@rw/core'
import type { ChatItem } from '@rw/core/contract/agentChats'
import { AgentChats, type AgentRunner, type RunEvent } from './agentChats.js'
import { claudeAccount, codexAccount, jwtClaims } from './agentAccounts.js'
import { reviewPrompt } from './agentPrompts.js'

const runner: AgentRunner = async function* (input): AsyncIterable<RunEvent> {
  yield { type: 'session', id: 's1' }
  if (input.prompt.startsWith('fix')) {
    const edit = { project: 'p', file: 'workbench/notes/a/note.md', edits: [{ old: 'R(θ)', new: 'R(-θ)', reason: '부호' }] }
    yield { type: 'tool', tool: 'mcp__workbench__edit_note', input: edit }
    await input.canUseTool('mcp__workbench__edit_note', edit)
  }
  yield { type: 'text', text: '고쳤습니다' }
  yield { type: 'result', ok: true }
}

function setup(review: AgentSettings['review'], ask: (o: { prompt: string; cwd: string }) => Promise<string>) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rw-review-'))
  const settings = { ...DEFAULT_AGENT_SETTINGS, review }
  const chats = new AgentChats({ dir, runner, limit: 2, project: () => ({ repo: dir, title: 'p' }), readable: () => [], extraDirs: () => [], notify: () => {}, settings: () => settings, review: ask })
  return { dir, chats }
}

describe('Codex 검토', () => {
  it('누르면 검토 카드가 붙고, 읽는 동안 또 누르면 막는다', async () => {
    let done: ((v: string) => void) | undefined
    const ask = vi.fn((_o: { prompt: string; cwd: string }) => new Promise<string>((r) => { done = r }))
    const { dir, chats } = setup('off', ask)
    const c = chats.create({ rid: 'p', text: '설명해 줘' })
    await vi.waitFor(() => expect(chats.get(c.id).state).toBe('idle'))
    expect(chats.get(c.id).items.some((i) => i.kind === 'review')).toBe(false) // 끔이면 저절로 붙지 않는다
    chats.review(c.id)
    expect(() => chats.review(c.id)).toThrow(/이미 검토/)
    expect(ask.mock.calls[0]![0].prompt).toContain('First request: 설명해 줘')
    done!('고칠 것: 식 (3.2)의 부호 (note.md 88행)\n볼 것: 각주 번호')
    await vi.waitFor(() => expect(chats.get(c.id).items.at(-1)).toMatchObject({ kind: 'review', by: 'codex', edits: 0, text: expect.stringContaining('고칠 것') }))
    chats.stopAll()
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('저절로 검토: 파일을 고친 차례가 끝날 때만, 실패는 카드의 오류로', async () => {
    const ask = vi.fn(async () => { throw new Error('Codex 로그인이 풀렸습니다') })
    const { dir, chats } = setup('edits', ask)
    const c = chats.create({ rid: 'p', text: 'fix 부호' })
    await vi.waitFor(() => expect(chats.get(c.id).items.at(-1)).toMatchObject({ kind: 'review', auto: true, edits: 1, error: 'Codex 로그인이 풀렸습니다' }))
    expect(ask).toHaveBeenCalledTimes(1)
    chats.send(c.id, { text: '고마워' })
    await vi.waitFor(() => expect(chats.get(c.id).state).toBe('idle'))
    expect(ask).toHaveBeenCalledTimes(1) // 고치지 않은 차례는 건너뛴다
    chats.stopAll()
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('검토에 넘기는 글: 지난 검토 뒤에 고친 곳만, 요청 첫째 · 마지막과 마지막 답', () => {
    const edit = (old: string): ChatItem => ({ kind: 'edit', at: '', file: 'n.md', parts: [{ old, new: `${old}!` }], added: 1, removed: 1 })
    const items: ChatItem[] = [
      { kind: 'user', at: '', text: '첫 요청' }, edit('a'), { kind: 'text', at: '', text: '답 1' },
      { kind: 'review', at: '', by: 'codex', edits: 1, text: '고칠 것 없음' },
      { kind: 'user', at: '', text: '둘째 요청' }, edit('b'), { kind: 'text', at: '', text: '답 2' },
    ]
    const { prompt, edits } = reviewPrompt({ title: 'T', items })
    expect(edits).toBe(1)
    expect(prompt).toContain('+ b!')
    expect(prompt).not.toContain('+ a!')
    expect(prompt).toContain('Latest request: 둘째 요청')
    expect(prompt).toContain("Claude's latest answer: 답 2")
  })
})

describe('에이전트마다 설정', () => {
  it('계획 모드는 Claude만, 검토는 Codex만, auto: null은 기본값으로', () => {
    const s = normalizeAgentSettings({ per: { codex: { trust: 'plan', role: 'review', auto: { read: true, run: true, web: false } }, gemini: { role: 'review' }, 'claude-code': { role: 'review', trust: 'plan' } }, review: 'edits' })
    expect(s.per.codex).toEqual({ trust: 'ask', role: 'review', auto: { read: true, run: true, web: false } })
    expect(s.per.gemini.role).toBe('write')
    expect(s.per['claude-code']).toEqual({ trust: 'plan', role: 'write' })
    expect(s.review).toBe('edits')
    expect(normalizeAgentSettings({ per: { codex: { auto: null } } }, s).per.codex).toEqual({ trust: 'ask', role: 'review' })
    expect(normalizeAgentSettings({ review: 'x' }, s).review).toBe('edits')
  })
})

describe('로그인한 계정', () => {
  it('Claude는 .claude.json과 자격 파일에서, Codex는 id_token에서 이메일과 요금제만', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'rw-acct-'))
    const saved = { c: process.env.CLAUDE_CONFIG_DIR, x: process.env.CODEX_HOME }
    delete process.env.CLAUDE_CONFIG_DIR; delete process.env.CODEX_HOME
    expect(claudeAccount(home)).toEqual({})
    expect(codexAccount(home)).toEqual({})
    fs.writeFileSync(path.join(home, '.claude.json'), JSON.stringify({ oauthAccount: { emailAddress: 'me@example.com' } }))
    fs.mkdirSync(path.join(home, '.claude'))
    fs.writeFileSync(path.join(home, '.claude', '.credentials.json'), JSON.stringify({ claudeAiOauth: { subscriptionType: 'max', accessToken: 'secret' } }))
    expect(claudeAccount(home)).toEqual({ email: 'me@example.com', plan: 'Max' })
    const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url')
    const token = `${b64({ alg: 'none' })}.${b64({ email: 'other@example.com', 'https://api.openai.com/auth': { chatgpt_plan_type: 'plus' } })}.sig`
    fs.mkdirSync(path.join(home, '.codex'))
    fs.writeFileSync(path.join(home, '.codex', 'auth.json'), JSON.stringify({ tokens: { id_token: token } }))
    expect(codexAccount(home)).toEqual({ email: 'other@example.com', plan: 'Plus' })
    expect(jwtClaims('not-a-jwt')).toEqual({})
    if (saved.c !== undefined) process.env.CLAUDE_CONFIG_DIR = saved.c
    if (saved.x !== undefined) process.env.CODEX_HOME = saved.x
    fs.rmSync(home, { recursive: true, force: true })
  })
})
