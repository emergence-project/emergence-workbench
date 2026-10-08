// 공유 기호 파일(research-library/concepts/macros.tex)의 KaTeX 정의를 한 번 읽어 나눠 쓴다.
// 개념노트 · 노트 화면(ConceptNotes.tsx useConceptRender)과 카드 설명(cardParts.tsx)이 함께 쓴다.
import { useEffect, useState } from 'react'
import { conceptsApi } from './api'

let macroCache: Promise<Record<string, string>> | null = null
/** 설정 › LaTeX › 기호를 저장하면 다음에 여는 화면이 새 기호를 읽는다 */
export const forgetConceptMacros = () => { macroCache = null }
/** 기호 정의 (읽는 동안은 undefined) */
export function useConceptMacros(): Record<string, string> | undefined {
  const [macros, setMacros] = useState<Record<string, string> | undefined>(undefined)
  useEffect(() => {
    macroCache ??= conceptsApi.macros().then((m) => m.macros).catch(() => ({}))
    let live = true
    void macroCache.then((m) => { if (live) setMacros(m) })
    return () => { live = false }
  }, [])
  return macros
}
