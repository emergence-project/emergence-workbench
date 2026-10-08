// node --test scripts/ci/ — pnpm agent:status가 앱 없이 예제 연구의 요약을 뽑고, 아무것도 쓰지 않는지
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const run = (arg) => spawnSync('node', ['scripts/agent-status.mjs', arg], { cwd: root, encoding: 'utf8' })

test('예제 연구의 요약을 보이고 STATUS.md를 쓰지 않는다', () => {
  const r = run('fixtures/sample-research')
  assert.equal(r.status, 0, r.stderr)
  assert.match(r.stdout, /^# STATUS — /)
  assert.match(r.stdout, /## 할 일/)
  assert.equal(fs.existsSync(path.join(root, 'fixtures/sample-research/workbench/STATUS.md')), false)
  const stamp = (s) => s.replace(/자동으로 쓰는 요약이다 \([^)]*\)/, '')
  assert.equal(stamp(run('fixtures/sample-research/workbench').stdout), stamp(r.stdout))
})

test('연구 작업대 폴더가 아니면 알리고 실패한다', () => {
  const r = run('docs')
  assert.equal(r.status, 1)
  assert.match(r.stderr, /research\.yaml 없음/)
})
