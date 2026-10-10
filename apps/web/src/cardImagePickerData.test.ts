import { describe, expect, it } from 'vitest'
import type { FigureRow } from './api/figures'
import { cardImageFigures, cardImageFileError } from './cardImagePickerData'

const row = (scope: string, file: string, mtime: number, name = file, description = ''): FigureRow => ({
  id: `${scope}/${file}`, scope, file, mtime, name, description, kind: 'svg', path: file, uses: [], subjects: [], subjectsHash: '',
})

describe('카드 그림 고르기', () => {
  const figures = [row('library', 'a.svg', 10, '고리 지도', 'Map 그림'), row('mine', 'a.svg', 20), row('other', 'x.svg', 30)]
  it('공용과 현재 프로젝트만 최근 순으로 보이며 원본 순서는 바꾸지 않는다', () => {
    expect(cardImageFigures(figures, 'mine', '').map((f) => f.id)).toEqual(['mine/a.svg', 'library/a.svg'])
    expect(figures[0]!.scope).toBe('library')
  })
  it('이름 · 파일 이름 · 설명을 모두 찾고, 같은 파일 이름의 두 범위를 구분한다', () => {
    expect(cardImageFigures(figures, 'mine', '고리 MAP a.SVG')).toEqual([figures[0]])
    expect(cardImageFigures(figures, 'mine', 'missing')).toEqual([])
    expect(cardImageFigures(figures, 'other', 'a.svg')).toEqual([figures[0]])
  })
  it('업로드는 기존 그림 더하기 API가 받는 이미지와 PDF 한 개만 받는다', () => {
    for (const name of ['한글.SVG', 'photo.png', 'photo.JPG', 'photo.jpeg', 'page.PDF']) expect(cardImageFileError([{ name }])).toBeNull()
    for (const name of ['photo.webp', 'photo.gif', 'code.tex', 'bad.pdf.exe']) expect(cardImageFileError([{ name }])).toContain('SVG')
    expect(cardImageFileError([])).toContain('하나씩')
    expect(cardImageFileError([{ name: 'a.svg' }, { name: 'b.svg' }])).toContain('하나씩')
  })
})
