import { describe, expect, it } from 'vitest'
import { autoCustom, autoOf, commandKind, presetAuto, runProgram } from './chat-auto.js'

const o = { cwd: '/u/p', home: '/u', inside: (a: string) => a === '/u/p' || a.startsWith('/u/p/') || a.startsWith('/u/lib/') }
const k = (c: string) => commandKind(c, o)

describe('명령이 하는 일', () => {
  it('읽기: 보는 명령과 git 보기, 폴더 안 경로', () => {
    for (const c of ['ls', 'cat a.md | head -3', 'grep -rn x workbench', 'git log --oneline -5', 'git diff', 'find . -name "*.md"', "sed -n '1,5p' a.md", 'cd workbench && ls', 'cat /u/lib/x.md', 'wc -l a 2>&1', 'ls > /dev/null'])
      expect(k(c), c).toBe('read')
  })
  it('편집 · 삭제', () => {
    for (const c of ["sed -i '' 's/a/b/' a.md", 'mv a b', 'echo x > out.txt', 'git add . && git commit -m x', 'git checkout main'])
      expect(k(c), c).toBe('edit')
    for (const c of ['rm a.md', 'ls && rm -rf build', 'find . -name x -delete', 'git reset --hard', 'git checkout -- a.md', 'git clean -fd'])
      expect(k(c), c).toBe('delete')
  })
  it('실행: 모르는 프로그램', () => {
    for (const c of ['python run.py', 'julia x.jl', 'pnpm test', 'find . -exec wc {} ;', 'make']) expect(k(c), c).toBe('run')
  })
  it('외부: 폴더 밖 · 올리기 · 설치 · 내려받기', () => {
    for (const c of ['git push', 'curl https://x', 'pip install numpy', 'pnpm add zod', 'python -m pip install x', 'ls ~/Desktop', 'cat /etc/hosts', 'echo x > ../other/a', 'cd .. && ls', 'ls $(curl x)', 'sudo ls'])
      expect(k(c), c).toBe('outside')
    expect(k('ls /tmp/x')).toBe('read')
  })
  it('따옴표 안의 이음표는 나누지 않는다', () => {
    expect(k("grep 'a && rm b' x")).toBe('read')
    expect(k('echo "x; git push"')).toBe('read')
  })
  it('「늘」의 프로그램 이름', () => {
    expect(runProgram('cd x && python run.py --n 3')).toBe('python')
    expect(runProgram('pnpm test -- a')).toBe('pnpm test')
    expect(runProgram('A=1 julia x.jl')).toBe('julia')
  })
})

describe('토글 기본값', () => {
  it('권한 이름마다', () => {
    expect(presetAuto('read', 'ask')).toEqual({ read: true, run: false, web: false })
    expect(presetAuto('notes', 'ask')).toEqual({ read: false, run: false, web: false })
    expect(presetAuto('notes', 'edit')).toEqual({ read: true, run: false, web: false })
    expect(autoOf({ write: 'notes', mode: 'ask', auto: { web: true } })).toEqual({ read: false, run: false, web: true })
    expect(autoCustom({ write: 'notes', mode: 'edit', auto: { read: true } })).toBe(false)
    expect(autoCustom({ write: 'notes', mode: 'edit', auto: { run: true } })).toBe(true)
  })
})
