import { describe, expect, it } from 'vitest'
import { findCites, findMath, findWikiLinks, slashQuery } from './conceptLiveParse'

describe('개념노트 편집기 자리 찾기', () => {
  it('수식: 블록과 줄 안, 글자 달러와 코드는 빼고', () => {
    const t = 'a $x^2$ b\n$$\nI(A:C|B)=0\n$$\nprice \\$5 and $ 6 $ `$no$`'
    const code = t.indexOf('`$no$`')
    const m = findMath(t, [[code, code + 6]])
    expect(m.map((s) => [s.tex, s.block])).toEqual([['x^2', false], ['I(A:C|B)=0', true]])
    expect(t.slice(m[1]!.from, m[1]!.to)).toBe('$$\nI(A:C|B)=0\n$$')
  })
  it('닫히지 않은 수식은 수식이 아니다', () => {
    expect(findMath('only $x here\nand $$ open')).toEqual([])
  })
  it('[[링크]]: 다른 이름과 절, 그림 끼우기는 빼고', () => {
    expect(findWikiLinks('see [[Kempe recoloring]], [[PG|plane graph]], [[EF#정의]] ![[fig.png]]').map((l) => [l.target, l.label]))
      .toEqual([['Kempe recoloring', 'Kempe recoloring'], ['PG', 'plane graph'], ['EF#정의', 'EF']])
  })
  it('[@인용]', () => {
    const t = 'x [@a2020] and [@b; @c].'
    expect(findCites(t).map((c) => t.slice(c.from, c.to))).toEqual(['[@a2020]', '[@b; @c]'])
  })
  it('"/" 명령은 줄 머리나 빈칸 뒤에서만', () => {
    expect(slashQuery('/')).toBe('')
    expect(slashQuery('text /정')).toBe('정')
    expect(slashQuery('a/b')).toBeNull()
    expect(slashQuery('http://x')).toBeNull()
  })
})
