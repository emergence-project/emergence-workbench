import assert from 'node:assert/strict'
import test from 'node:test'
import { checkExperiments, globRe, resolve, specifiers } from './check-experiments.mjs'

const exp = (code, extra = {}) => ({ id: 'demo', kind: 'experiment', review: '2030-01-01', verdict: 'watch', code, ...extra })
const run = (rules, sources, today = '2026-11-27') => checkExperiments({
  registry: { rules }, files: Object.keys(sources), read: (p) => sources[p], today,
})

test('무늬: *는 / 밖의 글자만', () => {
  assert.ok(globRe('src/problem*.ts').test('src/problems.ts'))
  assert.ok(!globRe('src/problem*.ts').test('src/problem/x.ts'))
  assert.ok(!globRe('src/problem*.ts').test('src/feedbackClaims.ts'))
})

test('import 경로: from · 맨 import · 동적 import · 패키지 경로', () => {
  assert.deepEqual(specifiers(`import { a } from './a.js'\nimport './s.css'\nconst m = await import('./m')\nexport * from "./e"`).sort(), ['./a.js', './e', './m', './s.css'])
  const has = (p) => ['apps/s/a.ts', 'packages/core/src/contract/x.ts', 'packages/core/src/index.ts'].includes(p)
  assert.equal(resolve('apps/s/b.ts', './a.js', has), 'apps/s/a.ts')
  assert.equal(resolve('apps/s/b.ts', '@rw/core/contract/x', has), 'packages/core/src/contract/x.ts')
  assert.equal(resolve('apps/s/b.ts', '@rw/core', has), 'packages/core/src/index.ts')
  assert.equal(resolve('apps/s/b.ts', 'zod', has), null)
})

test('이음매에서만 부르면 통과, 새 자리에서 부르면 실패', () => {
  const sources = {
    'src/feat.ts': 'export const f = 1',
    'src/seam.ts': "import { f } from './feat.js'",
    'src/other.ts': "import { f } from './feat'",
    'src/other.test.ts': "import { f } from './feat'",
  }
  const fails = run([exp({ owns: ['src/feat.ts'], seams: ['src/seam.ts'] })], sources)
  assert.equal(fails.length, 1)
  assert.match(fails[0], /src\/other\.ts가 src\/feat\.ts을 부릅니다/)
  assert.deepEqual(run([exp({ owns: ['src/feat.ts'], seams: ['src/seam.ts', 'src/other.ts'] })], sources), [])
})

test('낡은 지도: 부르지 않는 이음매 · 파일 없는 무늬', () => {
  const sources = { 'src/feat.ts': '', 'src/seam.ts': '' }
  const fails = run([exp({ owns: ['src/feat.ts', 'src/gone*.ts'], seams: ['src/seam.ts'] })], sources)
  assert.equal(fails.length, 2)
  assert.ok(fails.some((f) => f.includes('src/gone*.ts')))
  assert.ok(fails.some((f) => f.includes('seams의 src/seam.ts')))
})

test('다시 볼 날이 지나면 실패, 되돌린 실험은 통과', () => {
  const sources = { 'src/feat.ts': '' }
  const code = { owns: ['src/feat.ts'], seams: [] }
  assert.match(run([exp(code, { review: '2026-11-01' })], sources)[0], /다시 볼 날 2026-11-01이 지났습니다/)
  assert.deepEqual(run([exp(code, { review: '2026-11-01', verdict: 'reverted' })], sources), [])
  assert.deepEqual(run([exp(code, { review: '2026-11-27' })], sources), [])
})

test('울타리가 없는 실험 · 규칙은 보지 않는다', () => {
  assert.deepEqual(run([{ id: 'r', kind: 'process', review: '2020-01-01', verdict: 'watch' }, { id: 'e', kind: 'experiment', review: '2020-01-01', verdict: 'watch' }], {}), [])
})

test('tsImport로 부르는 스크립트도 센다', () => {
  const sources = { 'src/feat.ts': '', 'scripts/x.mjs': "const P = await tsImport('../src/feat.ts', opts)" }
  assert.match(run([exp({ owns: ['src/feat.ts'], seams: [] })], sources)[0], /scripts\/x\.mjs가 src\/feat\.ts을 부릅니다/)
})

test('이음매가 다시 내보낸(export *) 이름을 가져오면 실패, 다른 이름은 통과', () => {
  const sources = {
    'src/feat.ts': 'export const flowThing = 1\nexport type FlowRow = {}',
    'src/index.ts': "export * from './feat.js'\nexport * from './other.js'",
    'src/other.ts': 'export const plain = 2',
    'src/use.ts': "import { plain, type FlowRow as R } from './index.js'",
    'src/ok.ts': "import { plain } from './index'",
  }
  const fails = run([exp({ owns: ['src/feat.ts'], seams: ['src/index.ts'] })], sources)
  assert.equal(fails.length, 1)
  assert.match(fails[0], /src\/use\.ts가 src\/index\.ts을 거쳐 실험의 FlowRow/)
})

test('다시 볼 날 7일 안이면 알림만', () => {
  const warnings = []
  const fails = checkExperiments({ registry: { rules: [exp({ owns: ['src/feat.ts'], seams: [] }, { review: '2026-12-01' })] }, files: ['src/feat.ts'], read: () => '', today: '2026-11-27', warnings })
  assert.deepEqual(fails, [])
  assert.match(warnings[0], /7일 안/)
})
