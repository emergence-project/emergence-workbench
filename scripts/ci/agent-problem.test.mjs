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

test('서버 없이 흐름을 읽고, 주장을 세우고, 다음 후보를 시작해 보고하고, 다른 에이전트가 판정한다', () => {
  const tmp = sample()
  try {
    const at = (name) => path.join(tmp, 'workbench/problems/kempe-degree-five', `${name}.yaml`)
    const list = run(tmp)
    assert.equal(list.status, 0, list.stderr)
    assert.match(list.stdout, /kempe-degree-five · 진행 — .* · 시도 4\/6 · .* · 다음 C/)
    assert.match(list.stdout, /greedy-five-colors · 진행 — .* · 멈춤\(decision\)/)
    // 이어받기 요약: 주장(점)과 그 근거인 시도, 폐기 사유, 다음
    assert.match(run(tmp, 'brief', 'kempe-degree-five').stdout, /주장 \(점 하나가 주장 하나[\s\S]*- 1 \[진행 · 근거 대기[\s\S]*-   2 \[판정 대기 · 1의 근거\][\s\S]*← D 폐기, E 판정 대기[\s\S]*폐기 사유[\s\S]*다음: C/)
    // 주장 하나만 읽으면 그 주장과 그것을 겨눈 시도가 온다
    const two = JSON.parse(run(tmp, 'read', 'kempe-degree-five', '2').stdout)
    assert.equal(two.claim.state, 'reported')
    assert.deepEqual(two.attempts.map((a) => a.id), ['d', 'e'])
    assert.equal(run(tmp, 'read', 'kempe-degree-five', '9').status, 1)

    // 다음 후보 C는 질문을 바로 겨눈다: 진술과 쪽을 적어 보고하면 그 진술이 새 주장(4)이 되고 C는 그 근거가 된다
    const start = run(tmp, 'start', 'kempe-degree-five')
    assert.equal(start.status, 0, start.stderr)
    assert.match(start.stdout, /시작했습니다: C .*\(claude\).*시도 5\/6/)
    assert.match(fs.readFileSync(at('c'), 'utf8'), /state: active\n[\s\S]*worker: claude\n/)
    assert.equal(run(tmp, 'report', 'kempe-degree-five', 'C', '--did', '적었다', '--result', '된다', '--statement', '된다').status, 1)
    assert.equal(run(tmp, 'report', 'kempe-degree-five', 'C', '--did', '적었다', '--result', '같은 틀로 된다', '--statement', '이어지지 않은 두 이웃을 합치면 차수 5 꼭짓점을 지울 수 있다', '--side', 'for_yes', '--condition', '평면 그래프', '--file', 'workbench/notes/kempe-recoloring/note.md', '--command', 'python code/cases.py', '--commit', 'abc1234', '--test', 'python code/cases.py --self-test').status, 0)
    assert.match(fs.readFileSync(at('c'), 'utf8'), /claim: "4"\n[\s\S]*run:\n  command: python code\/cases\.py\n  commit: abc1234\ntest: python code\/cases\.py --self-test\n/)
    assert.match(fs.readFileSync(at('4'), 'utf8'), /statement: 이어지지 않은 두 이웃을 합치면 차수 5 꼭짓점을 지울 수 있다\ncondition: 평면 그래프\n[\s\S]*side: for_yes\n/)
    assert.match(fs.readFileSync(at('4'), 'utf8'), /from: c\n/)
    assert.equal(run(tmp, 'report', 'kempe-degree-five', 'C', '--did', '적었다', '--result', '된다').status, 1)

    const self = run(tmp, 'verdict', 'kempe-degree-five', 'c', 'holds', '--note', '다시 읽었다', '--check', '다른 그림')
    assert.equal(self.status, 1)
    assert.match(self.stderr, /작업한 쪽은 판정하지 않습니다/)
    const bare = run(tmp, 'verdict', 'kempe-degree-five', 'c', 'holds', '--note', '다시 읽었다', '--by', 'codex')
    assert.equal(bare.status, 1)
    assert.match(bare.stderr, /교차 검증/)
    // 검사 명령이 있는 시도: 다시 돌린 결과(--tested pass)가 있어야 성립이고, 성립이면 파일 지문이 남는다
    const untested = run(tmp, 'verdict', 'kempe-degree-five', 'c', 'holds', '--note', '다시 읽었다', '--check', '다른 그림', '--by', 'codex')
    assert.equal(untested.status, 1)
    assert.match(untested.stderr, /검사 명령이 있습니다/)
    const ok = run(tmp, 'verdict', 'kempe-degree-five', 'c', 'holds', '--note', '다시 읽었다', '--check', '다른 그림', '--tested', 'pass', '--by', 'codex')
    assert.equal(ok.status, 0, ok.stderr)
    assert.match(fs.readFileSync(at('c'), 'utf8'), /state: holds\n[\s\S]*by: codex\n[\s\S]*tested: pass\n  files:\n    workbench\/notes\/kempe-recoloring\/note\.md: /)
    assert.equal(JSON.parse(run(tmp, 'read', 'kempe-degree-five', '4').stdout).claim.state, 'holds')

    // 주장을 먼저 세운다: 질문 바로 아래면 --side가 있어야 하고, --under면 그 주장의 근거가 된다. 후보는 --claim으로 그 주장을 겨눈다
    const bareClaim = run(tmp, 'claim', 'kempe-degree-five', '곡선 위의 꼭짓점은 v와 색 1 · 3뿐이다')
    assert.equal(bareClaim.status, 1)
    assert.match(bareClaim.stderr, /side: for_yes/)
    const claimed = run(tmp, 'claim', 'kempe-degree-five', '곡선 위의 꼭짓점은 v와 색 1 · 3뿐이다', '--under', '2', '--by', 'codex')
    assert.equal(claimed.status, 0, claimed.stderr)
    assert.match(claimed.stdout, /주장을 세웠습니다: 5 곡선 위의 꼭짓점은/)
    assert.match(fs.readFileSync(at('5'), 'utf8'), /under: "2"\nby: codex\n/)
    const added = run(tmp, 'add', 'kempe-degree-five', '노트 3절을 다시 읽는다', '--claim', '5')
    assert.equal(added.status, 0, added.stderr)
    assert.match(added.stdout, /후보를 더했습니다 \(주장 5\): G 노트 3절을 다시 읽는다/)
    assert.match(fs.readFileSync(at('g'), 'utf8'), /claim: "5"\n/)
    assert.equal(run(tmp, 'add', 'kempe-degree-five', '없는 주장', '--claim', '9').status, 1)

    // 예외 기록: 앱이 규칙으로 거절한 것(자기 판정 · 검사 미실행)은 자동으로, 에이전트는 한 줄을 더한다
    const noted = run(tmp, 'exception', '세 규칙의 수를 한 문장으로 묶지 못했다', '--kind', 'no-claim', '--instead', '가장 약한 문장만 적었다', '--flow', 'kempe-degree-five', '--attempt', 'c')
    assert.equal(noted.status, 0, noted.stderr)
    assert.equal(run(tmp, 'exception', '종류 없음').status, 1)
    const log = run(tmp, 'exceptions', 'kempe-degree-five')
    assert.equal(log.status, 0, log.stderr)
    assert.match(log.stdout, /진술 불가[\s\S]*세 규칙의 수를 한 문장으로 묶지 못했다/)
    assert.match(log.stdout, /거절[\s\S]*작업한 쪽은 판정하지 않습니다/)
    assert.match(log.stdout, /거절[\s\S]*검사 명령이 있습니다/)
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
