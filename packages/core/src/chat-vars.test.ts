// 값을 알 수 없는 변수가 find · fd · git · sed 의 인자 맨 앞에 오면 한 번 묻는다 (11/26 결정 "값을 알 수 없는 변수" 안 B)
import { describe, expect, it } from 'vitest'
import { commandKind } from './chat-auto.js'

const o = { cwd: '/u/p', home: '/u', inside: (a: string) => a === '/u/p' || a.startsWith('/u/p/') }
const k = (c: string) => commandKind(c, o)

describe('값을 모르는 변수', () => {
  it('옵션 하나로 지우기 · 쓰기 · 실행이 되는 프로그램에서 인자가 값을 모르는 변수로 시작하면 외부(늘 한 번 묻는다)', () => {
    for (const c of ['find . $x', 'find . "$x"', 'find $dir -name a', 'find . ${x}', 'find . ${x:-a}', 'fd $x', 'git $x', 'git log $branch', 'git diff "$base"..HEAD', 'sed $x f', 'sed -n "${n}p" f',
      'read x; find . $x', 'find . $1', 'find . "$@"', 'git -C $dir status', 'time find . $x', 'if true; then find . $x; fi', 'ls | while read l; do sed -n 1p $l; done',
      'for f in *; do find . $f; done', 'for f in *.md; do sed -n 1p "$f"; done', 'for f in $list; do git log $f; done'])
      expect(k(c), c).toBe('outside')
  })
  it('그 줄에 글자 그대로 적은 값은 넣어서 본다: 전과 같다', () => {
    // 값을 넣는 줄이 있으면 전부터 「실행」이다 (x=1; echo $x)
    for (const c of ['x=a; find . $x', 'd=src; sed -n 1p $d/a.ts', 'M=/u/p; git -C $M status', 'x=a; y=b; git log $x $y']) expect(k(c), c).toBe('run')
    expect(k('x=-delete; find . $x')).toBe('delete')
    expect(k('for x in a b; do git log $x; done')).toBe('read')
    expect(k('for x in -delete; do find . $x; done')).toBe('delete')
    // 치환에서 받은 값 · 다른 변수로 만든 값은 알 수 없다
    for (const c of ['x=$(cat f); find . $x', 'x=`cat f`; git $x', 'y=$z; find . $y', 'x=a; x=$(cat f); find . $x']) expect(k(c), c).toBe('outside')
  })
  it('옵션이 될 수 없는 값: 낱말 가운데의 변수 · 경로로 시작하는 환경 변수 · 글자로 시작하는 낱말만 도는 반복 변수', () => {
    for (const c of ['find . -name "a$x"', 'find src/$x -name a', 'sed -n 1p src/$f', 'git log --author=$who', 'sed -n "1,${n}p" f', 'find $PWD -name a', 'for f in src/*.ts; do sed -n 1p "$f"; done',
      'for f in a.md b.md; do git log $f; done', 'for f in ./*.md docs/*.md; do sed -n 1p "$f"; done'])
      expect(k(c), c).not.toBe('outside')
    expect(k('find $HOME -name a')).toBe('outside')
  })
  it('find 의 조건이 받는 값은 옵션이 되지 못한다. 값은 차례로 한 번씩만 뺀다', () => {
    for (const c of ['find . -name "$pat"', 'find . -type f -name $x', 'find . -newer "$ref" -name a', 'find . -maxdepth $n -name a']) expect(k(c), c).toBe('read')
    for (const c of ['find . -name -name $x', 'find . -name a $x', 'find . $x -name a', 'find . -name a -o $x', 'find . -print $x']) expect(k(c), c).toBe('outside')
  })
  it('이미 편집 · 삭제인 줄은 그대로다 (읽기 전용 대화가 막는 것을 묻는 것으로 풀지 않는다)', () => {
    for (const c of ['find . ${x:--delete}', 'find . $u-delete', 'find . -delete $x', 'git clean -fd $x', 'rm -rf $x; find . $y']) expect(k(c), c).toBe('delete')
    for (const c of ["sed $u 'w out.txt' a.md", 'sed -i $x f', 'git add $f', 'find . $x; touch a', 'git commit -m "$msg"']) expect(k(c), c).toBe('edit')
  })
  it('다른 프로그램은 전과 같다 (cat $f · grep x $f · echo $x)', () => {
    for (const c of ['cat $f', 'grep x $f', 'echo $x', 'ls $dir', 'wc -l $f', 'head -5 "$f"']) expect(k(c), c).toBe('read')
    expect(k('rm $f')).toBe('delete')
  })
  it("작은따옴표 안의 $ 는 글자다: sed -n '$p' · grep 'a$'", () => {
    for (const c of ["sed -n '$p' f", "sed '$d' f", "git log --format='$x'", "find . -name '$x'", "git grep 'a$' -- src"]) expect(k(c), c).toBe('read')
  })
  it('긴 줄에도 느려지지 않는다', () => {
    const t0 = Date.now()
    expect(k(`find . ${'$x '.repeat(4000)}`)).toBe('outside')
    expect(Date.now() - t0).toBeLessThan(3000)
  })
})
