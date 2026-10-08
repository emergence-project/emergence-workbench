import { useEffect, useMemo, useState } from 'react'
import { figuresApi, LIBRARY_SCOPE, type FigureList, type FigureRow } from './api'

/**
 * 노트의 ![[이름]] → 그림 라이브러리의 그림 (planning/proposal-2026-10-05-libraries.md §5).
 * 이름 · 파일 이름 · 확장자 뺀 파일 이름 어느 것으로 적어도 찾고, 그 프로젝트 전용 그림이 공용보다 먼저다 (서버 figures.ts와 같게).
 * 그림 목록은 한 번 읽어 노트 화면들이 함께 쓴다. 그림 화면에서 바꾸면 forgetFigures로, 파일이 바뀌면 figuresMaybeChanged로 다시 읽는다.
 */
const stem = (f: string) => f.replace(/\.[^.]+$/, '')
const answers = (f: Pick<FigureRow, 'name' | 'file'>, x: string) => x === f.name || x === f.file || x === stem(f.file)

export function findFigure<T extends Pick<FigureRow, 'scope' | 'name' | 'file'>>(figs: T[], name: string, rid?: string): T | undefined {
  const x = name.trim()
  return (rid ? figs.find((f) => f.scope === rid && answers(f, x)) : undefined) ?? figs.find((f) => f.scope === LIBRARY_SCOPE && answers(f, x))
}

/** 그림 목록이 바뀌었을 때 (그림 첫 화면도 듣는다) */
export const FIGURES_CHANGED = 'rw-figures-changed'
const CHANGED = FIGURES_CHANGED
let cache: Promise<FigureList> | null = null
export function forgetFigures(): void { cache = null; window.dispatchEvent(new Event(CHANGED)) }
/** 노트·파일이 바뀌었을 때(그림을 쓰는 노트, 에이전트·Finder가 더한 그림): 잠시 모았다가 다시 읽는다 */
let soon: number | undefined
export function figuresMaybeChanged(): void { window.clearTimeout(soon); soon = window.setTimeout(forgetFigures, 1500) }

/** 그림 목록과 읽지 못했을 때의 까닭 */
export function useFigureListState(): { data: FigureList | null; error: string | null } {
  const [data, setData] = useState<FigureList | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    const load = () => {
      const p = (cache ??= figuresApi.list())
      p.then((d) => { if (live) { setData(d); setError(null) } })
        .catch((e: Error) => { if (cache === p) cache = null; if (live) setError(e.message) })
    }
    load()
    window.addEventListener(CHANGED, load)
    // 다른 앱(Finder)에서 그림을 더하고 돌아오면
    window.addEventListener('focus', figuresMaybeChanged)
    return () => { live = false; window.removeEventListener(CHANGED, load); window.removeEventListener('focus', figuresMaybeChanged) }
  }, [])
  return { data, error }
}

export function useFigureList(): FigureList | null { return useFigureListState().data }

/** 렌더러에 넘길 그림 주소 찾기 (없는 이름이면 undefined: 예전처럼 그린다) */
export function useFigureUrl(rid?: string): ((name: string) => { url: string; pdf: boolean } | undefined) | undefined {
  const data = useFigureList()
  return useMemo(() => {
    if (!data?.figures.length) return undefined
    return (name: string) => { const f = findFigure(data.figures, name, rid); return f && { url: figuresApi.fileUrl(f.id, f.mtime), pdf: f.kind === 'pdf' } }
  }, [data, rid])
}
