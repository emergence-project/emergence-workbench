import { LIBRARY_SCOPE, type FigureRow } from './api/figures'
import { t } from './i18n'

/** 카드에서 쓸 수 있는 공용 · 현재 프로젝트 그림을 최근 순으로 찾는다. */
export function cardImageFigures(figures: FigureRow[], rid: string, query: string): FigureRow[] {
  const words = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean)
  return figures.filter((f) => (f.scope === rid || f.scope === LIBRARY_SCOPE)
    && words.every((word) => `${f.name} ${f.file} ${f.description ?? ''}`.toLocaleLowerCase().includes(word)))
    .sort((a, b) => b.mtime - a.mtime || a.id.localeCompare(b.id))
}

/** 파일 고르기와 끌어다 놓기가 같은 그림 라이브러리 업로드 조건을 쓴다. */
export function cardImageFileError(files: Pick<File, 'name'>[]): string | null {
  if (files.length !== 1) return t('그림 파일을 하나씩 골라 주세요.', 'Choose one figure file at a time.')
  return /\.(svg|png|jpe?g|pdf)$/i.test(files[0]!.name) ? null : t('SVG · PNG · JPG · PDF 파일을 골라 주세요.', 'Choose an SVG, PNG, JPG or PDF file.')
}
