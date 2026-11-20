import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { attemptStrength, evidencePaths, fileStrength, hasAttemptTrailer } from '@rw/core'
import { commitHasTrailer, firstCommitDay, recordFacts, reportFacts } from './problemGit.js'

/** 날짜를 정한 커밋 둘: 노트(10/21), 코드(10/22, 꼬리말 있음) */
function makeRepo(): { dir: string; second: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rw-problem-git-'))
  const git = (args: string[], date?: string) => execFileSync('git', ['-C', dir, ...args], {
    env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@example.com', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@example.com', ...(date && { GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date }) },
  }).toString().trim()
  git(['init', '-q', '-b', 'main'])
  fs.mkdirSync(path.join(dir, 'note'))
  fs.writeFileSync(path.join(dir, 'note', 'note.md'), '# Fit\n')
  git(['add', '.']); git(['commit', '-q', '-m', 'note'], '2026-10-21T10:00:00+09:00')
  fs.writeFileSync(path.join(dir, 'fit.py'), 'print(1)\n')
  git(['add', '.']); git(['commit', '-q', '-m', 'fit code\n\nAttempt: my-flow/b'], '2026-10-22T10:00:00+09:00')
  return { dir, second: git(['rev-parse', 'HEAD']) }
}

describe('flow evidence from git (11/20 common rules)', () => {
  it('classifies evidence: rerun, reread, pointer only', () => {
    expect(fileStrength('pr:12')).toBe('pointer')
    expect(fileStrength('#12')).toBe('pointer')
    expect(fileStrength('3f2a1b9c')).toBe('pointer')
    expect(fileStrength('https://github.com/o/r/pull/3')).toBe('pointer')
    expect(fileStrength('workbench/tasks/fit.md')).toBe('pointer')
    expect(fileStrength('workbench/topics/fit/note.md#stability')).toBe('reread')
    expect(fileStrength('bib:doe2015 p.4')).toBe('reread')
    expect(attemptStrength({ files: [] })).toBeUndefined()
    expect(attemptStrength({ files: ['pr:1'] })).toBe('pointer')
    expect(attemptStrength({ files: ['pr:1', 'note.md'] })).toBe('reread')
    expect(attemptStrength({ files: ['pr:1'], test: 'pytest' })).toBe('rerun')
    expect(evidencePaths(['pr:1', 'note/note.md#fit', 'note/note.md', 'bib:x', 'fit.py'])).toEqual(['note/note.md', 'fit.py'])
    expect(hasAttemptTrailer('fit\n\nAttempt: my-flow/b\n', 'my-flow', 'B')).toBe(true)
    expect(hasAttemptTrailer('fit\n\nAttempt: my-flow/bc\n', 'my-flow', 'b')).toBe(false)
  })

  it('fills the day from the first commit of the evidence and checks the trailer', async () => {
    const { dir, second } = makeRepo()
    expect(await firstCommitDay(dir, ['fit.py', 'note/note.md#fit'])).toBe('2026-10-21')
    expect(await firstCommitDay(dir, ['fit.py'])).toBe('2026-10-22')
    expect(await firstCommitDay(dir, ['pr:3'])).toBeUndefined()
    expect(await recordFacts(dir, undefined, ['fit.py'])).toEqual({ firstDay: '2026-10-22' })
    expect(await recordFacts(dir, '2026-01-01', ['fit.py'])).toEqual({})
    expect(await commitHasTrailer(dir, second, 'my-flow', 'b')).toBe(true)
    expect(await reportFacts(dir, 'my-flow', 'b')).toEqual({ trailer: true })
    expect(await reportFacts(dir, 'my-flow', 'c')).toEqual({ trailer: false })
    expect(await reportFacts(dir, 'my-flow', 'b', `${second}^`)).toEqual({ trailer: false })
    // git 저장소가 아니면 아무것도 적지 않는다 (경고하지 않음)
    const plain = fs.mkdtempSync(path.join(os.tmpdir(), 'rw-problem-plain-'))
    expect(await recordFacts(plain, undefined, ['x.md'])).toEqual({})
    expect(await reportFacts(plain, 'my-flow', 'b', 'abc123')).toEqual({})
  })
})
