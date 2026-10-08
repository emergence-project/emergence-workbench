import { describe, expect, it } from 'vitest'
import { applyNoteFixes, parseNoteFixes, splitNoteFixes } from './note-fix.js'

describe('note fixes', () => {
  const answer = ['고칠 곳은 두 군데입니다.', '', '```before', '$a+b$ 이다.', '```', '', '```after', '$a-b$ 이다.', '```', '', '~~~~before', '```', 'x', '```', '~~~~', '~~~~after', 'y', '~~~~', '', '```python', 'print(1)', '```'].join('\n')
  it('pairs before/after blocks in order and ignores other code', () => {
    expect(parseNoteFixes(answer)).toEqual([{ before: '$a+b$ 이다.', after: '$a-b$ 이다.' }, { before: '```\nx\n```', after: 'y' }])
    expect(parseNoteFixes('```after\nx\n```')).toEqual([])
    expect(splitNoteFixes(answer).text).toBe('고칠 곳은 두 군데입니다.\n\n```python\nprint(1)\n```')
  })
  it('applies only when each before occurs exactly once', () => {
    const fixes = parseNoteFixes(answer)
    expect(applyNoteFixes('앞 $a+b$ 이다.\n```\nx\n```\n뒤', fixes)).toEqual({ text: '앞 $a-b$ 이다.\ny\n뒤' })
    expect(applyNoteFixes('없음', fixes)).toHaveProperty('error')
    expect(applyNoteFixes('$a+b$ 이다. $a+b$ 이다.', fixes.slice(0, 1))).toEqual({ error: '바꿀 글이 노트에 2곳 있어 어디를 바꿀지 모릅니다' })
  })
  it('keeps $ patterns in the replacement literal', () => {
    expect(applyNoteFixes('a', [{ before: 'a', after: '$& $1' }])).toEqual({ text: '$& $1' })
  })
})
