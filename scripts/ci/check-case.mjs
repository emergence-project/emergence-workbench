// Fail when two tracked files differ only in letter case, or resolve to the same import path
// (Foo.tsx and foo.ts). macOS file systems ignore case, so the user's Mac picks the wrong file
// and the app update build fails there while Linux CI passes (2026-10-05: ProjectProfile.tsx vs projectProfile.ts).
import { execFileSync } from 'node:child_process'

const files = execFileSync('git', ['ls-files'], { encoding: 'utf8' }).split('\n').filter(Boolean)
const seen = new Map()
const clashes = []
for (const f of files) {
  for (const key of new Set([f.toLowerCase(), f.toLowerCase().replace(/\.(tsx?|jsx?|mjs|cjs)$/, '')])) {
    const other = seen.get(key)
    if (other && other !== f) clashes.push(`${other} ↔ ${f}`)
    else seen.set(key, f)
  }
}
if (clashes.length) {
  console.error(`대소문자만 다른 파일 이름 (맥에서 서로 헷갈립니다):\n${[...new Set(clashes)].map((c) => `  - ${c}`).join('\n')}`)
  process.exit(1)
}
console.log('파일 이름 대소문자 검사 통과')
