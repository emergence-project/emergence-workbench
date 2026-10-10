import { describe, expect, it } from 'vitest'
import { summaryOfMarkdown } from './noteMeta.js'

describe('Markdown 노트의 자동 설명', () => {
  it('\\(…\\) 수식도 $…$로 보이고, 안의 _·*가 지워지지 않는다', () => {
    expect(summaryOfMarkdown('오일러 지표 \\(\\chi(G)_\\Sigma\\)가 2이면 $\\deg_{v}$로 줄인다.'))
      .toBe('오일러 지표 $\\chi(G)_\\Sigma$가 2이면 $\\deg_{v}$로 줄인다.')
  })
  it('수식이 없으면 그대로', () => {
    expect(summaryOfMarkdown('# 제목\n\n첫 문단 **굵게** [[링크|이름]].')).toBe('첫 문단 굵게 이름.')
  })
  it('첫 문단 앞의 주석 줄은 건너뛴다', () => {
    expect(summaryOfMarkdown('---\ntitle: Note\n---\n# Heading\n<!-- Hidden note -->\nFirst paragraph.'))
      .toBe('First paragraph.')
  })
  it.each([
    '<!-- Hidden note -->',
    '# Heading\n<!-- Hidden note -->\n<!-- Another note -->',
    '<!--\nHidden note\n-->',
    '<!-- Unclosed note\nHidden text',
  ])('주석뿐이면 설명이 없다: %s', (text) => {
    expect(summaryOfMarkdown(text)).toBeUndefined()
  })
  it('여러 줄 주석은 안의 코드·수식 표시까지 통째로 건너뛴다', () => {
    expect(summaryOfMarkdown('<!--\nHidden note\n```\n$$\n-->\nFirst paragraph.')).toBe('First paragraph.')
  })
  it('줄 안의 주석만 지우고 앞뒤 글은 남긴다', () => {
    expect(summaryOfMarkdown('First <!-- hidden --> paragraph <!-- another --> continues.\nNext line.'))
      .toBe('First paragraph continues. Next line.')
    expect(summaryOfMarkdown('First <!-- hidden\nnote --> paragraph.')).toBe('First paragraph.')
  })
  it.each(['<!-- Hidden note -->', '<!--\nHidden note\n-->'])('모은 문단은 주석 줄에서 끝난다: %s', (comment) => {
    expect(summaryOfMarkdown(`First paragraph.\n${comment}\nSecond paragraph.`)).toBe('First paragraph.')
  })
  it.each(['```', '~~~', '$$'])('건너뛰는 %s 블록 안의 <!--는 주석으로 보지 않는다', (delimiter) => {
    expect(summaryOfMarkdown(`${delimiter}\n<!-- Hidden note\n${delimiter}\nFirst paragraph.`)).toBe('First paragraph.')
  })
})
