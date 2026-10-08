import { parseCardFigureRef } from '@rw/core'
import type { FigureKind } from './api/figures'

const KINDS: Record<string, FigureKind> = { tikz: 'tikz', tex: 'tikz', svg: 'svg', png: 'png', jpg: 'jpg', jpeg: 'jpg', pdf: 'pdf' }

/** 저장한 참조만으로 미리보기를 열 수 있다. 표시 이름·설명이 바뀌어도 같은 파일을 가리킨다. */
export function cardFigurePreview(image: string | undefined): { id: string; name: string; kind: FigureKind } | null {
  const ref = parseCardFigureRef(image)
  if (!ref) return null
  const kind = KINDS[ref.file.slice(ref.file.lastIndexOf('.') + 1).toLowerCase()]
  return kind ? { id: ref.id, name: ref.file, kind } : null
}
