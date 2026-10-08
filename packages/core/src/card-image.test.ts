import { describe, expect, it } from 'vitest'
import { parseCardFigureRef } from './card-image.js'

describe('카드 그림의 라이브러리 참조', () => {
  it('공용·프로젝트 그림의 파일 이름을 그대로 읽는다', () => {
    expect(parseCardFigureRef('figure:library/고리 지도 (원판).svg'))
      .toEqual({ id: 'library/고리 지도 (원판).svg', scope: 'library', file: '고리 지도 (원판).svg' })
    for (const ext of ['png', 'JPG', 'jpeg', 'pdf', 'tikz', 'tex']) {
      expect(parseCardFigureRef(`figure:sample-research/diagram.${ext}`)?.file).toBe(`diagram.${ext}`)
    }
  })

  it('예전 경로·잘못된 참조·폴더를 벗어나는 이름은 참조로 읽지 않는다', () => {
    for (const value of [undefined, null, 1, '', 'workbench/figures/a.svg', '/a.svg',
      'figure:library', 'figure:/a.svg', 'figure:Library/a.svg', 'figure:../a.svg',
      'figure:library/../a.svg', 'figure:library/sub/a.svg', 'figure:library/..\\a.svg',
      'figure:library/.a.svg', 'figure:library/a.svg?x=1', 'figure:library/a.svg#x',
      'figure:library/a%2f.svg', 'figure:library/a.exe', ' figure:library/a.svg',
      'figure:library/a.svg ', 'figure:library/a.svg\n', 'figure:library\n/a.svg',
      `figure:library/${'a'.repeat(117)}.svg`]) {
      expect(parseCardFigureRef(value), String(value)).toBeNull()
    }
  })
})
