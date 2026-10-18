// 설정 › 공통 규칙: 개인 저장소 사본의 rules/research.md를 읽고 고친다. 저장은 확인이라 머리말을 확정 · 오늘로 적고,
// 개인 저장소 사본이면 그 파일만 올린다.
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { buildApp } from './app.js'
import { localDate } from './fsutil.js'
import { readCommonRules, writeCommonRules } from './routes/commonRules.js'

const tmp = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'rw-rules-'))
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }))
const git = (cwd: string, ...args: string[]) => execFileSync('git', ['-C', cwd, '-c', 'user.name=t', '-c', 'user.email=t@t', ...args]).toString().trim()

const RULES = '---\ntitle: 연구 공통 규칙\nstatus: in-review\ncreated: 2026-10-13\nupdated: 2026-10-14\nchecks:\n  flow-new-dot: error\n---\n\n# 연구 공통 규칙\n\n머리 글.\n\n## 시작할 때\n\n1. 먼저 읽는다.\n2. 받는다.\n\n## 말\n\n3. 한국어로 쓴다.\n'

describe('공통 규칙 파일', () => {
  it('머리말을 떼고 상태 · 규칙 수 · 절을 읽는다', () => {
    const r = readCommonRules(RULES)
    expect(r).toMatchObject({ status: 'in-review', updated: '2026-10-14', count: 3, sections: ['시작할 때', '말'] })
    expect(r.body.startsWith('# 연구 공통 규칙')).toBe(true)
  })
  it('저장하면 다른 머리말 칸은 두고 확정 · 오늘을 적는다', () => {
    const out = writeCommonRules(RULES, '# 연구 공통 규칙\n\n## 말\n\n1. 짧게 쓴다.\n', '2026-10-18')
    const r = readCommonRules(out)
    expect(r).toMatchObject({ status: 'accepted', updated: '2026-10-18', count: 1 })
    expect(out).toContain('checks:\n  flow-new-dot: error')
    expect(out).toContain('created: 2026-10-13')
    expect(out).toContain('reviewed-at: 2026-10-18')
  })
  it('파일이 없으면 머리말을 새로 만든다', () => {
    const out = writeCommonRules('', '# 연구 공통 규칙\n\n## 말\n', '2026-10-18')
    expect(out.startsWith('---\ntitle: 연구 공통 규칙\ncreated: 2026-10-18\nstatus: accepted\n')).toBe(true)
  })
})

describe('GET · PUT /api/settings/common-rules', () => {
  it('없으면 빈 상태, 만들면 읽힌다, 그새 바뀌면 409', async () => {
    const app = buildApp({ configDir: path.join(tmp, 'plain') })
    const empty = (await app.inject({ method: 'GET', url: '/api/settings/common-rules' })).json()
    expect(empty).toMatchObject({ exists: false, count: 0, unpublished: false })
    const saved = await app.inject({ method: 'PUT', url: '/api/settings/common-rules', payload: { body: '# 연구 공통 규칙\n\n## 말\n\n1. 짧게.\n', baseHash: empty.hash } })
    expect(saved.statusCode).toBe(200)
    expect(saved.json()).toMatchObject({ view: { exists: true, status: 'accepted', updated: localDate(), count: 1, sections: ['말'] }, published: null })
    const stale = await app.inject({ method: 'PUT', url: '/api/settings/common-rules', payload: { body: 'x', baseHash: empty.hash } })
    expect(stale.statusCode).toBe(409)
    expect((await app.inject({ method: 'PUT', url: '/api/settings/common-rules', payload: { body: '  ', baseHash: saved.json().view.hash } })).statusCode).toBe(400)
    // STATUS와 MCP rules가 읽는 자리와 같다
    expect((await app.inject({ method: 'GET', url: '/api/rules/common' })).json().rules.text).toContain('1. 짧게.')
    await app.close()
  })

  it('개인 저장소 사본이면 그 파일만 커밋해 올린다', async () => {
    const remote = path.join(tmp, 'personal.git')
    execFileSync('git', ['init', '--quiet', '--bare', '-b', 'main', remote])
    const seed = path.join(tmp, 'seed')
    execFileSync('git', ['clone', '--quiet', remote, seed])
    fs.mkdirSync(path.join(seed, 'rules'))
    fs.writeFileSync(path.join(seed, 'rules/research.md'), RULES)
    git(seed, 'add', '.'); git(seed, 'commit', '--quiet', '-m', 'seed'); git(seed, 'push', '--quiet', 'origin', 'HEAD:main')
    const configDir = path.join(tmp, 'mac')
    const personalDir = path.join(configDir, 'personal')
    execFileSync('git', ['clone', '--quiet', remote, personalDir])
    fs.writeFileSync(path.join(personalDir, 'other.md'), '올리지 않을 파일\n')
    const app = buildApp({ configDir, personalDir })
    const v = (await app.inject({ method: 'GET', url: '/api/settings/common-rules' })).json()
    expect(v).toMatchObject({ exists: true, status: 'in-review', count: 3, unpublished: false })
    const r = await app.inject({ method: 'PUT', url: '/api/settings/common-rules', payload: { body: `${v.body}\n4. 더한 규칙.\n`, baseHash: v.hash } })
    expect(r.statusCode).toBe(200)
    expect(r.json()).toMatchObject({ view: { count: 4, status: 'accepted', unpublished: false }, published: { pushed: true } })
    expect(git(remote, 'log', '-1', '--format=%s', 'main')).toBe('Update common research rules')
    expect(git(remote, 'show', 'main:rules/research.md')).toContain('4. 더한 규칙.')
    expect(git(remote, 'ls-tree', '--name-only', 'main')).not.toContain('other.md')
    await app.close()
  })
})
