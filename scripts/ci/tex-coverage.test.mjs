import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { matchesTexPath, requiredTexPaths, texCoverageGaps } from './check-tex-coverage.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const YAML = createRequire(path.join(root, 'apps/server/package.json'))('yaml')
const workflow = YAML.parse(fs.readFileSync(path.join(root, '.github/workflows/tex.yml'), 'utf8'))
const paths = workflow.on.pull_request.paths
const covered = (file) => paths.some((pattern) => matchesTexPath(file, pattern))

test('every server test using the real TeX availability guard triggers TeX CI', () => {
  const dir = path.join(root, 'apps/server/src')
  const required = fs.readdirSync(dir).filter((name) => name.endsWith('.test.ts') && /\bhasLatex\b/.test(fs.readFileSync(path.join(dir, name), 'utf8'))).map((name) => `apps/server/src/${name}`)
  assert.deepEqual(required.filter((file) => !covered(file)), [])
})

test('compile choices, figure embeds, template files and source transforms trigger TeX CI', () => {
  const required = ['apps/server/src/routes/latexChoice.ts', 'apps/server/src/latexFiles.ts', 'apps/server/src/latexPreview.ts', 'apps/server/src/figureEmbeds.ts', 'apps/server/src/figures.ts', 'apps/server/src/manuscriptFreshness.ts', 'apps/server/src/noteBody.ts', 'apps/server/src/noteBib.ts', 'apps/server/src/noteMeta.ts', 'apps/server/src/noteCopy.ts', 'apps/server/src/conceptNotes.ts', 'apps/server/src/libraryNotes.ts', 'apps/server/src/routes/latexSetup.ts', 'templates/latex/rw-research-note.sty', 'packages/core/src/block-header.ts', 'packages/core/src/block-header.test.ts']
  assert.deepEqual(required.filter((file) => !covered(file)), [])
})


test('the lightweight checker detects future guarded tests in nested directories', (t) => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'rw-tex-coverage-'))
  t.after(() => fs.rmSync(repo, { recursive: true, force: true }))
  for (const dir of ['apps/server/src/nested', 'packages/core/src', 'templates/latex', 'templates/research-library']) fs.mkdirSync(path.join(repo, dir), { recursive: true })
  fs.writeFileSync(path.join(repo, 'apps/server/src/nested/newCompile.test.ts'), "import { hasLatex } from '../testkit.js'\nit.skipIf(!hasLatex)('new compile', () => {})")
  fs.writeFileSync(path.join(repo, 'apps/server/src/nested/fakeCompile.test.ts'), "const fakeCompiler = 'latexmk'")
  assert.deepEqual(texCoverageGaps(repo, paths), ['apps/server/src/nested/newCompile.test.ts'])
})

test('the checker catches a removed compile-choice trigger and accepts current coverage', () => {
  assert.deepEqual(texCoverageGaps(root), [])
  assert.deepEqual(texCoverageGaps(root, paths.filter((p) => p !== 'apps/server/src/routes/latexChoice.ts')), ['apps/server/src/routes/latexChoice.ts'])
})

test('invalid workflow patterns fail instead of silently passing coverage', () => {
  assert.throws(() => texCoverageGaps(root, ['!apps/server/**']), /positive/)
  assert.throws(() => texCoverageGaps(root, 0), /positive/)
})

// Node 22.0–22.4 is supported but has no path.matchesGlob. Model that API shape.
function withoutNativeGlob(run) {
  const native = path.matchesGlob
  delete path.matchesGlob
  try { run() } finally { if (native) path.matchesGlob = native }
}

test('the checker runs on supported Node 22 versions without path.matchesGlob', () => {
  withoutNativeGlob(() => assert.deepEqual(texCoverageGaps(root), []))
})

test('workflow coverage assertions do not require path.matchesGlob', () => {
  withoutNativeGlob(() => assert.equal(covered('apps/server/src/blockCompile.test.ts'), true))
})

test('the checker catches removal of the block parser and its regression coverage', () => {
  const required = ['packages/core/src/block-header.test.ts', 'packages/core/src/block-header.ts']
  for (const file of required) assert(requiredTexPaths(root).includes(file), `${file} is compiler input`)
  assert.deepEqual(texCoverageGaps(root, paths.filter((pattern) => !pattern.startsWith('packages/core/src/block-header'))), required)
})

test('workflow wildcards respect path segments and optional globstar directories', () => {
  assert(matchesTexPath('packages/core/src/block-header.ts', 'packages/core/src/block-header*.ts'))
  assert(matchesTexPath('packages/core/src/block-header.test.ts', 'packages/core/src/block-header*.ts'))
  assert.equal(matchesTexPath('packages/core/src/nested/block-header.ts', 'packages/core/src/*.ts'), false)
  assert(matchesTexPath('templates/latex/nested/input.tex', 'templates/latex/**'))
  assert(matchesTexPath('apps/server/src/newCompile.test.ts', 'apps/server/src/**/*.test.ts'))
  assert(matchesTexPath('apps/server/src/nested/newCompile.test.ts', 'apps/server/src/**/*.test.ts'))
  assert.equal(matchesTexPath('apps/server/src/newCompileXtestYts', 'apps/server/src/newCompile.test.ts'), false)
  assert.throws(() => matchesTexPath('file', '{file,other}'), /literal paths/)
})
