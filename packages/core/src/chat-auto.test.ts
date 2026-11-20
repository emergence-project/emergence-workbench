import { describe, expect, it } from 'vitest'
import { autoCustom, autoOf, commandKind, presetAuto, runProgram, runPrograms } from './chat-auto.js'

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
  it('「늘」은 줄 안의 실행 프로그램 모두를 본다', () => {
    expect(runPrograms('pnpm test && ./deploy.sh')).toEqual(['pnpm test', 'deploy.sh'])
    expect(runPrograms('cd x && pnpm test | tail -5')).toEqual(['pnpm test'])
    expect(runPrograms('python a.py; git commit -m x; mv a b')).toEqual(['python', 'git commit', 'mv'])
    expect(runPrograms('echo $(node x.js)')).toEqual(['node'])
    expect(runPrograms('GIT_PAGER=less git log')).toEqual(['GIT_PAGER= git log'])
    expect(runPrograms('ls | wc -l')).toEqual([])
  })
  it('가운데의 ../ · 옵션에 붙여 적은 경로로 폴더를 벗어나면 외부', () => {
    for (const c of ['cat workbench/../../other/secret', 'ls a/b/../../..', 'grep -r x --file=/etc/hosts .', 'grep -f/etc/hosts a', 'rg x --ignore-file=~/.ssh/config', 'cd workbench/../.. && ls']) expect(k(c), c).toBe('outside')
    for (const c of ['cat workbench/../a.md', "grep -rn \"from '../x'\" workbench", 'rg --glob=*.md x', 'ls --color=auto', 'cat --number a.md', 'grep --file=patterns.txt a']) expect(k(c), c).toBe('read')
  })
  it('셸의 묶음 말 뒤의 명령도 본다', () => {
    for (const c of ['for f in a b; do rm $f; done', 'if true; then rm x; fi', 'while read l; do rm "$l"; done < list', '( rm x )', '(rm x)', '{ rm x; }', '! rm x']) expect(k(c), c).toBe('delete')
    for (const c of ['for f in *.md; do wc -l "$f"; done', 'if [ -f a ]; then cat a; else echo none; fi', '(cd workbench && ls)', 'while read l; do echo "$l"; done < a']) expect(k(c), c).toBe('read')
    for (const c of ['for c in rm; do $c x; done', 'case x in a) rm b;; esac']) expect(k(c), c).not.toBe('read')
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

describe('읽기로 보이던 쓰기 · 실행 (11/20 보안 검토)', () => {
  it('뒤에서 돌리기(&) · 겹친 $( ) · env 앞말 뒤의 명령도 본다', () => {
    expect(k('ls & rm -rf build')).toBe('delete')
    expect(k('echo "$(echo $(rm a.md))"')).toBe('delete')
    expect(k("env sh -c 'rm -rf notes'")).toBe('run')
    expect(k('FOO=1 env -i python x.py')).toBe('run')
    expect(k('env')).toBe('read')
    expect(k('wc -l a 2>&1 | head')).toBe('read')
  })
  it('읽는 프로그램의 쓰는 쓰임', () => {
    for (const c of ["sed -n 'w out.txt' a.md", 'sort -o a b', 'sort -uo a b', 'uniq a b', 'xxd -r a b', "yq -i '.a=1' f.yaml", 'find . -fprint out', 'tree -o out', 'pdftotext a.pdf', 'echo x 1> y', 'echo x &> y', 'ls 2> err.txt'])
      expect(k(c), c).toBe('edit')
    for (const c of ['awk \'BEGIN{"rm -rf x" | getline}\'', 'awk \'{print | "sh"}\' f']) expect(k(c), c).toBe('run')
    for (const c of ["awk '$3 == 100 {n++} END{print n}' f", "sed -n '2p' a.md", 'sort -n -k2 a', 'uniq -c a', 'xxd a | head', 'pdftotext a.pdf -', "yq '.a' f.yaml"]) expect(k(c), c).toBe('read')
  })
  it('<( ) 안의 명령 · git의 쓰는 쓰임 · rg --pre · $HOME 경로', () => {
    expect(k('cat <(rm -rf x)')).toBe('delete')
    expect(k('diff <(curl https://example.com) a')).toBe('outside')
    for (const c of ['git branch -D old', 'git tag -d v1', 'git branch --delete old']) expect(k(c), c).toBe('delete')
    for (const c of ['git branch -m a b', 'git branch new', 'git tag v1', 'git tag -a v1 -m x', 'git config alias.x "!rm -rf ."', 'git config --unset a.b', 'git remote add o u', 'git remote set-url origin u', 'git log --output=x', 'git diff --output x'])
      expect(k(c), c).toBe('edit')
    for (const c of ['git branch', 'git branch -a', 'git branch -vv', 'git branch -r', 'git branch --show-current', 'git branch --contains abc', 'git tag', 'git tag -l "v*"', 'git tag --sort=-creatordate', 'git config user.name', 'git config --get a.b', 'git config -l', 'git remote -v', 'git remote show origin', 'git log --oneline -5', 'git diff a b'])
      expect(k(c), c).toBe('read')
    expect(k('rg --pre cat x')).toBe('run')
    for (const c of ['GIT_PAGER="rm x" git log', 'LESSOPEN="|rm %s" less f', 'PATH=. ls', 'env GIT_EXTERNAL_DIFF=rm git diff', 'sort --compress-program=rm a']) expect(k(c), c).toBe('run')
    for (const c of ['LC_ALL=C sort a', 'TZ=UTC date', 'NO_COLOR=1 git diff']) expect(k(c), c).toBe('read')
    for (const c of ['git grep -Orm x', 'git grep --open-files-in-pager=rm x', 'git log -p --ext-diff']) expect(k(c), c).toBe('run')
    expect(k('git grep -n foo')).toBe('read')
    expect(k('rg -n foo src')).toBe('read')
    expect(k('cat $HOME/.ssh/id_rsa')).toBe('outside')
    expect(k('cat "${HOME}/.ssh/id_rsa"')).toBe('outside')
    expect(k('cat ~other/x')).toBe('outside')
  })
})
