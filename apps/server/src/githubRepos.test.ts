import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildApp } from './app.js'
import { fromApi, fromGh, listGitHubRepos, tokenFrom, type RepoIO } from './githubRepos.js'

const TOKEN = 'gho_' + 'x'.repeat(36)

/** 가짜 바깥: gh·git 명령과 GitHub API를 기록하며 정해진 답을 준다 */
function fakeIO({ gh, credential, origins = {}, pages = [], existing = [] }: {
  gh?: unknown; credential?: string; origins?: Record<string, string>; pages?: unknown[][]; existing?: string[]
}) {
  const calls: string[] = []
  const tokens: string[] = []
  const io: RepoIO = {
    run: async (cmd, args, input) => {
      calls.push(`${cmd} ${args.join(' ')}`)
      if (cmd === 'gh') { if (gh === undefined) throw new Error('gh: not logged in'); return JSON.stringify(gh) }
      if (args[0] === 'credential') {
        expect(input).toContain('host=github.com')
        if (!credential) throw new Error('no credential')
        return credential
      }
      if (args[0] === '-C' && args[2] === 'remote') {
        const o = origins[args[1]!]
        if (!o) throw new Error('no origin')
        return `${o}\n`
      }
      throw new Error(`unexpected ${cmd}`)
    },
    getJson: async (url, token) => {
      tokens.push(token)
      const page = Number(new URL(url).searchParams.get('page'))
      return pages[page - 1] ?? []
    },
    exists: (p) => existing.includes(p) || (p.endsWith('/.git') && p.slice(0, -5) in origins),
  }
  return { io, calls, tokens }
}

const ghRow = (owner: string, name: string, updatedAt: string, isPrivate = false) => ({ name, owner: { login: owner }, isPrivate, description: `${name} desc`, updatedAt, url: `https://github.com/${owner}/${name}` })
const apiRow = (owner: string, name: string, pushed: string) => ({ name, owner: { login: owner }, private: true, description: null, pushed_at: pushed, updated_at: '2000-01-01T00:00:00Z' })

describe('parsing', () => {
  it('reads gh and API rows, skipping broken ones', () => {
    expect(fromGh([ghRow('me', 'a', '2026-01-01', true), { name: 'x' }, null])).toEqual([
      { owner: 'me', name: 'a', url: 'https://github.com/me/a', private: true, description: 'a desc', updatedAt: '2026-01-01' },
    ])
    expect(fromApi([apiRow('me', 'b', '2026-02-02'), 'junk'])).toEqual([
      { owner: 'me', name: 'b', url: 'https://github.com/me/b', private: true, description: '', updatedAt: '2026-02-02' },
    ])
    expect(fromGh({})).toEqual([])
  })
  it('reads only the password line of git credential fill', () => {
    expect(tokenFrom(`protocol=https\nhost=github.com\nusername=me\npassword=${TOKEN}\n`)).toBe(TOKEN)
    expect(tokenFrom('protocol=https\nhost=github.com\n')).toBeNull()
  })
})

describe('listGitHubRepos', () => {
  const registered = [{ id: 'reg-a', path: '/r/alpha' }, { id: 'reg-b', path: '/r/beta-local' }]

  it('uses gh first, marks registered (by origin, else folder name) and existing folders, newest first', async () => {
    const { io, calls } = fakeIO({
      gh: [ghRow('me', 'old', '2025-01-01'), ghRow('Me', 'Alpha', '2026-03-01', true), ghRow('lab', 'beta-local', '2026-02-01'), ghRow('me', 'here', '2026-01-15')],
      origins: { '/r/alpha': 'git@github.com:me/alpha.git' },
      existing: ['/clone/here'],
    })
    const got = await listGitHubRepos(io, registered, '/clone')
    expect(got.ok).toBe(true)
    if (!got.ok) return
    expect(got.source).toBe('gh')
    expect(got.repos.map((r) => [r.name, r.registeredId ?? r.localPath ?? null])).toEqual([
      ['Alpha', 'reg-a'], ['beta-local', 'reg-b'], ['here', '/clone/here'], ['old', null],
    ])
    expect(calls.some((c) => c.startsWith('git credential'))).toBe(false)
  })

  it('falls back to the git login and pages the API, never returning the token', async () => {
    const page1 = Array.from({ length: 100 }, (_, i) => apiRow('me', `r${i}`, `2026-01-${String((i % 28) + 1).padStart(2, '0')}`))
    const { io, tokens } = fakeIO({ credential: `protocol=https\nhost=github.com\nusername=me\npassword=${TOKEN}\n`, pages: [page1, [apiRow('me', 'last', '2026-05-01')]] })
    const got = await listGitHubRepos(io, [], '/clone')
    expect(got.ok && got.source).toBe('git')
    expect(got.ok && got.repos.length).toBe(101)
    expect(got.ok && got.repos[0]!.name).toBe('last')
    expect(tokens).toEqual([TOKEN, TOKEN])
    expect(JSON.stringify(got)).not.toContain(TOKEN)
  })

  it('gives a plain reason when no login is found', async () => {
    const got = await listGitHubRepos(fakeIO({}).io, [], '/clone')
    expect(got).toEqual({ ok: false, reason: expect.stringContaining('로그인') })
  })

  it('serves the sample list in sandbox mode without calling gh', async () => {
    const { io, calls } = fakeIO({})
    const got = await listGitHubRepos(io, [{ id: 's', path: '/x/sample-research' }], '/clone', true)
    expect(got.ok && got.source).toBe('sample')
    expect(got.ok && got.repos.find((r) => r.name === 'sample-research')?.registeredId).toBe('s')
    expect(calls.some((c) => c.startsWith('gh'))).toBe(false)
  })
})

describe('GET /api/researches/github-repos', () => {
  it('returns the list with the default clone folder', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rw-repos-'))
    const app = buildApp({ configDir: path.join(tmp, 'config'), repoIO: fakeIO({ gh: [ghRow('me', 'a', '2026-01-01')] }).io })
    try {
      const res = await app.inject({ method: 'GET', url: '/api/researches/github-repos' })
      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body).toMatchObject({ ok: true, source: 'gh', parent: path.join(os.homedir(), 'GitHub') })
      expect(body.repos[0].name).toBe('a')
    } finally {
      await app.close()
      fs.rmSync(tmp, { recursive: true, force: true })
    }
  })
})
