import assert from 'node:assert/strict'
import test from 'node:test'
import { compare, isSource, LINE_LIMIT, LINE_WIDTH, lowered, measure } from './check-ratchet.mjs'

test('타입 단언은 as T와 @ts-ignore를 세고, as const · 글 · 주석은 세지 않는다', () => {
  const src = [
    "const a = x as Record<string, unknown>",
    "const b = [1, 2] as const",
    "throw new Error((e as Error).message)",
    "const s = 'save as PDF'",
    '// value as Foo',
    '// @ts-ignore',
    'const c = y // @ts-expect-error',
    "import * as C from '@rw/core/contract/tasks'",
    "export { a as B } from './a.js'",
    '',
  ].join('\n')
  assert.deepEqual(measure(src), { lines: 9, casts: 4 })
})

test('긴 줄은 LINE_WIDTH자마다 한 줄로 센다 (긴 줄로 줄 수를 피하지 못하게, 11/27)', () => {
  assert.equal(measure(`${'a'.repeat(LINE_WIDTH)}\n`).lines, 1)
  assert.equal(measure(`${'a'.repeat(LINE_WIDTH + 1)}\nb\n`).lines, 3)
  assert.equal(measure(`${'가'.repeat(LINE_WIDTH * 3)}\n`).lines, 3)
  assert.equal(measure('\n\n').lines, 2)
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
  assert.equal(compare({ 'big.ts': { lines: 1000, casts: 5 }, 'new.ts': { lines: LINE_LIMIT, casts: 1 } }, base).problems.length, 1)
})

test('파일을 나눠 단언을 옮기면 전체가 늘지 않는 한 통과한다 (11/27)', () => {
  const base = { lines: {}, casts: { 'a.ts': 3 } }
  const split = compare({ 'a.ts': { lines: 10, casts: 1 }, 'a2.ts': { lines: 10, casts: 2 } }, base)
  assert.deepEqual(split.problems, [])
  assert.ok(split.lower.some((l) => l.includes('a2.ts')))
  assert.equal(compare({ 'a.ts': { lines: 10, casts: 3 }, 'a2.ts': { lines: 10, casts: 1 } }, base).problems.length, 1)
})

test('--update는 낮추기만 하고, 한도 아래로 내려간 파일과 단언이 없어진 파일은 빼고, 옮겨 간 단언은 새 파일에 적는다', () => {
  const base = { lines: { 'a.ts': 1000, 'b.ts': 700 }, casts: { 'a.ts': 3, 'c.ts': 2 } }
  const now = { 'a.ts': { lines: 1200, casts: 1 }, 'b.ts': { lines: 500, casts: 0 }, 'c.ts': { lines: 10, casts: 0 }, 'd.ts': { lines: 10, casts: 2 } }
  assert.deepEqual(lowered(now, base), { lines: { 'a.ts': 1000 }, casts: { 'a.ts': 1, 'd.ts': 2 } })
})

test('--update는 단언 기준의 합을 올리지 않고, 옮긴 단언을 적은 뒤에도 같은 코드가 통과한다 (11/27 별도 검토)', () => {
  // 새 파일에 단언을 더해 전체가 늘었으면 새 파일은 기준에 적지 않는다
  const grown = lowered({ 'a.ts': { lines: 10, casts: 3 }, 'n.ts': { lines: 10, casts: 5 } }, { lines: {}, casts: { 'a.ts': 3 } })
  assert.deepEqual(grown.casts, { 'a.ts': 3 })
  // 있던 파일 사이에서 옮겼으면 지금 수를 적고, 그 기준으로 다시 검사해도 통과한다
  const now = { 'a.ts': { lines: 10, casts: 5 }, 'b.ts': { lines: 10, casts: 1 } }
  const next = lowered(now, { lines: {}, casts: { 'a.ts': 3, 'b.ts': 4 } })
  assert.deepEqual(next.casts, { 'a.ts': 5, 'b.ts': 1 })
  assert.deepEqual(compare(now, next).problems, [])
})
