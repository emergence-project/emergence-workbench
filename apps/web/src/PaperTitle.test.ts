import { describe, expect, it } from 'vitest'
import { titleParts, titleText } from './PaperTitle'

describe('논문 제목의 TeX', () => {
  it('$…$는 수식, 나머지는 글 (bib 괄호 · 이스케이프는 푼다)', () => {
    expect(titleParts('Giant Magnetocaloric Effect in Na$_2$BaCo(PO$_4$)$_2$')).toEqual([
      { math: false, text: 'Giant Magnetocaloric Effect in Na' }, { math: true, text: '_2' }, { math: false, text: 'BaCo(PO' },
      { math: true, text: '_4' }, { math: false, text: ')' }, { math: true, text: '_2' },
    ])
    expect(titleParts('{Q}uantum \\& {SU(2)}')).toEqual([{ math: false, text: 'Quantum & SU(2)' }])
    expect(titleText('A $\\mathbb{Z}_2$ {S}pin')).toBe('A \\mathbb{Z}_2 Spin')
  })
  it('달러가 하나뿐이면 글 그대로', () => {
    expect(titleParts('Costs $5 only')).toEqual([{ math: false, text: 'Costs $5 only' }])
  })
})
