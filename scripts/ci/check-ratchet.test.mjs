import assert from 'node:assert/strict'
import test from 'node:test'
import { compare, isSource, LINE_LIMIT, lowered, measure } from './check-ratchet.mjs'

test('타입 단언은 as T와 @ts-ignore를 세고, as const · 글 · 주석은 세지 않는다', () => {
  const src = [
    "const a = x as Record<string, unknown>",
    "const b = [1, 2] as const",
    "throw new Error((e as Error).message)",
    "const s = 'save as PDF'",
    '// value as Foo',
    '// @ts-ignore',
    'const c = y // @ts-expect-error',
    '',
  ].join('\n')
  assert.deepEqual(measure(src), { lines: 7, casts: 4 })
})

test('소스만 본다 (테스트 · d.ts 빼고)', () => {
  assert.equal(isSource('apps/server/src/workbench.ts'), true)
  assert.equal(isSource('apps/web/src/App.tsx'), true)
  assert.equal(isSource('apps/server/src/workbench.test.ts'), false)
  assert.equal(isSource('apps/web/src/env.d.ts'), false)
  assert.equal(isSource('scripts/ci/check-design.mjs'), false)
})

test('기준보다 늘면 실패, 줄면 알리기만, 기준 없는 큰 새 파일은 실패', () => {
  const base = { lines: { 'big.ts': 1000 }, casts: { 'big.ts': 5 } }
  assert.equal(compare({ 'big.ts': { lines: 1001, casts: 5 } }, base).problems.length, 1)
  assert.equal(compare({ 'big.ts': { lines: 1000, casts: 6 } }, base).problems.length, 1)
  assert.deepEqual(compare({ 'big.ts': { lines: 900, casts: 4 } }, base), { problems: [], lower: ['big.ts 줄 수 1000 → 900', 'big.ts 타입 단언 5 → 4'] })
  assert.equal(compare({ 'new.ts': { lines: LINE_LIMIT + 1, casts: 0 } }, base).problems.length, 1)
  assert.equal(compare({ 'new.ts': { lines: LINE_LIMIT, casts: 1 } }, base).problems.length, 1)
})

test('--update는 낮추기만 하고, 한도 아래로 내려간 파일과 단언이 없어진 파일은 뺀다', () => {
  const base = { lines: { 'a.ts': 1000, 'b.ts': 700 }, casts: { 'a.ts': 3, 'c.ts': 2 } }
  const now = { 'a.ts': { lines: 1200, casts: 1 }, 'b.ts': { lines: 500, casts: 0 }, 'c.ts': { lines: 10, casts: 0 } }
  assert.deepEqual(lowered(now, base), { lines: { 'a.ts': 1000 }, casts: { 'a.ts': 1 } })
})
