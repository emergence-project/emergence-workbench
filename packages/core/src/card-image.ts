/** 카드가 그림 라이브러리 원본을 가리키는 값. 예전 저장소 기준 경로와 구별한다. */
export interface CardFigureRef { id: string; scope: string; file: string }

/** 파일 경로를 풀지 않고 그림 id만 읽는다. 실제 존재·프로젝트 범위는 서버에서 확인한다. */
export function parseCardFigureRef(value: unknown): CardFigureRef | null {
  if (typeof value !== 'string' || !value.startsWith('figure:')) return null
  const id = value.slice('figure:'.length)
  const slash = id.indexOf('/')
  if (slash < 1) return null
  const scope = id.slice(0, slash)
  const file = id.slice(slash + 1)
  if (scope !== scope.trim() || file !== file.trim()
    || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(scope)
    || !/^(?!\.)[\p{L}\p{N} ._()-]{1,120}$/u.test(file)
    || !/\.(tikz|tex|svg|png|jpe?g|pdf)$/i.test(file)) return null
  return { id, scope, file }
}
