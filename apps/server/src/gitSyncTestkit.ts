// Local-only Git fixtures: a bare remote and one working copy. Never contact GitHub.
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fixture } from './testkit.js'

export const gitTest = (root: string, ...args: string[]) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim()

export function syncRepo(tmp: string, name: string, files: Record<string, string> = {}) {
  const remote = path.join(tmp, `${name}.git`)
  const mine = path.join(tmp, name)
  execFileSync('git', ['init', '-q', '--bare', '-b', 'main', remote])
  execFileSync('git', ['clone', '-q', remote, mine])
  gitTest(mine, 'config', 'user.name', 'Test')
  gitTest(mine, 'config', 'user.email', 'test@example.com')
  fs.cpSync(fixture, mine, { recursive: true, filter: (src) => !src.includes('.build') })
  fs.appendFileSync(path.join(mine, '.gitignore'), '\nworkbench/STATUS.md\nignored.txt\n')
  for (const [file, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(mine, file)), { recursive: true })
    fs.writeFileSync(path.join(mine, file), content)
  }
  gitTest(mine, 'add', '.')
  gitTest(mine, 'commit', '-qm', 'Initial research')
  gitTest(mine, 'push', '-q', '-u', 'origin', 'main')

  // Author incoming commits directly in the bare store, with a disposable index.
  const incoming = (changes: Record<string, string | null>) => {
    const index = path.join(tmp, `${name}-index`)
    const env = { ...process.env, GIT_INDEX_FILE: index, GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 'test@example.com', GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 'test@example.com' }
    const g = (args: string[], input?: string) => execFileSync('git', ['-C', remote, ...args], { encoding: 'utf8', env, input }).trim()
    try {
      const parent = g(['rev-parse', 'main'])
      g(['read-tree', parent])
      for (const [file, content] of Object.entries(changes)) {
        if (content === null) g(['update-index', '-z', '--index-info'], `0 ${'0'.repeat(40)}\t${file}\0`)
        else {
          const blob = g(['hash-object', '-w', '--stdin'], content)
          g(['update-index', '--add', '--cacheinfo', '100644', blob, file])
        }
      }
      const commit = g(['commit-tree', g(['write-tree']), '-p', parent], 'Incoming change\n')
      g(['update-ref', 'refs/heads/main', commit])
      return commit
    } finally { fs.rmSync(index, { force: true }) }
  }
  return { mine, remote, incoming }
}
