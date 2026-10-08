import { cardFigurePreview } from './cardImageReference'
import { useFigureListState } from './figureEmbed'
import { FigurePreview, type FigurePreviewData } from './FigurePreview'

/** 라이브러리 참조와 예전 카드 그림 경로를 함께 지원한다. 예전 경로의 주소는 해당 카드 API가 정한다. */
export function CardImage({ image, legacyUrl, className = '' }: { image?: string; legacyUrl?: string; className?: string }) {
  const figure = cardFigurePreview(image)
  const cls = `card-image${className ? ` ${className}` : ''}`
  if (figure) return <LibraryCardImage figure={figure} className={cls} />
  const url = legacyUrl || image
  return url ? <img className={cls} src={url} alt="" draggable={false} /> : null
}

/** 파일이 바뀌면 라이브러리와 함께 주소를 갱신해 PDF 첫 쪽도 다시 그린다. */
function LibraryCardImage({ figure, className }: { figure: FigurePreviewData; className: string }) {
  const { data } = useFigureListState()
  const current = data?.figures.find((item) => item.id === figure.id) ?? figure
  return <FigurePreview fig={current} className={className} />
}
