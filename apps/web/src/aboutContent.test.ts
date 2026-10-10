import { describe, expect, it } from 'vitest'
import { ABOUT_PARTS_KO, COLOR_ROWS_KO, SYMBOL_GROUPS_KO, type AboutPart } from './aboutContent'
import { ABOUT_PARTS_EN, COLOR_ROWS_EN, SYMBOL_GROUPS_EN } from './aboutContent.en'

// 소개 글은 두 언어 파일에 따로 있다. 영어 쪽 data-ui는 같은 자리의 한국어 제목을 쓰므로(withUi) 모양이 같아야 한다
const shape = (parts: AboutPart[]) => parts.map((p) => ({
  id: p.id,
  open: p.open?.map((o) => o.to),
  left: p.left?.length ?? 0,
  sections: (p.sections ?? []).map((s) => ({ figure: !!s.figure, items: s.items.map((i) => !!i.unsure) })),
}))
const icons = Object.fromEntries(['pencil', 'trash', 'play', 'download', 'comment', 'approve', 'sendBack', 'memo', 'feedback', 'panelLeft', 'more', 'reopen', 'search'].map((k) => [k, k])) as Parameters<typeof SYMBOL_GROUPS_KO>[0]['icons']

describe('소개 두 언어', () => {
  it('쪽 · 절 · 항목 · 확인 필요 표시가 같은 자리에 있다', () => {
    expect(shape(ABOUT_PARTS_EN)).toEqual(shape(ABOUT_PARTS_KO))
  })
  it('색 표와 기호 표의 줄이 같다', () => {
    expect(COLOR_ROWS_EN.map((r) => [r.status, r.token])).toEqual(COLOR_ROWS_KO.map((r) => [r.status, r.token]))
    const rows = (g: ReturnType<typeof SYMBOL_GROUPS_KO>) => g.map((x) => x.rows.length)
    expect(rows(SYMBOL_GROUPS_EN({ icons }))).toEqual(rows(SYMBOL_GROUPS_KO({ icons })))
  })
})
