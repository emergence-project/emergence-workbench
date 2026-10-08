// Check trigger coverage without running TeX or starting another CI job.
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const YAML = createRequire(path.join(root, 'apps/server/package.json'))('yaml')

// Files that select or produce compiler/export input. Add new input helpers here.
export const TEX_INPUT_FILES = [
  'apps/server/src/latex.ts', 'apps/server/src/latexFiles.ts', 'apps/server/src/latexPreview.ts',
  'apps/server/src/manuscript.ts', 'apps/server/src/manuscriptFreshness.ts', 'apps/server/src/mainNote.ts',
  'apps/server/src/workbench.ts', 'apps/server/src/library.ts', 'apps/server/src/libraryNotes.ts',
  'apps/server/src/conceptNotes.ts', 'apps/server/src/figureEmbeds.ts', 'apps/server/src/figures.ts',
  'apps/server/src/noteBody.ts', 'apps/server/src/noteBib.ts', 'apps/server/src/noteMeta.ts',
  'apps/server/src/noteCopy.ts', 'apps/server/src/noteExport.ts',
  'apps/server/src/routes/blocks.ts', 'apps/server/src/routes/manuscript.ts', 'apps/server/src/routes/library.ts',
  'apps/server/src/routes/latexChoice.ts', 'apps/server/src/routes/latexSetup.ts',
  'apps/server/src/testkit.ts', 'packages/core/src/block-header.ts',
]

function files(repoRoot, dir) {
  return fs.readdirSync(path.join(repoRoot, dir), { withFileTypes: true }).flatMap((entry) => {
    const file = `${dir}/${entry.name}`
    return entry.isDirectory() ? files(repoRoot, file) : [file]
  })
}

export function requiredTexPaths(repoRoot = root) {
  const guardedTests = files(repoRoot, 'apps/server/src').filter((file) => file.endsWith('.test.ts') && /\bhasLatex\b/.test(fs.readFileSync(path.join(repoRoot, file), 'utf8')))
  const coreInputs = files(repoRoot, 'packages/core/src').filter((file) => /\/(?:latex-.*|(?:md-latex|block-header)(?:\.test)?)\.ts$/.test(file))
  const templateInputs = [...files(repoRoot, 'templates/latex'), ...files(repoRoot, 'templates/research-library')]
    .filter((file) => /\.(?:tex|sty|cls|bib|png|pdf|jpe?g|svg|eps)$/.test(file))
  return [...new Set([...TEX_INPUT_FILES, ...guardedTests, ...coreInputs, ...templateInputs])].sort()
}

// tex.yml uses positive literal paths and * / ** wildcards. Do not require the
// newer Node 22.5 path.matchesGlob API while Node 22.0 remains supported.
export function matchesTexPath(file, pattern) {
  if (/[?\[\]{}()!]/.test(pattern)) throw new Error('tex.yml paths support only literal paths, * and **')
  let regex = ''
  for (let i = 0; i < pattern.length; i++) {
    if (pattern[i] === '*') {
      if (pattern[i + 1] === '*') {
        i++
        if (pattern[i + 1] === '/') { regex += '(?:[^/]+/)*'; i++ }
        else regex += '.*'
      } else regex += '[^/]*'
    } else regex += pattern[i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }
  return new RegExp(`^${regex}$`).test(file)
}

export function texCoverageGaps(repoRoot = root, patterns) {
  const paths = patterns ?? YAML.parse(fs.readFileSync(path.join(repoRoot, '.github/workflows/tex.yml'), 'utf8')).on?.pull_request?.paths
  if (!Array.isArray(paths) || paths.some((p) => typeof p !== 'string' || p.startsWith('!'))) throw new Error('tex.yml must have a positive pull_request.paths list')
  return requiredTexPaths(repoRoot).filter((file) => !paths.some((pattern) => matchesTexPath(file, pattern)))
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const gaps = texCoverageGaps()
  if (gaps.length) {
    console.error(`TeX 검사 대상 누락 (${gaps.length}개):\n${gaps.map((file) => `  - ${file}`).join('\n')}`)
    process.exitCode = 1
  } else console.log('TeX 검사 대상 누락 없음')
}
