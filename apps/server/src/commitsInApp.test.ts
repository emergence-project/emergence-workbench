import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { commitChecker } from './commitsInApp.js'

describe('반영 커밋이 앱에 들어 있는가', () => {
  it('돌고 있는 커밋의 조상이면 true, 저장소에만 있으면 false, 모르는 커밋은 undefined', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rw-inapp-'))
    const env = { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' }
    const g = (...args: string[]) => execFileSync('git', args, { cwd: dir, env }).toString().trim()
    g('init', '-q', '-b', 'main')
    g('commit', '-q', '--allow-empty', '-m', 'a'); const a = g('rev-parse', 'HEAD')
    g('commit', '-q', '--allow-empty', '-m', 'b'); const b = g('rev-parse', 'HEAD')
    g('commit', '-q', '--allow-empty', '-m', 'c'); const c = g('rev-parse', 'HEAD')
    const check = commitChecker(dir, b)
    expect(await check(a.slice(0, 7))).toBe(true)
    expect(await check(`${a.slice(0, 7)}, ${b.slice(0, 7)}`)).toBe(true)
    expect(await check(c.slice(0, 7))).toBe(false)
    expect(await check(`${a.slice(0, 7)}, ${c.slice(0, 7)}`)).toBe(false)
    expect(await check('deadbee')).toBeUndefined()
    expect(await check('#59')).toBeUndefined()
    fs.rmSync(dir, { recursive: true, force: true })
  })
})
