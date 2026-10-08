import { describe, expect, it } from 'vitest'
import { keepLineBreaks } from './lineBreaks'

describe('편집기 줄바꿈 보존', () => {
  it('LF 파일은 그대로', () => {
    expect(keepLineBreaks('a\nb\n', 'a\nb\n')).toBe('a\nb\n')
    expect(keepLineBreaks('a\nc\n', 'a\nb\n')).toBe('a\nc\n')
  })
  it('CRLF 파일은 고치지 않으면 같은 바이트, 고치면 새 줄도 CRLF (마지막 빈 줄 포함)', () => {
    const initial = '---\r\ntitle: x\r\n---\r\n본문\r\n\r\n'
    expect(keepLineBreaks(initial.replace(/\r\n/g, '\n'), initial)).toBe(initial)
    expect(keepLineBreaks('---\ntitle: x\n---\n본문\n더함\n\n', initial)).toBe('---\r\ntitle: x\r\n---\r\n본문\r\n더함\r\n\r\n')
  })
  it('섞인 파일은 고치지 않으면 그대로 둔다', () => {
    const mixed = 'a\r\nb\nc'
    expect(keepLineBreaks('a\nb\nc', mixed)).toBe(mixed)
    expect(keepLineBreaks('a\nb\nd', mixed)).toBe('a\nb\nd')
  })
})
