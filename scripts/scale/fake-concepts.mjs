import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const root = fs.realpathSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'))
export function sandboxPath(target) {
  const sandbox = path.join(fs.realpathSync(root), '.sandbox')
  const abs = path.resolve(target)
  if (!abs.startsWith(sandbox + path.sep)) throw new Error('Target must be inside this repo .sandbox/')
  // Check existing ancestors too: a symlink must never escape the sandbox.
  for (let p = abs; p !== root; p = path.dirname(p)) {
    if (fs.existsSync(p) && !fs.realpathSync(p).startsWith(sandbox + path.sep) && fs.realpathSync(p) !== sandbox) throw new Error('Symlink escapes .sandbox/')
  }
  return abs
}
export function fakeConcepts(target, count = 10000) {
  const lib = sandboxPath(target)
  if (!Number.isSafeInteger(count) || count < 1) throw new Error('N must be a positive integer')
  fs.mkdirSync(path.join(lib, 'concepts'), { recursive: true })
  const prose = 'The chromatic polynomial determines how many proper colorings exist for each number of colors. Counting arguments obey the stated assumptions for large planar graphs. '.repeat(12)
  for (let i = 0; i < count; i++) {
    const id = `scale-${String(i).padStart(5, '0')}`
    const body = i % 50 === 0 ? `# Concept ${i}\n\n## Definition\n` : `# Concept ${i}\n\n${prose}\n\nSee [[Concept ${(i + 1) % count}]] and [[Concept ${(i + 7) % count}]].\n${i % 10 === 0 ? '- [ ] TODO: verify the boundary case.\n' : ''}${i % 20 === 0 ? '![[scale-diagram]]\n' : ''}`
    fs.writeFileSync(path.join(lib, 'concepts', `${id}.md`), `---\ntitle: Concept ${i}\nsubject: Mathematics › Field ${i % 20} › Topic ${i % 100}\naliases: [Example ${i}, Alias ${i}]\nsources: [scale-paper]\n---\n${body}`, { flag: 'wx' })
    fs.utimesSync(path.join(lib, 'concepts', `${id}.md`), 1700000000 + i, 1700000000 + i)
  }
  return lib
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  fakeConcepts(process.argv[2] ?? '', Number(process.argv[3] ?? 10000))
}
