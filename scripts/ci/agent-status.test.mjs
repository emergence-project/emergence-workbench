// node --test scripts/ci/ — pnpm agent:status가 앱 없이 예제 연구의 요약을 뽑고, 아무것도 쓰지 않는지
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const run = (arg, configDir) => spawnSync('node', ['scripts/agent-status.mjs', arg], { cwd: root, encoding: 'utf8', env: { ...process.env, ...(configDir && { RW_CONFIG_DIR: configDir }) } })

test('예제의 임시 복사본 요약을 보이고 설정이 없어도 STATUS.md를 쓰지 않는다', () => {
  const tmp = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'rw-status-cli-'))
  try {
    const repo = path.join(tmp, 'sample')
    const config = path.join(tmp, 'missing-config')
    fs.cpSync(path.join(root, 'fixtures/sample-research'), repo, { recursive: true, filter: (src) => !src.includes('.build') })
    const r = run(repo, config)
    assert.equal(r.status, 0, r.stderr)
    assert.match(r.stdout, /^# STATUS — /)
    assert.match(r.stdout, /## 할 일/)
    assert.doesNotMatch(r.stdout, /## 에이전트 고침 검토 대기/)
    assert.equal(fs.existsSync(path.join(repo, 'workbench/STATUS.md')), false)
    assert.equal(fs.existsSync(config), false)
    const stamp = (s) => s.replace(/자동으로 쓰는 요약이다 \([^)]*\)/, '')
    assert.equal(stamp(run(path.join(repo, 'workbench'), config).stdout), stamp(r.stdout))
  } finally { fs.rmSync(tmp, { recursive: true, force: true }) }
})

test('RW_CONFIG_DIR의 검토·허락 대기를 읽기만 하고 다른 프로젝트·라이브러리 기록은 섞지 않는다', () => {
  const tmp = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'rw-status-cli-'))
  try {
    const repo = path.join(tmp, 'sample')
    const config = path.join(tmp, 'config')
    const lib = path.join(tmp, 'library')
    fs.cpSync(path.join(root, 'fixtures/sample-research'), repo, { recursive: true, filter: (src) => !src.includes('.build') })
    fs.mkdirSync(lib)
    fs.mkdirSync(path.join(config, 'agent-edits'), { recursive: true })
    fs.writeFileSync(path.join(config, 'config.yaml'), `library: ${lib}\nresearches:\n  - {id: gone, path: ${tmp}/gone}\n  - {id: registered, path: ${repo}}\n`)
    const file = 'workbench/notes/working/note.md'
    fs.mkdirSync(path.dirname(path.join(repo, file)), { recursive: true })
    fs.writeFileSync(path.join(repo, file), '# Work\n\nChanged.\n\nMine.\n')
    const target = { kind: 'note', rid: 'registered', file }
    const pending = { key: `note:registered:${file}`, target, title: 'working', base: '# Work\n\nBefore.\n\nOther.\n', after: '# Work\n\nChanged.\n\nOther.\n', since: '2026-10-10T01:02:00Z', updated: '2026-10-10T01:02:00Z', agents: ['codex', 'claude-code'], notes: [] }
    const attempt = { key: 'note:registered:solved', target: { ...target, file: 'workbench/calc/solved/main.tex' }, title: '확인한 계산', at: pending.since, agent: 'codex' }
    const hash = crypto.createHash('sha1').update(path.resolve(lib)).digest('hex').slice(0, 12)
    const store = path.join(config, 'agent-edits', `edits-${hash}.json`)
    const data = JSON.stringify({ pending: [pending, { ...pending, key: 'other', target: { ...target, rid: 'other' } }], attempts: [attempt] })
    fs.writeFileSync(store, data)
    fs.writeFileSync(path.join(config, 'agent-edits/edits-old.json'), JSON.stringify({ pending: [{ ...pending, key: 'old' }], attempts: [] }))
    const r = run(repo, config)
    assert.equal(r.status, 0, r.stderr)
    assert.match(r.stdout, /## 에이전트 고침 검토 대기 2/)
    assert.match(r.stdout, /바뀐 곳 1 · 에이전트 codex, claude-code/)
    assert.match(r.stdout, /허락 대기: \*\*확인한 계산\*\*/)
    assert.equal(fs.readFileSync(store, 'utf8'), data)
    assert.equal(fs.existsSync(path.join(repo, 'workbench/STATUS.md')), false)
    // 깨진 현재 기록도 보관 파일을 쓰지 않고 조용히 넘어간다.
    fs.writeFileSync(store, '{broken')
    const names = fs.readdirSync(path.dirname(store))
    const broken = run(repo, config)
    assert.equal(broken.status, 0, broken.stderr)
    assert.doesNotMatch(broken.stdout, /## 에이전트 고침 검토 대기/)
    assert.equal(fs.readFileSync(store, 'utf8'), '{broken')
    assert.deepEqual(fs.readdirSync(path.dirname(store)), names)
  } finally { fs.rmSync(tmp, { recursive: true, force: true }) }
})

test('연구 작업대 폴더가 아니면 알리고 실패한다', () => {
  const r = run('docs')
  assert.equal(r.status, 1)
  assert.match(r.stderr, /research\.yaml 없음/)
})
