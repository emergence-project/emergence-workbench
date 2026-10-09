import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { compileStandalone, copyWorkingTree, isWithin, runRepositoryCheck, sandboxProfile } from './check-repo.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const temporary = () => fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'rw-safety-selftest-'))
function write(root, name, content) {
  const file = path.join(root, name)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, content)
}
function git(root, ...args) {
  const result = spawnSync('git', ['--no-optional-locks', '-C', root, ...args], { encoding: 'utf8', env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' } })
  assert.equal(result.status, 0, result.stderr)
  return result.stdout
}

test('working-tree copy includes ignored data and confines internal links', () => {
  const tmp = temporary()
  try {
    const source = path.join(tmp, 'source'), copied = path.join(tmp, 'copy')
    write(source, 'workbench/note.md', 'uncommitted\n')
    write(source, 'node_modules/ignore.js', 'ignored cache')
    write(source, 'lean/.lake/build/Main.olean', 'Lean build cache')
    write(source, '.git/index', 'not copied')
    write(tmp, 'outside.txt', 'must stay outside')
    fs.symlinkSync(path.join(source, 'workbench/note.md'), path.join(source, 'internal.md'))
    fs.symlinkSync(path.join(tmp, 'outside.txt'), path.join(source, 'external.md'))
    const result = copyWorkingTree(source, copied)
    assert.equal(fs.readFileSync(path.join(copied, 'workbench/note.md'), 'utf8'), 'uncommitted\n')
    assert.equal(fs.existsSync(path.join(copied, 'node_modules')), false)
    assert.equal(fs.existsSync(path.join(copied, 'lean/.lake')), false)
    assert.equal(fs.existsSync(path.join(copied, '.git')), false)
    assert.equal(fs.existsSync(path.join(copied, 'external.md')), false)
    assert(isWithin(copied, fs.realpathSync(path.join(copied, 'internal.md'))))
    fs.writeFileSync(path.join(copied, 'internal.md'), 'copy changed')
    assert.equal(fs.readFileSync(path.join(source, 'workbench/note.md'), 'utf8'), 'uncommitted\n')
    assert(result.omissions.some((x) => x.reason === 'external-symlink'))
    assert(result.omissions.some((x) => x.file === 'node_modules'))
  } finally { fs.rmSync(tmp, { recursive: true, force: true }) }
})

test('real APIs cover manuscript, Markdown, blocks and comments while preserving a dirty source', async () => {
  const tmp = temporary()
  try {
    const source = path.join(tmp, 'research')
    fs.cpSync(path.join(root, 'fixtures/sample-research'), source, { recursive: true })
    write(source, 'workbench/research.yaml', 'title: Safety fixture\nsources:\n  manuscript: docs/main.tex — Draft\ntopics:\n  - id: result\n    title: Result\n    parts: [docs/chapter.tex]\n    blocks: [md-block]\n')
    write(source, 'docs/main.tex', '% !TeX program = pdflatex\n\\documentclass{article}\n\\begin{document}\n\\input{chapter}\n\\end{document}\n')
    write(source, 'docs/chapter.tex', '\\section{Result}\nA test result.\r\n\r\n')
    write(source, 'workbench/notes/topic/note.md', '## Goal\r\n\r\nA Markdown note.\r\n\r\n')
    write(source, 'workbench/notes/topic/note.yaml', 'name: Topic\nstate: blocked\nresume: Check an assumption\n')
    write(source, 'workbench/blocks/md-block.md', '---\nid: md-block\ntitle: Markdown block\nstatus: in-progress\n---\n## Goal\n\nAn independent argument.\n')
    write(source, 'workbench/comments/block-md-block.md', '# Comment\n\n## c-test · 질문 · p.1\n- 상태: 대기\n\nKeep this comment.\n')
    git(source, 'init', '-q')
    git(source, 'add', 'docs/main.tex')
    const before = git(source, 'status', '--porcelain=v1', '-uall')
    const result = await runRepositoryCheck(source, { noCompile: true, keepTemp: true })
    try {
      assert.equal(result.error, undefined, JSON.stringify(result))
      assert.equal(result.sourceIntegrity.status, 'pass')
      assert.equal(result.sourceIntegrity.gitBefore.text, before)
      assert.equal(git(source, 'status', '--porcelain=v1', '-uall'), before)
      assert.equal(result.status, 'unverified')
      assert.equal(result.index.status, 'pass')
      assert.equal(result.index.commentFiles, 1)
      assert.equal(result.index.topics, 1)
      assert.equal(result.index.preservedAfterWrites, true)
      assert.equal(result.copyRestoration.status, 'pass')
      assert(result.targets.some((x) => x.kind === 'research-note-md'))
      assert(result.targets.some((x) => x.kind === 'block-md'))
      assert(result.targets.some((x) => x.file === 'docs/chapter.tex'))
      for (const t of result.targets) {
        assert.equal(t.noOp.status, 'pass', JSON.stringify(t))
        assert.equal(t.conflict.status, 'pass', JSON.stringify(t))
        assert.equal(t.restored, true)
        assert.deepEqual(fs.readFileSync(path.join(result.temporary, 'repository', t.file)), fs.readFileSync(path.join(source, t.file)))
      }
      const config = fs.readFileSync(path.join(result.temporary, 'config/config.yaml'), 'utf8')
      assert(config.includes('empty-study'))
      assert(config.includes('empty-reviews'))
      assert(!config.includes('.config/research-workspace'))
    } finally { if (result.temporary) fs.rmSync(result.temporary, { recursive: true, force: true }) }
  } finally { fs.rmSync(tmp, { recursive: true, force: true }) }
})

test('concept bytes are preserved, locks remain locked, and the disk index is rebuilt', async () => {
  const tmp = temporary()
  try {
    const source = path.join(tmp, 'library')
    write(source, 'concepts/normal.md', '---\ntitle: Normal\nrelated: [Locked]\n---\nA sufficiently long definition and [[Locked]] relation.\n')
    write(source, 'concepts/normal.memo.md', '- [ ] Preserve this user memo.\n')
    write(source, 'concepts/locked.md', '---\ntitle: Locked\nlocked: true\n---\nA sufficiently long definition that cannot be edited.\n')
    write(source, 'concepts/normalized.md', '---\r\ntitle: Changed ending\r\n---\r\nNo-op must preserve this ending.\r\n\r\n')
    const result = await runRepositoryCheck(source, { noCompile: true })
    assert.equal(result.error, undefined, JSON.stringify(result))
    assert.equal(result.status, 'unverified') // The fixture has no Git repository.
    assert.equal(result.sourceIntegrity.filesStatus, 'pass')
    assert.equal(result.index.status, 'pass')
    assert.equal(result.index.concepts, 3)
    assert.equal(result.index.diskBefore.length, 1)
    assert.equal(result.index.diskAfter.length, 1)
    assert.equal(result.targets.find((x) => x.file === 'concepts/normal.md').noOp.status, 'pass')
    assert.equal(result.targets.find((x) => x.file === 'concepts/locked.md').noOp.status, 'locked')
    assert.equal(result.targets.find((x) => x.file === 'concepts/normalized.md').noOp.status, 'pass')
    for (const t of result.targets) { assert.equal(t.conflict.status, 'pass'); assert.equal(t.restored, true) }
    assert(fs.readFileSync(path.join(source, 'concepts/locked.md'), 'utf8').includes('locked: true'))
  } finally { fs.rmSync(tmp, { recursive: true, force: true }) }
})

test('missing and escaping declared manuscripts are not silently counted as passing', async () => {
  const tmp = temporary()
  try {
    const source = path.join(tmp, 'research')
    write(source, 'workbench/research.yaml', 'title: Missing source\nsources:\n  manuscript:\n    - missing.tex\n    - ../outside.tex\n')
    write(tmp, 'outside.tex', '\\documentclass{article}\n')
    const result = await runRepositoryCheck(source, { noCompile: true })
    assert.equal(result.error, undefined)
    assert.equal(result.status, 'fail')
    assert.equal(result.declarations.length, 2)
    assert(result.declarations.every((x) => x.status === 'fail' && !x.visible))
    assert.equal(result.sourceIntegrity.filesStatus, 'pass')
    assert.equal(fs.readFileSync(path.join(tmp, 'outside.tex'), 'utf8'), '\\documentclass{article}\n')
  } finally { fs.rmSync(tmp, { recursive: true, force: true }) }
})

test('concept snapshots read every API page, including more than 500 notes', async () => {
  const tmp = temporary()
  try {
    const source = path.join(tmp, 'library')
    for (let n = 0; n < 502; n++) write(source, `concepts/n${n}.md`, `---\ntitle: Concept ${n}\n---\nA real body for this synthetic note ${n}.\n`)
    const result = await runRepositoryCheck(source, { noCompile: true })
    assert.equal(result.error, undefined)
    assert.equal(result.targets.length, 502)
    assert.equal(result.index.concepts, 502)
    assert.equal(result.index.status, 'pass')
    assert.equal(result.index.preservedAfterWrites, true)
    assert(result.targets.every((x) => x.noOp.status === 'pass' && x.conflict.status === 'pass'))
    assert.equal(result.sourceIntegrity.filesStatus, 'pass')
    assert.equal(result.sourceIntegrity.status, 'unverified') // No Git repository in this fixture.
  } finally { fs.rmSync(tmp, { recursive: true, force: true }) }
})

test('independent compilation never executes repository rc or shell escape', (t) => {
  const tmp = temporary()
  const outside = temporary()
  try {
    const copy = path.join(tmp, 'repository')
    const marker = path.join(outside, 'must-not-be-written')
    write(copy, '.latexmkrc', `open(my $fh, '>', '${marker}') or die $!; print $fh 'unsafe'; close($fh);\n`)
    write(copy, 'main.tex', `% !TeX program = pdflatex\n\\documentclass{article}\n\\begin{document}\nIndependent test.\\immediate\\write18{touch ${marker}}\n\\end{document}\n`)
    const result = compileStandalone(copy, tmp, { file: 'main.tex' })
    assert.equal(fs.existsSync(marker), false)
    assert(['pass', 'unverified'].includes(result.status), JSON.stringify(result))
    if (result.status === 'unverified') t.diagnostic(`Compilation unavailable under current isolation: ${result.reason}`)
    else { assert.equal(result.hasPdf, true); assert.equal(result.exitCode, 0) }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
    fs.rmSync(outside, { recursive: true, force: true })
  }
})

test('OS write boundary allows only the independent temporary tree', (t) => {
  if (process.platform !== 'darwin' || !fs.existsSync('/usr/bin/sandbox-exec')) { t.skip('macOS sandbox-exec unavailable'); return }
  const tmp = temporary(), outside = temporary()
  try {
    const allowed = path.join(tmp, 'allowed'), denied = path.join(outside, 'denied')
    const code = `const fs = require('node:fs'); fs.writeFileSync(process.argv[1], 'ok'); try { fs.writeFileSync(process.argv[2], 'bad'); process.exitCode = 7 } catch (e) { if (e.code !== 'EPERM' && e.code !== 'EACCES') throw e }`
    const result = spawnSync('/usr/bin/sandbox-exec', ['-p', sandboxProfile(tmp), process.execPath, '-e', code, allowed, denied], { encoding: 'utf8', timeout: 30_000 })
    if (/sandbox-exec:|sandbox_apply:/.test(result.stderr)) { t.skip('Outer sandbox prevents nested sandbox-exec'); return }
    assert.equal(result.status, 0, result.stderr)
    assert.equal(fs.readFileSync(allowed, 'utf8'), 'ok')
    assert.equal(fs.existsSync(denied), false)
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); fs.rmSync(outside, { recursive: true, force: true }) }
})
