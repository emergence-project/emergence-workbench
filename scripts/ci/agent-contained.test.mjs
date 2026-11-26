// 가둬서 실행하기(scripts/agent-contained.mjs): 실행이 끝난 뒤 프로세스가 남지 않고, 파일이 상한을 넘지 않고, 실행 폴더가 지워지는지 본다.
// 2026-11-26: 시간 한도가 셸만 죽이는 실행기로 생성한 명령을 돌렸다가, 남은 프로세스들이 몇 시간 동안 파일을 키워 디스크가 찼다.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { runContained, strays } from '../agent-contained.mjs'

const script = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../agent-contained.mjs')
const shells = ['/bin/bash', '/bin/zsh'].filter((s) => fs.existsSync(s))
const MB = 1024 * 1024

for (const shell of shells) {
  const sh = path.basename(shell)

  test(`${sh}: 끝난 명령의 결과와 만든 파일을 돌려주고 실행 폴더를 지운다`, async () => {
    const r = await runContained('echo hello; echo x > made.txt; exit 3', { shell })
    assert.equal(r.code, 3)
    assert.equal(r.timedOut, false)
    assert.equal(r.stdout, 'hello\n')
    assert.deepEqual(r.files, { 'made.txt': 2 })
    assert.equal(fs.existsSync(r.dir), false)
    assert.deepEqual(r.leftover, [])
  })

  test(`${sh}: 시간 한도에서 셸이 띄운 프로세스까지 죽인다`, async () => {
    const r = await runContained('yes > f &\nsleep 60', { shell, timeoutMs: 800 })
    assert.equal(r.timedOut, true)
    assert.deepEqual(strays(r.dir), [])
  })

  test(`${sh}: 셸이 먼저 끝나도 뒤로 돌린 프로세스가 남지 않는다`, async () => {
    const r = await runContained('touch f; tail -f f | cat >> g &\necho started', { shell, timeoutMs: 5000 })
    assert.equal(r.timedOut, false)
    assert.equal(r.stdout, 'started\n')
    assert.deepEqual(strays(r.dir), [])
  })

  test(`${sh}: 파일은 상한을 넘지 못한다 (자기 파일을 읽으며 쓰는 꼴 포함)`, async () => {
    const a = await runContained('yes > f', { shell, timeoutMs: 3000, fileMb: 1 })
    assert.ok((a.files.f ?? Infinity) <= MB, `f ${a.files.f}`)
    // 덧붙여 쓰는 프로세스가 겹치면 맥에서는 상한을 조금 넘는다(1MB 상한에서 1.3~1.5MB를 보았다): 끝없이 커지지 않는 것만 본다
    const b = await runContained('echo x > g; cat g >> g & cat g >> g; wait', { shell, timeoutMs: 3000, fileMb: 1 })
    assert.ok((b.files.g ?? Infinity) <= 4 * MB, `g ${b.files.g}`)
    assert.deepEqual(strays(b.dir), [])
  })

  test(`${sh}: 명령이 상한을 다시 올리지 못한다`, async () => {
    const r = await runContained('ulimit -f unlimited 2>/dev/null; yes > f', { shell, timeoutMs: 3000, fileMb: 1 })
    assert.ok((r.files.f ?? Infinity) <= MB, `f ${r.files.f}`)
  })

  test(`${sh}: 묶음을 벗어난 프로세스(setsid)도 찾아 죽인다`, async () => {
    const r = await runContained(`perl -MPOSIX -e 'if (fork == 0) { POSIX::setsid(); sleep 300 }'\necho bg`, { shell, timeoutMs: 5000 })
    assert.equal(r.stdout, 'bg\n')
    assert.deepEqual(r.leftover, [])
    assert.deepEqual(strays(r.dir), [])
  })

  test(`${sh}: 쏟아지는 출력은 잘라서 받는다`, async () => {
    const r = await runContained('yes', { shell, timeoutMs: 3000, maxOutput: 1000 })
    assert.equal(r.stdout.length, 1000)
    assert.deepEqual(strays(r.dir), [])
  })
}

test('bash: 작업 제어(set -m)로 묶음을 벗어난 프로세스도 찾아 죽인다', async () => {
  const r = await runContained('set -m\nsleep 300 &\nsleep 300 &\necho bg', { shell: 'bash', timeoutMs: 5000 })
  assert.equal(r.stdout, 'bg\n')
  assert.deepEqual(strays(r.dir), [])
})

test('남은 공간이 모자라면 돌리지 않는다', async () => {
  await assert.rejects(runContained('echo hi', { minFreeGb: 1e9 }), /남은 공간/)
})

test('명령줄: 작업 목록을 돌려 한 줄에 하나씩 결과를 적고, 남은 프로세스 수를 알린다', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rw-contained-test-'))
  try {
    const jobs = path.join(tmp, 'jobs.json')
    fs.writeFileSync(jobs, JSON.stringify([{ id: 'a', cmd: 'echo MARK' }, { id: 'b', cmd: 'sleep 60 &\nsleep 60', timeoutMs: 500 }, { id: 'c', cmd: 'set -m\nsleep 300 &\necho c' }]))
    const r = spawnSync(process.execPath, [script, '--jobs', jobs], { encoding: 'utf8' })
    assert.equal(r.status, 0, r.stderr)
    const lines = r.stdout.trim().split('\n').map((l) => JSON.parse(l))
    assert.deepEqual(lines.map((l) => [l.id, l.timedOut]), [['a', false], ['b', true], ['c', false]])
    assert.equal(lines[0].stdout, 'MARK\n')
    assert.match(r.stderr, /따로 죽인 프로세스 1개 · 남은 프로세스 0/)
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
})
