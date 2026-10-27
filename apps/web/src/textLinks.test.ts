import { describe, expect, it } from 'vitest'
import { textLinks } from './textLinks'

describe('textLinks', () => {
  it('splits addresses out of text', () => {
    expect(textLinks('시안: https://claude.ai/artifact/ML85 「3. 자리」')).toEqual([
      { kind: 'text', text: '시안: ' },
      { kind: 'url', text: 'https://claude.ai/artifact/ML85' },
      { kind: 'text', text: ' 「3. 자리」' },
    ])
  })
  it('leaves trailing punctuation and unmatched brackets outside', () => {
    expect(textLinks('(https://github.com/a/b/pull/3).')).toEqual([
      { kind: 'text', text: '(' },
      { kind: 'url', text: 'https://github.com/a/b/pull/3' },
      { kind: 'text', text: ').' },
    ])
    expect(textLinks('https://en.wikipedia.org/wiki/A_(b)')[0]).toEqual({ kind: 'url', text: 'https://en.wikipedia.org/wiki/A_(b)' })
  })
  it('keeps plain text whole', () => {
    expect(textLinks('주소 없음')).toEqual([{ kind: 'text', text: '주소 없음' }])
    expect(textLinks('https:// 만')).toEqual([{ kind: 'text', text: 'https:// 만' }])
  })
})
