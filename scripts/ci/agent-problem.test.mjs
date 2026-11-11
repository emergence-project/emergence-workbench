import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const run = (...args) => spawnSync('node', ['scripts/agent-problem.mjs', ...args], { cwd: root, encoding: 'utf8' })

/** 예제의 흐름 넷(진행 둘 · 쓰는 중 · 제안)을 임시 폴더에 */
function sample() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rw-agent-problem-'))
  fs.mkdirSync(path.join(tmp, 'workbench'))
  fs.writeFileSync(path.join(tmp, 'workbench/research.yaml'), 'title: 검사\n')
  fs.cpSync(path.join(root, 'fixtures/sandbox-extra/workbench/problems'), path.join(tmp, 'workbench/problems'), { recursive: true })
  return tmp
}

test('서버 없이 흐름을 읽고, 다음 후보를 시작해 보고하고, 다른 에이전트가 판정한다', () => {
  const tmp = sample()
  try {
    const list = run(tmp)
    assert.equal(list.status, 0, list.stderr)
    assert.match(list.stdout, /kempe-degree-five · 진행 — .* · 시도 3\/6 · .* · 다음 B2/)
    assert.match(list.stdout, /greedy-five-colors · 진행 — .* · 멈춤\(decision\)/)
    assert.match(run(tmp, 'brief', 'kempe-degree-five').stdout, /폐기 사유[\s\S]*다음: B2/)

    const start = run(tmp, 'start', 'kempe-degree-five')
    assert.equal(start.status, 0, start.stderr)
    assert.match(start.stdout, /시작했습니다: B2 .*\(claude\).*시도 4\/6/)
    const file = path.join(tmp, 'workbench/problems/kempe-degree-five/b2.yaml')
    assert.match(fs.readFileSync(file, 'utf8'), /state: active\n[\s\S]*worker: claude\n/)
    assert.equal(run(tmp, 'report', 'kempe-degree-five', 'B2', '--did', '적었다', '--result', '같은 틀로 된다', '--file', 'workbench/notes/kempe-recoloring/note.md', '--command', 'python code/cases.py', '--commit', 'abc1234', '--test', 'python code/cases.py --self-test').status, 0)
    assert.match(fs.readFileSync(file, 'utf8'), /run:\n  command: python code\/cases\.py\n  commit: abc1234\ntest: python code\/cases\.py --self-test\n/)

    const self = run(tmp, 'verdict', 'kempe-degree-five', 'b2', 'holds', '--note', '다시 읽었다', '--check', '다른 그림')
    assert.equal(self.status, 1)
    assert.match(self.stderr, /작업한 쪽은 판정하지 않습니다/)
    const bare = run(tmp, 'verdict', 'kempe-degree-five', 'b2', 'holds', '--note', '다시 읽었다', '--by', 'codex')
    assert.equal(bare.status, 1)
    assert.match(bare.stderr, /교차 검증/)
    // 검사 명령이 있는 시도: 다시 돌린 결과(--tested pass)가 있어야 성립이고, 성립이면 파일 지문이 남는다
    const untested = run(tmp, 'verdict', 'kempe-degree-five', 'b2', 'holds', '--note', '다시 읽었다', '--check', '다른 그림', '--by', 'codex')
    assert.equal(untested.status, 1)
    assert.match(untested.stderr, /검사 명령이 있습니다/)
    const ok = run(tmp, 'verdict', 'kempe-degree-five', 'b2', 'holds', '--note', '다시 읽었다', '--check', '다른 그림', '--tested', 'pass', '--by', 'codex')
    assert.equal(ok.status, 0, ok.stderr)
    assert.match(fs.readFileSync(file, 'utf8'), /state: holds\n[\s\S]*by: codex\n[\s\S]*tested: pass\n  files:\n    workbench\/notes\/kempe-recoloring\/note\.md: /)
  } finally { fs.rmSync(tmp, { recursive: true, force: true }) }
})

test('사용자의 일은 하지 못한다: 시작 전 흐름 · 결정을 기다리는 흐름에서는 거절하고, 새 흐름은 출처가 있는 제안만', () => {
  const tmp = sample()
  try {
    const waiting = run(tmp, 'start', 'greedy-five-colors')
    assert.equal(waiting.status, 1)
    assert.match(waiting.stderr, /사용자의 결정을 기다립니다/)
    const draft = run(tmp, 'add', 'torus-seven-colors', '해 본다')
    assert.equal(draft.status, 1)
    assert.match(draft.stderr, /사용자가 시작한 흐름에서만 일합니다/)
    assert.equal(run(tmp, 'prepare', 'torus-seven-colors', '--literature', 'heawood1890: 토러스의 상한을 보였다', '--first-test', 'K7을 넣어 본다').status, 0)
    assert.match(fs.readFileSync(path.join(tmp, 'workbench/problems/torus-seven-colors/problem.yaml'), 'utf8'), /state: draft\n[\s\S]*ref: heawood1890\n[\s\S]*by: claude\n[\s\S]*first_test: K7을 넣어 본다/)

    const noSource = run(tmp, 'propose', 'Is six enough?')
    assert.equal(noSource.status, 1)
    assert.match(noSource.stderr, /--source/)
    const proposed = run(tmp, 'propose', 'Is six enough?', '--source', '시도 A')
    assert.equal(proposed.status, 0, proposed.stderr)
    assert.match(fs.readFileSync(path.join(tmp, 'workbench/problems/is-six-enough/problem.yaml'), 'utf8'), /state: proposed\nby: claude\n/)

    const asUser = run(tmp, 'start', 'kempe-degree-five', '--by', 'user')
    assert.equal(asUser.status, 1)
    assert.match(asUser.stderr, /에이전트 이름/)
    assert.equal(run(tmp, 'open', 'torus-seven-colors').status, 1)
    assert.equal(run(os.tmpdir()).status, 1)
  } finally { fs.rmSync(tmp, { recursive: true, force: true }) }
})
