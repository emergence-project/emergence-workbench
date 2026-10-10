// pnpm agent:check의 인자·종료 값. 형식 사례와 읽기 전용 검사는 서버 테스트에서 확인한다.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const run = (...args) => spawnSync('node', ['scripts/agent-check.mjs', ...args], { cwd: root, encoding: 'utf8' })

test('저장소·workbench 인자와 오류·경고 종료 값', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rw-agent-check-'))
  try {
    const wb = path.join(dir, 'workbench')
    fs.mkdirSync(wb)
    fs.writeFileSync(path.join(wb, 'research.yaml'), 'title: 연구\nunknown: value\n')
    for (const arg of [dir, wb]) {
      const r = run(arg)
      assert.equal(r.status, 0, r.stderr)
      assert.match(r.stdout, /검사한 파일 1 · 오류 0 · 경고 1/)
      assert.match(r.stderr, /경고 workbench\/research.yaml:2 — 모르는 research.yaml 키: unknown/)
    }
    fs.writeFileSync(path.join(wb, 'research.yaml'), 'title: [\n')
    const r = run(dir)
    assert.equal(r.status, 1)
    assert.match(r.stderr, /오류 workbench\/research.yaml:2 — /)
    assert.match(r.stdout, /검사한 파일 1 · 오류 1 · 경고 0/)
  } finally { fs.rmSync(dir, { recursive: true, force: true }) }
})

test('인자나 research.yaml이 없으면 종료 값 1', () => {
  assert.equal(run().status, 1)
  const r = run('docs')
  assert.equal(r.status, 1)
  assert.match(r.stderr, /research.yaml 없음/)
})
