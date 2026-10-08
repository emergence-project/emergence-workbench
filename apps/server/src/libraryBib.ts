import { t } from './i18n.js'
/**
 * 공유 라이브러리의 참고문헌(references.bib) 검사.
 * 노트는 \cite{키}만 쓰고, bib는 나중에 Zotero(Better BibTeX)가 내보낸다. 컴파일 전에 사람이 고칠 것만 알려 준다.
 */

/** 주석(%)을 뺀 글에서 \cite류 명령이 부른 키, 나온 순서대로 한 번씩 */
export function citedKeys(tex: string): string[] {
  const text = tex.replace(/(^|[^\\])%.*$/gm, '$1')
  const keys: string[] = []
  for (const m of text.matchAll(/\\(?:no)?cite[a-zA-Z]*\*?(?:\[[^\]]*\])*\{([^}]*)\}/g)) {
    for (const k of (m[1] ?? '').split(',').map((s) => s.trim())) if (k && k !== '*' && !keys.includes(k)) keys.push(k)
  }
  return keys
}

/** bib 파일의 항목 키 (@string·@comment·@preamble 제외), 나온 그대로 */
export function bibKeys(bib: string): string[] {
  return [...bib.matchAll(/^\s*@(\w+)\s*[{(]\s*([^,\s]+)\s*,/gm)]
    .filter((m) => !/^(string|comment|preamble)$/i.test(m[1] ?? ''))
    .map((m) => m[2] ?? '')
}

/** 노트가 인용한 키 중 bib에 없는 것, bib 안에서 두 번 이상 나온 키 (이 노트가 인용한 것만) */
export function checkCitations(tex: string, bib: string | null): string[] {
  const cited = citedKeys(tex)
  if (cited.length === 0) return []
  if (bib === null) return [t('라이브러리에 references.bib가 없어서 참고문헌을 붙이지 못했습니다', 'Could not add references: the library has no references.bib')]
  const keys = bibKeys(bib)
  const missing = cited.filter((k) => !keys.includes(k))
  const twice = cited.filter((k) => keys.indexOf(k) !== keys.lastIndexOf(k))
  return [
    ...(missing.length ? [t(`references.bib에 없는 인용 키: ${missing.join(', ')}`, `Citation keys not in references.bib: ${missing.join(', ')}`)] : []),
    ...(twice.length ? [t(`references.bib에 두 번 이상 있는 키: ${twice.join(', ')}`, `Keys that appear more than once in references.bib: ${twice.join(', ')}`)] : []),
  ]
}
