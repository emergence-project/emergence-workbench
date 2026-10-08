import { CITE, citeKeys as mdCiteKeys } from './ObsidianMarkdown'

/** 본문의 \cite{a,b}·\citep[..]{c} 키, Markdown 노트의 [@a; @b] 키 (나온 순서, 중복 없이) */
export function citeKeys(text: string): string[] {
  const keys = [...text.matchAll(new RegExp(`\\\\(?:no)?cite[a-zA-Z]*\\*?(?:\\[[^\\]]*\\])*\\{([^}]+)\\}|${CITE.source}`, 'g'))]
    .flatMap((m) => (m[1] !== undefined ? m[1].split(',').map((k) => k.trim()) : mdCiteKeys(m[2]!))).filter(Boolean)
  return [...new Set(keys)]
}

/** 본문의 인용 [n]을 누른 것을 아래 "인용한 논문"(Materials의 CitedPapers)에 알리는 DOM 이벤트. detail은 bib 키 */
export const CITE_EVENT = 'rw-cite'
