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
  assert.deepEqual(parseShotOptions([], {}), { viewport: { width: 1200, height: 735 }, theme: 'mixed', sample: 'default', lang: 'ko', scale: 2, help: false })
})

test('one CLI interface selects viewport, theme and fixture with both argument styles', () => {
  const expected = { viewport: { width: 1440, height: 900 }, theme: 'dark', sample: 'subjects', lang: 'ko', scale: 2, help: false }
  assert.deepEqual(parseShotOptions(['--viewport', '1440x900', '--theme=dark', '--sample', 'subjects'], {}), expected)
  assert.deepEqual(parseShotOptions(['--viewport=1440x900', '--theme', 'dark', '--sample=subjects'], {}), expected)
})

test('explicit light theme overrides mixed dark-name captures and legacy environment', () => {
  const got = parseShotOptions(['--viewport=1200x735', '--theme=light', '--sample=default'], { SHOTS_VIEWPORT: '1440x900', SHOTS_SCHEME: 'dark', SHOTS_SUBJECTS: '1' })
  assert.deepEqual(got, { viewport: { width: 1200, height: 735 }, theme: 'light', sample: 'default', lang: 'ko', scale: 2, help: false })
})

test('legacy environment remains compatible while standard commands use CLI options', () => {
  assert.deepEqual(parseShotOptions([], { SHOTS_VIEWPORT: '1440x900', SHOTS_SCHEME: 'dark', SHOTS_SUBJECTS: '1' }), { viewport: { width: 1440, height: 900 }, theme: 'dark', sample: 'subjects', lang: 'ko', scale: 2, help: false })
})

test('invalid or incomplete options fail before starting the build or server', () => {
  for (const args of [['--viewport=0x735'], ['--viewport=1200xnope'], ['--viewport=-1x735'], ['--viewport=1200.5x735'], ['--theme=blue'], ['--sample=other'], ['--viewport'], ['--theme'], ['--typo=dark'], ['1200x735']]) {
    assert.throws(() => parseShotOptions(args, {}), /viewport|theme|sample|option|argument/)
  }
})

test('help is available without starting a browser', () => {
  assert.equal(parseShotOptions(['--help'], {}).help, true)
})


// 화면 수는 적지 않는다 (11/27): 숫자를 적어 두면 화면을 더할 때마다 실패해 숫자만 고쳤고(20번), 걸러 낸 것은 없었다.
// 대신 범위가 어긋나는 꼴(이름 겹침 · 다른 샘플 섞임 · 어두운 그림 수)을 본다.
test('the default CI scope has unique screen names, no other sample, and exactly two dark captures', () => {
  const defaults = parseShotOptions([], {})
  const screens = selectScreens(defaults.sample)
  assert.ok(screens.length > 0)
  assert.equal(new Set(screens.map(([name]) => name)).size, screens.length)
  assert.ok(screens.every(([name]) => !name.startsWith('subjects-')))
  assert.deepEqual(screens.filter(([name]) => screenScheme(defaults.theme, name) === 'dark').map(([name]) => name), ['dark-topic', 'dark-note-info'])
  assert.ok(selectScreens('subjects').length > 0)
  assert.ok(selectScreens('subjects').every(([name]) => name.startsWith('subjects-')))
  assert.ok(screens.every(([name]) => screenScheme('light', name) === 'light'))
  assert.ok(screens.every(([name]) => screenScheme('dark', name) === 'dark'))
})

test('CLI help and invalid choices exit before any build, server or browser', () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
  for (const [arg, status, message] of /** @type {[string, number, RegExp][]} */ ([['--help', 0, /Usage: pnpm shots/], ['--viewport=1200xnope', 1, /positive integer/], ['--sample=other', 1, /sample must/]])) {
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
  const command = workflow.jobs.shots.steps.find((step) => step.run?.startsWith('pnpm shots')).run
  const options = parseShotOptions(command.split(/\s+/).slice(2), {})
  assert.deepEqual(options, { viewport: { width: 1200, height: 735 }, theme: 'mixed', sample: 'default', lang: 'ko', scale: 2, help: false })
  assert.deepEqual(selectScreens(options.sample), selectScreens(parseShotOptions([], {}).sample))
  assert.equal(selectScreens(options.sample).filter(([name]) => screenScheme(options.theme, name) === 'dark').length, 2)
})

test('--lang en captures the English sample', () => {
  assert.equal(parseShotOptions(['--lang', 'en'], {}).lang, 'en')
  assert.equal(parseShotOptions([], { SHOTS_LANG: 'en' }).lang, 'en')
  assert.throws(() => parseShotOptions(['--lang=fr'], {}), /--lang/)
})

test('every screen names a part to wait for, so it is not captured before its content loads', () => {
  const missing = [...selectScreens('default'), ...selectScreens('subjects')].filter(([, , ui]) => !ui).map(([name]) => name)
  assert.deepEqual(missing, [])
})

test('agent conversations take half-size pictures with SHOTS_SCALE=1, and --scale wins', () => {
  assert.equal(parseShotOptions([], { SHOTS_SCALE: '1' }).scale, 1)
  assert.equal(parseShotOptions(['--scale', '2'], { SHOTS_SCALE: '1' }).scale, 2)
  assert.throws(() => parseShotOptions(['--scale=3'], {}), /--scale must be 1 or 2/)
})
