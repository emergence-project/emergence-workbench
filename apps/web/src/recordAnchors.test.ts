import { describe, expect, it } from 'vitest'
import { findRecordRange, matchRecordText, projectRecordSource, renderedRangeFromSource, selectionAnchor, sourceRangeFromRendered } from './recordAnchors'

describe('record selection anchors', () => {
  it('keeps source bytes, full-file line numbers and 32 characters of context', () => {
    const source = `---\ntitle: 노트\n---\n${'앞'.repeat(40)}\n**선택한 글**\n${'뒤'.repeat(40)}`
    const from = source.indexOf('선택한')
    expect(selectionAnchor(source, from, from + '선택한 글'.length)).toEqual({
      quote: '선택한 글', line: 5, prefix: source.slice(0, from).slice(-32), suffix: source.slice(from + '선택한 글'.length).slice(0, 32),
    })
    expect(source).toContain('**선택한 글**')
  })

  it('normalizes CRLF anchors while keeping exact multiline contents and backward selections', () => {
    const source = '머리\r\n첫 **줄**\r\n둘째 줄\r\n끝'
    const from = source.indexOf('첫'), to = source.indexOf('\r\n끝')
    expect(selectionAnchor(source, to, from)).toEqual({ quote: '첫 **줄**\n둘째 줄', line: 2, prefix: '머리\n', suffix: '\n끝' })
    expect(selectionAnchor(source, 0, 0)).toBeNull()
    expect(selectionAnchor(' \n ', 0, 3)).toBeNull()
  })

  it('maps a formatted read selection to the raw source, including intervening syntax', () => {
    const source = '---\ntitle: 노트\n---\n## 시작\n\n첫 **중요한 글**과 [링크](https://example.com)를 읽는다.'
    const offset = source.indexOf('## 시작')
    const rendered = '시작 첫 중요한 글과 링크를 읽는다.'
    const from = rendered.indexOf('중요한'), to = rendered.indexOf('를 읽는다')
    const range = sourceRangeFromRendered(source, rendered, { from, to }, offset)!
    expect(source.slice(range.from, range.to)).toBe('중요한 글**과 [링크')
    expect(selectionAnchor(source, range.from, range.to)?.line).toBe(6)
  })

  it('maps multiline and repeated rendered quotes by context and occurrence order', () => {
    const source = '## 첫 절\n\n반복 **낱말**\n둘째 줄\n\n## 다음 절\n\n반복 **낱말**\n둘째 줄'
    const rendered = '첫 절 반복 낱말 둘째 줄 다음 절 반복 낱말 둘째 줄'
    const from = rendered.lastIndexOf('반복'), to = rendered.length
    const raw = sourceRangeFromRendered(source, rendered, { from, to })!
    expect(raw.from).toBe(source.lastIndexOf('반복'))
    expect(selectionAnchor(source, raw.from, raw.to)).toMatchObject({ line: 8, quote: '반복 **낱말**\n둘째 줄' })
    expect(matchRecordText('same same same', { from: 5, to: 9 }, 'same same same')).toEqual({ from: 5, to: 9 })
  })

  it('keeps source equations and citation syntax inside a rendered sentence selection', () => {
    const source = '앞 문장. 켐페 사슬 $K(x)$과 [@ipsum]의 결과를 사용한다. 뒤 문장.'
    const rendered = '앞 문장. 켐페 사슬 K(x)과 [1]의 결과를 사용한다. 뒤 문장.'
    const from = rendered.indexOf('켐페'), to = rendered.indexOf(' 뒤 문장.')
    const raw = sourceRangeFromRendered(source, rendered, { from, to })!
    expect(source.slice(raw.from, raw.to)).toBe('켐페 사슬 $K(x)$과 [@ipsum]의 결과를 사용한다.')
    expect(renderedRangeFromSource(source, raw, rendered)).toEqual({ from, to })
  })

  it('maps a read selection across table rows and formulas to the raw table source (10/7 12:12)', () => {
    const source = '앞\n\n| 기호 | 뜻 |\n|---|---|\n| $G$ | 만유인력 상수 $6.674\\times10^{-11}$ |\n| $h$ | 깊이 |\n\n뒤'
    // Read mode renders cells as blocks and each formula as its TeX between $ marks (recordMarks visibleText).
    const rendered = '앞 기호 뜻 $G$ 만유인력 상수 $6.674\\times10^{-11}$ $h$ 깊이 뒤'
    const from = rendered.indexOf('기호'), to = rendered.indexOf(' 뒤')
    const raw = sourceRangeFromRendered(source, rendered, { from, to })!
    expect(source.slice(raw.from, raw.to)).toBe('기호 | 뜻 |\n|---|---|\n| $G$ | 만유인력 상수 $6.674\\times10^{-11}$ |\n| $h$ | 깊이')
  })
})

describe('record mark ranges', () => {
  it('uses context to disambiguate quotes on the same line', () => {
    const source = '앞 글 · 뒤 글'
    expect(findRecordRange(source, { quote: '글', line: 1, prefix: '뒤 ' })).toEqual({ from: 8, to: 9 })
  })

  it('uses the re-anchored line when old context changed', () => {
    const source = '첫 낱말\n\n바뀐 낱말\n마지막'
    const from = source.lastIndexOf('낱말')
    expect(findRecordRange(source, { quote: '낱말', line: 3, prefix: '옛 앞', suffix: '옛 뒤' })).toEqual({ from, to: from + 2 })
  })

  it('never draws a lost, missing or empty highlight', () => {
    expect(findRecordRange('있는 글', { quote: '있는', line: 1, lost: true })).toBeNull()
    expect(findRecordRange('있는 글', { quote: '없는', line: 1 })).toBeNull()
    expect(findRecordRange('있는 글', {})).toBeNull()
  })

  it('maps normalized server quotes back to original CRLF offsets', () => {
    const source = '머리\r\n첫 줄\r\n둘째 줄\r\n끝'
    const from = source.indexOf('첫'), to = source.indexOf('\r\n끝')
    expect(findRecordRange(source, { quote: '첫 줄\n둘째 줄', line: 2 })).toEqual({ from, to })
  })

  it('draws raw Markdown quotes across inline elements and multiple lines', () => {
    const source = '첫 **중요한 글**과 `코드`\n다음 줄'
    const rendered = '첫 중요한 글과 코드 다음 줄'
    const from = source.indexOf('중요한'), to = source.length
    expect(renderedRangeFromSource(source, { from, to }, rendered)).toEqual({ from: 2, to: rendered.length })
  })

  it('draws the correct occurrence of a repeated rendered quote', () => {
    const source = 'A **반복**\n\nB **반복**'
    const from = source.lastIndexOf('반복')
    expect(renderedRangeFromSource(source, { from, to: from + 2 }, 'A 반복 B 반복')).toEqual({ from: 7, to: 9 })
  })

  it('retains visible link labels, wiki aliases, escaped punctuation and native Markdown highlights', () => {
    expect(projectRecordSource('## 제목\n- **굵게**와 *기울임*, `코드`, [링크](https://example.com), [[노트|별칭]], ==칠함==, \\*별').text)
      .toBe('제목 굵게와 기울임, 코드, 링크, 별칭, 칠함, *별')
  })
})
