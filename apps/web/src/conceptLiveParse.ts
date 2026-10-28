// 개념노트 편집기에서 쓰는 순수 함수: 본문에서 수식·[[링크]]·[@인용] 자리를 찾고, "/" 명령을 여는 자리를 알아본다.

export interface MathSpan { from: number; to: number; tex: string; block: boolean }
export interface LinkSpan { from: number; to: number; target: string; label: string }

/** `$$ … $$`(여러 줄 가능)와 `$ … $`(한 줄 안). `\$`는 글자 달러. skip 안의 자리(코드)는 건너뛴다 */
export function findMath(text: string, skip: [number, number][] = []): MathSpan[] {
  const out: MathSpan[] = []
  const inSkip = (p: number) => skip.find(([a, b]) => p >= a && p < b)
  let i = 0
  while (i < text.length) {
    const s = inSkip(i)
    if (s) { i = s[1]; continue }
    const c = text[i]
    if (c === '\\') { i += 2; continue }
    if (c !== '$') { i++; continue }
    if (text[i + 1] === '$') {
      const end = text.indexOf('$$', i + 2)
      if (end < 0) break
      out.push({ from: i, to: end + 2, tex: text.slice(i + 2, end).trim(), block: true })
      i = end + 2
      continue
    }
    // 한 줄 안의 $…$: 여는 $ 바로 뒤나 닫는 $ 바로 앞이 빈칸이면 수식이 아니다 (금액 "$5 and $6" 같은 글)
    let j = i + 1
    while (j < text.length && text[j] !== '\n' && !(text[j] === '$' && text[j - 1] !== '\\')) j++
    if (j < text.length && text[j] === '$' && j > i + 1 && !/\s/.test(text[i + 1]!) && !/\s/.test(text[j - 1]!)) {
      out.push({ from: i, to: j + 1, tex: text.slice(i + 1, j), block: false })
      i = j + 1
    } else i++
  }
  return out
}

/** `[[대상]]`, `[[대상|보이는 이름]]`, `[[대상#절]]` */
export function findWikiLinks(text: string): LinkSpan[] {
  const out: LinkSpan[] = []
  for (const m of text.matchAll(/!?\[\[([^\]\n]+?)\]\]/g)) {
    if (m[0].startsWith('!')) continue // 그림 끼우기는 그대로 둔다
    const [target, alias] = m[1]!.split('|')
    out.push({ from: m.index!, to: m.index! + m[0].length, target: target!.trim(), label: (alias ?? target!.split('#')[0]!).trim() || target!.trim() })
  }
  return out
}

/** `[@키]`, `[@가; @나]` */
export function findCites(text: string): { from: number; to: number }[] {
  return [...text.matchAll(/\[@[^\]\n]+\]/g)].map((m) => ({ from: m.index!, to: m.index! + m[0].length }))
}

/** 줄 머리나 빈칸 뒤의 "/…"이면 찾는 말을, 아니면 null (주소·분수 a/b에서는 열지 않는다) */
export function slashQuery(before: string): string | null {
  const m = /(?:^|\s)\/([^\s/]*)$/.exec(before)
  return m ? m[1]! : null
}

export type MathDelim = '$' | '\\(' | '$$' | '\\['
export interface MathRange { from: number; to: number; kind: MathDelim; open: number; close: number }

/**
 * 원문 보기에서 수식 범위를 칠하려고 찾는다 (21:39 피드백): `$…$`, `\(…\)`, `$$…$$`, `\[…\]`.
 * open · close는 여는 · 닫는 기호의 길이, 짝이 없으면 to = 기호 끝 · close = 0. `\$`는 글자 달러.
 */
export function findMathRanges(text: string, skip: [number, number][] = []): MathRange[] {
  const out: MathRange[] = []
  const inSkip = (p: number) => skip.find(([a, b]) => p >= a && p < b)
  let i = 0
  while (i < text.length) {
    const s = inSkip(i)
    if (s) { i = s[1]; continue }
    const c = text[i]
    const pair = c === '\\' ? (text[i + 1] === '(' ? '\\)' : text[i + 1] === '[' ? '\\]' : null) : null
    if (c === '\\' && !pair) { i += 2; continue }
    if (pair || (c === '$' && text[i + 1] === '$')) {
      const kind = (pair ? text.slice(i, i + 2) : '$$') as MathDelim
      const close = pair ?? '$$'
      let end = text.indexOf(close, i + 2)
      while (end > 0 && close === '$$' && text[end - 1] === '\\') end = text.indexOf(close, end + 1)
      if (end < 0) { out.push({ from: i, to: i + 2, kind, open: 2, close: 0 }); i += 2; continue }
      out.push({ from: i, to: end + 2, kind, open: 2, close: 2 })
      i = end + 2
      continue
    }
    if (c !== '$') { i++; continue }
    // findMath와 같은 규칙: 한 줄 안, 여는 $ 뒤와 닫는 $ 앞이 빈칸이 아니어야 수식
    let j = i + 1
    while (j < text.length && text[j] !== '\n' && !(text[j] === '$' && text[j - 1] !== '\\')) j++
    if (j < text.length && text[j] === '$' && j > i + 1 && !/\s/.test(text[i + 1]!) && !/\s/.test(text[j - 1]!)) {
      out.push({ from: i, to: j + 1, kind: '$', open: 1, close: 1 })
      i = j + 1
    } else i++
  }
  return out
}
