// 기기의 앱 버전을 업데이트 번호 · 시각 · 앞뒤 수로 읽기
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { deviceBuild, prOf } from './deviceBuild.js'

let tmp = ''
afterEach(() => { if (tmp) fs.rmSync(tmp, { recursive: true, force: true }) })

it('커밋 제목 끝의 (#번호)만 업데이트 번호로 읽는다', () => {
  expect(prOf('새 노트 이름 알리기 (#622)')).toBe(622)
  expect(prOf('Fix (#12) follow-up')).toBeUndefined()
  expect(prOf('no number')).toBeUndefined()
})

it('다른 기기의 커밋이 이 기기보다 몇 개 뒤 · 앞인지와 업데이트 번호를 돌려주고, 모르는 커밋은 null', async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rw-build-'))
  const g = (...a: string[]) => execFileSync('git', ['-C', tmp, '-c', 'user.name=t', '-c', 'user.email=t@example.com', ...a], { encoding: 'utf8' }).trim()
  g('init', '--quiet', '-b', 'main')
  const commit = (msg: string) => { g('commit', '--quiet', '--allow-empty', '-m', msg); return g('rev-parse', 'HEAD') }
  const a = commit('첫 업데이트 (#1)'), b = commit('둘째 (#2)'), c = commit('셋째 (#3)')
  expect(await deviceBuild(tmp, a.slice(0, 7), c)).toMatchObject({ pr: 1, behind: 2, ahead: 0 })
  expect(await deviceBuild(tmp, c.slice(0, 7), b)).toMatchObject({ pr: 3, behind: 0, ahead: 1 })
  expect(await deviceBuild(tmp, c, c)).toMatchObject({ pr: 3, behind: 0, ahead: 0 })
  expect(await deviceBuild(tmp, 'deadbee', c)).toBeNull()
  expect(await deviceBuild(tmp, '--all', c)).toBeNull()
})
