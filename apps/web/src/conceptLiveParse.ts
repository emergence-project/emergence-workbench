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
