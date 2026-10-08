import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fakeConcepts, sandboxPath, root } from './fake-concepts.mjs'

test('rejects outside targets and symlink escapes, never overwrites a note', () => {
  const dir = path.join(root, '.sandbox', `scale-guard-${process.pid}`)
  fs.mkdirSync(dir, { recursive: true })
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'rw-scale-guard-'))
  try {
    assert.throws(() => fakeConcepts(outside, 1), /inside/)
    assert.throws(() => sandboxPath(path.join(root, '.sandbox', '..', 'real')), /inside/)
    fs.symlinkSync(outside, path.join(dir, 'escape'))
    assert.throws(() => fakeConcepts(path.join(dir, 'escape/library'), 1), /Symlink/)
    assert.deepEqual(fs.readdirSync(outside), [])
    fakeConcepts(path.join(dir, 'library'), 2)
    assert.throws(() => fakeConcepts(path.join(dir, 'library'), 2), /EEXIST/)
    assert.equal(fs.readdirSync(path.join(dir, 'library/concepts')).length, 2)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
    fs.rmSync(outside, { recursive: true, force: true })
  }
})
