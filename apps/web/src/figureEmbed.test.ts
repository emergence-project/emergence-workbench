import { describe, expect, it } from 'vitest'
import { findFigure, sameAsBefore } from './figureEmbed'
import type { FigureList } from './api'
import { renderObsidian } from './ObsidianMarkdown'

const figs = [
  { scope: 'library', name: '고리 지도', file: 'ring-map.tex' },
  { scope: 'library', name: 'disk', file: 'disk.svg' },
  { scope: 'alpha', name: 'disk', file: 'disk.svg' },
]

describe('그림 라이브러리 ![[이름]]', () => {
  it('이름 · 파일 이름 · 확장자 뺀 이름으로 찾고, 그 프로젝트 전용이 먼저', () => {
    expect(findFigure(figs, '고리 지도')).toBe(figs[0])
    expect(findFigure(figs, 'ring-map')).toBe(figs[0])
    expect(findFigure(figs, 'ring-map.tex')).toBe(figs[0])
    expect(findFigure(figs, 'disk', 'alpha')).toBe(figs[2])
    expect(findFigure(figs, 'disk', 'other')).toBe(figs[1])
    expect(findFigure(figs, 'none')).toBeUndefined()
  })

  it('찾은 그림은 그림으로, 못 찾으면 예전처럼 그린다', () => {
    const figure = (n: string) => (n === '고리 지도' ? { url: '/f/a1', pdf: false } : n === 'p' ? { url: '/f/p', pdf: true } : undefined)
    expect(renderObsidian('![[고리 지도|300]]', { figure })).toContain('<img class="ob-img ob-fig" src="/f/a1" alt="고리 지도" style="max-width:min(100%,300px)">')
    expect(renderObsidian('![[p]]', { figure })).toContain('<canvas class="md-fig-pdf ob-fig" data-src="/f/p"')
    expect(renderObsidian('![[없음]]', { figure })).toContain('ob-embed')
  })
})

describe('그림 목록 다시 받기', () => {
  it('내용이 같으면 이전 객체를 그대로 준다', () => {
    const list = (mtime: number) => ({ figures: [{ id: 'library/disk.svg', mtime }] }) as unknown as FigureList
    const a = sameAsBefore(list(1))
    expect(sameAsBefore(list(1))).toBe(a)
    const b = sameAsBefore(list(2))
    expect(b).not.toBe(a)
    expect(sameAsBefore(list(2))).toBe(b)
  })
})
