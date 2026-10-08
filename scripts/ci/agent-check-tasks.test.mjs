import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const run = (...args) => spawnSync('node', ['scripts/agent-check-tasks.mjs', ...args], { cwd: root, encoding: 'utf8' })

test('실제 명령이 작업 파일 오류를 파일·줄로 알리고 파일을 고치지 않는다', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rw-task-check-'))
  try {
    const wb = path.join(tmp, 'workbench')
    fs.mkdirSync(path.join(wb, 'tasks'), { recursive: true })
    fs.writeFileSync(path.join(wb, 'research.yaml'), 'title: 검사\n')
    const file = path.join(wb, 'tasks/2026-10-07-result.md')
    const content = '---\ntitle: 결과\ntask: 대조\nstate: results\n---\n본문\r\n'
    fs.writeFileSync(file, content)
    const result = run(tmp)
    assert.equal(result.status, 1, result.stderr)
    assert.match(result.stderr, /workbench\/tasks\/2026-10-07-result\.md:4/)
    assert.match(result.stderr, /results/)
    assert.equal(fs.readFileSync(file, 'utf8'), content)
    assert.equal(fs.existsSync(path.join(wb, 'STATUS.md')), false)
    const status = spawnSync('node', ['scripts/agent-status.mjs', tmp], { cwd: root, encoding: 'utf8' })
    assert.equal(status.status, 0, status.stderr)
    assert.match(status.stdout, /작업 파일 오류 1/)
    assert.match(status.stdout, /workbench\/tasks\/2026-10-07-result\.md:4/)
    fs.writeFileSync(file, content.replace('results', 'working'))
    assert.equal(run(wb).status, 0)
    fs.writeFileSync(file, content.replace('results', 'proposed'))
    const proposal = run(tmp)
    assert.equal(proposal.status, 1)
    assert.match(proposal.stderr, /proposal/)
  } finally { fs.rmSync(tmp, { recursive: true, force: true }) }
})

test('경로가 없거나 작업대가 아니면 사용법·이유를 알리고 실패한다', () => {
  assert.equal(run().status, 1)
  assert.match(run().stderr, /사용법/)
  assert.equal(run('docs').status, 1)
  assert.match(run('docs').stderr, /research\.yaml 없음/)
})
