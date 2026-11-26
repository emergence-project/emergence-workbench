// 테스트 실행마다 전용 임시 폴더(scripts/ci/test-tmp.mjs): 끝나면 통째로 지우고, 죽은 실행이 남긴 폴더는 다음 실행이 치운다.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, test } from 'node:test'
import { startRunTmp, sweepStale } from './test-tmp.mjs'

/** @type {string} */
let base
/** @type {string | undefined} */
let before
beforeEach(() => {
  before = process.env.TMPDIR
  base = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'rw-testtmp-test-'))
})
afterEach(() => {
  if (before === undefined) delete process.env.TMPDIR
  else process.env.TMPDIR = before
  fs.rmSync(base, { recursive: true, force: true })
})

/** 이미 끝난 프로세스의 번호 */
const deadPid = () => /** @type {number} */ (spawnSync(process.execPath, ['-e', '0']).pid)
/** @param {string} name @param {number | null} pid @param {number} [ageHours] */
function leftBehind(name, pid, ageHours = 0) {
  const dir = path.join(base, name)
  fs.mkdirSync(path.join(dir, 'rw-test-abc'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'rw-test-abc', 'big.bin'), 'x')
  if (pid !== null) fs.writeFileSync(path.join(dir, '.pid'), String(pid))
  const t = new Date(Date.now() - ageHours * 3600_000)
  fs.utimesSync(dir, t, t)
  return dir
}

test('실행 폴더를 만들어 임시 폴더로 삼고, 끝나면 통째로 지우고 되돌린다', () => {
  const run = startRunTmp(base)
  assert.equal(path.dirname(run.dir), base)
  assert.match(path.basename(run.dir), /^rw-testrun-/)
  assert.equal(os.tmpdir(), run.dir)
  const made = fs.mkdtempSync(path.join(os.tmpdir(), 'rw-test-'))
  fs.writeFileSync(path.join(made, 'left.txt'), 'x') // 테스트가 지우지 않고 남긴 것
  run.stop()
  assert.equal(fs.existsSync(run.dir), false)
  assert.equal(process.env.TMPDIR, before)
})

test('죽은 실행이 남긴 폴더는 치우고, 도는 실행의 폴더는 둔다', () => {
  const dead = leftBehind('rw-testrun-dead00', deadPid())
  const live = leftBehind('rw-testrun-live00', process.pid)
  const other = leftBehind('rw-other-thing', deadPid())
  assert.deepEqual(sweepStale(base), ['rw-testrun-dead00'])
  assert.equal(fs.existsSync(dead), false)
  assert.equal(fs.existsSync(live), true)
  assert.equal(fs.existsSync(other), true)
})

test('번호를 적기 전에 죽은 실행의 폴더는 한 시간이 지나면 치운다', () => {
  const fresh = leftBehind('rw-testrun-fresh0', null)
  const old = leftBehind('rw-testrun-old000', null, 2)
  assert.deepEqual(sweepStale(base), ['rw-testrun-old000'])
  assert.equal(fs.existsSync(fresh), true)
  assert.equal(fs.existsSync(old), false)
})

test('새 실행을 시작할 때 죽은 실행의 폴더를 치운다', () => {
  const dead = leftBehind('rw-testrun-dead01', deadPid())
  const run = startRunTmp(base)
  assert.equal(fs.existsSync(dead), false)
  assert.equal(fs.readFileSync(path.join(run.dir, '.pid'), 'utf8'), String(process.pid))
  run.stop()
})

test('프로세스가 stop 없이 끝나도(process.exit) 자기 폴더를 지운다', () => {
  const code = `import { startRunTmp } from ${JSON.stringify(new URL('./test-tmp.mjs', import.meta.url).href)}; const r = startRunTmp(${JSON.stringify(base)}); console.log(r.dir); process.exit(3)`
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', code], { encoding: 'utf8' })
  assert.equal(r.status, 3, r.stderr)
  const dir = r.stdout.trim()
  assert.match(path.basename(dir), /^rw-testrun-/)
  assert.equal(fs.existsSync(dir), false)
})
