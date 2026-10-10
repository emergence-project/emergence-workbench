import { describe, expect, it } from 'vitest'
import { frontMatter, frontMatterEnd, frontMatterLines, stripFrontMatter } from './front-matter.js'

describe('frontMatter', () => {
  it('머리말과 본문을 나눈다', () => {
    expect(frontMatter('---\na: 1\nb: 2\n---\n# 제목\n')).toEqual({ yaml: 'a: 1\nb: 2', head: '---\na: 1\nb: 2\n---\n', body: '# 제목\n', eol: '\n' })
  })
  it('CRLF와 줄 끝 공백', () => {
    const f = frontMatter('--- \r\na: 1\r\n---  \r\n본문')!
    expect(f.yaml).toBe('a: 1')
    expect(f.body).toBe('본문')
    expect(f.eol).toBe('\r\n')
  })
  it('닫는 줄이 파일 끝이어도 된다', () => {
    expect(frontMatter('---\na: 1\n---')?.body).toBe('')
  })
  it('머리말이 아닌 것', () => {
    expect(frontMatter('본문\n---\na: 1\n---\n')).toBeNull()
    expect(frontMatter('---\na: 1\n')).toBeNull() // 닫히지 않음
    expect(frontMatter('﻿---\na: 1\n---\n')).toBeNull() // BOM
    expect(frontMatter('---\na: 1\n----\nb\n')).toBeNull() // 닫는 줄은 --- 만
    expect(frontMatter('----\na: 1\n---\n')).toBeNull()
  })
  it('닫는 줄 뒤 글이 붙으면 다음 --- 까지', () => {
    expect(frontMatter('---\na: 1\n---x\nb: 2\n---\n본문')?.yaml).toBe('a: 1\n---x\nb: 2')
  })
  it('본문의 --- 는 건드리지 않는다', () => {
    expect(stripFrontMatter('---\na: 1\n---\n본문\n\n---\n뒤')).toBe('본문\n\n---\n뒤')
  })
})

describe('도우미', () => {
  it('frontMatterEnd', () => {
    expect(frontMatterEnd('---\na: 1\n---\n본문')).toBe(13)
    expect(frontMatterEnd('본문')).toBe(0)
  })
  it('stripFrontMatter', () => {
    expect(stripFrontMatter('---\na: 1\n---\n본문')).toBe('본문')
    expect(stripFrontMatter('본문\n---\n')).toBe('본문\n---\n')
  })
  it('frontMatterLines', () => {
    expect(frontMatterLines('---\na: 1\n---\n본문')).toBe(3)
    expect(frontMatterLines('---\na: 1\n---')).toBe(3)
    expect(frontMatterLines('본문')).toBe(0)
  })
})
