import assert from 'node:assert/strict'
import { test } from 'node:test'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import { parseShotOptions, screenScheme } from './options.mjs'
import { selectScreens } from './screens.mjs'

test('default matches the documented Mac viewport without expanding CI samples', () => {
  assert.deepEqual(parseShotOptions([], {}), { viewport: { width: 1200, height: 735 }, theme: 'mixed', sample: 'default', lang: 'ko', help: false })
})

test('one CLI interface selects viewport, theme and fixture with both argument styles', () => {
  const expected = { viewport: { width: 1440, height: 900 }, theme: 'dark', sample: 'subjects', lang: 'ko', help: false }
  assert.deepEqual(parseShotOptions(['--viewport', '1440x900', '--theme=dark', '--sample', 'subjects'], {}), expected)
  assert.deepEqual(parseShotOptions(['--viewport=1440x900', '--theme', 'dark', '--sample=subjects'], {}), expected)
})

test('explicit light theme overrides mixed dark-name captures and legacy environment', () => {
  const got = parseShotOptions(['--viewport=1200x735', '--theme=light', '--sample=default'], { SHOTS_VIEWPORT: '1440x900', SHOTS_SCHEME: 'dark', SHOTS_SUBJECTS: '1' })
  assert.deepEqual(got, { viewport: { width: 1200, height: 735 }, theme: 'light', sample: 'default', lang: 'ko', help: false })
})

test('legacy environment remains compatible while standard commands use CLI options', () => {
  assert.deepEqual(parseShotOptions([], { SHOTS_VIEWPORT: '1440x900', SHOTS_SCHEME: 'dark', SHOTS_SUBJECTS: '1' }), { viewport: { width: 1440, height: 900 }, theme: 'dark', sample: 'subjects', lang: 'ko', help: false })
})

test('invalid or incomplete options fail before starting the build or server', () => {
  for (const args of [['--viewport=0x735'], ['--viewport=1200xnope'], ['--viewport=-1x735'], ['--viewport=1200.5x735'], ['--theme=blue'], ['--sample=other'], ['--viewport'], ['--theme'], ['--typo=dark'], ['1200x735']]) {
    assert.throws(() => parseShotOptions(args, {}), /viewport|theme|sample|option|argument/)
  }
})

test('help is available without starting a browser', () => {
  assert.equal(parseShotOptions(['--help'], {}).help, true)
})


test('the existing CI scope stays 55 screens with exactly two dark captures', () => {
  const defaults = parseShotOptions([], {})
  const screens = selectScreens(defaults.sample)
  assert.equal(screens.length, 55)
  assert.deepEqual(screens.filter(([name]) => screenScheme(defaults.theme, name) === 'dark').map(([name]) => name), ['dark-topic', 'dark-note-info'])
  assert.equal(selectScreens('subjects').length, 10)
  assert.ok(selectScreens('subjects').every(([name]) => name.startsWith('subjects-')))
  assert.ok(screens.every(([name]) => screenScheme('light', name) === 'light'))
  assert.ok(screens.every(([name]) => screenScheme('dark', name) === 'dark'))
})

test('CLI help and invalid choices exit before any build, server or browser', () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
  for (const [arg, status, message] of [['--help', 0, /Usage: pnpm shots/], ['--viewport=1200xnope', 1, /positive integer/], ['--sample=other', 1, /sample must/]]) {
    const result = spawnSync(process.execPath, ['scripts/shots/shots.mjs', arg], { cwd: root, encoding: 'utf8', timeout: 1500 })
    assert.equal(result.status, status, result.error?.message ?? result.stderr)
    assert.match(result.stdout + result.stderr, message)
    assert.doesNotMatch(result.stdout + result.stderr, /vite build|@rw\/web@ build|research-workspace server:|찍음 /)
  }
})


test('the actual CI capture command selects the same bounded default scope', () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
  const YAML = createRequire(path.join(root, 'apps/server/package.json'))('yaml')
  const workflow = YAML.parse(fs.readFileSync(path.join(root, '.github/workflows/ci.yml'), 'utf8'))
  const command = workflow.jobs.check.steps.find((step) => step.run?.startsWith('pnpm shots')).run
  const options = parseShotOptions(command.split(/\s+/).slice(2), {})
  assert.deepEqual(options, { viewport: { width: 1200, height: 735 }, theme: 'mixed', sample: 'default', lang: 'ko', help: false })
  assert.equal(selectScreens(options.sample).length, 55)
  assert.equal(selectScreens(options.sample).filter(([name]) => screenScheme(options.theme, name) === 'dark').length, 2)
})

test('--lang en captures the English sample', () => {
  assert.equal(parseShotOptions(['--lang', 'en'], {}).lang, 'en')
  assert.equal(parseShotOptions([], { SHOTS_LANG: 'en' }).lang, 'en')
  assert.throws(() => parseShotOptions(['--lang=fr'], {}), /--lang/)
})
