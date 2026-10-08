import { describe, expect, it } from 'vitest'
import { bibKeys, checkCitations, citedKeys } from './libraryBib.js'

describe('라이브러리 참고문헌 검사', () => {
  it('주석을 빼고 \\cite류의 키를 모은다', () => {
    expect(citedKeys('본문 \\cite{a, b} \\citep[p.~3]{c}\n% \\cite{d}\n\\nocite{a}')).toEqual(['a', 'b', 'c'])
  })
  it('bib 항목 키만 읽는다', () => {
    expect(bibKeys('@string{prl = "PRL"}\n@article{a,\n title={x}}\n@Book{b ,\n}')).toEqual(['a', 'b'])
  })
  it('없는 키와 두 번 나온 키를 알려 주고, 인용이 없으면 조용하다', () => {
    const bib = '@article{a,}\n@article{b,}\n@misc{b,}'
    expect(checkCitations('\\cite{a,b,z}', bib)).toEqual(['references.bib에 없는 인용 키: z', 'references.bib에 두 번 이상 있는 키: b'])
    expect(checkCitations('인용 없음', null)).toEqual([])
    expect(checkCitations('\\cite{a}', null)[0]).toMatch(/references.bib가 없어서/)
  })
})
