import { describe, expect, it } from 'vitest'
import { cardFigurePreview } from './cardImageReference'

describe('cardFigurePreview', () => {
  it('keeps legacy paths and temporary preview URLs on their original render path', () => {
    for (const value of [undefined, '', 'workbench/figures/plot.png', 'blob:preview', '/api/topic/image', 'https://example.test/a.svg']) {
      expect(cardFigurePreview(value)).toBeNull()
    }
  })
  it.each([
    ['library/공리 그림.svg', 'svg'], ['my-project/plot.PDF', 'pdf'],
    ['my-project/plot.tikz', 'tikz'], ['library/plot.tex', 'tikz'],
    ['library/plot.jpeg', 'jpg'], ['library/plot.JPG', 'jpg'], ['library/plot.png', 'png'],
  ])('uses the file id and supported preview kind for %s', (id, kind) => {
    expect(cardFigurePreview(`figure:${id}`)).toEqual({ id, name: id.slice(id.indexOf('/') + 1), kind })
  })
  it('does not turn malformed figure references into library preview requests', () => {
    for (const value of ['figure:library/../plot.svg', 'figure:library/plot.exe', 'figure:library/']) {
      expect(cardFigurePreview(value)).toBeNull()
    }
  })
})
