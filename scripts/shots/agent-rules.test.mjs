// pnpm agent:rules의 순수 함수와 규칙 목록(docs/rules/registry.json)의 모양을 본다.
// 화면 검사 옵션 테스트와 같은 단계(scripts/shots)에서 돈다: scripts/ci에 두면 고위험 영역이 되어 규칙 목록을 고칠 때마다 사용자가 합쳐야 한다.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { checkRegistry, flagsFor, measure } from '../agent-rules.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const rule = (over = {}) => ({ id: 'a', rule: 'r', where: 'w', why: 'y', note: 'n', kind: 'process', verdict: 'keep', since: '2026-11-01', review: '2026-12-01', ...over })

test('the rule registry in the repository is well formed', () => {
  const registry = JSON.parse(fs.readFileSync(path.join(root, 'docs/rules/registry.json'), 'utf8'))
  assert.deepEqual(checkRegistry(registry), [])
})

test('a registry entry without a reason, a known kind or dates is reported', () => {
  const problems = checkRegistry({ rules: [rule({ why: '', kind: 'other', review: 'soon' }), rule()] })
  assert.equal(problems.length, 4)
})

test('attestation lines and touched files are counted per rule', () => {
  const commits = [{ body: 'x\n소개: 그대로 — 파일만 나눔', files: ['a.tsx'] }, { body: 'y', files: ['scripts/ci/x.mjs'] }]
  assert.deepEqual(measure(rule({ measure: { attest: '^소개: 그대로' } }), commits), { commits: 2, attest: 1 })
  assert.deepEqual(measure(rule({ measure: { touch: ['scripts/ci/'] } }), commits), { commits: 2, touch: 1 })
  assert.equal(measure(rule(), commits), null)
})

test('rules past their review date or costing a ritual line in over a quarter of commits are flagged', () => {
  const commits = [{ body: '소개: 그대로', files: [] }, { body: 'b', files: [] }]
  const registry = { rules: [rule({ id: 'due' }), rule({ id: 'costly', review: '2027-01-01', measure: { attest: '^소개: 그대로' } }), rule({ id: 'fine', review: '2027-01-01' }), rule({ id: 'gone', verdict: 'removed' })] }
  assert.deepEqual(flagsFor(registry, commits, '2026-12-05').map((f) => f.id), ['due', 'costly'])
})
