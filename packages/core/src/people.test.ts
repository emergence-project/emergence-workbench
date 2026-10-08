import { describe, expect, it } from 'vitest'
import { isAuthorOf, nameKey, normalizePeople, orgOf, personId, suggestPeople } from './people.js'

describe('네트워킹의 사람', () => {
  it('이름을 성과 첫 글자로 읽는다', () => {
    expect(nameKey('Example, Ada E.')).toEqual({ family: 'example', initial: 'a' })
    expect(nameKey('Ada E. Example')).toEqual({ family: 'example', initial: 'a' })
    expect(nameKey('Sch{\\"o}n, B.')).toEqual({ family: 'schon', initial: 'b' })
    expect(personId('Ada E. Example')).toBe('ada-e-example')
  })

  it('bib author 줄에서 저자를 찾는다 (성이 같고 첫 글자가 같을 때만)', () => {
    const ada = { name: 'Ada E. Example' }
    expect(isAuthorOf(ada, 'Sample, Bea and Example, Ada E.')).toBe(true)
    expect(isAuthorOf(ada, 'Bea Sample and A. Example and others')).toBe(true)
    expect(isAuthorOf(ada, 'Example, Eve-Ann')).toBe(false)
    expect(isAuthorOf(ada, undefined)).toBe(false)
    expect(isAuthorOf({ name: 'Ady Example', aliases: ['Ada Example'] }, 'Example, Ada')).toBe(true)
  })

  it('목록을 고르고 같은 사람은 한 번만', () => {
    expect(normalizePeople([{ name: ' Ada  Example ' }, { name: 'ada example' }, { name: '' }, 3, { name: 'A', aliases: ['B', ''], note: 'x' }]))
      .toEqual([{ name: 'Ada Example' }, { name: 'A', aliases: ['B'], note: 'x' }])
    expect(normalizePeople('nope')).toEqual([])
    // 즐겨찾기는 true일 때만 남긴다
    expect(normalizePeople([{ name: 'A', star: true }, { name: 'B', star: 'yes' }])).toEqual([{ name: 'A', star: true }, { name: 'B' }])
  })

  it('분야 이름표를 고르고, 소속 줄에서 기관 이름만 뽑는다', () => {
    expect(normalizePeople([{ name: 'A', tags: ['그래프 이론', '그래프 이론', ''] }])).toEqual([{ name: 'A', tags: ['그래프 이론'] }])
    expect(orgOf('Department of Mathematics, Example Institute of Science and Technology, Example City 00000, Exland')).toBe('Example Institute of Science and Technology')
    expect(orgOf('Department of Computer Science, University of California, Davis, CA 95616, USA')).toBe('University of California')
    expect(orgOf('Example Institute for Advanced Study, Example City')).toBe('Example Institute for Advanced Study')
    expect(orgOf('Example Graph Lab')).toBe('Example Graph Lab')
  })

  it('소속·이메일·홈페이지를 받고, http 주소가 아닌 홈페이지는 버린다', () => {
    expect(normalizePeople([{ name: 'A B', affiliations: ['Example College', ' ', 'EXLAB'], email: ' a@b.c ', homepage: 'https://x.org' }, { name: 'C D', homepage: 'javascript:x' }]))
      .toEqual([{ name: 'A B', affiliations: ['Example College', 'EXLAB'], email: 'a@b.c', homepage: 'https://x.org' }, { name: 'C D' }])
  })

  it('참고 문헌에 자주 나오고 아직 없는 사람을 추천한다', () => {
    const authors = [
      'Example, Ada E. and Sample, Bea and Tester, Theo',
      'Sample, Bea and Example, Ada E.',
      'Bea Sample and Tester, T. and others',
      'Zou, Yijian and {Sample}, Bea',
      'Example, Ada E.',
    ]
    const s = suggestPeople(authors, [{ name: 'Ada E. Example' }])
    expect(s).toEqual([{ name: 'Bea Sample', count: 4 }, { name: 'Theo Tester', count: 2, aliases: ['T. Tester'] }])
    expect(suggestPeople(["D{\\'e}nes Sample", "Sample, D\\'enes"], [])).toEqual([{ name: 'Dénes Sample', count: 2 }])
  })
})
