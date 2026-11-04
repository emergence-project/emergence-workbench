import { describe, expect, it } from 'vitest'
import { aboutIndex, definitionsFirst, nodeText } from './aboutSearch'
import { rank } from './searchMatch'

describe('About search (10/30 16:51)', () => {
  it('reads text out of bold and code', () => {
    expect(nodeText(<>a <b>b</b> <code>c</code></>)).toBe('a b c')
  })
  it('puts the definition of a screen part first', () => {
    const hits = definitionsFirst(rank(aboutIndex(), '레일', (a) => [a.text], 200), '레일')
    expect(hits[0]!.text.startsWith('레일:')).toBe(true)
    expect(hits[0]!.to).toEqual({ page: 'about', part: 'design', anchor: 'names' })
  })
})
